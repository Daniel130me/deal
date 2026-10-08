export type ChannelType =
  | "whatsapp"
  | "telegram"
  | "instagram"
  | "email"
  | "phone_call"
  | "sms"
  | "x_twitter"
  | "linkedin"
  | "tiktok";

export interface CreatorChannel {
  type: ChannelType;
  value: string;
  primary?: boolean;
}

export interface User {
  id: string;
  name: string;
  handle: string;
  email: string;
  phone: string;
  whatsapp: string;
  channels: CreatorChannel[];
  password: string;
  craft: string;
  location: string;
  bio: string;
  verified: boolean;
  onboarded: boolean;
  preferredProvider: PaymentProvider;
  createdAt: string;
  /** Present on API-backed sessions (auth user fields); prototype rows omit them. */
  role?: "CREATOR" | "CLIENT" | "ADMIN";
  status?: "ACTIVE" | "SUSPENDED" | "DELETED";
  lastLoginAt?: string | null;
  updatedAt?: string;
}

export interface Service {
  id: string;
  userId: string;
  title: string;
  desc: string;
  from: number;
  duration: string;
  popular: boolean;
  includes: string[];
  /** API-backed rows carry the active flag; prototype rows omit it. */
  isActive?: boolean;
}

export interface ClientRequest {
  id: string;
  ref: string;
  creatorId: string;
  serviceId: string;
  clientName: string;
  clientContact: string;
  eventDate: string;
  location: string;
  budgetMin: number;
  budgetMax: number;
  description: string;
  notes: string;
  status: "new" | "replied" | "archived" | "declined";
  createdAt: string;
  /** Joined service (API rows include it); prototype rows may omit it. */
  service?: Service | null;
}

export interface Booking {
  id: string;
  ref: string;
  creatorId: string;
  serviceId?: string;
  sessionType: string;
  clientName: string;
  clientContact: string;
  date: string; // yyyy-mm-dd
  time: string; // "10:00"
  note: string;
  status: "requested" | "confirmed" | "completed" | "declined" | "cancelled";
  createdAt: string;
  /** Joined service (API rows include it); prototype rows may omit it. */
  service?: Service | null;
}

export interface DealEvent {
  at: string;
  type:
    | "created"
    | "sent"
    | "accepted"
    | "deposit_paid"
    | "delivered"
    | "changes_requested"
    | "approved"
    | "balance_paid"
    | "files_released"
    | "payment_released"
    | "completed"
    | "declined"
    | "disputed"
    | "review"
    | "dispute_resolved";
  label: string;
  actor: "creator" | "client" | "system" | "admin";
}

export type PaymentMethod = "card" | "transfer" | "ussd";

/** Payment rails DEAL supports. They process the charge; escrow is managed by DEAL itself. */
export type PaymentProvider = "flutterwave" | "paystack";

export const PROVIDERS: PaymentProvider[] = ["flutterwave", "paystack"];

export function isPaymentProvider(value: unknown): value is PaymentProvider {
  return value === "flutterwave" || value === "paystack";
}

export const PROVIDER_META: Record<
  PaymentProvider,
  { label: string; logo: string; logoWhite: string; refPrefix: "FLW" | "PSK"; tint: string }
> = {
  flutterwave: {
    label: "Flutterwave",
    logo: "/flutterwave/logo.svg",
    logoWhite: "/flutterwave/logo-white.svg",
    refPrefix: "FLW",
    tint: "bg-[#FFF3E0] text-[#8A5300]",
  },
  paystack: {
    label: "Paystack",
    logo: "/paystack/logo.svg",
    logoWhite: "/paystack/logo-white.svg",
    refPrefix: "PSK",
    tint: "bg-[#E0F7FE] text-[#02516B]",
  },
};

/** DEAL is niched down to these creator crafts only. */
export const CREATOR_CRAFTS = [
  "Photographer",
  "Videographer",
  "Motion designer",
  "Graphic designer",
  "Video editor",
  "Illustrator",
  "Voice artist",
] as const;

export type CreatorCraft = (typeof CREATOR_CRAFTS)[number];

export interface DealPayment {
  id: string;
  type: "deposit" | "installment" | "balance";
  label: string;
  amount: number;
  method: PaymentMethod;
  methodLabel: string;
  provider: PaymentProvider;
  reference: string; // FLW-XXXXXXXX (Flutterwave) | PSK-XXXXXXXX (Paystack)
  status: "held" | "released" | "refunded" | "disputed";
  paidAt: string;
  releasedAt?: string;
}

export interface DealFile {
  id: string;
  name: string;
  size: string;
  kind: string;
  /** API-backed rows carry the storage role + mime; prototype rows omit them. */
  role?: "PREVIEW" | "FINAL";
  mime?: string;
}

export interface DealDelivery {
  id: string;
  note: string;
  files: DealFile[];
  submittedAt: string;
}

export type DealStatus =
  | "draft"
  | "sent"
  | "changes_requested"
  | "declined"
  | "active"
  | "delivered"
  | "revision"
  | "approved"
  | "balance_paid"
  | "files_released"
  | "completed"
  | "disputed";

export interface Deal {
  id: string;
  ref: string;
  creatorId: string;
  requestId: string | null;
  shareToken: string;
  title: string;
  serviceTitle: string;
  client: { name: string; contact: string };
  summary: string;
  eventDate: string;
  location: string;
  message: string;
  scope: string;
  deliverables: string[];
  price: number;
  depositPercent: number;
  installmentsCount: number;
  startDate: string;
  dueDate: string;
  revisions: number;
  status: DealStatus;
  events: DealEvent[];
  payments: DealPayment[];
  deliveries: DealDelivery[];
  finalFiles: DealFile[];
  createdAt: string;
  sentAt?: string;
  acceptedAt?: string;
  depositPaidAt?: string;
  deliveredAt?: string;
  approvedAt?: string;
  balancePaidAt?: string;
  filesReleasedAt?: string;
  paymentReleasedAt?: string;
  completedAt?: string;
}

export interface DB {
  users: User[];
  services: Service[];
  requests: ClientRequest[];
  deals: Deal[];
  bookings: Booking[];
  settings: { earningsSeries: { month: string; amount: number }[] };
}

export interface PublicUser extends Omit<User, "password" | "email"> {
  email?: string;
}

export const STATUS_LABELS: Record<DealStatus, string> = {
  draft: "Draft",
  sent: "Awaiting response",
  changes_requested: "Changes requested",
  declined: "Declined",
  active: "Active",
  delivered: "Awaiting review",
  revision: "Revision requested",
  approved: "Approved · Funds released",
  balance_paid: "Payment secured",
  files_released: "Files released",
  completed: "Completed",
  disputed: "In dispute",
};

export const STATUS_CHIP_CLASS: Record<DealStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-amber-50 text-amber-700",
  changes_requested: "bg-amber-50 text-amber-700",
  declined: "bg-red-50 text-red-600",
  active: "bg-accent text-accent-foreground",
  delivered: "bg-violet-50 text-violet-700",
  revision: "bg-amber-50 text-amber-700",
  approved: "bg-teal-50 text-teal-700",
  balance_paid: "bg-accent text-accent-foreground",
  files_released: "bg-accent text-accent-foreground",
  completed: "bg-accent text-accent-foreground",
  disputed: "bg-red-50 text-red-600",
};

export const BOOKING_STATUS_LABELS: Record<Booking["status"], string> = {
  requested: "Needs confirmation",
  confirmed: "Confirmed",
  completed: "Completed",
  declined: "Declined",
  cancelled: "Cancelled",
};

export const BOOKING_STATUS_CHIP_CLASS: Record<Booking["status"], string> = {
  requested: "bg-amber-50 text-amber-700",
  confirmed: "bg-accent text-accent-foreground",
  completed: "bg-muted text-muted-foreground",
  declined: "bg-red-50 text-red-600",
  cancelled: "bg-muted text-muted-foreground",
};

export function depositAmount(deal: Pick<Deal, "price" | "depositPercent">) {
  return Math.round((deal.price * deal.depositPercent) / 100);
}

/** @deprecated legacy helper — prefer remainingBalance() which accounts for payments made. */
export function balanceAmount(deal: Pick<Deal, "price" | "depositPercent">) {
  return deal.price - depositAmount(deal);
}

/** Everything still unpaid on the deal. */
export function remainingBalance(deal: Deal) {
  return Math.max(0, deal.price - paidTotal(deal));
}

export function isFullyPaid(deal: Deal) {
  return remainingBalance(deal) === 0;
}

/** Work has been approved by the client — new payments release instantly. */
export function isApproved(deal: Deal) {
  return (
    deal.status === "approved" ||
    deal.status === "files_released" ||
    deal.status === "completed"
  );
}

export function paidTotal(deal: Deal) {
  return deal.payments.reduce((sum, p) => sum + p.amount, 0);
}

export interface ScheduleSlot {
  type: DealPayment["type"];
  label: string;
  amount: number;
  status: "paid" | "due";
}

/** Ideal payment plan with each slot marked paid/due by consuming payments in order. */
export function paymentSchedule(deal: Deal): ScheduleSlot[] {
  const slots: Omit<ScheduleSlot, "status">[] = [];

  if (deal.depositPercent >= 100) {
    slots.push({ type: "deposit", label: "Full payment", amount: deal.price });
  } else {
    const deposit = depositAmount(deal);
    slots.push({
      type: "deposit",
      label: `Deposit (${deal.depositPercent}%)`,
      amount: deposit,
    });
    const balance = deal.price - deposit;
    const n = Math.max(0, deal.installmentsCount ?? 0);
    if (n === 0) {
      slots.push({ type: "balance", label: "Balance payment", amount: balance });
    } else {
      const each = Math.floor(balance / n);
      for (let i = 1; i <= n; i++) {
        const amount = i === n ? balance - each * (n - 1) : each;
        slots.push({
          type: "installment",
          label: n === 1 ? "Balance installment" : `Installment ${i} of ${n}`,
          amount,
        });
      }
    }
  }

  let pool = paidTotal(deal);
  const out: ScheduleSlot[] = [];
  for (const slot of slots) {
    if (pool >= slot.amount) {
      out.push({ ...slot, status: "paid" });
      pool -= slot.amount;
    } else {
      out.push({ ...slot, status: "due" });
    }
  }
  // Leftover money (e.g. a merged "pay all remaining" payment) clears everything.
  if (pool > 0) {
    for (const slot of out) slot.status = "paid";
  }
  return out;
}

export function nextDueSlot(deal: Deal): ScheduleSlot | null {
  return paymentSchedule(deal).find((s) => s.status === "due") ?? null;
}

export function formatNaira(amount: number) {
  return `₦${amount.toLocaleString("en-NG")}`;
}

export function formatDate(iso: string | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(iso: string | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "Fri, 12 Feb" for a yyyy-mm-dd booking date. */
export function formatBookingDate(date: string) {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
