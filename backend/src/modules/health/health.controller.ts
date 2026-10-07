import { Controller, Get } from '@nestjs/common';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '../../config/config.service';
import { PrismaService } from '../../database/prisma.service';
import { Public } from '../auth/decorators/public.decorator';

/**
 * Liveness/readiness probes for load balancers and uptime checks.
 * Deliberately served on fixed root paths (/health, /health/live, /health/ready)
 * — excluded from the /api/v1 prefix in app.ts because probe paths must not
 * change when the API version bumps.
 */
@Controller('health')
@Public() // probes must answer without credentials — load balancers have no tokens
export class HealthController {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async health() {
    return this.snapshot({ app: 'ok', db: (await this.prisma.isHealthy()) ? 'ok' : 'down' });
  }

  @Get('live')
  live() {
    // Liveness = "the process is up" — no dependencies checked (a DB outage
    // must not make the orchestrator restart a healthy process).
    return this.snapshot({ app: 'ok' });
  }

  @Get('ready')
  async ready() {
    const dbOk = await this.prisma.isHealthy();
    if (!dbOk) {
      // Load-balancer convention: not ready -> 503 so traffic stops being routed here.
      throw new ServiceUnavailableException('Database unavailable');
    }
    return this.snapshot({ app: 'ok', db: 'ok' });
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
