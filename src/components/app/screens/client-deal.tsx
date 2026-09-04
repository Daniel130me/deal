"use client";

import { useEffect, useState } from "react";
import {
  BadgeCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  MapPin,
  MessageCircle,
  PartyPopper,
  ShieldCheck,
  Star,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/landing/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AgreementSummary,
  EscrowBanner,
  FileRow,
  PaymentSummary,
  RecordTimeline,
  SectionCard,
  Stepper,
  type Step,
} from "@/components/app/kit";
import { api } from "@/lib/api";
import {
  balanceAmount,
  depositAmount,
  formatNaira,
  formatDate,
  type Deal,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface SharedData {
  deal: Deal;
  creator: {
    id: string;
    name: string;
    handle: string;
    craft: string;
    location: string;
    verified: boolean;
    whatsapp: string;
  };
  amounts: { total: number; deposit: number; balance: number; paid: number; due: number };
}

export default function ClientDealScreen({ token }: { token: string }) {
  const [data, setData] = useState<SharedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payKind, setPayKind] = useState<"deposit" | "balance">("deposit");
  const [changesOpen, setChangesOpen] = useState(false);
  const [changesNote, setChangesNote] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [busy, setBusy] = useState(false);
  const [justPaid, setJustPaid] = useState<"deposit" | "balance" | null>(null);

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

  if (error) {
    return (
      <ClientFrame>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <span className="text-4xl">🔗</span>
          <p className="text-lg font-extrabold text-foreground">Deal not found</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </ClientFrame>
    );
  }

  if (!data) {
    return (
      <ClientFrame>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </ClientFrame>
    );
  }

  const { deal, creator, amounts } = data;
  const deposit = depositAmount(deal);
  const balance = balanceAmount(deal);

  async function act(body: Parameters<typeof api.sharedAction>[1]) {
    setBusy(true);
    try {
      const { deal: updated } = await api.sharedAction(token, body);
      setData((prev) => (prev ? { ...prev, deal: updated } : prev));
      return updated;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  /* ---------------- stepper ---------------- */
  const steps: Step[] = [
    {
      label: "Deal accepted",
      sub: formatDate(deal.acceptedAt),
      state: deal.acceptedAt ? "done" : "todo",
    },
    {
      label: "Deposit secured",
      sub: "In escrow",
      state: deal.payments.some((p) => p.type === "deposit") ? "done" : "todo",
    },
    {
      label: "Delivery approved",
      sub: formatDate(deal.approvedAt),
      state: deal.approvedAt ? "done" : "todo",
    },
    {
      label: "Balance paid",
      sub: formatDate(deal.balancePaidAt),
      state: deal.payments.some((p) => p.type === "balance") ? "done" : "todo",
    },
    {
      label: "Completed",
      sub: deal.status === "completed" ? formatDate(deal.completedAt) : "Pending",
      state: deal.status === "completed" ? "done" : "todo",
    },
  ];

  const latestDelivery = deal.deliveries.at(-1);

  /* ---------------- success screen after payment ---------------- */
  if (justPaid) {
    return (
      <ClientFrame>
        <div className="flex flex-1 flex-col px-5 pb-10 pt-10">
          <div className="flex justify-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary ring-8 ring-accent">
              <Check className="h-9 w-9 text-white" strokeWidth={3} />
            </span>
          </div>
          <h1 className="mt-5 text-center text-2xl font-extrabold tracking-tight text-foreground">
            Payment successful!
          </h1>
          <p className="mx-auto mt-2 max-w-xs text-center text-[15px] font-medium text-muted-foreground">
            {justPaid === "deposit"
              ? `You've paid and accepted the deal. ${creator.name} has been notified.`
              : "Balance received. The creator will now release your final files."}
          </p>
          <div className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span className="text-[13px] font-extrabold text-accent-foreground">
              Your payment is protected
            </span>
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-card p-4">
            <p className="text-[15px] font-extrabold text-foreground">{deal.title}</p>
            <p className="text-[13px] font-semibold text-muted-foreground">
              {deal.ref} · {creator.name} ({creator.craft || "Creator"})
            </p>
            <div className="mt-2 flex items-center justify-between border-t border-border pt-3">
              <p className="text-sm font-bold text-muted-foreground">
                {justPaid === "deposit" ? "Deposit paid" : "Balance paid"}
              </p>
              <p className="text-lg font-extrabold text-primary">
                {formatNaira(justPaid === "deposit" ? deposit : balance)}
              </p>
            </div>
          </div>

          <Button
            className="mt-6 h-13 w-full rounded-xl font-bold"
            onClick={() => setJustPaid(null)}
          >
            View my deal <CheckCircle2 className="ml-1 h-4.5 w-4.5" />
          </Button>
        </div>
      </ClientFrame>
    );
  }

  /* ---------------- status-driven body ---------------- */

  let body: React.ReactNode = null;

  switch (deal.status) {
    case "sent":
    case "changes_requested":
      body = (
        <>
          <div className="rounded-2xl border border-primary/20 bg-secondary p-5 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white ring-8 ring-accent/60">
              <FileText className="h-8 w-8 text-primary" />
            </span>
            <p className="mt-3 text-lg font-extrabold text-foreground">You received a DEAL!</p>
            <p className="mx-auto mt-1 max-w-xs text-[13px] font-medium text-muted-foreground">
              {creator.name} has sent you a deal for your project. Review the details and take your
              next step.
            </p>
            <span className="mt-3 inline-flex items-center rounded-full bg-amber-50 px-3 py-1.5 text-[12px] font-extrabold text-amber-700">
              Waiting for your response
            </span>
          </div>

          <SectionCard title="What happens next?">
            <ol className="space-y-4">
              {[
                ["1. Review the deal", "Check the services, terms, deliverables and price below."],
                ["2. Accept, request changes or decline", "Accept to lock the booking, or ask for changes first."],
                ["3. Sign & pay (when accepted)", "Pay the deposit to secure your date — funds are held safely."],
                ["4. Project starts", "Work begins and you'll get updates until final delivery."],
              ].map(([title, desc]) => (
                <li key={title} className="flex gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-extrabold text-primary">
                    {title.slice(0, 1)}
                  </span>
                  <div>
                    <p className="text-[13px] font-extrabold text-foreground">{title.slice(3)}</p>
                    <p className="text-[13px] font-medium leading-relaxed text-muted-foreground">{desc}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-accent/70 p-3">
              <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
              <p className="text-[13px] font-bold text-accent-foreground">
                Your payment is protected — held securely and only released when both parties are
                satisfied.
              </p>
            </div>
          </SectionCard>

          <AgreementSummary deal={deal} />

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="h-12 rounded-xl text-[13px] font-bold"
              onClick={() =>
                creator.whatsapp
                  ? window.open(`https://wa.me/${creator.whatsapp.replace(/\D/g, "")}`, "_blank")
                  : toast.info("Messaging coming soon")
              }
            >
              <MessageCircle className="mr-1.5 h-4 w-4" /> Message
            </Button>
            <Button
              variant="outline"
              className="h-12 rounded-xl text-[13px] font-bold"
              onClick={() => setChangesOpen(true)}
            >
              Request changes
            </Button>
            <Button
              className="col-span-2 h-13 rounded-xl text-[15px] font-bold shadow-md shadow-primary/25"
              disabled={busy}
              onClick={() => {
                setPayKind("deposit");
                setPayOpen(true);
              }}
            >
              <Check className="mr-1.5 h-4.5 w-4.5" /> Accept deal — pay {formatNaira(deposit)} deposit
            </Button>
          </div>
          <p className="text-center text-xs font-semibold text-muted-foreground">
            You'll review everything before any payment leaves your account.
          </p>
        </>
      );
      break;

    case "active":
      body = (
        <>
          <EscrowBanner amount={deposit} paidOn={deal.depositPaidAt} />
          <SectionCard title="Deal progress">
            <Stepper
              steps={[
                { label: "Deal accepted", sub: formatDate(deal.acceptedAt), state: "done" },
                { label: "Payment secured", sub: formatNaira(deposit), state: "done" },
                { label: "In progress", sub: "Creator working", state: "current" },
                { label: "Awaiting approval", sub: "You review", state: "todo" },
              ]}
            />
          </SectionCard>
          <div className="flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="min-w-0 pr-3">
              <p className="text-[14px] font-extrabold text-amber-800">What's next?</p>
              <p className="mt-0.5 text-[13px] font-medium text-amber-700">
                {creator.name} is working on your project and will deliver the final output for your
                review.
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[11px] font-bold text-amber-700">Estimated delivery</p>
              <p className="text-[13px] font-extrabold text-amber-800">{formatDate(deal.dueDate)}</p>
            </div>
          </div>
          <PeopleCard deal={deal} creatorName={creator.name} creatorCraft={creator.craft} />
        </>
      );
      break;

    case "delivered":
      body = (
        <>
          <EscrowBanner amount={deposit} paidOn={deal.depositPaidAt} />
          <div className="flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white">
              <FileText className="h-5 w-5 text-violet-600" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-extrabold text-foreground">
                {creator.name} has submitted the delivery
              </p>
              <p className="mt-0.5 text-[13px] font-medium text-violet-700">
                Please review the work and decide if it meets the agreed requirements.
              </p>
              <p className="mt-1 text-xs font-bold text-muted-foreground">
                Submitted {formatDate(deal.deliveredAt)}
              </p>
            </div>
          </div>

          <SectionCard title="What was delivered">
            <div className="space-y-2.5">
              <p className="text-[13px] font-medium text-muted-foreground">{latestDelivery?.note}</p>
              {latestDelivery?.files.map((file) => (
                <FileRow
                  key={file.id}
                  name={file.name}
                  size={file.size}
                  kind={file.kind}
                  onPreview={() =>
                    toast.info("Preview is simulated in this demo", {
                      description: "In production, watermarked previews open here.",
                    })
                  }
                />
              ))}
            </div>
          </SectionCard>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-[14px] font-extrabold text-amber-800">
              Review the work to release payment
            </p>
            <p className="mt-1 text-[13px] font-medium leading-relaxed text-amber-700">
              If the work meets the agreement, approve it and {formatNaira(balance)} will be released
              to {creator.name}. Not satisfied? Request changes or raise a dispute.
            </p>
          </div>

          <SectionCard title="Review & next steps">
            <div className="space-y-1">
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  const updated = await act({ action: "approve" });
                  if (updated) toast.success("Delivery approved!");
                }}
                className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-accent"
              >
                <div>
                  <p className="text-[14px] font-extrabold text-foreground">
                    Approve & release payment
                  </p>
                  <p className="text-[12px] font-semibold text-muted-foreground">
                    You're satisfied with the work.
                  </p>
                </div>
                <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
              </button>
              <button
                type="button"
                onClick={() => setChangesOpen(true)}
                className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted"
              >
                <div>
                  <p className="text-[14px] font-extrabold text-foreground">Request changes</p>
                  <p className="text-[12px] font-semibold text-muted-foreground">
                    Request revisions or additional tweaks.
                  </p>
                </div>
                <span className="text-muted-foreground">›</span>
              </button>
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
                className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-red-50"
              >
                <div>
                  <p className="text-[14px] font-extrabold text-red-600">Raise a dispute</p>
                  <p className="text-[12px] font-semibold text-muted-foreground">
                    Something isn't right? Our team will step in to help.
                  </p>
                </div>
                <span className="text-red-400">›</span>
              </button>
            </div>
          </SectionCard>
        </>
      );
      break;

    case "revision":
      body = (
        <>
          <EscrowBanner amount={deposit} paidOn={deal.depositPaidAt} />
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-[14px] font-extrabold text-amber-800">Changes requested</p>
            <p className="mt-1 text-[13px] font-medium text-amber-700">
              {deal.events.find((e) => e.type === "changes_requested")?.label ??
                "You requested changes to this delivery."}
            </p>
            <p className="mt-2 text-[13px] font-semibold text-amber-700">
              {creator.name} will submit an updated delivery soon.
            </p>
          </div>
          <PeopleCard deal={deal} creatorName={creator.name} creatorCraft={creator.craft} />
        </>
      );
      break;

    case "approved":
      body = (
        <>
          <div className="rounded-2xl border border-primary/20 bg-secondary p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-lg font-extrabold text-foreground">Delivery approved! 🎉</p>
                <p className="mt-1 text-[13px] font-medium text-muted-foreground">
                  The preview meets the agreed requirements. Great work, {creator.name}.
                </p>
              </div>
              <div className="shrink-0 rounded-xl bg-amber-50 p-3 text-center">
                <p className="text-[11px] font-bold text-amber-700">Next step</p>
                <p className="text-[13px] font-extrabold text-amber-800">Complete payment</p>
              </div>
            </div>
          </div>
          <SectionCard title="Deal progress">
            <Stepper steps={steps} />
          </SectionCard>
          <PaymentSummary deal={deal} deposit={deposit} balance={balance} />
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-[14px] font-extrabold text-amber-800">
              Why we need the final payment
            </p>
            <p className="mt-1 text-[13px] font-medium leading-relaxed text-amber-700">
              Your initial {formatNaira(deposit)} deposit is held securely. Pay the remaining{" "}
              {formatNaira(balance)} to secure the full {formatNaira(deal.price)} — once secured,{" "}
              {creator.name} will upload the final, high-resolution files.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase text-muted-foreground">Amount due</p>
                <p className="text-xl font-extrabold text-amber-600">{formatNaira(balance)}</p>
              </div>
              <Button
                className="h-12 rounded-xl px-5 font-bold"
                disabled={busy}
                onClick={() => {
                  setPayKind("balance");
                  setPayOpen(true);
                }}
              >
                <Wallet className="mr-2 h-4.5 w-4.5" /> Pay {formatNaira(balance)} balance
              </Button>
            </div>
            <p className="mt-2 text-center text-[11px] font-semibold text-muted-foreground">
              100% secure · Encrypted by DEAL · Your money is protected
            </p>
          </div>
        </>
      );
      break;

    case "balance_paid":
      body = (
        <>
          <div className="rounded-2xl border border-primary/20 bg-secondary p-5 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent ring-8 ring-accent/50">
              <ShieldCheck className="h-8 w-8 text-primary" />
            </span>
            <p className="mt-3 text-lg font-extrabold text-foreground">Full payment secured! 🎉</p>
            <p className="text-[15px] font-extrabold text-primary">{formatNaira(deal.price)}</p>
            <p className="mx-auto mt-1 max-w-xs text-[13px] font-medium text-muted-foreground">
              We'll hold the full payment securely until {creator.name} releases your final files.
            </p>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[12px] font-extrabold text-accent-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Your money is 100% safe with DEAL
            </p>
          </div>
          <SectionCard title="Deal progress">
            <Stepper steps={steps} />
          </SectionCard>
          <PaymentSummary deal={deal} deposit={deposit} balance={balance} />
          <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/60 p-4">
            <span className="text-xl">⏳</span>
            <div>
              <p className="text-[14px] font-extrabold text-foreground">Waiting for final delivery</p>
              <p className="mt-0.5 text-[13px] font-medium text-muted-foreground">
                {creator.name} has been notified that the full payment is secured. Once they upload
                and release the final files, we'll release the payment to them.
              </p>
            </div>
          </div>
        </>
      );
      break;

    case "files_released":
      body = (
        <>
          <div className="rounded-2xl border border-primary/20 bg-secondary p-5 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent ring-8 ring-accent/50">
              <PartyPopper className="h-8 w-8 text-primary" />
            </span>
            <p className="mt-3 text-lg font-extrabold text-foreground">Final files released!</p>
            <p className="mx-auto mt-1 max-w-xs text-[13px] font-medium text-muted-foreground">
              {creator.name} has delivered the final files. Download them below — they're yours
              forever.
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
                  onPreview={() => toast.success("Download started (simulated)")}
                />
              ))}
            </div>
          </SectionCard>
          <Button
            variant="outline"
            className="h-12 w-full rounded-xl font-bold"
            onClick={() => toast.success("Download started (simulated)")}
          >
            <Download className="mr-2 h-4.5 w-4.5" /> Download all files
          </Button>
        </>
      );
      break;

    case "completed":
      body = (
        <>
          <div className="rounded-2xl border border-primary/20 bg-secondary p-6 text-center">
            <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary ring-8 ring-accent">
              <Check className="h-10 w-10 text-white" strokeWidth={3} />
            </span>
            <p className="mt-4 text-xl font-extrabold text-foreground">DEAL completed! 🎉</p>
            <p className="mx-auto mt-1 max-w-xs text-[13px] font-medium text-muted-foreground">
              The project is complete and payment has been released to {creator.name}.
            </p>
            <p className="mt-2 text-[13px] font-extrabold text-primary">Thanks for using DEAL. 💚</p>
          </div>
          <SectionCard title="Deal progress">
            <Stepper steps={steps} />
          </SectionCard>
          <SectionCard title="Final files delivered">
            <div className="space-y-2.5">
              {deal.finalFiles.map((file) => (
                <FileRow
                  key={file.id}
                  name={file.name}
                  size={file.size}
                  kind={file.kind}
                  onPreview={() => toast.success("Download started (simulated)")}
                />
              ))}
            </div>
            <Button
              variant="outline"
              className="mt-3 h-11 w-full rounded-xl font-bold"
              onClick={() => toast.success("Download started (simulated)")}
            >
              <Download className="mr-2 h-4 w-4" /> Download again
            </Button>
          </SectionCard>
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
            <div>
              <p className="text-[14px] font-extrabold text-foreground">Payment released</p>
              <p className="text-[13px] font-medium text-muted-foreground">
                {formatNaira(deal.price)} has been released to {creator.name}.
              </p>
            </div>
            <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-extrabold text-accent-foreground">
              Released
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-accent/60 p-4">
            <div className="min-w-0">
              <p className="text-[14px] font-extrabold text-foreground">How was your experience?</p>
              <p className="text-[13px] font-medium text-muted-foreground">
                Support amazing creatives like {creator.name}.
              </p>
            </div>
            <Button className="h-10 shrink-0 rounded-xl px-4 text-[13px] font-bold" onClick={() => setReviewOpen(true)}>
              Leave a review
            </Button>
          </div>
        </>
      );
      break;

    default:
      body = (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-[15px] font-extrabold text-red-700">
            {deal.status === "declined" ? "Deal declined" : "Dispute in review"}
          </p>
          <p className="mt-1 text-[13px] font-medium text-red-600">
            {deal.status === "declined"
              ? "This deal was declined. Reach out to the creator on WhatsApp to discuss alternatives."
              : "Our team is reviewing this case and will contact both sides shortly. Your money is safe."}
          </p>
        </div>
      );
  }

  return (
    <ClientFrame>
      <div className="flex-1 px-5 pb-12 pt-4">
        {/* deal header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-extrabold tracking-tight text-foreground">
              {deal.title}
            </h1>
            <p className="mt-0.5 text-[13px] font-semibold text-muted-foreground">
              {deal.ref} · {creator.name} ({creator.craft || "Creator"})
              {creator.verified ? (
                <BadgeCheck className="ml-1 inline h-3.5 w-3.5 text-primary" />
              ) : null}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" /> {formatDate(deal.eventDate) || "Date TBD"}
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

        {deal.message && deal.status === "sent" ? (
          <div className="mt-4 rounded-xl border border-border bg-muted/60 p-3.5 text-[13px] font-medium leading-relaxed text-foreground">
            “{deal.message}”
          </div>
        ) : null}

        <div className="mt-5 space-y-4">{body}</div>

        {/* record */}
        {deal.events.length > 1 && deal.status !== "sent" ? (
          <div className="mt-4">
            <RecordTimeline events={deal.events} />
          </div>
        ) : null}

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs font-semibold text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-primary" />
          All projects on DEAL are protected by clear agreements and secure payments.
        </p>
      </div>

      {/* payment sheet */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-md rounded-2xl p-0">
          <div className="max-h-[85vh] overflow-y-auto p-6">
            <DialogHeader>
              <DialogTitle className="text-center text-base font-extrabold">
                🔒 Secure checkout
              </DialogTitle>
              <p className="mt-1 text-center text-[13px] font-bold text-primary">
                Your payment is protected by DEAL
              </p>
            </DialogHeader>

            <div className="mt-4 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-extrabold text-foreground">{deal.title}</p>
                  <p className="text-[13px] font-semibold text-muted-foreground">
                    {deal.ref} · {creator.name}
                  </p>
                </div>
              </div>
              <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-[13px] font-semibold">
                <div className="flex justify-between text-muted-foreground">
                  <span>Total project price</span>
                  <span className="font-extrabold text-foreground">{formatNaira(deal.price)}</span>
                </div>
                {payKind === "deposit" ? (
                  <>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Deposit you're paying now</span>
                      <span className="font-extrabold text-primary">{formatNaira(deposit)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Due later (on approval)</span>
                      <span className="font-bold">{formatNaira(balance)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Balance you're paying now</span>
                    <span className="font-extrabold text-primary">{formatNaira(balance)}</span>
                  </div>
                )}
              </div>
            </div>

            {payKind === "deposit" && (
              <div className="mt-4 rounded-2xl border border-border bg-card p-4">
                <p className="text-[13px] font-extrabold text-foreground">
                  How our escrow protection works
                </p>
                <ol className="mt-3 grid grid-cols-4 gap-1.5 text-center">
                  {[
                    ["You pay", "Funds protected"],
                    ["Held securely", "In escrow"],
                    ["Work done", "You review"],
                    ["You approve", "Then release"],
                  ].map(([t, s], i) => (
                    <li key={t} className="flex flex-col items-center gap-1">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[10px] font-extrabold text-primary">
                        {i + 1}
                      </span>
                      <p className="text-[10px] font-extrabold leading-tight text-foreground">{t}</p>
                      <p className="text-[9px] font-semibold leading-tight text-muted-foreground">{s}</p>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <PayMethods
              amount={payKind === "deposit" ? deposit : balance}
              busy={busy}
              onPay={async (method) => {
                const updated =
                  payKind === "deposit"
                    ? await act({ action: "pay-deposit", method })
                    : await act({ action: "pay-balance", method });
                if (updated) {
                  setPayOpen(false);
                  setJustPaid(payKind);
                }
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* request changes dialog */}
      <Dialog open={changesOpen} onOpenChange={setChangesOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold">Request changes</DialogTitle>
          </DialogHeader>
          <p className="text-sm font-medium text-muted-foreground">
            Tell {creator.name} what you'd like adjusted — they'll update the deal or delivery.
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

      {/* review dialog */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold">How was your experience?</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center gap-2 py-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
              >
                <Star
                  className={cn(
                    "h-9 w-9 transition-colors",
                    n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
                  )}
                />
              </button>
            ))}
          </div>
          <Button
            className="h-12 w-full rounded-xl font-bold"
            disabled={busy}
            onClick={async () => {
              await act({ action: "review", rating });
              setReviewOpen(false);
              toast.success("Review sent — thank you!");
            }}
          >
            Submit {rating}-star review
          </Button>
        </DialogContent>
      </Dialog>
    </ClientFrame>
  );
}

/* ---------------- chrome ---------------- */

function ClientFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#edf3ef]">
      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col bg-background pb-[env(safe-area-inset-bottom)] shadow-[0_0_60px_rgba(14,31,51,0.10)]">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-white/90 px-5 backdrop-blur-md">
          <button
            type="button"
            onClick={() => {
              window.location.hash = "#/";
            }}
            aria-label="Back"
            className="rounded-lg p-1 hover:bg-muted"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5m0 0 6 6m-6-6 6-6" />
            </svg>
          </button>
          <Logo />
          <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1.5 text-[11px] font-extrabold text-accent-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Protected
          </span>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}

function PeopleCard({
  deal,
  creatorName,
  creatorCraft,
}: {
  deal: Deal;
  creatorName: string;
  creatorCraft: string;
}) {
  return (
    <SectionCard title="People on this deal">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-sm font-extrabold text-primary">
            {deal.client.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-foreground">
              You <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold text-amber-700">Client</span>
            </p>
            <p className="truncate text-xs font-semibold text-muted-foreground">{deal.client.contact}</p>
          </div>
          <span className="text-xs font-semibold text-muted-foreground">Started this deal</span>
        </div>
        <div className="flex items-center gap-3 border-t border-border pt-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-sm font-extrabold text-white">
            {creatorName.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-foreground">
              {creatorName}{" "}
              <span className="ml-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-extrabold text-accent-foreground">
                Creator
              </span>
            </p>
            <p className="truncate text-xs font-semibold text-muted-foreground">{creatorCraft}</p>
          </div>
          <span className="text-xs font-semibold text-muted-foreground">Working on it</span>
        </div>
      </div>
    </SectionCard>
  );
}

/* ---------------- payment methods ---------------- */

function PayMethods({
  amount,
  busy,
  onPay,
}: {
  amount: number;
  busy: boolean;
  onPay: (method: string) => void;
}) {
  const [method, setMethod] = useState<"card" | "bank" | "ussd" | "wallet">("card");
  const [card, setCard] = useState({ number: "", expiry: "", cvv: "", name: "" });

  const methods = [
    { key: "card", label: "Card", sub: "Visa, Mastercard, Verve", badge: "VISA" },
    { key: "bank", label: "Bank Transfer", sub: "Transfer from your bank", badge: "🏦" },
    { key: "ussd", label: "USSD", sub: "Pay securely with USSD", badge: "*#" },
    { key: "wallet", label: "Digital Wallet", sub: "OPay, PalmPay, Moniepoint & more", badge: "M" },
  ] as const;

  return (
    <div className="mt-4">
      <p className="text-[13px] font-extrabold text-foreground">Choose how to pay</p>
      <div className="mt-2 space-y-2">
        {methods.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMethod(m.key)}
            className={cn(
              "flex w-full items-center justify-between gap-3 rounded-xl border p-3.5 text-left transition-colors",
              method === m.key ? "border-primary bg-accent/50" : "border-border bg-card hover:bg-muted/60"
            )}
          >
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-4.5 w-4.5 items-center justify-center rounded-full border-2",
                  method === m.key ? "border-primary" : "border-muted-foreground/40"
                )}
              >
                {method === m.key && <span className="h-2 w-2 rounded-full bg-primary" />}
              </span>
              <div>
                <p className="text-[14px] font-extrabold text-foreground">{m.label}</p>
                <p className="text-[12px] font-semibold text-muted-foreground">{m.sub}</p>
              </div>
            </div>
            <span className="shrink-0 text-[10px] font-extrabold text-muted-foreground">{m.badge}</span>
          </button>
        ))}
      </div>

      {method === "card" && (
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[12px] font-extrabold text-foreground">Card number</label>
            <Input
              value={card.number}
              onChange={(e) => setCard({ ...card, number: e.target.value })}
              placeholder="1234 5678 9012 3456"
              inputMode="numeric"
              className="mt-1 h-11 rounded-xl bg-muted/60 font-semibold"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-extrabold text-foreground">Expiry date</label>
              <Input
                value={card.expiry}
                onChange={(e) => setCard({ ...card, expiry: e.target.value })}
                placeholder="MM / YY"
                className="mt-1 h-11 rounded-xl bg-muted/60 font-semibold"
              />
            </div>
            <div>
              <label className="text-[12px] font-extrabold text-foreground">CVV</label>
              <Input
                value={card.cvv}
                onChange={(e) => setCard({ ...card, cvv: e.target.value })}
                placeholder="123"
                inputMode="numeric"
                className="mt-1 h-11 rounded-xl bg-muted/60 font-semibold"
              />
            </div>
          </div>
          <div>
            <label className="text-[12px] font-extrabold text-foreground">Cardholder name</label>
            <Input
              value={card.name}
              onChange={(e) => setCard({ ...card, name: e.target.value })}
              placeholder="Name on card"
              className="mt-1 h-11 rounded-xl bg-muted/60 font-semibold"
            />
          </div>
        </div>
      )}

      {method === "bank" && (
        <div className="mt-4 rounded-xl border border-border bg-muted/60 p-4 text-[13px] font-semibold text-muted-foreground">
          <p className="font-extrabold text-foreground">DEAL Secure Account</p>
          <p className="mt-1">999 123 4567 · Wema Bank</p>
          <p className="mt-0.5">Transfer expires in 30:00 after you tap pay.</p>
        </div>
      )}

      {method === "ussd" && (
        <div className="mt-4 rounded-xl border border-border bg-muted/60 p-4 text-[13px] font-semibold text-muted-foreground">
          <p className="font-extrabold text-foreground">Dial *919*86#</p>
          <p className="mt-1">Complete the prompt with your bank to approve {formatNaira(amount)}.</p>
        </div>
      )}

      {method === "wallet" && (
        <div className="mt-4 rounded-xl border border-border bg-muted/60 p-4 text-[13px] font-semibold text-muted-foreground">
          <p className="font-extrabold text-foreground">You'll be redirected</p>
          <p className="mt-1">Choose OPay, PalmPay or Moniepoint to approve the payment.</p>
        </div>
      )}

      <Button
        className="mt-5 h-13 w-full rounded-xl text-[15px] font-bold shadow-md shadow-primary/25"
        disabled={busy}
        onClick={() => onPay(methods.find((m) => m.key === method)?.label ?? "Card")}
      >
        {busy ? (
          <>
            <Loader2 className="mr-2 h-4.5 w-4.5 animate-spin" />
            Processing payment…
          </>
        ) : (
          <>
            <ShieldCheck className="mr-2 h-4.5 w-4.5" />
            Pay {formatNaira(amount)} securely
          </>
        )}
      </Button>
      <p className="mt-2.5 text-center text-[11px] font-semibold text-muted-foreground">
        🔒 Encrypted and secure · Your data is safe with us
      </p>
    </div>
  );
}
