import { Injectable } from '@nestjs/common';

/**
 * Requests domain boundary — owning phase: 5.
 * Empty shell in Phase 2: the module boundary exists so later phases only add code.
 * Once implemented, cross-module calls must go through this service — never through
 * another module's repositories or Prisma models directly (keeps the future
 * microservice split cheap, see docs/target-architecture.md §6).
 */
@Injectable()
export class RequestsService {}
