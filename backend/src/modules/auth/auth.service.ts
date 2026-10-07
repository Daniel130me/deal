import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import type { Prisma, RefreshToken, User } from '@prisma/client';
import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { REFRESH_TOKEN_BYTES, REFRESH_TOKEN_TTL_SECONDS } from './auth.constants';
import type { LoginDto, SignupDto } from './dto/auth.dto';
import { AccessTokenService } from './access-token.service';
import { SafeUser, UsersService } from '../users/users.service';

/** What the session endpoints hand back to the client. */
interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Auth domain boundary — owning phase: 4.
 *
 * Owns: credential verification (Argon2id), access-token minting, refresh-token
 * lifecycle (rotation + family revocation). The RefreshToken table is an auth
 * artifact (schema: cascades with the user) and is only touched here.
 * User rows are reached exclusively through UsersService.
 *
 * Session model (docs/target-architecture.md §7):
 *   - Access token: 15-min JWT — stateless, no DB hit on the hot path.
 *   - Refresh token: opaque 256-bit random value; only its SHA-256 hash is stored.
 *   - Every refresh ROTATES: the presented token is revoked and replaced inside
 *     one transaction. Presenting an already-revoked token is treated as theft
 *     and revokes the whole family (all tokens descending from one login).
 */
@Injectable()
export class AuthService {
  /** Lazily-built Argon2 hash of a constant, used only to equalise timing on unknown-user logins. */
  private dummyHash?: Promise<string>;

  constructor(
    private readonly users: UsersService,
    private readonly tokens: AccessTokenService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Use cases ────────────────────────────────────────────────────────────────

  async signup(dto: SignupDto): Promise<{ user: SafeUser } & SessionTokens> {
    // Friendly pre-checks on indexed unique columns; the DB constraints remain
    // the real authority (race backstop below maps P2002 to the same 409).
    if (await this.users.findByIdentifier(dto.email)) {
      throw this.fail('EMAIL_TAKEN', 'An account with this email already exists', HttpStatus.CONFLICT);
    }
    if (dto.phone && (await this.users.findByIdentifier(dto.phone))) {
      throw this.fail('PHONE_TAKEN', 'An account with this phone already exists', HttpStatus.CONFLICT);
    }

    // Argon2id via @node-rs/argon2 OWASP-default parameters (m=19MiB, t=2, p=1).
    const passwordHash = await argon2Hash(dto.password);

    let user: User;
    try {
      user = await this.users.createUser({
        email: dto.email,
        phone: dto.phone ?? null,
        passwordHash,
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw this.fail('CONTACT_TAKEN', 'An account with this contact already exists', HttpStatus.CONFLICT);
      }
      throw error;
    }

    const tokens = await this.issueTokenFamily(user);
    return { user: this.users.toSafeUser(user), ...tokens };
  }

  async login(dto: LoginDto): Promise<{ user: SafeUser } & SessionTokens> {
    const user = await this.users.findByIdentifier(dto.identifier);
    if (!user) {
      // Unknown identifier: burn the same Argon2 work a real verification would,
      // so response timing cannot be used to enumerate registered accounts.
      await this.verifyAgainstDummyHash(dto.password);
      throw this.fail('INVALID_CREDENTIALS', 'Incorrect credentials', HttpStatus.UNAUTHORIZED);
    }

    const passwordOk = await this.verifyPassword(user.passwordHash, dto.password);
    if (!passwordOk) {
      throw this.fail('INVALID_CREDENTIALS', 'Incorrect credentials', HttpStatus.UNAUTHORIZED);
    }
    if (user.status !== UserStatus.ACTIVE) {
      // Checked AFTER credential verification: only the rightful owner
      // learns anything about the account's state.
      throw this.fail('ACCOUNT_SUSPENDED', 'This account is suspended', HttpStatus.FORBIDDEN);
    }

    await this.users.touchLastLogin(user.id);
    await this.pruneExpiredTokens(user.id);
    const tokens = await this.issueTokenFamily(user);
    return { user: this.users.toSafeUser(user), ...tokens };
  }

  async refresh(rawToken: string): Promise<{ user: SafeUser } & SessionTokens> {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: this.hashToken(rawToken) } });
    if (!row) {
      throw this.fail('TOKEN_INVALID', 'Invalid refresh token', HttpStatus.UNAUTHORIZED);
    }
    if (row.revokedAt) {
      // Reuse of an already-rotated token: either replay or theft. In both
      // cases every token descending from that login is untrusted.
      await this.revokeFamily(row.familyId);
      throw this.fail('TOKEN_REUSE', 'Refresh token already used — session revoked', HttpStatus.UNAUTHORIZED);
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      throw this.fail('TOKEN_EXPIRED', 'Refresh token expired', HttpStatus.UNAUTHORIZED);
    }

    const user = await this.users.findUserById(row.userId);
    if (!user) {
      await this.revokeFamily(row.familyId);
      throw this.fail('TOKEN_INVALID', 'Invalid refresh token', HttpStatus.UNAUTHORIZED);
    }
    if (user.status !== UserStatus.ACTIVE) {
      await this.revokeFamily(row.familyId);
      throw this.fail('ACCOUNT_SUSPENDED', 'This account is suspended', HttpStatus.FORBIDDEN);
    }

    let rotatedToken: string;
    try {
      rotatedToken = await this.rotate(row, user);
    } catch {
      // Two concurrent refreshes with the same token: this one lost the
      // transaction race, which is precisely the reuse scenario above.
      await this.revokeFamily(row.familyId);
      throw this.fail('TOKEN_REUSE', 'Refresh token already used — session revoked', HttpStatus.UNAUTHORIZED);
    }

    const accessToken = await this.tokens.signAccessToken({ sub: user.id, role: user.role });
    return { user: this.users.toSafeUser(user), accessToken, refreshToken: rotatedToken };
  }

  /** Single-device logout. Idempotent: unknown or already-dead tokens are a no-op. */
  async logout(rawToken: string): Promise<{ revoked: boolean }> {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: this.hashToken(rawToken) } });
    if (!row || row.revokedAt) {
      return { revoked: false };
    }
    const result = await this.prisma.refreshToken.updateMany({
      where: { id: row.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { revoked: result.count > 0 };
  }

  /** GET /auth/me — re-reads the user so suspensions take effect immediately. */
  async getProfile(userId: string): Promise<SafeUser> {
    const user = await this.users.findUserById(userId);
    if (!user) {
      throw this.fail('TOKEN_INVALID', 'Invalid access token', HttpStatus.UNAUTHORIZED);
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw this.fail('ACCOUNT_SUSPENDED', 'This account is suspended', HttpStatus.FORBIDDEN);
    }
    return this.users.toSafeUser(user);
  }

  // ── Refresh-token mechanics ─────────────────────────────────────────────────

  /** New family = new login/signup. Other families stay untouched (other devices stay logged in). */
  private async issueTokenFamily(user: User): Promise<SessionTokens> {
    const accessToken = await this.tokens.signAccessToken({ sub: user.id, role: user.role });
    const { raw } = await this.createToken(user, randomUUID(), this.prisma);
    return { accessToken, refreshToken: raw };
  }

  /**
   * Atomic rotation: create the child, then revoke the parent ONLY IF it is
   * still live. The conditional updateMany makes double-spend impossible —
   * a concurrent refresh loses the race and reports count 0, which rolls the
   * child back. `replacedById` keeps the audit chain linking parent → child.
   */
  private async rotate(parent: RefreshToken, user: User): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const childToken = await this.createToken(user, parent.familyId, tx);
      const revoked = await tx.refreshToken.updateMany({
        where: { id: parent.id, revokedAt: null },
        data: { revokedAt: new Date(), replacedById: childToken.id },
      });
      if (revoked.count === 0) {
        // Rolls back the child creation; caller maps this to TOKEN_REUSE.
        throw new Error('REFRESH_RACE');
      }
      return childToken.raw;
    });
  }

  /** Persists one refresh token (hash only) and returns the raw value to hand to the client. */
  private async createToken(
    user: User,
    familyId: string,
    client: Prisma.TransactionClient | PrismaService,
  ): Promise<{ raw: string; id: string }> {
    const raw = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    const created = await client.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(raw),
        familyId,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
      },
      select: { id: true },
    });
    return { raw, id: created.id };
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Housekeeping: at new logins, drop this user's already-expired refresh rows. */
  private async pruneExpiredTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });
  }

  // ── Crypto helpers ──────────────────────────────────────────────────────────

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private async verifyPassword(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await argon2Verify(passwordHash, password);
    } catch {
      // Malformed stored hash (corrupt row / foreign format) — never a valid login.
      return false;
    }
  }

  private async verifyAgainstDummyHash(password: string): Promise<void> {
    this.dummyHash ??= argon2Hash('deal-timing-equalizer');
    await this.verifyPassword(await this.dummyHash, password);
  }

  private fail(code: string, message: string, status: HttpStatus): never {
    throw new HttpException({ code, message }, status);
  }
}
