import { Injectable } from '@nestjs/common';
import { env, parseOrigins, type Env } from './env';

/**
 * Typed access to the validated environment.
 * Values are captured from `env.ts` (parsed once, fail-fast) — nothing here
 * re-reads process.env at runtime, so configuration is immutable while running.
 */
@Injectable()
export class ConfigService {
  private readonly values: Env = env;

  get nodeEnv(): Env['NODE_ENV'] {
    return this.values.NODE_ENV;
  }

  get isProduction(): boolean {
    return this.values.NODE_ENV === 'production';
  }

  get port(): number {
    return this.values.PORT;
  }

  get corsOrigins(): string[] {
    return parseOrigins(this.values.FRONTEND_URL);
  }

  get jwtAccessSecret(): string {
    return this.values.JWT_ACCESS_SECRET;
  }
}
