import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { UserStatus, UserRole, type CreatorChannel, type CreatorProfile } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';
import type { ChannelDto, CreateProfileDto, UpdateProfileDto } from './dto/profile.dto';

/** Owner view: everything on the profile belongs to its owner. */
export type OwnedProfile = CreatorProfile & { channels: CreatorChannel[] };

/** What an anonymous visitor may see on /public/:handle — whitelist, not omission. */
export interface PublicProfile {
  id: string;
  name: string;
  handle: string;
  craft: string | null;
  location: string | null;
  bio: string | null;
  verified: boolean;
  preferredProvider: CreatorProfile['preferredProvider'];
  channels: Array<Pick<CreatorChannel, 'type' | 'value' | 'isPrimary'>>;
}

/**
 * Creators domain boundary — owning phase: 5.
 *
 * Owns CreatorProfile + CreatorChannel rows. Cross-module callers resolve a
 * user to their creator profile through this service (or via the
 * CreatorProfileGuard, which uses it under the hood) — never through Prisma
 * directly (docs/target-architecture.md §6 keeps the future split cheap).
 */
@Injectable()
export class CreatorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  // ── Owner (authenticated) use cases ─────────────────────────────────────────

  async getProfileByUserId(userId: string): Promise<OwnedProfile | null> {
    return this.prisma.creatorProfile.findUnique({
      where: { userId },
      include: { channels: { orderBy: { createdAt: 'asc' } } },
    });
  }

  /**
   * Onboarding: creates the profile and promotes the account to CREATOR in the
   * same transaction — an account without a profile is never called a creator.
   */
  async createProfile(userId: string, dto: CreateProfileDto): Promise<OwnedProfile> {
    if (await this.prisma.creatorProfile.findUnique({ where: { userId } })) {
      throw this.fail('PROFILE_EXISTS', 'This account already has a creator profile', HttpStatus.CONFLICT);
    }
    if (await this.prisma.creatorProfile.findUnique({ where: { handle: dto.handle } })) {
      throw this.fail('HANDLE_TAKEN', 'This handle is already taken', HttpStatus.CONFLICT);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.users.setRole(userId, UserRole.CREATOR, tx);
        const profile = await tx.creatorProfile.create({
          data: {
            userId,
            name: dto.name,
            handle: dto.handle,
            craft: dto.craft ?? null,
            location: dto.location ?? null,
            bio: dto.bio ?? null,
            preferredProvider: dto.preferredProvider ?? 'FLUTTERWAVE',
            onboarded: true,
          },
          include: { channels: true },
        });
        return profile;
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        // Race backstop: handle taken between the pre-check and the insert.
        throw this.fail('HANDLE_TAKEN', 'This handle is already taken', HttpStatus.CONFLICT);
      }
      throw error;
    }
  }

  async updateProfile(profileId: string, dto: UpdateProfileDto): Promise<OwnedProfile> {
    return this.prisma.creatorProfile.update({
      where: { id: profileId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.craft !== undefined && { craft: dto.craft }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.bio !== undefined && { bio: dto.bio }),
        ...(dto.preferredProvider !== undefined && { preferredProvider: dto.preferredProvider }),
        ...(dto.onboarded !== undefined && { onboarded: dto.onboarded }),
      },
      include: { channels: { orderBy: { createdAt: 'asc' } } },
    });
  }

  /**
   * Replaces the channel set. "At most one primary" is a business rule the
   * schema cannot express: the first channel marked primary wins, and a set
   * with no primary defaults its first entry — so the invariant after this
   * call is always exactly 0 (empty set) or 1 primary.
   */
  async replaceChannels(creatorId: string, channels: ChannelDto[]): Promise<OwnedProfile> {
    const rows = channels.map((channel) => ({ ...channel, isPrimary: channel.isPrimary === true }));
    const firstPrimary = rows.findIndex((channel) => channel.isPrimary);
    if (firstPrimary === -1 && rows.length > 0) {
      rows[0].isPrimary = true;
    } else if (firstPrimary > -1) {
      for (let i = 0; i < rows.length; i++) {
        if (i !== firstPrimary) rows[i].isPrimary = false;
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.creatorChannel.deleteMany({ where: { creatorId } });
      await tx.creatorChannel.createMany({
        data: rows.map((channel) => ({
          creatorId,
          type: channel.type,
          value: channel.value,
          isPrimary: channel.isPrimary,
        })),
      });
    });
    return this.getProfileById(creatorId) as Promise<OwnedProfile>;
  }

  // ── Cross-module lookups (used by services/requests/bookings/public) ───────

  /**
   * Minimal identity+status probe for the CreatorProfileGuard: one indexed
   * query answering "does this user have a profile, and may they act?".
   */
  async getProfileStatusByUserId(userId: string): Promise<{ id: string; status: UserStatus } | null> {
    const row = await this.prisma.creatorProfile.findUnique({
      where: { userId },
      select: { id: true, user: { select: { status: true } } },
    });
    return row ? { id: row.id, status: row.user.status } : null;
  }

  async getProfileById(id: string): Promise<OwnedProfile | null> {
    return this.prisma.creatorProfile.findUnique({
      where: { id },
      include: { channels: { orderBy: { createdAt: 'asc' } } },
    });
  }

  /** Resolves a public page handle to its profile, or null when unknown. */
  async getProfileByHandle(handle: string): Promise<OwnedProfile | null> {
    return this.prisma.creatorProfile.findUnique({
      where: { handle },
      include: { channels: { orderBy: { createdAt: 'asc' } } },
    });
  }

  /** Whitelist projection for anonymous surfaces (A1: no over-exposure). */
  toPublicProfile(profile: OwnedProfile): PublicProfile {
    return {
      id: profile.id,
      name: profile.name,
      handle: profile.handle,
      craft: profile.craft,
      location: profile.location,
      bio: profile.bio,
      verified: profile.verified,
      preferredProvider: profile.preferredProvider,
      channels: profile.channels.map(({ type, value, isPrimary }) => ({ type, value, isPrimary })),
    };
  }

  private fail(code: string, message: string, status: HttpStatus): never {
    throw new HttpException({ code, message }, status);
  }
}
