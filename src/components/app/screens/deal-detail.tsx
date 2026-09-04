"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  CalendarDays,
  CheckCircle2,
  Copy,
  Eye,
  FileUp,
  FileWarning,
  Loader2,
  MapPin,
  PartyPopper,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { AppCanvas } from "@/components/app/chrome";
import {
  AgreementSummary,
  AppPage,
  ChannelButtons,
  EscrowBanner,
  FileRow,
  MetaRow,
  PaymentSummary,
  PayazaMark,
  RecordTimeline,
  SectionCard,
  StatusChip,
  Stepper,
  type Step,
} from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { api, type SafeUser } from "@/lib/api";
import {
  formatNaira,
  formatDate,
  formatDateTime,
  isApproved,
  isFullyPaid,
  paidTotal,
  remainingBalance,
  type Deal,
} from "@/lib/types";

/** Plain hash anchor: native navigation fires `hashchange`, which drives the SPA router
 *  (Next <Link> does same-page pushState without firing it). */
function HashLink({ onClick, ...rest }: React.ComponentPropsWithoutRef<"a">) {
  return (
    <a
      {...rest}
      onClick={(event) => {
        window.scrollTo({ top: 0 });
        onClick?.(event);
      }}
    />
  );
}

const DELIVERY_FILES = [
  { name: "Preview photos (High Res).zip", size: "45.6 MB" },
  { name: "Preview photos (Web Size).zip", size: "18.9 MB" },
];

const FINAL_FILES = [
  { name: "Final files — High Res.zip", size: "204.3 MB" },
  { name: "Final files — Web Exports.zip", size: "28.9 MB" },
];

const HELD_STATUSES: Deal["status"][] = [
  "active",
  "delivered",
  "revision",
  "approved",
  "files_released",
  "completed",
];

function heldTotal(deal: Deal) {
  return deal.payments
    .filter((p) => p.status === "held")
    .reduce((sum, p) => sum + p.amount, 0);
}

function lifecycleSteps(deal: Deal): Step[] {
  const delivery: Step["state"] =
    deal.status === "active" || deal.status === "revision" ? "current" : "done";
  const approval: Step["state"] =
    deal.status === "delivered" ? "current" : isApproved(deal) ? "done" : "todo";
  const files: Step["state"] =
    deal.status === "files_released" || deal.status === "completed"
      ? "done"
      : isApproved(deal)
        ? "current"
        : "todo";
  return [
    { label: "Accepted", state: "done" },
    { label: "Payment", sub: "In Payaza escrow", state: "done" },
    { label: "Delivery", sub: deal.status === "revision" ? "Revision" : undefined, state: delivery },
    { label: "Approval", state: approval },
    {
      label: "Final files",
      sub:
        deal.status === "approved" && remainingBalance(deal) > 0 ? "Awaiting balance" : undefined,
      state: files,
    },
  ];
}

function MiniFileRow({ name, size }: { name: string; size: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/50 p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-[9px] font-extrabold text-primary">
        ZIP
      </span>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-bold text-foreground">{name}</p>
        <p className="text-xs font-semibold text-muted-foreground">{size}</p>
      </div>
    </div>
  );
}

function UploadDialog({
  open,
  onOpenChange,
  title,
  hint,
  files,
  submitLabel,
  progress,
  submitting,
  onSubmit,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  hint?: string;
  files: { name: string; size: string }[];
  submitLabel: string;
  progress: number;
  submitting: boolean;
  onSubmit: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting && progress === 0) onOpenChange(next);
      }}
    >
      <DialogContent aria-describedby={undefined} className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-extrabold">{title}</DialogTitle>
        </DialogHeader>
        {progress > 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm font-extrabold text-foreground">Uploading files… {progress}%</p>
            <Progress value={progress} className="mx-auto mt-4 h-2.5 max-w-xs" />
            <p className="mt-2 text-xs font-semibold text-muted-foreground">
              Simulated upload for this demo
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {hint ? (
              <p className="text-[13px] font-medium leading-relaxed text-muted-foreground">{hint}</p>
            ) : null}
            <div className="space-y-2.5">
              {files.map((file) => (
                <MiniFileRow key={file.name} name={file.name} size={file.size} />
              ))}
            </div>
            {children}
            <Button
              className="h-12 w-full rounded-xl font-bold"
              disabled={submitting}
              onClick={onSubmit}
            >
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileUp className="mr-2 h-4 w-4" />
              )}
              {submitLabel}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function DealDetailScreen({ dealId }: { dealId: string }) {
  const [deal, setDeal] = useState<Deal | null>(null);
  const [creator, setCreator] = useState<SafeUser | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [finalOpen, setFinalOpen] = useState(false);
  const [note, setNote] = useState("");
  const [progress, setProgress] = useState(0);
  const agreementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .deal(dealId)
      .then((d) => {
        if (!alive) return;
        setDeal(d.deal);
        setCreator(d.creator);
      })
      .catch((err) => {
        if (alive) setLoadError(err instanceof Error ? err.message : "Deal not found.");
      });
    return () => {
      alive = false;
    };
  }, [dealId]);

  if (loadError) {
    return (
      <AppCanvas activeTab="deals" backHref="/deals">
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
          <FileWarning className="h-8 w-8 text-muted-foreground" />
          <p className="text-[15px] font-extrabold text-foreground">{loadError}</p>
          <Button asChild variant="outline" className="rounded-xl font-bold">
            <HashLink href="#/deals">Back to projects</HashLink>
          </Button>
        </div>
      </AppCanvas>
    );
  }

  if (!deal || !creator) {
    return (
      <AppCanvas activeTab="deals" backHref="/deals">
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </AppCanvas>
    );
  }

  const remaining = remainingBalance(deal);
  const paid = paidTotal(deal);
  const pct = deal.price > 0 ? Math.min(100, Math.round((paid / deal.price) * 100)) : 0;
  const escrowed = heldTotal(deal);
  const fullyPaid = isFullyPaid(deal);
  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/#/c/${deal.shareToken}` : "";

  async function simulateUpload() {
    for (const step of [10, 26, 44, 62, 78, 90, 100]) {
      setProgress(step);
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  const sendDeal = async () => {
    setBusy(true);
    try {
      const { deal: updated } = await api.dealAction(deal.id, { action: "send" });
      setDeal(updated);
      toast.success(`Deal sent to ${updated.client.name}!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send the deal.");
    } finally {
      setBusy(false);
    }
  };

  const submitDelivery = async () => {
    const wasRevision = deal.status === "revision";
    setBusy(true);
    try {
      await simulateUpload();
      const { deal: updated } = await api.dealAction(deal.id, {
        action: "deliver",
        note: note.trim() || undefined,
      });
      setDeal(updated);
      setDeliverOpen(false);
      setNote("");
      toast.success(wasRevision ? "Revised delivery submitted!" : "Delivery submitted for review!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't submit the delivery.");
    } finally {
      setProgress(0);
      setBusy(false);
    }
  };

  const submitRelease = async () => {
    setBusy(true);
    try {
      await simulateUpload();
      const { deal: updated } = await api.dealAction(deal.id, { action: "release-files" });
      setDeal(updated);
      setFinalOpen(false);
      toast.success("Final files released to client!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't release the final files.");
    } finally {
      setProgress(0);
      setBusy(false);
    }
  };

  const copyClientLink = () => {
    navigator.clipboard
      ?.writeText(shareUrl)
      .then(() => toast.success("Client link copied"))
      .catch(() => toast.error("Couldn't copy — long-press the link to copy it."));
  };

  const remindClient = () => {
    toast.success(`Reminder sent to ${deal.client.name}!`);
  };

  const nudgeClient = () => {
    toast.success(`Nudge sent to ${deal.client.name} — they'll review it now.`);
  };

  const latestRevisionNote =
    [...deal.events].reverse().find((e) => e.type === "changes_requested")?.label ??
    "The client requested some changes.";

  /* ---------------- status-driven hero block ---------------- */

  let banner: React.ReactNode = null;
  let actions: React.ReactNode = null;

  switch (deal.status) {
    case "draft":
      banner = (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 lg:p-5">
          <p className="text-[15px] font-extrabold text-amber-800">
            Draft — only you can see this deal
          </p>
          <p className="mt-0.5 text-[13px] font-medium leading-relaxed text-amber-700">
            Review the agreement below, then send it to {deal.client.name || "your client"} whenever
            you're ready.
          </p>
          <p className="mt-2 text-xs font-bold text-amber-800/80">
            Nothing goes out until you tap Send deal — take one last look at the terms first.
          </p>
        </div>
      );
      actions = (
        <div className="space-y-2">
          <Button
            className="h-12 w-full rounded-xl font-bold"
            onClick={() =>
              agreementRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          >
            <Eye className="mr-2 h-4 w-4" /> Review &amp; send
          </Button>
          <p className="flex items-center justify-center gap-1.5 text-center text-xs font-semibold text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Check every line below — clients see exactly what you see.
          </p>
        </div>
      );
      break;

    case "sent":
    case "changes_requested":
      banner = (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 lg:p-5">
          <p className="text-[15px] font-extrabold text-amber-800">
            {deal.status === "sent"
              ? `Waiting for ${deal.client.name} to accept`
              : `${deal.client.name} requested changes`}
          </p>
          <p className="mt-0.5 text-[13px] font-medium leading-relaxed text-amber-700">
            {deal.status === "sent"
              ? "They'll accept and make the first payment from their link — you'll see it here the moment it happens."
              : latestRevisionNote}
          </p>
        </div>
      );
      actions = (
        <div className="space-y-3 rounded-2xl border border-border bg-muted/40 p-4">
          <div>
            <p className="text-[13px] font-extrabold text-foreground">Client link</p>
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-border bg-white p-2 pl-3">
              <p className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{shareUrl}</p>
              <Button
                type="button"
                size="sm"
                className="shrink-0 rounded-lg font-bold"
                onClick={copyClientLink}
              >
                <Copy className="mr-1 h-3.5 w-3.5" /> Copy
              </Button>
            </div>
          </div>
          {creator.channels.length > 0 ? (
            <div>
              <p className="text-[13px] font-extrabold text-foreground">Share via</p>
              <ChannelButtons channels={creator.channels} size="sm" className="mt-2" />
            </div>
          ) : null}
          <Button
            asChild
            size="sm"
            className="w-full rounded-lg bg-accent font-extrabold text-accent-foreground shadow-none hover:bg-primary hover:text-white"
          >
            <HashLink href={`#/c/${deal.shareToken}`}>
              <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview as client — open their view
            </HashLink>
          </Button>
          <div>
            <Button variant="outline" size="sm" className="rounded-lg font-bold" onClick={remindClient}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Send reminder
            </Button>
          </div>
          <p className="flex items-start gap-1.5 text-xs font-medium leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            Clients can also pay installments before delivery — everything sits in Payaza escrow
            until they approve the completed work.
          </p>
        </div>
      );
      break;

    case "active":
      banner = (
        <EscrowBanner
          amount={escrowed}
          paidOn={deal.depositPaidAt}
          note={`Held by Payaza escrow — released to you the moment ${deal.client.name} approves the completed work. They can pay installments anytime.`}
        />
      );
      actions = (
        <Button className="h-12 w-full rounded-xl font-bold" onClick={() => setDeliverOpen(true)}>
          <FileUp className="mr-2 h-4 w-4" /> Deliver work for review
        </Button>
      );
      break;

    case "delivered":
      banner = (
        <div className="flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 lg:p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white">
            <FileUp className="h-5 w-5 text-violet-600" />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-extrabold text-violet-900">Awaiting client review</p>
            <p className="mt-0.5 text-[13px] font-medium leading-relaxed text-violet-700">
              {escrowed > 0
                ? `${formatNaira(escrowed)} is in escrow and releases the moment they approve.`
                : "The client is reviewing your delivery now."}
            </p>
          </div>
        </div>
      );
      actions = (
        <Button variant="outline" className="h-12 w-full rounded-xl font-bold" onClick={nudgeClient}>
          <RefreshCw className="mr-2 h-4 w-4" /> Nudge client
        </Button>
      );
      break;

    case "revision":
      banner = (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 lg:p-5">
          <p className="text-[15px] font-extrabold text-amber-800">Revision requested</p>
          <p className="mt-0.5 text-[13px] font-medium leading-relaxed text-amber-700">
            {latestRevisionNote}
          </p>
        </div>
      );
      actions = (
        <Button className="h-12 w-full rounded-xl font-bold" onClick={() => setDeliverOpen(true)}>
          <FileUp className="mr-2 h-4 w-4" /> Submit revised delivery
        </Button>
      );
      break;

    case "approved":
    case "balance_paid": // legacy status — never set by the backend, treated like approved
      banner = (
        <div className="rounded-2xl border border-primary/20 bg-secondary p-4 lg:p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent">
              <CheckCircle2 className="h-5 w-5 text-primary" />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-extrabold text-foreground">
                Work approved! {formatNaira(paid)} released from escrow
              </p>
              <p className="mt-0.5 text-[13px] font-medium text-muted-foreground">
                The money has landed in your Payaza payout account.
              </p>
              <PayazaMark className="mt-2" />
            </div>
          </div>
        </div>
      );
      actions = fullyPaid ? (
        <Button className="h-12 w-full rounded-xl font-bold" onClick={() => setFinalOpen(true)}>
          <FileUp className="mr-2 h-4 w-4" /> Upload final files
        </Button>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-[13px] font-extrabold text-amber-800">
            {formatNaira(remaining)} still outstanding
          </p>
          <p className="mt-0.5 text-[13px] font-medium leading-relaxed text-amber-700">
            The client can pay anytime — payments now land instantly since the work is approved.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 rounded-lg border-amber-300 bg-white font-bold text-amber-800 hover:bg-amber-100"
            onClick={remindClient}
          >
            <Wallet className="mr-1.5 h-3.5 w-3.5" /> Remind client to pay
          </Button>
        </div>
      );
      break;

    case "files_released":
      banner = (
        <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-secondary p-4 lg:p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent">
            <CheckCircle2 className="h-5 w-5 text-primary" />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-extrabold text-foreground">Final files delivered</p>
            <p className="mt-0.5 text-[13px] font-medium leading-relaxed text-muted-foreground">
              Waiting for {deal.client.name} to confirm and download — you'll get a notification
              when they do.
            </p>
          </div>
        </div>
      );
      break;

    case "completed":
      banner = (
        <div className="rounded-2xl border border-primary/20 bg-secondary p-5 text-center lg:p-6">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary ring-8 ring-accent">
            <PartyPopper className="h-7 w-7 text-white" />
          </span>
          <p className="mt-3 text-lg font-extrabold text-foreground">Deal completed!</p>
          <p className="mt-0.5 text-[15px] font-extrabold text-primary">
            {formatNaira(paid)} released to your Payaza payout account
          </p>
          <div className="mt-2 flex justify-center">
            <PayazaMark withText />
          </div>
          <p className="mt-2 text-[13px] font-medium text-muted-foreground">
            Agreed, paid, delivered, approved — DEAL kept the record.
          </p>
        </div>
      );
      break;

    default:
      banner = (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 lg:p-5">
          <p className="text-[15px] font-extrabold text-red-700">
            {deal.status === "declined" ? "Deal declined" : "Dispute raised"}
          </p>
          <p className="mt-0.5 text-[13px] font-medium leading-relaxed text-red-600">
            {deal.status === "declined"
              ? `${deal.client.name} passed on this deal. You can create a new one anytime.`
              : "The DEAL team has been notified and will help both sides resolve it."}
          </p>
          {deal.status === "declined" ? (
            <Button asChild variant="outline" size="sm" className="mt-3 rounded-lg font-bold">
              <HashLink href="#/deals/new">
                <Plus className="mr-1 h-3.5 w-3.5" /> Create a new deal
              </HashLink>
            </Button>
          ) : null}
        </div>
      );
  }

  return (
    <AppCanvas activeTab="deals" backHref="/deals">
      <AppPage
        title={deal.title}
        chip={<StatusChip status={deal.status} />}
        backHref="#/deals"
        subtitle={
          <>
            <span className="font-mono">{deal.ref}</span> · {deal.client.name}
            {deal.serviceTitle ? ` · ${deal.serviceTitle}` : ""}
          </>
        }
      >
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="space-y-5 lg:space-y-6"
        >
          {/* hero card */}
          <section className="space-y-5 rounded-2xl border border-border bg-card p-5 lg:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <MetaRow
                items={[
                  {
                    icon: <CalendarDays className="h-4 w-4" />,
                    text: deal.dueDate ? `Due ${formatDate(deal.dueDate)}` : "Date TBD",
                  },
                  ...(deal.location
                    ? [{ icon: <MapPin className="h-4 w-4" />, text: deal.location }]
                    : []),
                ]}
              />
              <div className="text-right">
                <p className="text-xl font-extrabold text-foreground lg:text-2xl">
                  {formatNaira(deal.price)}
                </p>
                <p className="text-xs font-bold text-muted-foreground">
                  {remaining > 0
                    ? `${formatNaira(paid)} paid · ${formatNaira(remaining)} outstanding`
                    : "Paid in full"}
                </p>
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold text-muted-foreground">
                <span>Payment progress</span>
                <span>{pct}%</span>
              </div>
              <Progress value={pct} className="h-2" />
            </div>

            {HELD_STATUSES.includes(deal.status) ? <Stepper steps={lifecycleSteps(deal)} /> : null}

            {banner}
            {actions}
            {deal.status !== "draft" &&
            deal.status !== "sent" &&
            deal.status !== "changes_requested" ? (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="-ml-2 justify-start self-start text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                <HashLink href={`#/c/${deal.shareToken}`}>
                  <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview what {deal.client.name} sees
                </HashLink>
              </Button>
            ) : null}
          </section>

          {/* agreement */}
          <div ref={agreementRef} className="scroll-mt-24 space-y-5 lg:space-y-6">
            <AgreementSummary deal={deal} />
            <PaymentSummary deal={deal} />
            {deal.status === "draft" ? (
              <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-primary/40 bg-accent/60 p-4 sm:flex-row sm:items-center sm:justify-between lg:p-5">
                <p className="text-[13px] font-bold text-accent-foreground">
                  Happy with the agreement? Send it to {deal.client.name}.
                </p>
                <Button className="rounded-xl font-bold" disabled={busy} onClick={sendDeal}>
                  {busy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Send deal
                </Button>
              </div>
            ) : null}
          </div>

          {/* deliveries */}
          {deal.deliveries.length > 0 ? (
            <SectionCard
              title="Deliveries"
              right={
                <span className="text-xs font-bold text-muted-foreground">
                  {deal.deliveries.length} submission{deal.deliveries.length === 1 ? "" : "s"}
                </span>
              }
            >
              <div className="space-y-5">
                {[...deal.deliveries].reverse().map((delivery, index) => (
                  <div key={delivery.id} className={index > 0 ? "border-t border-border pt-5" : ""}>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[13px] font-extrabold text-foreground">
                        {index === 0 ? "Latest delivery" : `Delivery ${deal.deliveries.length - index}`}
                      </p>
                      <p className="text-xs font-semibold text-muted-foreground">
                        {formatDateTime(delivery.submittedAt)}
                      </p>
                    </div>
                    {delivery.note ? (
                      <p className="mb-3 rounded-xl bg-muted/60 p-3 text-[13px] font-medium leading-relaxed text-foreground/90">
                        {delivery.note}
                      </p>
                    ) : null}
                    <div className="space-y-2.5">
                      {delivery.files.map((file) => (
                        <FileRow
                          key={file.id}
                          name={file.name}
                          size={file.size}
                          kind={file.kind}
                          onPreview={() =>
                            toast.info("File preview is simulated in this demo", {
                              description:
                                "In production this opens the file in a secure viewer.",
                            })
                          }
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          ) : null}

          {/* final files */}
          {deal.finalFiles.length > 0 ? (
            <SectionCard title="Final files">
              <div className="space-y-2.5">
                {deal.finalFiles.map((file) => (
                  <FileRow
                    key={file.id}
                    name={file.name}
                    size={file.size}
                    kind={file.kind}
                    onPreview={() => toast.info("File preview is simulated in this demo")}
                  />
                ))}
              </div>
            </SectionCard>
          ) : null}

          {/* record */}
          <RecordTimeline events={deal.events} />
        </motion.div>
      </AppPage>

      {/* deliver dialog */}
      <UploadDialog
        open={deliverOpen}
        onOpenChange={setDeliverOpen}
        title={deal.status === "revision" ? "Submit revised delivery" : "Deliver work for review"}
        hint={`Attach your preview files and add a note for ${deal.client.name}. Final high-resolution files are uploaded after approval.`}
        files={DELIVERY_FILES}
        submitLabel="Submit delivery"
        progress={progress}
        submitting={busy}
        onSubmit={submitDelivery}
      >
        <div>
          <label htmlFor="deliver-note" className="text-[13px] font-extrabold text-foreground">
            Note for {deal.client.name}
          </label>
          <Textarea
            id="deliver-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="e.g. First cut of the gallery — have a look at shots 12–24."
            className="mt-1.5 rounded-xl"
          />
        </div>
      </UploadDialog>

      {/* release final files dialog */}
      <UploadDialog
        open={finalOpen}
        onOpenChange={setFinalOpen}
        title="Upload final files"
        hint="These are the high-resolution files your client will download once you release them."
        files={FINAL_FILES}
        submitLabel="Upload & release"
        progress={progress}
        submitting={busy}
        onSubmit={submitRelease}
      />
    </AppCanvas>
  );
}

