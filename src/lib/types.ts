export interface User {
  id: string;
  name: string;
  handle: string;
  email: string;
  phone: string;
  whatsapp: string;
  password: string;
  craft: string;
  location: string;
  bio: string;
  verified: boolean;
  onboarded: boolean;
  createdAt: string;
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
    | "disputed";
  label: string;
  actor: "creator" | "client" | "system";
}

export interface DealPayment {
  id: string;
  type: "deposit" | "balance";
  amount: number;
  method: string;
  status: "held" | "released";
  paidAt: string;
}

export interface DealFile {
  id: string;
  name: string;
  size: string;
  kind: string;
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
  approved: "Awaiting balance",
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
  approved: "bg-sky-50 text-teal-700",
  balance_paid: "bg-accent text-accent-foreground",
  files_released: "bg-accent text-accent-foreground",
  completed: "bg-accent text-accent-foreground",
  disputed: "bg-red-50 text-red-600",
};

export function depositAmount(deal: Pick<Deal, "price" | "depositPercent">) {
  return Math.round((deal.price * deal.depositPercent) / 100);
}

export function balanceAmount(deal: Pick<Deal, "price" | "depositPercent">) {
  return deal.price - depositAmount(deal);
}

export function paidTotal(deal: Deal) {
  return deal.payments.reduce((sum, p) => sum + p.amount, 0);
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
