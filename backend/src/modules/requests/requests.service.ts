import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, RequestStatus, type ClientRequest, type Service } from '@prisma/client';
import { retryOnUniqueViolation, nextSequentialRef } from '../../common/ids/ref.util';
import { PrismaService } from '../../database/prisma.service';
import { NOTIFICATION_TYPES } from '../notifications/notifications.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { ServicesService } from '../services/services.service';
import type { PublicRequestDto, RequestActionDto } from './dto/request.dto';

/** Requests include their referenced service in every owner-facing response. */
export type RequestWithService = ClientRequest & { service: Service | null };

/** Action -> resulting status. Anything not listed is not a legal action. */
const ACTION_TO_STATUS: Record<RequestActionDto['action'], RequestStatus> = {
  decline: RequestStatus.DECLINED,
  archive: RequestStatus.ARCHIVED,
};

/**
 * Server-side transition table — the ONLY authority on request status changes.
 * From NEW the creator may reply (Phase 6, when a deal is created), decline or
 * archive; from REPLIED still decline/archive. DECLINED and ARCHIVED are
 * terminal — the prototype had no guard here; the escrow platform does.
 */
const REQUEST_TRANSITIONS: Partial<Record<RequestStatus, RequestStatus[]>> = {
  [RequestStatus.NEW]: [RequestStatus.REPLIED, RequestStatus.DECLINED, RequestStatus.ARCHIVED],
  [RequestStatus.REPLIED]: [RequestStatus.DECLINED, RequestStatus.ARCHIVED],
};

/**
 * Requests domain boundary — owning phase: 5.
 *
 * Owns the ClientRequest table. Every owner call is scoped by the acting
 * creator's profile id; a missing and a foreign request are the same 404.
 * Public submissions arrive through PublicController with the handle already
 * resolved to a creator id.
 */
@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly services: ServicesService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Owner (authenticated creator) use cases ─────────────────────────────────

  /** Inbox listing — matches the prototype: declined requests drop out of the inbox. */
  async listByCreator(creatorId: string): Promise<RequestWithService[]> {
    return this.prisma.clientRequest.findMany({
      where: { creatorId, status: { not: RequestStatus.DECLINED } },
      include: { service: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOwned(creatorId: string, requestId: string): Promise<RequestWithService> {
    const request = await this.prisma.clientRequest.findFirst({
      where: { id: requestId, creatorId },
      include: { service: true },
    });
    if (!request) {
      throw new HttpException({ code: 'REQUEST_NOT_FOUND', message: 'Request not found' }, HttpStatus.NOT_FOUND);
    }
    return request;
  }

  async act(creatorId: string, requestId: string, dto: RequestActionDto): Promise<RequestWithService> {
    const request = await this.getOwned(creatorId, requestId);
    const allowed = REQUEST_TRANSITIONS[request.status] ?? [];
    if (!allowed.includes(ACTION_TO_STATUS[dto.action])) {
      throw new HttpException(
        { code: 'INVALID_REQUEST_TRANSITION', message: `A ${request.status.toLowerCase()} request cannot be ${dto.action}d` },
        HttpStatus.CONFLICT,
      );
    }
    return this.prisma.clientRequest.update({
      where: { id: request.id },
      data: { status: ACTION_TO_STATUS[dto.action] },
      include: { service: true },
    });
  }

  /**
   * Phase 6 seam: creating a deal from a request marks it REPLIED. Idempotent
   * on REPLIED (a second deal from the same thread is legitimate) and refuses
   * dead threads so closed conversations cannot be resurrected.
   *
   * Pass `tx` to run inside the caller's transaction — deal creation marks the
   * request in the SAME transaction that writes the deal, so a crash can never
   * leave a deal linked to a request still sitting in the inbox as NEW.
   */
  async markReplied(requestId: string, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    const request = await client.clientRequest.findUnique({ where: { id: requestId }, select: { status: true } });
    if (!request) {
      throw new HttpException({ code: 'REQUEST_NOT_FOUND', message: 'Request not found' }, HttpStatus.NOT_FOUND);
    }
    if (request.status === RequestStatus.NEW) {
      await client.clientRequest.update({ where: { id: requestId }, data: { status: RequestStatus.REPLIED } });
    }
  }

  // ── Public submission (rate-limited, anonymous) ─────────────────────────────

  async createPublicSubmission(creatorId: string, dto: PublicRequestDto): Promise<RequestWithService> {
    if (
      dto.budgetMinMinor !== undefined &&
      dto.budgetMaxMinor !== undefined &&
      dto.budgetMinMinor > dto.budgetMaxMinor
    ) {
      throw new HttpException(
        { code: 'INVALID_BUDGET_RANGE', message: 'Minimum budget cannot exceed maximum budget' },
        HttpStatus.BAD_REQUEST,
      );
    }

    // The referenced service must exist, be active, and belong to this creator.
    const service = await this.services.findActiveOwned(dto.serviceId, creatorId);
    if (!service) {
      throw new HttpException({ code: 'SERVICE_NOT_FOUND', message: 'Service not found' }, HttpStatus.NOT_FOUND);
    }

    const created = await this.createWithRef(creatorId, dto);
    // Nudge the creator AFTER the row exists (advisory, best-effort): a new
    // public request is the inbox's whole reason to be checked.
    await this.notifyNewRequest(created, service.title);
    return { ...created, service };
  }

  /** Best-effort creator nudge for a public submission — never fails the intake. */
  private async notifyNewRequest(request: ClientRequest, serviceTitle: string | null): Promise<void> {
    const profile = await this.prisma.creatorProfile.findUnique({
      where: { id: request.creatorId },
      select: { userId: true },
    });
    if (!profile) return; // structurally impossible (requests RESTRICT profile deletion)
    await this.notifications.notify({
      userId: profile.userId,
      type: NOTIFICATION_TYPES.REQUEST_NEW,
      payload: {
        requestId: request.id,
        requestRef: request.ref,
        label: `New request from ${request.clientName}${serviceTitle ? ` — ${serviceTitle}` : ''}`,
        clientName: request.clientName,
      },
    });
  }

  /** Ref generated inside the closure so a P2002 retry re-allocates. */
  private createWithRef(creatorId: string, dto: PublicRequestDto): Promise<ClientRequest> {
    return retryOnUniqueViolation(async () => {
      const ref = await this.nextRef('REQ');
      return this.prisma.clientRequest.create({
        data: {
          ref,
          creatorId,
          serviceId: dto.serviceId,
          clientName: dto.clientName,
          clientContact: dto.clientContact,
          eventDate: dto.eventDate ? new Date(`${dto.eventDate}T00:00:00Z`) : null,
          location: dto.location ?? null,
          budgetMinMinor: dto.budgetMinMinor ?? null,
          budgetMaxMinor: dto.budgetMaxMinor ?? null,
          description: dto.description,
          notes: dto.notes ?? null,
          status: RequestStatus.NEW,
        },
      });
    });
  }

  private async nextRef(prefix: string): Promise<string> {
    const rows = await this.prisma.clientRequest.findMany({
      where: { ref: { startsWith: `${prefix}-` } },
      select: { ref: true },
    });
    return nextSequentialRef(prefix, rows.map((row) => row.ref));
  }
}
