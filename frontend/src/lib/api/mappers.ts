/**
 * Backend DTO → prototype-shape mappers.
 *
 * The screens were built against the prototype's naira/lowacase-envelope
 * shapes (`@/lib/types`). Rather than redesigning every screen, the api layer
 * converts ONCE at the boundary: kobo ints → naira numbers, UPPER enums →
 * lowercase, ISO datetimes → yyyy-mm-dd where screens expect dates. Writes go
 * the other way (toMinor). This file is the ONLY place that knows both shapes.
 */

import type {
  Booking,
  ClientRequest,
  CreatorChannel,
  Deal,
  DealDelivery,
  DealEvent,
  DealFile,
  DealPayment,
  DealStatus,
  PaymentProvider,
  ScheduleSlot,
  Service,
} from "@/lib/types";
import type {
  BookingDto,
  ClientRequestDto,
  CreatorOverviewDto,
  DealAmountsDto,
  DealDetailDto,
  DealEventDto,
  DealPaymentDto,
  DealStatusDto,
  FileAssetDto,
  PublicProfileDto,
  ServiceDto,
  SharedProjectionDto,
} from "./backend.types";

/* ---- money (backend kobo ints ↔ prototype naira numbers) ---- */

export function toMinor(naira: number): number {
  // Round-trip through integer kobo; screens type whole-naira amounts.
  return Math.round(naira * 100);
}

export function toNaira(minor: number): number {
  // Payments can only be whole kobo; keep display math exact.
  return minor / 100;
}

/* ---- shared primitives ---- */

function lowerStatus<T extends string>(status: T): Lowercase<T> {
  return status.toLowerCase() as Lowercase<T>;
}

/** ISO datetime | yyyy-mm-dd → the yyyy-mm-dd the prototype screens render. */
function toDateString(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "";
}

export function humanFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes;
  let unit = "B";
  for (const next of units) {
    if (value < 1024) break;
    value /= 1024;
    unit = next;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${unit}`;
}

/** mime → short badge label ("image/png" → "PNG", "application/pdf" → "PDF"). */
function kindOf(mime: string): string {
  if (mime === "application/pdf") return "PDF";
  if (mime === "application/zip") return "ZIP";
  const sub = mime.split("/")[1] ?? "FILE";
  return sub.replace(/^x-/, "").toUpperCase().slice(0, 4);
}

const METHOD_LABELS: Record<DealPaymentDto["method"], string> = {
  CARD: "Card",
  TRANSFER: "Transfer",
  USSD: "USSD",
};

export function mapFile(file: FileAssetDto): DealFile {
  return {
    id: file.id,
    name: file.filename,
    size: humanFileSize(file.sizeBytes),
    kind: kindOf(file.mime),
    role: file.role,
    mime: file.mime,
  };
}

/* ---- services / requests / bookings ---- */

export function mapService(row: ServiceDto): Service {
  return {
    id: row.id,
    userId: row.creatorId,
    title: row.title,
    desc: row.description,
    from: toNaira(row.startingPriceMinor),
    duration: row.duration ?? "",
    popular: row.isPopular,
    includes: row.includes,
    isActive: row.isActive,
  };
}

export function mapRequest(row: ClientRequestDto): ClientRequest & { service: Service | null } {
  return {
    id: row.id,
    ref: row.ref,
    creatorId: row.creatorId,
    serviceId: row.serviceId,
    clientName: row.clientName,
    clientContact: row.clientContact,
    eventDate: toDateString(row.eventDate),
    location: row.location ?? "",
    budgetMin: toNaira(row.budgetMinMinor),
    budgetMax: toNaira(row.budgetMaxMinor),
    description: row.description,
    notes: row.notes ?? "",
    status: lowerStatus(row.status) as ClientRequest["status"],
    createdAt: row.createdAt,
    service: row.service ? mapService(row.service) : null,
  };
}

export function mapBooking(row: BookingDto): Booking & { service: Service | null } {
  return {
    id: row.id,
    ref: row.ref,
    creatorId: row.creatorId,
    serviceId: row.serviceId ?? undefined,
    sessionType: row.sessionType,
    clientName: row.clientName,
    clientContact: row.clientContact,
    date: toDateString(row.date),
    time: row.time,
    note: row.note ?? "",
    status: lowerStatus(row.status) as Booking["status"],
    createdAt: row.createdAt,
    service: row.service ? mapService(row.service) : null,
  };
}

/* ---- deals ---- */

const EVENT_TYPES = new Set([
  "created",
  "sent",
  "accepted",
  "deposit_paid",
  "delivered",
  "changes_requested",
  "approved",
  "balance_paid",
  "files_released",
  "payment_released",
  "completed",
  "declined",
  "disputed",
  "review",
  "dispute_resolved",
]);

function mapEvent(event: { type: string; actor: string; label: string; createdAt: string }): DealEvent {
  const type = lowerStatus(event.type);
  return {
    at: event.createdAt,
    // Unknown future event types render with the timeline's fallback icon.
    type: EVENT_TYPES.has(type) ? (type as DealEvent["type"]) : "created",
    label: event.label,
    actor: lowerStatus(event.actor) as DealEvent["actor"],
  };
}

function mapPayment(row: DealPaymentDto): DealPayment {
  return {
    id: row.id,
    type: lowerStatus(row.type) as DealPayment["type"],
    label: row.label,
    amount: toNaira(row.amountMinor),
    method: lowerStatus(row.method) as DealPayment["method"],
    methodLabel: METHOD_LABELS[row.method],
    provider: lowerStatus(row.provider) as DealPayment["provider"],
    reference: row.reference,
    status: lowerStatus(row.escrowStatus) as DealPayment["status"],
    paidAt: row.paidAt,
    releasedAt: row.releasedAt ?? undefined,
  };
}

function mapDeliveries(deliveries: NonNullable<DealDetailDto["deliveries"]>): DealDelivery[] {
  return deliveries.map((delivery) => ({
    id: delivery.id,
    note: delivery.note ?? "",
    submittedAt: delivery.submittedAt,
    files: delivery.files.map(mapFile),
  }));
}

/** Every FINAL file across deliveries — the prototype's `finalFiles`. */
function finalFilesOf(deliveries: DealDelivery[]): DealFile[] {
  return deliveries.flatMap((delivery) => delivery.files.filter((file) => file.role === "FINAL"));
}

/**
 * Owner deal (list or detail). List rows carry no events/deliveries —
 * the mapper fills them with empty arrays so screens can rely on the shape.
 */
export function mapDeal(row: DealDetailDto): Deal {
  const deliveries = row.deliveries ? mapDeliveries(row.deliveries) : [];
  return {
    id: row.id,
    ref: row.ref,
    creatorId: row.creatorId,
    requestId: row.requestId,
    shareToken: row.shareToken,
    title: row.title,
    serviceTitle: row.serviceTitle,
    client: { name: row.clientName, contact: row.clientContact },
    summary: row.summary ?? "",
    eventDate: toDateString(row.eventDate),
    location: row.location ?? "",
    message: row.message ?? "",
    scope: row.scope ?? "",
    deliverables: row.deliverables.map((d) => d.name),
    price: toNaira(row.priceMinor),
    depositPercent: row.depositPercent,
    installmentsCount: row.installmentsCount,
    startDate: toDateString(row.startDate),
    dueDate: toDateString(row.dueDate),
    revisions: row.revisions,
    status: lowerStatus(row.status) as DealStatus,
    events: (row.events ?? []).map(mapEvent),
    payments: row.payments.map(mapPayment),
    deliveries,
    finalFiles: finalFilesOf(deliveries),
    createdAt: row.createdAt,
    sentAt: row.sentAt ?? undefined,
    acceptedAt: row.acceptedAt ?? undefined,
    depositPaidAt: row.depositPaidAt ?? undefined,
    deliveredAt: row.deliveredAt ?? undefined,
    approvedAt: row.approvedAt ?? undefined,
    balancePaidAt: row.balancePaidAt ?? undefined,
    filesReleasedAt: row.filesReleasedAt ?? undefined,
    paymentReleasedAt: row.paymentReleasedAt ?? undefined,
    completedAt: row.completedAt ?? undefined,
  };
}

/* ---- shared (capability link) ---- */

export function mapPublicChannels(channels: PublicProfileDto["channels"]): CreatorChannel[] {
  return channels
    .map((channel) => {
      const type = channel.type.toLowerCase() as CreatorChannel["type"];
      return { type, value: channel.value, primary: channel.isPrimary };
    })
    .filter((channel) => Boolean(channel.type));
}

export function mapPublicCreator(profile: PublicProfileDto): PublicCreator {
  const channels = mapPublicChannels(profile.channels);
  return {
    id: profile.id,
    name: profile.name,
    handle: profile.handle,
    craft: profile.craft ?? "",
    location: profile.location ?? "",
    bio: profile.bio ?? "",
    verified: profile.verified,
    preferredProvider: profile.preferredProvider.toLowerCase() as PaymentProvider,
    channels,
    whatsapp: channels.find((c) => c.type === "whatsapp")?.value ?? "",
  };
}

/** Creator as seen on public/shared surfaces (no contact details, no internal ids). */
export interface PublicCreator {
  id: string;
  name: string;
  handle: string;
  craft: string;
  location: string;
  bio: string;
  verified: boolean;
  preferredProvider: PaymentProvider;
  channels: CreatorChannel[];
  whatsapp: string;
}

export function mapScheduleSlots(amounts: DealAmountsDto): ScheduleSlot[] {
  return amounts.schedule.map((slot) => ({
    type: lowerStatus(slot.type) as ScheduleSlot["type"],
    label: slot.label,
    amount: toNaira(slot.amountMinor),
    status: slot.status,
  }));
}

export interface SharedData {
  deal: Deal;
  creator: ReturnType<typeof mapPublicCreator>;
  amounts: {
    total: number;
    deposit: number;
    paid: number;
    due: number;
    held: number;
    released: number;
    schedule: ScheduleSlot[];
    nextDue: ScheduleSlot | null;
    fullyPaid: boolean;
    approved: boolean;
  };
}

/**
 * The share-page payload. The client is not a user: money facts come from the
 * backend's `amounts` block (schedule, held, due), the record timeline and
 * deliveries from the whitelisted projection.
 */
export function mapSharedProjection(data: SharedProjectionDto): SharedData {
  const { deal, creator, amounts } = data;
  const deliveries: DealDelivery[] = deal.deliveries.map((delivery) => ({
    id: delivery.submittedAt, // grouping key only — the projection has no ids
    note: delivery.note ?? "",
    submittedAt: delivery.submittedAt,
    files: delivery.files.map(mapFile),
  }));

  return {
    deal: {
      id: deal.ref, // client view keys off ref; the id never leaves the server
      ref: deal.ref,
      creatorId: "",
      requestId: null,
      shareToken: "",
      title: deal.title,
      serviceTitle: deal.serviceTitle,
      client: { name: deal.clientName, contact: "" },
      summary: deal.summary ?? "",
      eventDate: toDateString(deal.eventDate),
      location: deal.location ?? "",
      message: deal.message ?? "",
      scope: deal.scope ?? "",
      deliverables: deal.deliverables,
      price: toNaira(amounts.totalMinor),
      depositPercent: deal.depositPercent,
      installmentsCount: deal.installmentsCount,
      startDate: toDateString(deal.startDate),
      dueDate: toDateString(deal.dueDate),
      revisions: deal.revisions,
      status: lowerStatus(deal.status) as DealStatus,
      events: deal.events.map(mapEvent),
      payments: [],
      deliveries,
      finalFiles: finalFilesOf(deliveries),
      createdAt: deal.createdAt,
      sentAt: deal.sentAt ?? undefined,
      acceptedAt: deal.acceptedAt ?? undefined,
      depositPaidAt: deal.depositPaidAt ?? undefined,
      deliveredAt: deal.deliveredAt ?? undefined,
      approvedAt: deal.approvedAt ?? undefined,
      filesReleasedAt: deal.filesReleasedAt ?? undefined,
      completedAt: deal.completedAt ?? undefined,
    },
    creator: mapPublicCreator(creator),
    amounts: {
      total: toNaira(amounts.totalMinor),
      deposit: toNaira(amounts.depositMinor),
      paid: toNaira(amounts.paidMinor),
      due: toNaira(amounts.dueMinor),
      held: toNaira(amounts.heldMinor),
      released: toNaira(amounts.paidMinor - amounts.heldMinor),
      schedule: mapScheduleSlots(amounts),
      nextDue: amounts.nextDue
        ? {
            type: lowerStatus(amounts.nextDue.type) as ScheduleSlot["type"],
            label: amounts.nextDue.label,
            amount: toNaira(amounts.nextDue.amountMinor),
            status: amounts.nextDue.status,
          }
        : null,
      fullyPaid: amounts.fullyPaid,
      approved: amounts.approved,
    },
  };
}

/* ---- overview ---- */

export interface Overview {
  creator: {
    id: string;
    name: string;
    handle: string;
    craft: string;
    location: string;
    bio: string;
    verified: boolean;
    onboarded: boolean;
    createdAt: string;
  };
  stats: CreatorOverviewDto["stats"];
  money: {
    releasedAllTime: number;
    earnedThisMonth: number;
    inEscrow: number;
    expectedBalance: number;
  };
  earningsSeries: { month: string; amount: number }[];
  rating: { average: number | null; count: number };
  requests: (ClientRequest & { service: Service | null })[];
  deals: {
    id: string;
    ref: string;
    title: string;
    client: string;
    status: DealStatus;
    price: number;
    balance: number;
    dueDate: string;
    updatedAt: string;
  }[];
  bookings: (Booking & { service: Service | null })[];
}

export function mapOverview(row: CreatorOverviewDto): Overview {
  return {
    creator: {
      id: row.creator.id,
      name: row.creator.name,
      handle: row.creator.handle,
      craft: row.creator.craft ?? "",
      location: row.creator.location ?? "",
      bio: row.creator.bio ?? "",
      verified: row.creator.verified,
      onboarded: row.creator.onboarded,
      createdAt: row.creator.createdAt,
    },
    stats: row.stats,
    money: {
      releasedAllTime: toNaira(row.money.releasedAllTime),
      earnedThisMonth: toNaira(row.money.earnedThisMonth),
      inEscrow: toNaira(row.money.inEscrow),
      expectedBalance: toNaira(row.money.expectedBalance),
    },
    earningsSeries: row.earningsSeries.map((point) => ({
      month: point.month,
      amount: toNaira(point.amountMinor),
    })),
    rating: row.rating,
    requests: row.requests.map((request) =>
      mapRequest({
        creatorId: "",
        ...request,
        serviceId: request.service?.id ?? "",
        eventDate: request.eventDate,
        location: null,
        budgetMinMinor: request.budgetMinMinor,
        budgetMaxMinor: request.budgetMaxMinor,
        notes: null,
        service: null,
        updatedAt: request.createdAt,
      }),
    ),
    deals: row.deals.map((deal) => ({
      id: deal.id,
      ref: deal.ref,
      title: deal.title,
      client: deal.clientName,
      status: lowerStatus(deal.status) as DealStatus,
      price: toNaira(deal.priceMinor),
      balance: toNaira(deal.balanceMinor),
      dueDate: toDateString(deal.dueDate),
      updatedAt: deal.updatedAt,
    })),
    bookings: row.bookings.map((booking) =>
      mapBooking({
        creatorId: "",
        ...booking,
        serviceId: booking.service?.id ?? null,
        note: null,
        service: null,
        updatedAt: booking.createdAt,
      }),
    ),
  };
}
