import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '../../config/config.service';

/**
 * Liveness/readiness probes for load balancers and uptime checks.
 * Deliberately served on fixed root paths (/health, /health/live, /health/ready)
 * — excluded from the /api/v1 prefix in main.ts because probe paths must not
 * change when the API version bumps.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  health() {
    return this.snapshot({ app: 'ok' });
  }

  @Get('live')
  live() {
    return this.snapshot({ app: 'ok' });
  }

  @Get('ready')
  ready() {
    // Phase 3 adds the Neon database ping here.
    return this.snapshot({ app: 'ok' });
  }

  private snapshot(checks: Record<string, string>) {
    return {
      status: 'ok',
      environment: this.config.nodeEnv,
      uptimeSeconds: Math.round(process.uptime()),
      checks,
    };
  }
}
