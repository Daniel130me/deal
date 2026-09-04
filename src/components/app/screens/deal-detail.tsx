"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  Copy,
  FileUp,
  Loader2,
  MapPin,
  PartyPopper,
  RefreshCw,
  Send,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { AppCanvas } from "@/components/app/chrome";
import {
  AppPage,
  EscrowBanner,
  FileRow,
  PaymentSummary,
  RecordTimeline,
  SectionCard,
  StatusChip,
} from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/api";
import { useApp } from "@/components/app/context";
import {
  balanceAmount,
  depositAmount,
  formatNaira,
  formatDate,
  type Deal,
  type DealFile,
} from "@/lib/types";

export default function DealDetailScreen({ dealId }: { dealId: string }) {
  const { user } = useApp();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [busy, setBusy] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [uploading, setUploading] = useState(0); // 0..100

  useEffect(() => {
    let alive = true;
    api
      .deal(dealId)
      .then((d) => alive && setDeal(d.deal))
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Deal not found.");
      });
    return () => {
      alive = false;
    };
  }, [dealId]);

  const deposit = useMemo(() => (deal ? depositAmount(deal) : 0), [deal]);
  const balance = useMemo(() => (deal ? balanceAmount(deal) : 0), [deal]);

  if (!deal) {
    return (
      <AppCanvas activeTab="deals" backHref="/deals">
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </AppCanvas>
    );
  }

  async function action(body: { action: "send" | "deliver" | "release-files" | "confirm-payout"; note?: string }) {
    setBusy(true);
    try {
      const { deal: updated } = await api.dealAction(deal.id, body);
      setDeal(updated);
      return updated;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  const shareUrl = `${window.location.origin}/#/c/${deal.shareToken}`;

  async function simulateUpload(kind: "deliver" | "final") {
    setUploading(8);
    const timer = setInterval(() => {
      setUploading((p) => Math.min(96, p + 11));
    }, 120);
    await new Promise((r) => setTimeout(r, 1300));
    clearInterval(timer);
    setUploading(100);
    const files: DealFile[] =
      kind === "deliver"
        ? [
            { id: "f1", name: "Preview photos (High Res).zip", size: "45.6 MB", kind: "ZIP" },
            { id: "f2", name: "Preview photos (Web Size).zip", size: "18.9 MB", kind: "ZIP" },
          ]
        : [
            { id: "f3", name: "Final photos — High Res.zip", size: "204.3 MB", kind: "ZIP" },
            { id: "f4", name: "Final photos — Web Exports.zip", size: "28.9 MB", kind: "ZIP" },
          ];
    await new Promise((r) => setTimeout(r, 350));
    setUploading(0);
    return files;
  }

  const latestDelivery = deal.deliveries.at(-1);

  /* ---------------- hero state per status ---------------- */

  let hero: React.ReactNode = null;
  let primaryAction: React.ReactNode = null;

  switch (deal.status) {
    case "draft":
      hero = (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-[15px] font-extrabold text-amber-800">Draft — not sent yet</p>
          <p className="mt-1 text-[13px] font-medium text-amber-700">
            Finish up and send this deal to {deal.client.name || "your client"} whenever you're ready.
          </p>
        </div>
      );
      primaryAction = (
        <Button
          className="h-13 w-full rounded-xl font-bold"
          disabled={busy}
          onClick={async () => {
            const updated = await action({ action: "send" });
            if (updated) toast.success("Deal sent!");
          }}
        >
          <Send className="mr-2 h-4.5 w-4.5" /> Send deal to client
        </Button>
      );
      break;

    case "sent":
    case "changes_requested":
      hero = (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-[15px] font-extrabold text-amber-800">
            {deal.status === "sent"
              ? `Waiting for ${deal.client.name} to accept`
              : `${deal.client.name} requested changes`}
          </p>
          <p className="mt-1 text-[13px] font-medium text-amber-700">
            {deal.status === "sent"
              ? "You'll be notified the moment they accept and pay the deposit."
              : "Review their note below, tweak the deal and resend when ready."}
          </p>
        </div>
      );
      primaryAction = (
        <div className="space-y-3">
          <div className="rounded-2xl border border-border bg-card p-3.5">
            <p className="text-[13px] font-extrabold text-foreground">Client link</p>
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-border bg-muted/60 p-2 pl-3">
              <p className="min-w-0 flex-1 truncate text-[13px] font-bold text-foreground">{shareUrl}</p>
              <Button
                type="button"
                size="sm"
                className="shrink-0 rounded-lg font-bold"
                onClick={() => {
                  navigator.clipboard?.writeText(shareUrl).catch(() => undefined);
                  toast.success("Link copied!");
                }}
              >
                <Copy className="mr-1 h-3.5 w-3.5" /> Copy
              </Button>
            </div>
          </div>
          <Button
            variant="outline"
            className="h-12 w-full rounded-xl font-bold"
            onClick={() => toast.success(`Reminder sent to ${deal.client.name}!`)}
          >
            <RefreshCw className="mr-2 h-4.5 w-4.5" /> Send reminder
          </Button>
        </div>
      );
      break;

    case "active":
      hero = (
        <div className="rounded-2xl border border-primary/20 bg-secondary p-5 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent ring-8 ring-accent/50">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </span>
          <p className="mt-3 text-lg font-extrabold text-foreground">Deposit secured!</p>
          <p className="text-[15px] font-extrabold text-primary">
            {formatNaira(deposit)} is secured by DEAL.
          </p>
          <p className="mt-1 text-[13px] font-semibold text-muted-foreground">You can start working.</p>
        </div>
      );
      primaryAction = (
        <Button
          className="h-13 w-full rounded-xl font-bold"
          onClick={() => setDeliverOpen(true)}
        >
          <FileUp className="mr-2 h-4.5 w-4.5" /> Deliver work for review
        </Button>
      );
      break;

    case "delivered":
      hero = (
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white ring-8 ring-white/60">
            <FileUp className="h-8 w-8 text-violet-600" />
          </span>
          <p className="mt-3 text-lg font-extrabold text-foreground">Delivery submitted!</p>
          <p className="mx-auto mt-1 max-w-xs text-[13px] font-medium text-violet-700">
            You've uploaded the preview files. The client will review and approve before paying the
            balance.
          </p>
        </div>
      );
      primaryAction = (
        <p className="rounded-xl bg-muted p-3.5 text-center text-[13px] font-semibold text-muted-foreground">
          You'll be notified once the client approves the delivery and pays the remaining balance.
        </p>
      );
      break;

    case "revision":
      hero = (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-[15px] font-extrabold text-amber-800">Revision requested</p>
          <p className="mt-1 text-[13px] font-medium leading-relaxed text-amber-700">
            {deal.events.find((e) => e.type === "changes_requested")?.label ??
              "The client requested some changes."}
          </p>
        </div>
      );
      primaryAction = (
        <Button className="h-13 w-full rounded-xl font-bold" onClick={() => setDeliverOpen(true)}>
          <FileUp className="mr-2 h-4.5 w-4.5" /> Deliver updated work
        </Button>
      );
      break;

    case "approved":
      hero = (
        <div className="rounded-2xl border border-primary/20 bg-secondary p-5 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent ring-8 ring-accent/50">
            <CheckCircle2 className="h-8 w-8 text-primary" />
          </span>
          <p className="mt-3 text-lg font-extrabold text-foreground">Delivery approved!</p>
          <p className="mx-auto mt-1 max-w-xs text-[13px] font-medium text-muted-foreground">
            The client is paying the balance of{" "}
            <span className="font-extrabold text-amber-600">{formatNaira(balance)}</span>. You'll
            release final files once it lands.
          </p>
        </div>
      );
      primaryAction = (
        <Button
          variant="outline"
          className="h-12 w-full rounded-xl font-bold"
          onClick={() => toast.success("Payment reminder sent to the client!")}
        >
          <Wallet className="mr-2 h-4.5 w-4.5" /> Remind client to pay balance
        </Button>
      );
      break;

    case "balance_paid":
      hero = (
        <div className="rounded-2xl border border-primary/20 bg-secondary p-5 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent ring-8 ring-accent/50">
            <PartyPopper className="h-8 w-8 text-primary" />
          </span>
          <p className="mt-3 text-lg font-extrabold text-foreground">Full payment secured!</p>
          <p className="text-[15px] font-extrabold text-primary">{formatNaira(deal.price)}</p>
          <p className="mt-1 text-[13px] font-semibold text-muted-foreground">
            Upload and release the final files — DEAL then releases your payment.
          </p>
        </div>
      );
      primaryAction = (
        <Button
          className="h-13 w-full rounded-xl font-bold"
          disabled={busy}
          onClick={async () => {
            const files = await simulateUpload("final");
            const updated = await action({ action: "release-files", files: undefined });
            if (updated) {
              // attach file list visually
              setDeal({ ...updated, finalFiles: files });
              toast.success("Final files released!");
            }
          }}
        >
          {busy ? <Loader2 className="mr-2 h-4.5 w-4.5 animate-spin" /> : <FileUp className="mr-2 h-4.5 w-4.5" />}
          Upload final files
        </Button>
      );
      break;

    case "files_released":
      hero = (
        <div className="rounded-2xl border border-primary/20 bg-secondary p-5 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent ring-8 ring-accent/50">
            <CheckCircle2 className="h-8 w-8 text-primary" />
          </span>
          <p className="mt-3 text-lg font-extrabold text-foreground">Final files released!</p>
          <p className="mx-auto mt-1 max-w-xs text-[13px] font-medium text-muted-foreground">
            DEAL is releasing your payment to your bank account. This usually takes a few minutes.
          </p>
        </div>
      );
      primaryAction = (
        <Button
          className="h-13 w-full rounded-xl font-bold"
          disabled={busy}
          onClick={async () => {
            const updated = await action({ action: "confirm-payout" });
            if (updated) toast.success("Payment released to your bank account!");
          }}
        >
          {busy ? <Loader2 className="mr-2 h-4.5 w-4.5 animate-spin" /> : <Wallet className="mr-2 h-4.5 w-4.5" />}
          View payout status
        </Button>
      );
      break;

    case "completed":
      hero = (
        <div className="rounded-2xl border border-primary/20 bg-secondary p-5 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary ring-8 ring-accent">
            <Check className="h-8 w-8 text-white" strokeWidth={3} />
          </span>
          <p className="mt-3 text-lg font-extrabold text-foreground">Payment released!</p>
          <p className="text-[15px] font-extrabold text-primary">{formatNaira(deal.price)}</p>
          <p className="mt-1 text-[13px] font-semibold text-muted-foreground">
            Sent to your bank account. A receipt has been emailed to you.
          </p>
        </div>
      );
      primaryAction = (
        <p className="rounded-xl bg-accent p-3.5 text-center text-[13px] font-bold text-accent-foreground">
          Great work! This deal is fully completed — agreed, paid, delivered and approved.
        </p>
      );
      break;

    default:
      hero = (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-[15px] font-extrabold text-red-700">
            {deal.status === "declined" ? "Deal declined" : "Dispute raised"}
          </p>
          <p className="mt-1 text-[13px] font-medium text-red-600">
            {deal.status === "declined"
              ? "The client declined this deal. You can create a new one anytime."
              : "Our team has been notified and will step in to help both sides."}
          </p>
        </div>
      );
  }

  return (
    <AppCanvas activeTab="deals" backHref="/deals">
      <AppPage
        title={deal.title}
        chip={<StatusChip status={deal.status} />}
        subtitle={
          <>
            {deal.ref} · {deal.client.name} · {formatDate(deal.eventDate) || "—"} ·{" "}
            {deal.location || "—"}
          </>
        }
      >
        {hero}
        {primaryAction && <div>{primaryAction}</div>}

        {/* project details */}
        <SectionCard title="Project details">
          <div className="space-y-2.5 text-[13px] font-semibold text-foreground">
            <p className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              {deal.eventDate ? formatDate(deal.eventDate) : "Date TBD"}
            </p>
            <p className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              {deal.location || "—"}
            </p>
            <p className="flex items-center gap-2">
              <FileUp className="h-4 w-4 text-muted-foreground" />
              {deal.serviceTitle || "Custom service"}
            </p>
          </div>
        </SectionCard>

        <PaymentSummary deal={deal} deposit={deposit} balance={balance} />

        {/* deliveries */}
        {deal.deliveries.length > 0 && (
          <SectionCard
            title="What was delivered"
            right={
              <span className="text-xs font-bold text-muted-foreground">
                {deal.deliveries.length} submission{deal.deliveries.length === 1 ? "" : "s"}
              </span>
            }
          >
            <div className="space-y-2.5">
              <p className="text-[13px] font-medium text-muted-foreground">{latestDelivery?.note}</p>
              {latestDelivery?.files.map((file) => (
                <FileRow
                  key={file.id}
                  name={file.name}
                  size={file.size}
                  kind={file.kind}
                  onPreview={() =>
                    toast.info("File preview is simulated in this demo", {
                      description: "In production this opens the file in a secure viewer.",
                    })
                  }
                />
              ))}
            </div>
          </SectionCard>
        )}

        {deal.finalFiles.length > 0 && (
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
        )}

        <RecordTimeline events={deal.events} />
      </AppPage>

      {/* deliver work dialog */}
      <Dialog open={deliverOpen} onOpenChange={setDeliverOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold">Deliver work for review</DialogTitle>
          </DialogHeader>
          {uploading > 0 ? (
            <div className="py-4">
              <p className="text-center text-sm font-bold text-foreground">Uploading files… {uploading}%</p>
              <Progress value={uploading} className="mt-3 h-2.5" />
            </div>
          ) : (
            <>
              <div className="space-y-2.5">
                {[
                  { name: "Preview photos (High Res).zip", size: "45.6 MB", kind: "ZIP" },
                  { name: "Preview photos (Web Size).zip", size: "18.9 MB", kind: "ZIP" },
                ].map((file) => (
                  <div key={file.name} className="flex items-center gap-3 rounded-xl border border-border bg-muted/50 p-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-[10px] font-extrabold text-primary">
                      {file.kind}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold text-foreground">{file.name}</p>
                      <p className="text-xs font-semibold text-muted-foreground">{file.size}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs font-medium leading-relaxed text-muted-foreground">
                In this demo, sample files are attached. In production you'd upload from your device —
                final high-resolution files stay locked until the client pays the balance.
              </p>
              <Button
                className="h-12 w-full rounded-xl font-bold"
                disabled={busy}
                onClick={async () => {
                  const files = await simulateUpload("deliver");
                  const updated = await action({
                    action: "deliver",
                    note: "Preview selection for your review — final set follows after approval.",
                  });
                  setDeliverOpen(false);
                  if (updated) {
                    setDeal({
                      ...updated,
                      deliveries: [
                        ...updated.deliveries.slice(0, -1),
                        { ...updated.deliveries.at(-1)!, files },
                      ],
                    });
                    toast.success("Delivery submitted!");
                  }
                }}
              >
                {busy ? <Loader2 className="mr-2 h-4.5 w-4.5 animate-spin" /> : <FileUp className="mr-2 h-4.5 w-4.5" />}
                Submit delivery
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppCanvas>
  );
}
