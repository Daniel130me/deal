/**
 * Raw backend response shapes (NestJS API) — BEFORE mapping into the
 * frontend's prototype types. Money is kobo (`*Minor` ints), enums are
 * UPPER_CASE, dates are ISO strings. See mappers.ts for the conversion.
 */

export type Role = "CREATOR" | "CLIENT" | "ADMIN";

/** backend/src/modules/auth — auth user (passwordHash structurally stripped). */
export interface SafeUserDto {
  id: string;
  email: string | null;
  phone: string | null;
  role: Role;
  status: "ACTIVE" | "SUSPENDED" | "DELETED";
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthPayload {
  user: SafeUserDto;
  accessToken: string;
  refreshToken: string;
}

/* ---- creators ---- */

export type ChannelTypeDto =
  | "WHATSAPP"
  | "TELEGRAM"
  | "INSTAGRAM"
  | "EMAIL"
  | "PHONE_CALL"
  | "SMS"
  | "X_TWITTER"
  | "LINKEDIN"
  | "TIKTOK";

export interface ChannelDto {
  id: string;
  creatorId: string;
  type: ChannelTypeDto;
  value: string;
  isPrimary: boolean;
  createdAt: string;
}

export interface OwnedProfile {
  id: string;
  userId: string;
  name: string;
  handle: string;
  craft: string | null;
  location: string | null;
  bio: string | null;
  verified: boolean;
  onboarded: boolean;
  preferredProvider: "FLUTTERWAVE" | "PAYSTACK";
  createdAt: string;
  updatedAt: string;
  channels: ChannelDto[];
}

/** Whitelisted creator fields on public/shared surfaces. */
export interface PublicProfileDto {
  id: string;
  name: string;
  handle: string;
  craft: string | null;
  location: string | null;
  bio: string | null;
  verified: boolean;
  preferredProvider: "FLUTTERWAVE" | "PAYSTACK";
  channels: { type: ChannelTypeDto; value: string; isPrimary: boolean }[];
}

/* ---- services / requests / bookings ---- */

export interface ServiceDto {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  startingPriceMinor: number;
  duration: string | null;
  isPopular: boolean;
  isActive: boolean;
  includes: string[];
  createdAt: string;
  updatedAt: string;
}

export type RequestStatusDto = "NEW" | "REPLIED" | "DECLINED" | "ARCHIVED";

export interface ClientRequestDto {
  id: string;
  ref: string;
  creatorId: string;
  serviceId: string;
  clientName: string;
  clientContact: string;
  eventDate: string | null;
  location: string | null;
  budgetMinMinor: number;
  budgetMaxMinor: number;
  description: string;
  notes: string | null;
  status: RequestStatusDto;
  createdAt: string;
  updatedAt: string;
  service?: ServiceDto | null;
}

export type BookingStatusDto = "REQUESTED" | "CONFIRMED" | "COMPLETED" | "DECLINED" | "CANCELLED";

export interface BookingDto {
  id: string;
  ref: string;
  creatorId: string;
  serviceId: string | null;
  sessionType: string;
  clientName: string;
  clientContact: string;
  date: string;
  time: string;
  note: string | null;
  status: BookingStatusDto;
  createdAt: string;
  updatedAt: string;
  service?: ServiceDto | null;
}

/* ---- deals ---- */

export type DealStatusDto =
  | "DRAFT"
  | "SENT"
  | "CHANGES_REQUESTED"
  | "DECLINED"
  | "ACTIVE"
  | "DELIVERED"
  | "REVISION"
  | "APPROVED"
  | "BALANCE_PAID"
  | "FILES_RELEASED"
  | "COMPLETED"
  | "DISPUTED";

export interface DealDeliverableDto {
  id: string;
  dealId: string;
  name: string;
  position: number;
}

export interface DealPaymentDto {
  id: string;
  dealId: string;
  type: "DEPOSIT" | "INSTALLMENT" | "BALANCE";
  label: string;
  amountMinor: number;
  method: "CARD" | "TRANSFER" | "USSD";
  provider: "FLUTTERWAVE" | "PAYSTACK";
  reference: string;
  escrowStatus: "HELD" | "RELEASED" | "REFUNDED" | "DISPUTED";
  paidAt: string;
  releasedAt: string | null;
  createdAt: string;
}

export interface DealEventDto {
  id: string;
  dealId: string;
  type: string;
  actor: "CREATOR" | "CLIENT" | "SYSTEM" | "ADMIN";
  actorId: string | null;
  label: string;
  metadata: unknown;
  createdAt: string;
}

export interface FileAssetDto {
  id: string;
  dealId: string;
  role: "PREVIEW" | "FINAL";
  filename: string;
  sizeBytes: number;
  mime: string;
  createdAt: string;
  releasedAt: string | null;
}

export interface DealDeliveryDto {
  id: string;
  dealId: string;
  note: string | null;
  submittedAt: string;
  files: FileAssetDto[];
}

/** Owner-facing deal detail (GET/PATCH/POST /deals...). */
export interface DealDetailDto {
  id: string;
  ref: string;
  creatorId: string;
  requestId: string | null;
  shareToken: string;
  title: string;
  serviceTitle: string;
  clientName: string;
  clientContact: string;
  summary: string | null;
  eventDate: string | null;
  location: string | null;
  message: string | null;
  scope: string | null;
  priceMinor: number;
  depositPercent: number;
  installmentsCount: number;
  revisions: number;
  startDate: string | null;
  dueDate: string | null;
  status: DealStatusDto;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  acceptedAt: string | null;
  depositPaidAt: string | null;
  deliveredAt: string | null;
  approvedAt: string | null;
  balancePaidAt: string | null;
  filesReleasedAt: string | null;
  paymentReleasedAt: string | null;
  completedAt: string | null;
  deliverables: DealDeliverableDto[];
  payments: DealPaymentDto[];
  amounts: DealAmountsDto;
  // detail-only relations (absent on list rows):
  events?: DealEventDto[];
  deliveries?: DealDeliveryDto[];
  request?: { ref: string } | null;
}

/** The amounts block the backend computes from stored payments (kobo). */
export interface ScheduleSlotDto {
  type: "DEPOSIT" | "INSTALLMENT" | "BALANCE";
  label: string;
  amountMinor: number;
  status: "paid" | "due";
}

export interface DealAmountsDto {
  totalMinor: number;
  depositMinor: number;
  paidMinor: number;
  dueMinor: number;
  heldMinor: number;
  fullyPaid: boolean;
  approved: boolean;
  schedule: ScheduleSlotDto[];
  nextDue: ScheduleSlotDto | null;
}

/* ---- shared (capability-link) surface ---- */

export interface SharedProjectionDto {
  deal: {
    ref: string;
    title: string;
    serviceTitle: string;
    clientName: string;
    status: DealStatusDto;
    summary: string | null;
    scope: string | null;
    message: string | null;
    eventDate: string | null;
    location: string | null;
    deliverables: string[];
    revisions: number;
    depositPercent: number;
    installmentsCount: number;
    startDate: string | null;
    dueDate: string | null;
    createdAt: string;
    sentAt: string | null;
    acceptedAt: string | null;
    depositPaidAt: string | null;
    deliveredAt: string | null;
    approvedAt: string | null;
    filesReleasedAt: string | null;
    completedAt: string | null;
    events: { type: string; actor: string; label: string; createdAt: string }[];
    deliveries: {
      note: string | null;
      submittedAt: string;
      files: FileAssetDto[];
    }[];
  };
  creator: PublicProfileDto;
  amounts: DealAmountsDto;
}

/* ---- payments ---- */

export interface PaymentInitiationDto {
  reference: string;
  provider: "FLUTTERWAVE" | "PAYSTACK";
  method: "CARD" | "TRANSFER" | "USSD";
  amountMinor: number;
  label: string;
  link: string;
}

export interface PaymentVerificationDto {
  status: "pending" | "failed" | "successful";
  reference: string;
  payment?: {
    reference: string;
    type: string;
    label: string;
    amountMinor: number;
    escrowStatus: string;
    paidAt: string;
  };
  amounts: DealAmountsDto;
}

/* ---- overview ---- */

export interface CreatorOverviewDto {
  creator: {
    id: string;
    name: string;
    handle: string;
    craft: string | null;
    location: string | null;
    bio: string | null;
    verified: boolean;
    onboarded: boolean;
    createdAt: string;
  };
  stats: {
    totalRequests: number;
    newRequests: number;
    pendingDeals: number;
    ongoingDeals: number;
    completedDeals: number;
    newThisWeek: number;
    upcomingBookings: number;
  };
  money: {
    releasedAllTime: number;
    earnedThisMonth: number;
    inEscrow: number;
    expectedBalance: number;
  };
  earningsSeries: { month: string; amountMinor: number }[];
  rating: { average: number | null; count: number };
  requests: {
    id: string;
    ref: string;
    clientName: string;
    clientContact: string;
    status: RequestStatusDto;
    eventDate: string | null;
    budgetMinMinor: number;
    budgetMaxMinor: number;
    description: string;
    createdAt: string;
    service: { id: string; title: string } | null;
  }[];
  deals: {
    id: string;
    ref: string;
    title: string;
    clientName: string;
    status: DealStatusDto;
    priceMinor: number;
    balanceMinor: number;
    dueDate: string | null;
    updatedAt: string;
  }[];
  bookings: {
    id: string;
    ref: string;
    sessionType: string;
    clientName: string;
    clientContact: string;
    date: string;
    time: string;
    status: BookingStatusDto;
    createdAt: string;
    service: { id: string; title: string } | null;
  }[];
}

/* ---- files ---- */

export interface FileUploadUrlDto {
  upload: {
    uploadUrl: string;
    storageKey: string;
    mime: string;
    expiresIn: number;
  };
}

export interface FileDownloadDto {
  download: {
    downloadUrl: string;
    expiresIn: number;
    file: FileAssetDto;
  };
}
