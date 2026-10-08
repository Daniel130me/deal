"use client";

/**
 * Client checkout hand-off.
 *
 * Real-rail flow: the client picks a rail and a preferred method, the parent
 * mints a HOSTED checkout link through the backend (`onPay`), and the browser
 * is handed to the rail. Card details, one-time accounts and USSD codes belong
 * to the rail's PCI-scoped page — they never touch DEAL. When the rail
 * redirects back to the share link, the screen verifies the charge.
 */
import { useState } from "react";
import { ArrowLeft, Check, Loader2, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { GatewayMarks } from "@/components/app/kit";
import {
  PROVIDERS,
  PROVIDER_META,
  formatNaira,
  type PaymentProvider,
} from "@/lib/types";
import type { PayMethod } from "@/lib/api";
import { cn } from "@/lib/utils";

/* Gateway brand colors — used ONLY as a subtle accent (selected borders, check icons).
   Escrow is DEAL's, so escrow boxes stay in the app's green. No purple. */
const BRAND: Record<PaymentProvider, { base: string; ink: string }> = {
  flutterwave: { base: "#FF9B00", ink: "#8A5300" },
  paystack: { base: "#00C3F7", ink: "#02516B" },
};

const RAIL_DESC: Record<PaymentProvider, string> = {
  flutterwave: "Pan-African rail · card, transfer & USSD",
  paystack: "Nigeria's favourite checkout · card, transfer & USSD",
};

const METHOD_HINTS: Record<PayMethod, string> = {
  card: "You'll enter your card details on the secure checkout page.",
  transfer: "The checkout page shows a one-time account for this payment.",
  ussd: "The checkout page shows the USSD code for your bank.",
};

interface PaymentCheckoutProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the client pays now — always the server-computed next due slot. */
  amount: number;
  /** e.g. "Deposit (50%)" | "Installment 2 of 2" */
  label: string;
  dealTitle: string;
  dealRef: string;
  creatorName: string;
  /** The rail the creator prefers — preselected in step 1. */
  preferredProvider: PaymentProvider;
  escrowNote?: string;
  /** Parent mints the hosted-checkout link (records the payment attempt first). */
  onPay: (method: PayMethod, provider: PaymentProvider) => Promise<{ link: string }>;
}

type Phase = "rail" | "method" | "redirect";

export default function PaymentCheckout({
  open,
  onOpenChange,
  amount,
  label,
  dealTitle,
  dealRef,
  creatorName,
  preferredProvider,
  escrowNote,
  onPay,
}: PaymentCheckoutProps) {
  const [phase, setPhase] = useState<Phase>("rail");
  // null = no explicit choice yet → falls back to the creator's preferred rail on every open.
  const [choice, setChoice] = useState<PaymentProvider | null>(null);
  const [method, setMethod] = useState<PayMethod>("card");
  const [error, setError] = useState<string | null>(null);

  const provider: PaymentProvider = choice ?? preferredProvider;
  const meta = PROVIDER_META[provider];
  const brand = BRAND[provider];
  const escrowCopy =
    escrowNote ??
    `Funds are held in DEAL escrow — ${creatorName} only receives this payment when you approve the completed work.`;

  function resetState() {
    setPhase("rail");
    setChoice(null);
    setMethod("card");
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next && phase === "redirect") return; // locked while handing off to the rail
    if (!next) {
      resetState();
      onOpenChange(false);
    }
  }

  /** Mint the hosted link, then hand the browser to the rail. */
  async function startRedirect() {
    setError(null);
    setPhase("redirect");
    try {
      const { link } = await onPay(method, provider);
      window.location.assign(link);
      // Navigation is async — stay on the "redirecting" screen until it happens.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the checkout. Try again.");
      setPhase("method");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={phase !== "redirect"}
        className="gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-md"
      >
        <div className="max-h-[90vh] overflow-y-auto">
          {/* gateway header — shows the selected rail */}
          <header className="flex items-center justify-between gap-2 border-b border-border bg-white px-5 py-4">
            <div className="flex min-w-0 items-center gap-2.5">
              {phase === "rail" ? (
                <GatewayMarks className="shrink-0" />
              ) : (
                <img src={meta.logo} alt={meta.label} className="h-5 w-auto shrink-0" />
              )}
              <DialogTitle className="truncate text-[11px] font-extrabold uppercase tracking-wide text-foreground">
                {phase === "rail" ? "Secure checkout" : `${meta.label} secure checkout`}
              </DialogTitle>
            </div>
            <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 font-mono text-[10px] font-extrabold text-foreground">
              {dealRef}
            </span>
          </header>

          {/* STEP 1 — choose the rail */}
          {phase === "rail" && (
            <div className="px-5 py-5">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">
                Amount to pay
              </p>
              <p className="mt-1 text-4xl font-extrabold tracking-tight text-foreground">
                {formatNaira(amount)}
              </p>
              <p className="mt-1.5 text-[13px] font-extrabold text-foreground">{label}</p>
              <p className="text-[13px] font-medium text-muted-foreground">
                {dealTitle} · for {creatorName}
              </p>

              {/* escrow explainer — DEAL's, not the gateway's */}
              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-secondary p-3">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="text-[12px] font-semibold leading-relaxed text-foreground">
                  {escrowCopy}
                </p>
              </div>

              <p className="mt-4 text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">
                Step 1 of 2 · Choose how to pay
              </p>
              <div className="mt-2 grid gap-2.5">
                {PROVIDERS.map((p) => {
                  const pm = PROVIDER_META[p];
                  const selected = provider === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setChoice(p)}
                      aria-pressed={selected}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl border-2 bg-white p-3.5 text-left transition-all",
                        selected ? "shadow-sm" : "border-border hover:border-muted-foreground/40"
                      )}
                      style={selected ? { borderColor: BRAND[p].base } : undefined}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-white">
                        <img src={pm.logo} alt={pm.label} className="h-5 w-auto" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[14px] font-extrabold text-foreground">{pm.label}</span>
                          {p === preferredProvider ? (
                            <span className="rounded-full bg-accent px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-accent-foreground">
                              Preferred by {creatorName}
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-[11px] font-semibold text-muted-foreground">
                          {RAIL_DESC[p]}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                          !selected && "border-border"
                        )}
                        style={selected ? { borderColor: BRAND[p].base } : undefined}
                      >
                        {selected ? (
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: BRAND[p].base }}
                          />
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2.5 text-center text-[11px] font-semibold text-muted-foreground">
                Your choice — DEAL escrow protects your money either way.
              </p>

              <Button
                type="button"
                onClick={() => {
                  setError(null);
                  setPhase("method");
                }}
                className="mt-4 h-12 w-full rounded-xl text-[15px] font-extrabold text-white shadow-md shadow-primary/25"
              >
                Continue with {meta.label}
              </Button>
            </div>
          )}

          {/* STEP 2 — method preference + hand-off */}
          {phase === "method" && (
            <div className="px-5 py-4">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setPhase("rail");
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-extrabold text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Choose another rail
                </button>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">
                  Step 2 of 2 · {meta.label}
                </span>
              </div>

              <div className="mt-3">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">
                  Amount to pay
                </p>
                <p className="mt-0.5 text-3xl font-extrabold tracking-tight text-foreground">
                  {formatNaira(amount)}
                </p>
                <p className="mt-0.5 truncate text-[12px] font-extrabold text-foreground">{label}</p>
                <p className="truncate text-[12px] font-medium text-muted-foreground">
                  {dealTitle} · for {creatorName}
                </p>
              </div>

              {/* escrow explainer */}
              <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-secondary p-3">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="text-[12px] font-semibold leading-relaxed text-foreground">
                  {escrowCopy}
                </p>
              </div>

              {/* method preference — the checkout page finalises it */}
              <div className="mt-3.5 grid grid-cols-3 gap-2">
                {(
                  [
                    { key: "card", label: "Card" },
                    { key: "transfer", label: "Transfer" },
                    { key: "ussd", label: "USSD" },
                  ] as const
                ).map((m) => {
                  const active = method === m.key;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setMethod(m.key)}
                      aria-pressed={active}
                      className={cn(
                        "rounded-xl border-2 px-2 py-2.5 text-[12px] font-extrabold transition-colors",
                        active ? "bg-white" : "border-border bg-white text-muted-foreground hover:bg-muted"
                      )}
                      style={active ? { borderColor: brand.base, color: brand.ink } : undefined}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-center text-[11px] font-medium text-muted-foreground">
                {METHOD_HINTS[method]}
              </p>

              {error && (
                <div className="mt-3.5 rounded-xl border border-red-200 bg-red-50 p-3" role="alert">
                  <p className="text-[13px] font-bold text-red-700">{error}</p>
                </div>
              )}

              <Button
                type="button"
                onClick={startRedirect}
                className="mt-4 h-12 w-full rounded-xl text-[15px] font-extrabold text-white shadow-md shadow-primary/25"
              >
                <Lock className="mr-2 h-4 w-4" />
                Continue to {meta.label} checkout
              </Button>
              <p className="mt-2 text-center text-[11px] font-semibold text-muted-foreground">
                You&rsquo;ll complete {formatNaira(amount)} on {meta.label}&rsquo;s secure page, then
                come right back here.
              </p>
            </div>
          )}

          {/* handing off to the rail's hosted page */}
          {phase === "redirect" && (
            <div className="flex flex-col items-center px-5 py-12 text-center">
              <Loader2 className="h-10 w-10 animate-spin" style={{ color: brand.base }} />
              <p className="mt-4 text-[15px] font-extrabold text-foreground">
                Taking you to {meta.label}&hellip;
              </p>
              <p className="mt-1 text-[12px] font-semibold text-muted-foreground">
                {formatNaira(amount)} · {label}
              </p>
              <ol className="mt-6 w-full max-w-xs space-y-2.5 text-left">
                {[`Opening ${meta.label} secure checkout`, "You'll return here to confirm"].map(
                  (stepLabel) => (
                    <li key={stepLabel} className="flex items-center gap-2.5">
                      <span
                        className="flex h-5 w-5 items-center justify-center rounded-full"
                        style={{ backgroundColor: brand.base }}
                      >
                        <Check className="h-3 w-3 text-white" strokeWidth={3} />
                      </span>
                      <span className="text-[13px] font-bold text-foreground">{stepLabel}</span>
                    </li>
                  )
                )}
              </ol>
            </div>
          )}

          {/* gateway footer */}
          <footer className="border-t border-border bg-white px-5 py-3 text-center">
            <p className="text-[10px] font-bold text-muted-foreground">
              {phase === "rail"
                ? "Powered by Flutterwave & Paystack · Escrow managed by DEAL"
                : `Powered by ${meta.label} · Escrow managed by DEAL · PCI-DSS secured`}
            </p>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}
