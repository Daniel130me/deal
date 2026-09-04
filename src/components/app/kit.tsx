"use client";

import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  BOOKING_STATUS_CHIP_CLASS,
  BOOKING_STATUS_LABELS,
  STATUS_LABELS,
  STATUS_CHIP_CLASS,
  formatNaira,
  formatDate,
  formatDateTime,
  formatBookingDate,
  isApproved,
  paymentSchedule,
  remainingBalance,
  type Booking,
  type Deal,
  type DealEvent,
  type DealStatus,
  type CreatorChannel,
} from "@/lib/types";
import { CHANNEL_META, channelHref } from "@/lib/channels";
import { cn } from "@/lib/utils";

/* ---------- status chips ---------- */

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

export function BookingChip({ status, className }: { status: Booking["status"]; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-extrabold",
        BOOKING_STATUS_CHIP_CLASS[status],
        className
      )}
    >
      {BOOKING_STATUS_LABELS[status]}
    </span>
  );
}

/* ---------- Payaza branding ---------- */

export function PayazaMark({ withText = false, className }: { withText?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <img src="/payaza/payaza-logo.svg" alt="Payaza" className="h-4 w-auto" />
      {withText ? (
        <span className="text-[11px] font-bold text-muted-foreground">Powered by Payaza</span>
      ) : null}
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
    <div className="flex-1 pb-6">
      {backHref ? (
        <a
          href={backHref.startsWith("#") ? backHref : `#${backHref}`}
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-bold text-primary"
        >
          ← Back
        </a>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-extrabold tracking-tight text-foreground lg:text-2xl">
            <span className="truncate">{title}</span>
            {chip}
          </h1>
          {subtitle ? (
            <p className="mt-1 text-sm font-medium text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="mt-6 space-y-5 lg:mt-8 lg:space-y-6">{children}</div>
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
    <section className={cn("rounded-2xl border border-border bg-card p-5 lg:p-6", className)}>
      {(title || right) && (
        <header className="mb-4 flex items-center justify-between gap-2">
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

/* ---------- payment summary (schedule-based, escrow-aware) ---------- */

function PayChip({ tone, children }: { tone: "green" | "amber" | "gray" | "violet"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-extrabold",
        tone === "green" && "bg-accent text-accent-foreground",
        tone === "amber" && "bg-amber-50 text-amber-700",
        tone === "violet" && "bg-violet-50 text-violet-700",
        tone === "gray" && "bg-muted text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}

export function PaymentSummary({ deal }: { deal: Deal }) {
  const schedule = paymentSchedule(deal);
  const remaining = remainingBalance(deal);
  const approved = isApproved(deal);

  return (
    <SectionCard title="Payment summary">
      <div className="divide-y divide-border">
        <div className="flex items-center justify-between pb-3">
          <p className="text-sm font-bold text-foreground">Total project price</p>
          <span className="text-sm font-extrabold text-foreground">{formatNaira(deal.price)}</span>
        </div>
        {schedule.map((slot) => (
          <div key={slot.label} className="flex items-start justify-between gap-3 py-2.5">
            <div>
              <p className="text-sm font-bold text-foreground">{slot.label}</p>
              <p className="text-xs font-medium text-muted-foreground">
                {slot.status === "paid"
                  ? approved
                    ? "Paid & released to creator"
                    : "Paid · held in Payaza escrow"
                  : deal.status === "sent"
                    ? "Due after acceptance"
                    : "Due — pay anytime"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("text-sm font-extrabold", slot.status === "paid" ? "text-primary" : "text-foreground")}>
                {formatNaira(slot.amount)}
              </span>
              {slot.status === "paid" ? (
                approved ? (
                  <PayChip tone="green">Released</PayChip>
                ) : (
                  <PayChip tone="violet">In escrow</PayChip>
                )
              ) : (
                <PayChip tone="amber">Due</PayChip>
              )}
            </div>
          </div>
        ))}
        {remaining > 0 && (
          <div className="flex items-center justify-between pt-3">
            <p className="text-sm font-extrabold text-foreground">Remaining</p>
            <span className="text-sm font-extrabold text-foreground">{formatNaira(remaining)}</span>
          </div>
        )}
      </div>
      <p className="mt-3 rounded-xl bg-secondary p-3 text-xs font-medium leading-relaxed text-muted-foreground">
        Every payment sits in <span className="font-bold text-foreground">Payaza escrow</span> and is only
        released to the creator when the client approves the completed work.
      </p>
    </SectionCard>
  );
}

/* ---------- escrow banner ---------- */

export function EscrowBanner({
  amount,
  paidOn,
  note = "Held by Payaza escrow — the creator only receives it when you approve the completed work.",
}: {
  amount: number;
  paidOn?: string;
  note?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-secondary p-4 lg:p-5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-primary" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <rect x="9" y="10" width="6" height="5" rx="1" />
          <path d="M10 10V8.5a2 2 0 1 1 4 0V10" />
        </svg>
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-extrabold text-accent-foreground">
          Payment protected · <span className="text-foreground">{formatNaira(amount)}</span> held in escrow
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
        <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm sm:grid-cols-3">
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
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">Payment plan</p>
            <p className="mt-1 font-bold text-foreground">
              {deal.depositPercent >= 100
                ? "100% upfront"
                : `${deal.depositPercent}% deposit${deal.installmentsCount > 0 ? ` + ${deal.installmentsCount} installment${deal.installmentsCount === 1 ? "" : "s"}` : ""}`}
            </p>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

/* ---------- communication channels ---------- */

export function ChannelButtons({
  channels,
  size = "default",
  className,
}: {
  channels: CreatorChannel[];
  size?: "default" | "sm";
  className?: string;
}) {
  if (!channels || channels.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {channels.map((channel) => {
        const meta = CHANNEL_META[channel.type];
        if (!meta) return null;
        const Icon = meta.icon;
        return (
          <a
            key={channel.type + channel.value}
            href={channelHref(channel)}
            target="_blank"
            rel="noopener noreferrer"
            title={`${meta.label}: ${channel.value}`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-border bg-white font-bold text-foreground transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm",
              size === "default" ? "px-3 py-1.5 text-xs" : "px-2.5 py-1 text-[11px]"
            )}
          >
            <Icon className={cn("text-primary", size === "default" ? "h-3.5 w-3.5" : "h-3 w-3")} />
            {meta.label}
            {channel.primary ? (
              <span className="rounded-full bg-accent px-1.5 py-px text-[9px] font-extrabold text-accent-foreground">
                Primary
              </span>
            ) : null}
          </a>
        );
      })}
    </div>
  );
}

/* ---------- booking helpers ---------- */

export function BookingWhen({ date, time }: { date: string; time: string }) {
  return (
    <span className="text-sm font-bold text-foreground">
      {formatBookingDate(date)} · {time}
    </span>
  );
}
