"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Check,
  Download,
  FileText,
  Loader2,
  MapPin,
  PencilLine,
  ShieldCheck,
  Star,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Logo } from "@/components/landing/logo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AgreementSummary,
  ChannelButtons,
  EscrowBanner,
  FileRow,
  GatewayMarks,
  PaymentSummary,
  RecordTimeline,
  SectionCard,
  Stepper,
  type Step,
} from "@/components/app/kit";
import PaymentCheckout from "@/components/app/payment-checkout";
import { useApp } from "@/components/app/context";
import { api, ApiError, type PayMethod, type PublicCreator, type SharedData } from "@/lib/api";
import {
  formatDate,
  formatNaira,
  type Deal,
  type DealFile,
  type PaymentProvider,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type PayKind = "deposit" | "next" | "remaining";

/** Snapshot of what the checkout is for, taken when it opens (stays fixed while paying). */
interface PayContext {
  kind: PayKind;
  amount: number;
  label: string;
}

/** sessionStorage hand-off so the returning hosted checkout can be verified. */
function pendingPaymentKey(token: string) {
  return `deal_pending_payment:${token}`;
}

export default function ClientDealScreen({ token }: { token: string }) {
  const { user } = useApp();
  const [data, setData] = useState<SharedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [payCtx, setPayCtx] = useState<PayContext | null>(null);
  const [changesOpen, setChangesOpen] = useState(false);
  const [changesNote, setChangesNote] = useState("");
  const [approveOpen, setApproveOpen] = useState(false);
  const [rating, setRating] = useState(5);

  /**
   * Open a deal file through a signed, time-limited URL — previews render
   * inline in a new tab; released finals download as attachments (R2 serves
   * the disposition the backend picks per role).
   */
  async function openFile(file: DealFile) {
    try {
      const url = await api.sharedFileDownloadUrl(token, file.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      // Hidden files answer the same non-committal 404 as missing ones.
      toast.error(err instanceof Error ? err.message : "Couldn't open the file.");
    }
  }

  const openPreview = openFile;

  useEffect(() => {
    let alive = true;
    api
      .sharedDeal(token)
      .then((d) => alive && setData(d))
      .catch((err) => alive && setError(err instanceof Error ? err.message : "Deal not found."));
    return () => {
      alive = false;
    };
  }, [token]);

  function applyDeal(updated: Deal) {
    setData((prev) => (prev ? { ...prev, deal: updated } : prev));
  }

  /** Performs a shared action; returns the updated deal or null (toast on failure). */
  async function act(body: Parameters<typeof api.sharedAction>[1]): Promise<Deal | null> {
    setBusy(true);
    try {
      const { deal: updated } = await api.sharedAction(token, body);
      applyDeal(updated);
      return updated;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  /**
   * Real-rail checkout: mint a hosted link (the amount is the server-computed
   * next due slot), remember the reference, and let the checkout hand the
   * browser to the rail. Verification happens when the client returns.
   */
  async function pay(
    kind: PayKind,
    method: PayMethod,
    provider: PaymentProvider
  ): Promise<{ link: string }> {
    const init = await api.initializeSharedPayment(token, { provider, method });
    sessionStorage.setItem(pendingPaymentKey(token), JSON.stringify({ reference: init.reference }));
    return { link: init.link };
  }

  /**
   * A hosted checkout ends with the rail redirecting back here (tx_ref query
   * param) — or, when the redirect lands on a different origin than this
   * page (sandbox), the pending reference from sessionStorage. Either way we
   * ask the backend to verify the charge and refresh the projection.
   */
  useEffect(() => {
    if (!data) return;
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("tx_ref") ?? params.get("reference");
    let reference = fromUrl ?? "";
    let pending = sessionStorage.getItem(pendingPaymentKey(token));
    if (!reference && pending) {
      try {
        reference = (JSON.parse(pending) as { reference?: string }).reference ?? "";
      } catch {
        reference = "";
      }
    }
    if (!reference) return;
    if (pending) {
      sessionStorage.removeItem(pendingPaymentKey(token));
      pending = null;
    }
    // Clean the rail's query params out of the address bar (they sit before
    // the #/c/:token hash, which IS the SPA route).
    if (fromUrl) {
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    }
    let alive = true;
    (async () => {
      try {
        const result = await api.verifySharedPayment(token, reference);
        if (!alive) return;
        const fresh = await api.sharedDeal(token);
        if (!alive) return;
        setData(fresh);
        if (result.status === "successful") toast.success("Payment confirmed — thank you!");
        else if (result.status === "pending") toast.info("Payment is still processing — check back shortly.");
        else toast.error("The payment didn't go through — no money was taken.");
      } catch (err) {
        if (!alive) return;
        toast.error(err instanceof Error ? err.message : "Couldn't verify the payment.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [data === null, token]);

  if (error) {
    return (
      <ClientFrame
        backHref={user ? "#/deals" : undefined}
        backLabel={user ? "Creator view" : undefined}
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
          <span className="text-4xl">🔗</span>
          <p className="text-lg font-extrabold text-foreground">Deal not found</p>
          <p className="text-sm font-medium text-muted-foreground">{error}</p>
        </div>
      </ClientFrame>
    );
  }

  if (!data) {
    return (
      <ClientFrame
        backHref={user ? "#/deals" : undefined}
        backLabel={user ? "Creator view" : undefined}
      >
        <div className="flex flex-1 items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </ClientFrame>
    );
  }

  const { deal, creator, amounts } = data;
  // Money facts come from the server's amounts block — the capability
  // projection carries no payment rows to recompute from.
  const paid = amounts.paid;
  const due = amounts.due;
  const held = amounts.held;
  const releasedTotal = amounts.released;
  const schedule = amounts.schedule;
  const nextDue = amounts.nextDue;
  const fullyPaid = amounts.fullyPaid;
  const approved = amounts.approved;
  const deposit = amounts.deposit;
  const latestDelivery = deal.deliveries.at(-1);
  const firstName = creator.name.split(" ")[0];

  /** Opens the checkout with the amount/label frozen from the current schedule. */
  function openCheckout(kind: PayKind) {
    const label =
      kind === "deposit"
        ? (schedule[0]?.label ?? `Deposit (${deal.depositPercent}%)`)
        : (nextDue?.label ?? "Next payment");
    // Every charge is for the server-computed next due slot; "remaining" only
    // differs when a single slot is left (then it IS the next due amount).
    const amount = kind === "deposit" ? deposit : (nextDue?.amount ?? due);
    setPayCtx({ kind, amount, label });
  }

  /* ---------------- status bodies ---------------- */

  let body: React.ReactNode = null;

  if (deal.status === "sent" || deal.status === "changes_requested") {
    const lastChange = [...deal.events].reverse().find((e) => e.type === "changes_requested");
    body = (
      <>
        <div className="rounded-2xl border border-primary/20 bg-secondary p-5 text-center lg:p-6">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white ring-8 ring-accent/60">
            <FileText className="h-8 w-8 text-primary" />
          </span>
          <h2 className="mt-3 text-xl font-extrabold tracking-tight text-foreground">
            You&rsquo;ve received a DEAL
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-[13px] font-medium text-muted-foreground">
            {deal.status === "changes_requested"
              ? `${creator.name} is updating the deal based on your notes — review the new version below.`
              : `${creator.name} has sent you a deal for your project. Review the details and accept to get started.`}
          </p>
          <span
            className="mt-3 inline-flex items-center rounded-full bg-amber-50 px-3 py-1.5 text-[12px] font-extrabold text-amber-700"
          >
            {deal.status === "changes_requested"
              ? "Updated deal — waiting for your response"
              : "Waiting for your response"}
          </span>
          {deal.status === "changes_requested" && lastChange ? (
            <p className="mx-auto mt-3 max-w-sm rounded-xl bg-white/80 p-3 text-[12px] font-medium leading-relaxed text-muted-foreground">
              “{lastChange.label.replace(/^(Client requested changes|Revision requested):\s*/, "")}”
            </p>
          ) : null}
        </div>

        <SectionCard title="Who you're working with">
          <div className="flex items-center gap-3.5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-base font-extrabold text-white">
              {creator.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[15px] font-extrabold text-foreground">
                <span className="truncate">{creator.name}</span>
                {creator.verified ? <BadgeCheck className="h-4 w-4 shrink-0 text-primary" /> : null}
              </p>
              <p className="truncate text-[13px] font-semibold text-muted-foreground">
                {creator.craft || "Creative"}
                {creator.location ? ` · ${creator.location}` : ""}
              </p>
            </div>
          </div>
          <div className="mt-4 border-t border-border pt-3.5">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
              Questions? Reach {creator.name} on
            </p>
            <ChannelButtons channels={creator.channels} className="mt-2" />
          </div>
        </SectionCard>

        {deal.message ? (
          <div className="rounded-xl border border-border bg-muted/60 p-3.5 text-[13px] font-medium leading-relaxed text-foreground">
            “{deal.message}”
          </div>
        ) : null}

        <AgreementSummary deal={deal} />

        <SectionCard title="Payment plan" right={<GatewayMarks />}>
          <div className="divide-y divide-border">
            {schedule.map((slot) => (
              <div key={slot.label} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <p className="text-sm font-bold text-foreground">{slot.label}</p>
                  <p className="text-xs font-medium text-muted-foreground">
                    {slot.status === "paid" ? "Paid" : approved ? "Due — released instantly" : "Due after acceptance"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-extrabold text-foreground">{formatNaira(slot.amount)}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-extrabold",
                      slot.status === "paid" ? "bg-accent text-accent-foreground" : "bg-amber-50 text-amber-700"
                    )}
                  >
                    {slot.status === "paid" ? "Paid" : "Due"}
                  </span>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between pt-3">
              <p className="text-sm font-extrabold text-foreground">Total</p>
              <span className="text-sm font-extrabold text-foreground">{formatNaira(deal.price)}</span>
            </div>
          </div>
          <p className="mt-3 rounded-xl bg-secondary p-3 text-xs font-medium leading-relaxed text-muted-foreground">
            Every payment sits in <span className="font-bold text-foreground">DEAL escrow</span> —{" "}
            {creator.name} only gets paid when you approve the completed work. You pay through
            Flutterwave or Paystack — your choice at checkout.
          </p>
        </SectionCard>

        <SectionCard title="What happens next?">
          <ol className="space-y-4">
            {[
              [
                "Accept & pay the deposit",
                `Your ${formatNaira(deposit)} deposit is held safely in DEAL escrow — not sent to ${firstName} yet.`,
              ],
              [`${firstName} gets to work`, "Track progress right here until the work is delivered."],
              [
                "Approve to release payment",
                `Only when you approve the completed work does ${firstName} receive the money.`,
              ],
            ].map(([title, desc], i) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-extrabold text-primary">
                  {i + 1}
                </span>
                <div>
                  <p className="text-[13px] font-extrabold text-foreground">{title}</p>
                  <p className="text-[13px] font-medium leading-relaxed text-muted-foreground">{desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </SectionCard>

        <Button
          className="h-13 w-full rounded-xl text-[15px] font-bold shadow-md shadow-primary/25"
          disabled={busy}
          onClick={() => openCheckout("deposit")}
        >
          <Check className="mr-1.5 h-4.5 w-4.5" />
          Accept & pay deposit ({formatNaira(deposit)})
        </Button>
        <Button
          variant="outline"
          className="h-12 w-full rounded-xl font-bold"
          onClick={() => setChangesOpen(true)}
        >
          <PencilLine className="mr-1.5 h-4 w-4" /> Request changes
        </Button>
        <p className="text-center text-xs font-semibold text-muted-foreground">
          You&rsquo;ll review everything before any payment leaves your account.
        </p>
      </>
    );
  }

  if (deal.status === "active") {
    body = (
      <>
        {held > 0 ? <EscrowBanner amount={held} paidOn={deal.depositPaidAt} /> : null}

        <SectionCard title="Deal progress">
          <Stepper
            steps={[
              { label: "Agreed", sub: formatDate(deal.acceptedAt), state: "done" },
              { label: "Deposit secured", sub: formatNaira(deposit), state: "done" },
              { label: "Creation in progress", sub: "Creator working", state: "current" },
              { label: "Review & release", sub: "You approve", state: "todo" },
            ] satisfies Step[]}
          />
        </SectionCard>

        <div className="flex items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="min-w-0">
            <p className="text-[14px] font-extrabold text-amber-800">What&rsquo;s next?</p>
            <p className="mt-0.5 text-[13px] font-medium text-amber-700">
              {firstName} is working on your project and will deliver it for your review by{" "}
              {formatDate(deal.dueDate)}.
            </p>
          </div>
        </div>

        <PaymentSummary deal={deal} schedule={schedule} remaining={due} />
        <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[11px] font-bold text-muted-foreground">
          <GatewayMarks /> Charges processed by your chosen rail — escrow by DEAL
        </p>

        <SectionCard title="Payments on this deal">
          {fullyPaid ? (
            <p className="flex items-center gap-2 rounded-xl bg-accent p-3.5 text-[13px] font-extrabold text-accent-foreground">
              <Check className="h-4.5 w-4.5 text-primary" strokeWidth={3} />
              All paid — nothing left to pay. Waiting on delivery.
            </p>
          ) : (
            <div className="space-y-2.5">
              {nextDue ? (
                <Button
                  className="h-12 w-full rounded-xl font-bold shadow-md shadow-primary/25"
                  onClick={() => openCheckout("next")}
                >
                  Pay next installment · {nextDue.label} · {formatNaira(nextDue.amount)}
                </Button>
              ) : null}
              {/* One charge always covers exactly the next due slot — offer
                  "pay all remaining" only when a single slot is left. */}
              {nextDue && nextDue.amount === due ? (
                <Button
                  variant="ghost"
                  className="h-11 w-full rounded-xl font-bold text-primary hover:bg-accent"
                  onClick={() => openCheckout("remaining")}
                >
                  Pay all remaining ({formatNaira(due)})
                </Button>
              ) : null}
              <p className="text-center text-[12px] font-medium leading-relaxed text-muted-foreground">
                You can pay in parts — every part sits in DEAL escrow until you approve the work.
              </p>
            </div>
          )}
          <div className="mt-4 border-t border-border pt-3.5">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
              Questions? Reach {creator.name} on
            </p>
            <ChannelButtons channels={creator.channels} size="sm" className="mt-2" />
          </div>
        </SectionCard>
      </>
    );
  }

  if (deal.status === "delivered") {
    body = (
      <>
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5 text-center lg:p-6">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white ring-8 ring-violet-100">
            <FileText className="h-7 w-7 text-violet-600" />
          </span>
          <h2 className="mt-3 text-xl font-extrabold tracking-tight text-foreground">
            Your review unlocks {formatNaira(held)}
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-[13px] font-medium text-violet-700">
            {firstName} has submitted the delivery. Approving releases the money from escrow — request
            changes if something&rsquo;s off. Submitted {formatDate(deal.deliveredAt)}.
          </p>
        </div>

        <SectionCard title="What was delivered">
          <div className="space-y-2.5">
            {latestDelivery?.note ? (
              <p className="text-[13px] font-medium leading-relaxed text-muted-foreground">
                {latestDelivery.note}
              </p>
            ) : null}
            {latestDelivery?.files.map((file) => (
              <FileRow
                key={file.id}
                name={file.name}
                size={file.size}
                kind={file.kind}
                protected
                onPreview={() => openPreview(file)}
              />
            ))}
          </div>
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-muted/60 p-3 text-[11px] font-medium leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            Previews are protected — full-quality downloads unlock after you approve and the deal is
            fully paid.
          </p>
        </SectionCard>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col rounded-2xl border border-primary/30 bg-secondary p-5">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white">
              <ShieldCheck className="h-5.5 w-5.5 text-primary" />
            </span>
            <p className="mt-3 text-[15px] font-extrabold text-foreground">Approve delivery</p>
            <p className="mt-1 flex-1 text-[13px] font-medium leading-relaxed text-muted-foreground">
              Approving releases {formatNaira(held)} from escrow to {creator.name} and confirms the work
              is complete.
            </p>
            <Button
              className="mt-4 h-12 w-full rounded-xl font-bold shadow-md shadow-primary/25"
              disabled={busy}
              onClick={() => setApproveOpen(true)}
            >
              <ShieldCheck className="mr-1.5 h-4.5 w-4.5" /> Approve & release
            </Button>
          </div>
          <div className="flex flex-col rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white">
              <PencilLine className="h-5.5 w-5.5 text-amber-600" />
            </span>
            <p className="mt-3 text-[15px] font-extrabold text-foreground">Request changes</p>
            <p className="mt-1 flex-1 text-[13px] font-medium leading-relaxed text-amber-700">
              Tell {firstName} what to adjust — the money stays in escrow and they&rsquo;ll send an
              updated delivery.
            </p>
            <Button
              variant="outline"
              className="mt-4 h-12 w-full rounded-xl border-amber-300 bg-white font-bold text-amber-800 hover:bg-amber-100"
              onClick={() => setChangesOpen(true)}
            >
              <PencilLine className="mr-1.5 h-4.5 w-4.5" /> Request changes
            </Button>
          </div>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            const updated = await act({
              action: "dispute",
              note: "Work doesn't match the agreed scope",
            });
            if (updated) toast.warning("Dispute raised — our team will step in.");
          }}
          className="mx-auto block text-xs font-bold text-red-500 underline-offset-2 hover:underline"
        >
          Something else? Raise a dispute — your money stays protected.
        </button>
      </>
    );
  }

  if (deal.status === "revision") {
    const lastChange = [...deal.events].reverse().find((e) => e.type === "changes_requested");
    body = (
      <>
        {held > 0 ? <EscrowBanner amount={held} /> : null}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-[15px] font-extrabold text-amber-800">Changes requested</p>
          <p className="mt-1 text-[13px] font-medium leading-relaxed text-amber-700">
            “{lastChange?.label.replace(/^(Client requested changes|Revision requested):\s*/, "") ?? "You requested changes to this delivery."}”
          </p>
          <p className="mt-3 flex items-center gap-2 text-[13px] font-extrabold text-amber-800">
            <Loader2 className="h-4 w-4 animate-spin" /> Waiting for {firstName} to revise
          </p>
        </div>
        {latestDelivery ? (
          <SectionCard title="What was delivered">
            <div className="space-y-2.5">
              {latestDelivery.files.map((file) => (
                <FileRow
                  key={file.id}
                  name={file.name}
                  size={file.size}
                  kind={file.kind}
                  protected
                  onPreview={() => openPreview(file)}
                />
              ))}
            </div>
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-muted/60 p-3 text-[11px] font-medium leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              Previews are protected — full-quality downloads unlock after you approve and the deal is
              fully paid.
            </p>
          </SectionCard>
        ) : null}
        <PaymentSummary deal={deal} schedule={schedule} remaining={due} />
      </>
    );
  }

  if (deal.status === "approved") {
    body = (
      <>
        <div className="rounded-2xl border border-primary/20 bg-secondary p-5 text-center lg:p-6">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent ring-8 ring-accent/50">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </span>
          <h2 className="mt-3 text-xl font-extrabold tracking-tight text-foreground">
            Work approved — {formatNaira(releasedTotal)} released to {creator.name}
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-[13px] font-medium text-muted-foreground">
            Your approval released the escrow. {creator.name} has been notified.
          </p>
          <p className="mt-3 flex items-center justify-center">
            <GatewayMarks />
          </p>
        </div>

        {!fullyPaid ? (
          <SectionCard title="Remaining balance">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-2xl font-extrabold text-amber-600">{formatNaira(due)}</p>
                <p className="mt-0.5 text-[12px] font-semibold text-muted-foreground">
                  Pay anytime — since the work is approved your payment reaches {firstName} instantly.
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-2.5">
              {nextDue ? (
                <Button
                  className="h-12 w-full rounded-xl font-bold shadow-md shadow-primary/25"
                  onClick={() => openCheckout("next")}
                >
                  Pay next · {nextDue.label} · {formatNaira(nextDue.amount)}
                </Button>
              ) : null}
              {nextDue && nextDue.amount === due ? (
                <Button
                  variant="ghost"
                  className="h-11 w-full rounded-xl font-bold text-primary hover:bg-accent"
                  onClick={() => openCheckout("remaining")}
                >
                  Pay all remaining ({formatNaira(due)})
                </Button>
              ) : null}
            </div>
          </SectionCard>
        ) : (
          <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/60 p-4">
            <span className="text-xl">⏳</span>
            <div>
              <p className="text-[14px] font-extrabold text-foreground">
                All paid — {firstName} will now upload your final files.
              </p>
              <p className="mt-0.5 text-[13px] font-medium text-muted-foreground">
                You&rsquo;ll get your final files here as soon as they&rsquo;re uploaded.
              </p>
            </div>
          </div>
        )}

        <PaymentSummary deal={deal} schedule={schedule} remaining={due} />
      </>
    );
  }

  if (deal.status === "files_released") {
    body = (
      <>
        <div className="rounded-2xl border border-primary/20 bg-secondary p-5 text-center lg:p-6">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent ring-8 ring-accent/50">
            <Download className="h-8 w-8 text-primary" />
          </span>
          <h2 className="mt-3 text-xl font-extrabold tracking-tight text-foreground">
            Your final files are ready
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-[13px] font-medium text-muted-foreground">
            {firstName} has released the final files. Download them below — then confirm & rate to wrap
            up the deal.
          </p>
        </div>

        <SectionCard title="Final files">
          <div className="space-y-2.5">
            {deal.finalFiles.map((file) => (
              <FileRow
                key={file.id}
                name={file.name}
                size={file.size}
                kind={file.kind}
                onPreview={() => openFile(file)}
              />
            ))}
          </div>
          <Button
            variant="outline"
            className="mt-3 h-11 w-full rounded-xl font-bold"
            onClick={() => deal.finalFiles.forEach(openFile)}
          >
            <Download className="mr-2 h-4 w-4" /> Download all files
          </Button>
        </SectionCard>

        <SectionCard title="Confirm & rate">
          <p className="text-center text-[13px] font-medium text-muted-foreground">
            How did {firstName} do? Your rating closes out the deal.
          </p>
          <div className="mt-3 flex justify-center gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
                className="rounded-md p-0.5 transition-transform hover:scale-110"
              >
                <Star
                  className={cn(
                    "h-8 w-8 transition-colors",
                    n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
                  )}
                />
              </button>
            ))}
          </div>
          <Button
            className="mt-4 h-12 w-full rounded-xl font-bold"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                // The API models review and completion as separate moves; a
                // replayed rating (REVIEW_EXISTS) must not block completion.
                try {
                  await api.sharedAction(token, { action: "review", rating });
                } catch (err) {
                  if (!(err instanceof ApiError && err.code === "REVIEW_EXISTS")) throw err;
                }
                const fresh = await api.sharedAction(token, { action: "complete" });
                applyDeal(fresh.deal);
                toast.success("Deal completed — thank you!");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Couldn't complete the deal.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 className="mr-2 h-4.5 w-4.5 animate-spin" /> : <Check className="mr-1.5 h-4.5 w-4.5" />}
            Confirm & rate {rating}-star
          </Button>
        </SectionCard>
      </>
    );
  }

  if (deal.status === "completed") {
    const reviewEvent = [...deal.events].reverse().find((e) => e.label.includes("star"));
    const reviewMatch = reviewEvent?.label.match(/(\d)-star/);
    const reviewRating = reviewMatch ? Number(reviewMatch[1]) : null;
    body = (
      <>
        <div className="rounded-2xl border border-primary/20 bg-secondary p-6 text-center">
          <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary ring-8 ring-accent">
            <Check className="h-10 w-10 text-white" strokeWidth={3} />
          </span>
          <h2 className="mt-4 text-xl font-extrabold tracking-tight text-foreground">DEAL completed 🎉</h2>
          <p className="mx-auto mt-1 max-w-sm text-[13px] font-medium text-muted-foreground">
            The project is complete and {formatNaira(releasedTotal)} has been released to{" "}
            {creator.name.replace(/\.$/, "")}.
          </p>
        </div>

        <SectionCard title="Final files">
          <div className="space-y-2.5">
            {deal.finalFiles.map((file) => (
              <FileRow
                key={file.id}
                name={file.name}
                size={file.size}
                kind={file.kind}
                onPreview={() => openFile(file)}
              />
            ))}
          </div>
          <Button
            variant="outline"
            className="mt-3 h-11 w-full rounded-xl font-bold"
            onClick={() => deal.finalFiles.forEach(openFile)}
          >
            <Download className="mr-2 h-4 w-4" /> Download again
          </Button>
        </SectionCard>

        <SectionCard title="Your review">
          {reviewRating ? (
            <div className="flex flex-col items-center gap-1.5 py-1">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={cn(
                      "h-6 w-6",
                      n <= reviewRating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
                    )}
                  />
                ))}
              </div>
              <p className="text-[13px] font-bold text-foreground">You rated {firstName} {reviewRating}-star</p>
            </div>
          ) : (
            <div>
              <p className="text-center text-[13px] font-medium text-muted-foreground">
                How did {firstName} do?
              </p>
              <div className="mt-3 flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    aria-label={`${n} star${n === 1 ? "" : "s"}`}
                    className="rounded-md p-0.5 transition-transform hover:scale-110"
                  >
                    <Star
                      className={cn(
                        "h-8 w-8 transition-colors",
                        n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
                      )}
                    />
                  </button>
                ))}
              </div>
              <Button
                variant="outline"
                className="mt-4 h-11 w-full rounded-xl font-bold"
                disabled={busy}
                onClick={async () => {
                  const updated = await act({ action: "review", rating });
                  if (updated) toast.success("Review sent — thank you!");
                }}
              >
                Submit {rating}-star review
              </Button>
            </div>
          )}
        </SectionCard>

        <a
          href={`#/u/${creator.handle}`}
          className="flex h-13 w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-accent font-bold text-accent-foreground transition-colors hover:bg-primary hover:text-white"
        >
          Book another session with {firstName} <ArrowRight className="h-4.5 w-4.5" />
        </a>
      </>
    );
  }

  if (deal.status === "declined" || deal.status === "disputed") {
    body = (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
        <p className="text-[15px] font-extrabold text-red-700">
          {deal.status === "declined" ? "Deal declined" : "Dispute in review"}
        </p>
        <p className="mt-1 text-[13px] font-medium leading-relaxed text-red-600">
          {deal.status === "declined"
            ? "This deal was declined. Reach out to the creator to discuss alternatives."
            : "Our team is reviewing this case and will contact both sides shortly. Your money is safe in escrow."}
        </p>
        <ChannelButtons channels={creator.channels} size="sm" className="mt-3" />
      </div>
    );
  }

  return (
    <ClientFrame
      backHref={user ? `#/deals/${deal.id}` : undefined}
      backLabel={user ? "Creator view" : undefined}
    >
      <div className="flex-1 px-4 pb-12 pt-6 sm:px-6 lg:py-10">
        {/* deal header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold tracking-tight text-foreground lg:text-2xl">
              {deal.title}
            </h1>
            <p className="mt-0.5 flex items-center gap-1 text-[13px] font-semibold text-muted-foreground">
              <span className="truncate">
                {deal.ref} · {creator.name} ({creator.craft || "Creator"})
              </span>
              {creator.verified ? <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" /> : null}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                {deal.eventDate ? formatDate(deal.eventDate) : "Date TBD"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> {deal.location || "—"}
              </span>
            </div>
          </div>
          <div className="shrink-0 rounded-2xl border border-border bg-card px-3.5 py-2 text-right">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Total price</p>
            <p className="text-[15px] font-extrabold text-foreground">{formatNaira(deal.price)}</p>
          </div>
        </div>

        <motion.div
          key={deal.status}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="mt-5 space-y-4 lg:space-y-5"
        >
          {body}
        </motion.div>

        {/* record — always */}
        {deal.events.length > 0 ? (
          <div className="mt-5">
            <RecordTimeline events={deal.events} />
          </div>
        ) : null}

        <p className="mt-6 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-center text-xs font-semibold text-muted-foreground">
          <GatewayMarks /> Every charge processed via Flutterwave or Paystack — held in DEAL escrow
        </p>
      </div>

      {/* dual-gateway checkout (Flutterwave / Paystack) */}
      <PaymentCheckout
        open={payCtx !== null}
        onOpenChange={(next) => {
          if (!next) setPayCtx(null);
        }}
        amount={payCtx?.amount ?? 0}
        label={payCtx?.label ?? ""}
        dealTitle={deal.title}
        dealRef={deal.ref}
        creatorName={creator.name}
        preferredProvider={creator.preferredProvider}
        escrowNote={
          approved
            ? `The work is already approved — this payment is released to ${creator.name} instantly (not held in escrow).`
            : undefined
        }
        onPay={(method, provider) =>
          payCtx ? pay(payCtx.kind, method, provider) : Promise.reject(new Error("Nothing to pay."))
        }
      />

      {/* request changes dialog */}
      <Dialog open={changesOpen} onOpenChange={setChangesOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold">Request changes</DialogTitle>
          </DialogHeader>
          <p className="text-sm font-medium text-muted-foreground">
            Tell {firstName} what you&rsquo;d like adjusted — they&rsquo;ll update the deal or send a new
            delivery. Your money stays protected in escrow.
          </p>
          <Textarea
            value={changesNote}
            onChange={(e) => setChangesNote(e.target.value)}
            placeholder="e.g. Can we move the shoot to the morning? Also add one extra location."
            className="min-h-24 rounded-xl bg-muted/60 font-semibold"
          />
          <Button
            className="h-12 w-full rounded-xl font-bold"
            disabled={busy}
            onClick={async () => {
              const updated = await act({ action: "request-changes", note: changesNote });
              setChangesOpen(false);
              setChangesNote("");
              if (updated) toast.success("Changes requested");
            }}
          >
            {busy ? <Loader2 className="mr-2 h-4.5 w-4.5 animate-spin" /> : null}
            Send change request
          </Button>
        </DialogContent>
      </Dialog>

      {/* approve confirm dialog */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold">Approve delivery?</DialogTitle>
          </DialogHeader>
          <div className="flex items-start gap-2.5 rounded-xl bg-accent p-3.5">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p className="text-[13px] font-semibold leading-relaxed text-accent-foreground">
              Approving releases {formatNaira(held)} from DEAL escrow to {creator.name} and confirms
              the work is complete.
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="h-12 flex-1 rounded-xl font-bold"
              onClick={() => setApproveOpen(false)}
            >
              Not yet
            </Button>
            <Button
              className="h-12 flex-1 rounded-xl font-bold shadow-md shadow-primary/25"
              disabled={busy}
              onClick={async () => {
                const updated = await act({ action: "approve" });
                setApproveOpen(false);
                if (updated) toast.success(`Approved — ${formatNaira(held)} released to ${creator.name}`);
              }}
            >
              {busy ? <Loader2 className="mr-2 h-4.5 w-4.5 animate-spin" /> : <Check className="mr-1.5 h-4.5 w-4.5" />}
              Approve & release
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ClientFrame>
  );
}

/* ---------------- chrome ---------------- */

function ClientFrame({
  children,
  backHref = "#/",
  backLabel = "Home",
}: {
  children: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="min-h-screen bg-[#edf3ef]">
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col bg-background shadow-[0_0_60px_rgba(14,31,51,0.10)] lg:max-w-4xl">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-white/90 px-4 backdrop-blur-md sm:px-6">
          <a
            href={backHref}
            aria-label={`Back to ${backLabel.toLowerCase()}`}
            className="flex items-center gap-1.5 rounded-lg p-1 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5m0 0 6 6m-6-6 6-6" />
            </svg>
            <span className="hidden sm:inline">{backLabel}</span>
          </a>
          <Logo />
          <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1.5 text-[11px] font-extrabold text-accent-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Protected
          </span>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
        <div className="pb-[env(safe-area-inset-bottom)]" />
      </div>
    </div>
  );
}
