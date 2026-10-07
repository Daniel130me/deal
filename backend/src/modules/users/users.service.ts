import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

/**
 * User as the API exposes it — passwordHash is structurally absent, so a caller
 * cannot accidentally serialise it (the type, not discipline, is the guard).
 */
export interface SafeUser {
  id: string;
  email: string | null;
  phone: string | null;
  role: User['role'];
  status: User['status'];
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Users domain boundary — owning phase: 4.
 * The ONLY place the User table is read or written. Auth (and later phases)
 * goes through this service; nothing else touches user rows directly, which
 * keeps the future identity-service split cheap (docs/target-architecture.md §6).
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Strips the credential field. Everything else on the row is safe to expose. */
  toSafeUser(user: User): SafeUser {
    const { passwordHash: _passwordHash, ...safe } = user;
    return safe;
  }

  /** Creates the identity row for signup. Email is already normalised upstream. */
  async createUser(data: {
    email: string;
    phone?: string | null;
    passwordHash: string;
  }): Promise<User> {
    return this.prisma.user.create({ data });
  }

  /**
   * Resolves a login identifier to a user: emails are case-insensitive,
   * phones are matched as stored (normalised by the DTO before it gets here).
   */
  async findByIdentifier(identifier: string): Promise<User | null> {
    if (identifier.includes('@')) {
      return this.prisma.user.findUnique({ where: { email: identifier.toLowerCase() } });
    }
    return this.prisma.user.findUnique({ where: { phone: identifier } });
  }

  async findUserById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /** Best-effort login timestamp — never blocks or fails the login flow itself. */
  async touchLastLogin(id: string): Promise<void> {
    try {
      await this.prisma.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
    } catch {
      // A failed timestamp must not fail an otherwise valid authentication.
    }
  }
}
