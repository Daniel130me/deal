import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

/**
 * Singleton Prisma client exposed through DI (PrismaModule is @Global, so every
 * domain module can inject this without importing anything).
 * One client per process — never instantiate PrismaClient anywhere else.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ datasources: { db: { url: env.NEON_DATABASE_URL } } });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    // Shutdown must remain best-effort even when startup never established a
    // connection; otherwise teardown can hide the original connectivity error.
    await this.$disconnect().catch(() => undefined);
  }

  /** Cheap connectivity probe for the /health/ready endpoint. */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
