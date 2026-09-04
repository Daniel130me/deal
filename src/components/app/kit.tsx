"use client";

import { Camera, CalendarDays, MapPin, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  STATUS_LABELS,
  STATUS_CHIP_CLASS,
  formatNaira,
  formatDate,
  formatDateTime,
  type Deal,
  type DealStatus,
  type DealEvent,
} from "@/lib/types";
import { cn } from "@/lib/utils";

/* ---------- status chip ---------- */

export function StatusChip({ status, className }: { status: DealStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-extrabold",
        STATUS_CHIP_CLASS[status],
        className
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

/* ---------- page scaffolding ---------- */

export function AppPage({
  title,
  subtitle,
  chip,
  backHref,
  children,
  action,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  chip?: React.ReactNode;
  backHref?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex-1 px-5 pb-8 pt-5">
      {backHref ? (
        <a
          href={backHref}
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold text-primary"
        >
          ← Back
        </a>
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-extrabold tracking-tight text-foreground">
            <span className="truncate">{title}</span>
            {chip}
          </h1>
          {subtitle ? (
            <p className="mt-1 text-sm font-medium text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="mt-5 space-y-4">{children}</div>
    </div>
  );
}

export function SectionCard({
  title,
  right,
  children,
  className,
}: {
  title?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-4", className)}>
      {(title || right) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-extrabold text-foreground">{title}</h2>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

/* ---------- meta rows ---------- */

export function MetaRow({
  items,
  className,
}: {
  items: { icon: React.ReactNode; text: React.ReactNode }[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-semibold text-muted-foreground", className)}>
      {items.map((item, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {item.icon}
          {item.text}
        </span>
      ))}
    </div>
  );
}

export function PersonIcon() {
  return <Camera className="h-3.5 w-3.5" />;
}
export function DateIcon() {
  return <CalendarDays className="h-3.5 w-3.5" />;
}
export function PinIcon() {
  return <MapPin className="h-3.5 w-3.5" />;
}

/* ---------- stepper (deal progress) ---------- */

export interface Step {
  label: string;
  sub?: string;
  state: "done" | "current" | "todo";
}

export function Stepper({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex w-full items-start">
      {steps.map((step, i) => (
        <li key={step.label} className="relative flex flex-1 flex-col items-center text-center">
          {i > 0 && (
            <span
              aria-hidden
              className={cn(
                "absolute left-[-50%] right-[50%] top-4 -z-0 h-0.5",
                step.state === "todo" ? "bg-border" : "bg-primary"
              )}
            />
          )}
          <span
            className={cn(
              "relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-[12px] font-extrabold",
              step.state === "done" && "border-primary bg-primary text-white",
              step.state === "current" && "border-primary bg-white text-primary ring-4 ring-primary/10",
              step.state === "todo" && "border-border bg-white text-muted-foreground"
            )}
          >
            {step.state === "done" ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
          </span>
          <span
            className={cn(
              "mt-2 text-[11px] font-extrabold leading-tight",
              step.state === "todo" ? "text-muted-foreground" : "text-foreground"
            )}
          >
            {step.label}
          </span>
          {step.sub ? (
            <span className="mt-0.5 text-[10px] font-semibold text-muted-foreground">{step.sub}</span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/* ---------- payment summary ---------- */

function PayChip({ tone, children }: { tone: "green" | "amber" | "gray"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-extrabold",
        tone === "green" && "bg-accent text-accent-foreground",
        tone === "amber" && "bg-amber-50 text-amber-700",
        tone === "gray" && "bg-muted text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}

function PayRow({
  label,
  sub,
  amount,
  badge,
  strong,
}: {
  label: string;
  sub?: string;
  amount: number | string;
  badge?: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <div>
        <p className="text-sm font-bold text-foreground">{label}</p>
        {sub ? <p className="text-xs font-medium text-muted-foreground">{sub}</p> : null}
      </div>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "text-sm font-extrabold",
            strong ? "text-foreground" : amount === 0 ? "text-muted-foreground" : "text-primary"
          )}
        >
          {typeof amount === "number" ? formatNaira(amount) : amount}
        </span>
        {badge}
      </div>
    </div>
  );
}

export function PaymentSummary({
  deal,
  deposit,
  balance,
}: {
  deal: Deal;
  deposit: number;
  balance: number;
}) {
  const depositPaid = deal.payments.some((p) => p.type === "deposit");
  const balancePaid = deal.payments.some((p) => p.type === "balance");
  const allReleased = deal.payments.length > 0 && deal.payments.every((p) => p.status === "released");

  return (
    <SectionCard title="Payment summary">
      <div className="divide-y divide-border">
        <PayRow label="Total project price" amount={deal.price} strong />
        <PayRow
          label={`Deposit (${deal.depositPercent}%)`}
          sub={depositPaid ? (allReleased ? "Paid & released" : "Paid · secured in escrow") : "Pending"}
          amount={deposit}
          badge={
            allReleased ? (
              <PayChip tone="green">Released</PayChip>
            ) : depositPaid ? (
              <PayChip tone="green">Secured</PayChip>
            ) : (
              <PayChip tone="gray">Pending</PayChip>
            )
          }
        />
        <PayRow
          label="Balance"
          sub={balancePaid ? (allReleased ? "Paid & released" : "Paid · held securely") : "Due on approval"}
          amount={balance}
          badge={
            allReleased ? (
              <PayChip tone="green">Released</PayChip>
            ) : balancePaid ? (
              <PayChip tone="green">Secured</PayChip>
            ) : (
              <PayChip tone="amber">Due</PayChip>
            )
          }
        />
      </div>
    </SectionCard>
  );
}

/* ---------- escrow banner ---------- */

export function EscrowBanner({
  amount,
  paidOn,
  note = "Your deposit is securely held by DEAL and will only be released when you approve the completed work.",
}: {
  amount: number;
  paidOn?: string;
  note?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-secondary p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-primary" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <rect x="9" y="10" width="6" height="5" rx="1" />
          <path d="M10 10V8.5a2 2 0 1 1 4 0V10" />
        </svg>
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-extrabold text-accent-foreground">
          Payment is protected · <span className="text-foreground">{formatNaira(amount)}</span> held in escrow
        </p>
        <p className="mt-0.5 text-[13px] font-medium leading-relaxed text-muted-foreground">{note}</p>
        {paidOn ? (
          <p className="mt-1 text-xs font-bold text-muted-foreground">Paid {formatDate(paidOn)}</p>
        ) : null}
      </div>
    </div>
  );
}

/* ---------- deal record timeline ("DEAL keeps the record") ---------- */

const EVENT_ICONS: Record<string, string> = {
  created: "📝",
  sent: "📤",
  accepted: "🤝",
  deposit_paid: "💰",
  delivered: "📦",
  changes_requested: "✏️",
  approved: "✅",
  balance_paid: "💰",
  files_released: "📂",
  payment_released: "🏦",
  completed: "🎉",
  declined: "🚫",
  disputed: "⚠️",
};

export function RecordTimeline({ events }: { events: DealEvent[] }) {
  return (
    <SectionCard title="DEAL keeps the record">
      <ol className="relative space-y-4 border-l border-dashed border-border pl-5">
        {[...events].reverse().map((event, i) => (
          <li key={i} className="relative">
            <span className="absolute -left-[27px] flex h-4 w-4 items-center justify-center rounded-full bg-white ring-2 ring-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            <p className="text-[13px] font-bold text-foreground">
              <span className="mr-1">{EVENT_ICONS[event.type] ?? "•"}</span>
              {event.label}
            </p>
            <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {formatDateTime(event.at)} · {event.actor}
            </p>
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}

/* ---------- file rows ---------- */

export function FileRow({
  name,
  size,
  kind,
  locked,
  onPreview,
}: {
  name: string;
  size: string;
  kind: string;
  locked?: boolean;
  onPreview?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-white p-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-[10px] font-extrabold text-primary">
        {kind}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-bold text-foreground">{name}</p>
        <p className="text-xs font-semibold text-muted-foreground">{size}</p>
      </div>
      {locked ? (
        <Badge variant="outline" className="shrink-0 border-border text-[10px] font-bold text-muted-foreground">
          🔒 Locked
        </Badge>
      ) : (
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onPreview}
            className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-bold text-foreground transition-colors hover:bg-muted"
          >
            Preview
          </button>
          <button
            type="button"
            onClick={() => onPreview?.()}
            aria-label={`Download ${name}`}
            className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-muted"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
              <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- agreement block (client-facing summary) ---------- */

export function AgreementSummary({ deal }: { deal: Deal }) {
  return (
    <SectionCard title="What you're getting">
      <div className="space-y-3">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">Scope</p>
          <p className="mt-1 text-sm font-medium leading-relaxed text-foreground">{deal.scope}</p>
        </div>
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
            Deliverables
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {deal.deliverables.map((d) => (
              <li key={d} className="flex items-start gap-2 text-sm font-semibold text-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={3} />
                {d}
              </li>
            ))}
          </ul>
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">Timeline</p>
            <p className="mt-1 font-bold text-foreground">
              {formatDate(deal.startDate)} → {formatDate(deal.dueDate)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">Revisions</p>
            <p className="mt-1 font-bold text-foreground">{deal.revisions} round{deal.revisions === 1 ? "" : "s"} included</p>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
