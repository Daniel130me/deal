import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ActorType, DealEventType, DealStatus, Prisma, type Deal } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

/** Interactive-transaction client — callers pass their tx so multi-row writes stay atomic. */
export type PrismaTx = Prisma.TransactionClient;

/**
 * Server-side transition table — the ONLY authority on what Deal.status moves
 * are legal (docs/target-architecture.md §5: DealStateService is the only
 * writer of Deal.status).
 *
 * Shape of the lifecycle (plan Phase 6):
 *   draft → sent → (changes_requested | declined) → active → delivered →
 *   revision → approved → files_released → completed, with disputed as the
 *   side exit from delivered/approved.
 *
 * Notes:
 * - SENT → ACTIVE is the deposit-paid move. It is legal in the table NOW, but
 *   nothing triggers it until Phase 8 wires payment verification — a state no
 *   route can reach is preferable to a fake "accept without money" action.
 * - BALANCE_PAID is legacy (historical seed rows only); the machine never
 *   writes it and never leaves it.
 * - DISPUTED has no outgoing moves until Phase 9 implements resolution.
 */
const DEAL_TRANSITIONS: Record<DealStatus, DealStatus[]> = {
  [DealStatus.DRAFT]: [DealStatus.SENT],
  [DealStatus.SENT]: [DealStatus.CHANGES_REQUESTED, DealStatus.DECLINED, DealStatus.ACTIVE],
  [DealStatus.CHANGES_REQUESTED]: [DealStatus.SENT],
  [DealStatus.ACTIVE]: [DealStatus.DELIVERED],
  [DealStatus.DELIVERED]: [DealStatus.REVISION, DealStatus.APPROVED, DealStatus.DISPUTED],
  [DealStatus.REVISION]: [DealStatus.DELIVERED],
  [DealStatus.APPROVED]: [DealStatus.FILES_RELEASED, DealStatus.DISPUTED],
  [DealStatus.FILES_RELEASED]: [DealStatus.COMPLETED],
  [DealStatus.COMPLETED]: [],
  [DealStatus.DECLINED]: [],
  [DealStatus.DISPUTED]: [],
  [DealStatus.BALANCE_PAID]: [],
};

/** Status -> the lifecycle timestamp Deal carries for reaching that status. */
const STATUS_TIMESTAMP: Partial<Record<DealStatus, keyof Pick<Deal, 'sentAt' | 'acceptedAt' | 'deliveredAt' | 'approvedAt' | 'filesReleasedAt' | 'completedAt'>>> = {
  [DealStatus.SENT]: 'sentAt',
  [DealStatus.ACTIVE]: 'acceptedAt',
  [DealStatus.DELIVERED]: 'deliveredAt',
  [DealStatus.APPROVED]: 'approvedAt',
  [DealStatus.FILES_RELEASED]: 'filesReleasedAt',
  [DealStatus.COMPLETED]: 'completedAt',
};

/** Options for a single transition — the audit row and any extra timestamps. */
export interface TransitionOptions {
  type: DealEventType;
  actor: ActorType;
  /** Creator actions carry the acting profile id; anonymous client/system actors are null. */
  actorId?: string | null;
  label: string;
  metadata?: Record<string, unknown>;
  /** Extra non-status columns to stamp atomically (e.g. depositPaidAt on ACTIVE). */
  extraData?: Partial<Pick<Deal, 'depositPaidAt' | 'paymentReleasedAt' | 'balancePaidAt'>>;
}

@Injectable()
export class DealStateService {
  constructor(private readonly prisma: PrismaService) {}

  /** Whether the machine allows `from -> to`. Exposed for pre-checks (edit windows). */
  canTransition(from: DealStatus, to: DealStatus): boolean {
    return DEAL_TRANSITIONS[from].includes(to);
  }

  /**
   * Moves a deal to `to` and writes its audit event ATOMICALLY — status and
   * the append-only DealEvent row land together or not at all.
   *
   * Pass `tx` when the transition is part of a larger multi-row write (escrow
   * release, dispute rows, deliveries); when omitted, a standalone transaction
   * is used. Re-transitioning a deal whose status was read earlier is safe:
   * the update is where-filtered on the expected current status, so a concurrent
   * move makes the update a no-op and this method reports the conflict.
   */
  async transition(
    deal: Pick<Deal, 'id' | 'status'>,
    to: DealStatus,
    opts: TransitionOptions,
    tx?: PrismaTx,
  ): Promise<Deal> {
    const run = async (client: PrismaTx): Promise<Deal> => {
      if (!this.canTransition(deal.status, to)) {
        throw new HttpException(
          {
            code: 'INVALID_DEAL_TRANSITION',
            message: `A ${deal.status.toLowerCase()} deal cannot move to ${to.toLowerCase().replace(/_/g, ' ')}`,
          },
          HttpStatus.CONFLICT,
        );
      }

      const now = new Date();
      const stamp = STATUS_TIMESTAMP[to];
      let updated: Deal;
      try {
        updated = await client.deal.update({
          // Status filtered in the WHERE: the state machine's read is re-checked
          // at write time, so two racing actions cannot both land. Prisma
          // surfaces a lost race as P2025 (no row matches the filter).
          where: { id: deal.id, status: deal.status },
          data: { status: to, ...(stamp ? { [stamp]: now } : {}), ...opts.extraData },
        });
      } catch (error) {
        if ((error as { code?: string }).code === 'P2025') {
          // Someone moved the deal between our read and this write.
          throw new HttpException(
            { code: 'INVALID_DEAL_TRANSITION', message: 'This deal was already updated — reload and try again' },
            HttpStatus.CONFLICT,
          );
        }
        throw error;
      }

      await client.dealEvent.create({
        data: {
          dealId: deal.id,
          type: opts.type,
          actor: opts.actor,
          actorId: opts.actorId ?? null,
          label: opts.label,
          metadata: opts.metadata ? (opts.metadata as Prisma.InputJsonValue) : undefined,
        },
      });
      return updated;
    };

    return tx ? run(tx) : this.prisma.$transaction(run);
  }
}
