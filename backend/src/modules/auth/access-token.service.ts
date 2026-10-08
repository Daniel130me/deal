import { Injectable } from '@nestjs/common';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { UserRole } from '@prisma/client';
import { jwtVerify, SignJWT, errors as joseErrors } from 'jose';
import { ConfigService } from '../../config/config.service';
import { ACCESS_TOKEN_TTL_SECONDS, JWT_AUDIENCE, JWT_ISSUER } from './auth.constants';

/** Claims carried inside a DEAL access token — deliberately minimal. */
export interface AccessTokenClaims {
  sub: string;
  role: UserRole;
}

/**
 * Signs and verifies the short-lived access-token JWTs (HS256).
 *
 * Isolated in its own service so the rest of the app depends on an interface
 * ("give me claims for this bearer token"), not on a library — swapping the
 * token format later (e.g. asymmetric keys) touches one file.
 */
@Injectable()
export class AccessTokenService {
  private readonly secret: Uint8Array;

  constructor(config: ConfigService) {
    this.secret = new TextEncoder().encode(config.jwtAccessSecret);
  }

  async signAccessToken(claims: AccessTokenClaims): Promise<string> {
    return new SignJWT({ role: claims.role })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuer(JWT_ISSUER)
      .setAudience(JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(this.secret);
  }

  /** Verifies signature, expiry, issuer and audience; maps failures to API codes. */
  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });
      if (typeof payload.sub !== 'string' || typeof payload.role !== 'string') {
        throw new Error('malformed claims');
      }
      return { sub: payload.sub, role: payload.role as UserRole };
    } catch (error) {
      if (error instanceof joseErrors.JWTExpired) {
        throw new HttpException({ code: 'TOKEN_EXPIRED', message: 'Access token expired' }, HttpStatus.UNAUTHORIZED);
      }
      throw new HttpException(
        { code: 'TOKEN_INVALID', message: 'Invalid access token' },
        HttpStatus.UNAUTHORIZED,
      );
    }
  }
}
