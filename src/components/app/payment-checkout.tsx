"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  CreditCard,
  Landmark,
  Loader2,
  Lock,
  Smartphone,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GatewayMarks, ProviderMark } from "@/components/app/kit";
import {
  PROVIDERS,
  PROVIDER_META,
  formatNaira,
  type Deal,
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

const TEST_CARD = { number: "4084 0840 8408 4081", expiry: "09/28", cvv: "123" };
const TRANSFER_ACCOUNT = "88 0123456712";
const TRANSFER_BENEFICIARY = "DEAL Escrow Services";
const TRANSFER_BANK: Record<PaymentProvider, string> = {
  flutterwave: "Wema Bank",
  paystack: "Titan Trust Bank",
};
const COUNTDOWN_SECONDS = 30 * 60;

const USSD_BANKS = [
  { key: "gtb", label: "GTB", prefix: "*737*" },
  { key: "access", label: "Access", prefix: "*901*" },
  { key: "wema", label: "Wema", prefix: "*945*" },
] as const;

const METHOD_LABELS: Record<PayMethod, string> = {
  card: "Card payment",
  transfer: "Bank transfer",
  ussd: "USSD payment",
};

function formatCardNumber(v: string) {
  return v
    .replace(/\D/g, "")
    .slice(0, 16)
    .replace(/(.{4})/g, "$1 ")
    .trim();
}

function formatExpiry(v: string) {
  const digits = v.replace(/\D/g, "").slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function formatCvv(v: string) {
  return v.replace(/\D/g, "").slice(0, 4);
}

function formatCountdown(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface PaymentCheckoutProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the client pays now. */
  amount: number;
  /** e.g. "Deposit (50%)" | "Installment 2 of 2" | "Balance payment" */
  label: string;
  dealTitle: string;
  dealRef: string;
  creatorName: string;
  /** The rail the creator prefers — preselected in step 1 and badged "Preferred by {creatorName}". */
  preferredProvider: PaymentProvider;
  escrowNote?: string;
  /** Success-screen release line (defaults to the held-in-DEAL-escrow copy). */
  successNote?: string;
  /**
   * Parent performs the API call (passing the chosen rail) and returns the updated deal —
   * the success screen reads the FLW-/PSK- reference from its latest payment.
   */
  onPaid: (method: PayMethod, provider: PaymentProvider) => Promise<Deal>;
}

type Phase = "rail" | "method" | "processing" | "success";

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
  successNote,
  onPaid,
}: PaymentCheckoutProps) {
  const [phase, setPhase] = useState<Phase>("rail");
  // null = no explicit choice yet → falls back to the creator's preferred rail on every open.
  const [choice, setChoice] = useState<PaymentProvider | null>(null);
  const [line, setLine] = useState<0 | 1>(0);
  const [method, setMethod] = useState<PayMethod>("card");
  const [card, setCard] = useState({ number: "", expiry: "", cvv: "", name: "" });
  const [bank, setBank] = useState<(typeof USSD_BANKS)[number]["key"]>("gtb");
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Deal | null>(null);
  const aliveRef = useRef(true);

  // The client's chosen rail — preselected to the creator's preference until they pick one.
  const provider: PaymentProvider = choice ?? preferredProvider;
  const meta = PROVIDER_META[provider];
  const brand = BRAND[provider];

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // transfer countdown
  useEffect(() => {
    if (!open || phase !== "method" || method !== "transfer") return;
    const id = setInterval(() => {
      if (aliveRef.current) setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [open, phase, method]);

  const cardValid =
    card.number.replace(/\D/g, "").length === 16 &&
    card.expiry.length === 5 &&
    card.cvv.length >= 3 &&
    card.name.trim().length > 1;

  function resetState() {
    setPhase("rail");
    setChoice(null);
    setLine(0);
    setMethod("card");
    setCard({ number: "", expiry: "", cvv: "", name: "" });
    setBank("gtb");
    setSecondsLeft(COUNTDOWN_SECONDS);
    setError(null);
    setResult(null);
  }

  function handleOpenChange(next: boolean) {
    if (!next && phase === "processing") return; // lock the dialog while charging
    if (!next) {
      resetState();
      onOpenChange(false);
    }
  }

  async function startPayment() {
    setError(null);
    setPhase("processing");
    setLine(0);
    const lineTimer = setTimeout(() => {
      if (aliveRef.current) setLine(1);
    }, 900);
    try {
      const [deal] = await Promise.all([onPaid(method, provider), delay(1800)]);
      if (!aliveRef.current) return;
      setResult(deal);
      setPhase("success");
    } catch (err) {
      clearTimeout(lineTimer);
      if (!aliveRef.current) return;
      setError(err instanceof Error ? err.message : "Payment failed. Try again.");
      setPhase("method");
    }
  }

  // The reference comes from the API — the updated deal's latest payment carries the FLW-/PSK- ref.
  const reference = result?.payments.at(-1)?.reference ?? `${meta.refPrefix}-DEMO0000`;
  const ussdCode = `${USSD_BANKS.find((b) => b.key === bank)?.prefix ?? "*737*"}${amount}#`;
  const escrowCopy =
    escrowNote ??
    `Funds are held in DEAL escrow — ${creatorName} only receives this payment when you approve the completed work.`;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={phase !== "processing"}
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

          {/* STEP 2 — method, rebranded per rail */}
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

              {/* method tabs */}
              <div className="mt-3.5 grid grid-cols-3 gap-2">
                {(
                  [
                    { key: "card", label: "Card", icon: CreditCard },
                    { key: "transfer", label: "Transfer", icon: Landmark },
                    { key: "ussd", label: "USSD", icon: Smartphone },
                  ] as const
                ).map((m) => {
                  const Icon = m.icon;
                  const active = method === m.key;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setMethod(m.key)}
                      aria-pressed={active}
                      className={cn(
                        "flex items-center justify-center gap-1.5 rounded-xl border-2 px-2 py-2.5 text-[12px] font-extrabold transition-colors",
                        active ? "bg-white" : "border-border bg-white text-muted-foreground hover:bg-muted"
                      )}
                      style={active ? { borderColor: brand.base, color: brand.ink } : undefined}
                    >
                      <Icon className="h-4 w-4" />
                      {m.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-center text-[11px] font-medium text-muted-foreground">
                {method === "card"
                  ? `Your card details are encrypted and charged by ${meta.label}.`
                  : method === "transfer"
                    ? `${meta.label} creates a one-time account for this payment.`
                    : `${meta.label} USSD works from the number linked to your bank account.`}
              </p>

              {/* card form */}
              {method === "card" && (
                <div className="mt-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <label htmlFor="pc-card-number" className="text-[12px] font-extrabold text-foreground">
                      Card number
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setCard({ ...card, number: TEST_CARD.number, expiry: TEST_CARD.expiry, cvv: TEST_CARD.cvv })
                      }
                      className="text-[11px] font-extrabold text-primary hover:underline"
                    >
                      Use test card
                    </button>
                  </div>
                  <Input
                    id="pc-card-number"
                    value={card.number}
                    onChange={(e) => setCard({ ...card, number: formatCardNumber(e.target.value) })}
                    placeholder="0000 0000 0000 0000"
                    inputMode="numeric"
                    autoComplete="cc-number"
                    className="h-11 rounded-xl bg-muted/60 font-mono font-semibold"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="pc-card-expiry" className="text-[12px] font-extrabold text-foreground">
                        Expiry
                      </label>
                      <Input
                        id="pc-card-expiry"
                        value={card.expiry}
                        onChange={(e) => setCard({ ...card, expiry: formatExpiry(e.target.value) })}
                        placeholder="MM/YY"
                        inputMode="numeric"
                        autoComplete="cc-exp"
                        className="mt-1 h-11 rounded-xl bg-muted/60 font-mono font-semibold"
                      />
                    </div>
                    <div>
                      <label htmlFor="pc-card-cvv" className="text-[12px] font-extrabold text-foreground">
                        CVV
                      </label>
                      <Input
                        id="pc-card-cvv"
                        value={card.cvv}
                        onChange={(e) => setCard({ ...card, cvv: formatCvv(e.target.value) })}
                        placeholder="123"
                        inputMode="numeric"
                        autoComplete="cc-csc"
                        className="mt-1 h-11 rounded-xl bg-muted/60 font-mono font-semibold"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="pc-card-name" className="text-[12px] font-extrabold text-foreground">
                      Cardholder name
                    </label>
                    <Input
                      id="pc-card-name"
                      value={card.name}
                      onChange={(e) => setCard({ ...card, name: e.target.value })}
                      placeholder="Name on card"
                      autoComplete="cc-name"
                      className="mt-1 h-11 rounded-xl bg-muted/60 font-semibold"
                    />
                  </div>
                </div>
              )}

              {/* bank transfer */}
              {method === "transfer" && (
                <div className="mt-3.5">
                  <div
                    className="rounded-xl border p-4"
                    style={{ borderColor: `${brand.base}59`, backgroundColor: `${brand.base}14` }}
                  >
                    <p className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color: brand.base }}>
                      One-time account
                    </p>
                    <p className="mt-1 text-[15px] font-extrabold" style={{ color: brand.ink }}>
                      {TRANSFER_BANK[provider]}
                      <span className="ml-1.5 text-[11px] font-bold text-muted-foreground">
                        via {meta.label}
                      </span>
                    </p>
                    <p className="mt-1 font-mono text-2xl font-extrabold tracking-wider" style={{ color: brand.ink }}>
                      {TRANSFER_ACCOUNT}
                    </p>
                    <p className="text-[12px] font-bold" style={{ color: brand.ink }}>
                      {TRANSFER_BENEFICIARY}
                    </p>
                    <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-extrabold" style={{ color: brand.base }}>
                      <Timer className="h-3.5 w-3.5" /> Expires in {formatCountdown(secondsLeft)}
                    </p>
                    <p className="mt-1.5 text-[11px] font-medium leading-relaxed text-muted-foreground">
                      Transfer exactly {formatNaira(amount)} — {meta.label} attaches the payment reference
                      automatically and DEAL escrow holds the funds the moment they land.
                    </p>
                  </div>
                </div>
              )}

              {/* ussd */}
              {method === "ussd" && (
                <div className="mt-3.5">
                  <div className="flex flex-wrap gap-2">
                    {USSD_BANKS.map((b) => (
                      <button
                        key={b.key}
                        type="button"
                        onClick={() => setBank(b.key)}
                        aria-pressed={bank === b.key}
                        className={cn(
                          "rounded-full border-2 px-3.5 py-1.5 text-[12px] font-extrabold transition-colors",
                          bank === b.key ? "bg-white" : "border-border bg-white text-muted-foreground hover:bg-muted"
                        )}
                        style={bank === b.key ? { borderColor: brand.base, color: brand.ink } : undefined}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                  <div
                    className="mt-3 rounded-xl border p-4 text-center"
                    style={{ borderColor: `${brand.base}59`, backgroundColor: `${brand.base}14` }}
                  >
                    <p className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color: brand.base }}>
                      Dial on your phone
                    </p>
                    <p className="mt-1 font-mono text-2xl font-extrabold tracking-wider" style={{ color: brand.ink }}>
                      {ussdCode}
                    </p>
                    <p className="mt-1.5 text-[11px] font-medium text-muted-foreground">
                      Approve {formatNaira(amount)} — {meta.label} confirms it and DEAL escrow holds the funds.
                    </p>
                  </div>
                </div>
              )}

              {error && (
                <div className="mt-3.5 rounded-xl border border-red-200 bg-red-50 p-3" role="alert">
                  <p className="text-[13px] font-bold text-red-700">{error}</p>
                </div>
              )}

              <Button
                type="button"
                disabled={method === "card" && !cardValid}
                onClick={startPayment}
                className="mt-4 h-12 w-full rounded-xl text-[15px] font-extrabold text-white shadow-md shadow-primary/25"
              >
                {method === "card" ? (
                  <>
                    <Lock className="mr-2 h-4 w-4" />
                    Pay {formatNaira(amount)}
                  </>
                ) : method === "transfer" ? (
                  <>
                    <Check className="mr-2 h-4 w-4" strokeWidth={3} />
                    I&rsquo;ve sent the money
                  </>
                ) : (
                  <>
                    <Check className="mr-2 h-4 w-4" strokeWidth={3} />
                    I&rsquo;ve dialed the code
                  </>
                )}
              </Button>
              {method === "card" && !cardValid && (
                <p className="mt-2 text-center text-[11px] font-semibold text-muted-foreground">
                  Fill in your card details to continue · tap “Use test card” for the demo card.
                </p>
              )}
            </div>
          )}

          {/* processing — rail-branded */}
          {phase === "processing" && (
            <div className="flex flex-col items-center px-5 py-12 text-center">
              <Loader2 className="h-10 w-10 animate-spin" style={{ color: brand.base }} />
              <p className="mt-4 text-[15px] font-extrabold text-foreground">
                {line === 0 ? `Contacting ${meta.label}…` : "Authorizing payment…"}
              </p>
              <p className="mt-1 text-[12px] font-semibold text-muted-foreground">
                {METHOD_LABELS[method]} · {formatNaira(amount)}
              </p>
              <ol className="mt-6 w-full max-w-xs space-y-2.5 text-left">
                {[`Contacting ${meta.label}`, "Authorizing payment"].map((stepLabel, i) => (
                  <li key={stepLabel} className="flex items-center gap-2.5">
                    {line > i ? (
                      <span
                        className="flex h-5 w-5 items-center justify-center rounded-full"
                        style={{ backgroundColor: brand.base }}
                      >
                        <Check className="h-3 w-3 text-white" strokeWidth={3} />
                      </span>
                    ) : (
                      <Loader2
                        className={cn("h-5 w-5", line === i ? "animate-spin" : "opacity-30")}
                        style={{ color: line === i ? brand.base : undefined }}
                      />
                    )}
                    <span
                      className={cn(
                        "text-[13px] font-bold",
                        line >= i ? "text-foreground" : "text-muted-foreground/50"
                      )}
                    >
                      {stepLabel}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* success — green stays primary, FLW-/PSK- reference from the API */}
          {phase === "success" && (
            <div className="flex flex-col items-center px-5 py-8 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 ring-8 ring-emerald-100">
                <Check className="h-8 w-8 text-white" strokeWidth={3} />
              </span>
              <p className="mt-4 text-lg font-extrabold text-foreground">
                {successNote
                  ? `${formatNaira(amount)} released to ${creatorName}`
                  : `${formatNaira(amount)} secured in escrow`}
              </p>
              <p className="mt-1 text-[13px] font-medium text-muted-foreground">
                {label} · {dealTitle}
              </p>
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-muted/60 px-3.5 py-2.5">
                <p className="font-mono text-[13px] font-extrabold tracking-wider text-foreground">{reference}</p>
                <button
                  type="button"
                  aria-label="Copy payment reference"
                  onClick={() => {
                    navigator.clipboard?.writeText(reference).catch(() => undefined);
                    toast.success("Reference copied");
                  }}
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-3 max-w-xs text-[12px] font-semibold leading-relaxed text-muted-foreground">
                {successNote ?? `Held in DEAL escrow until you approve the work — then it's released to ${creatorName}.`}
              </p>
              <ProviderMark provider={provider} withText className="mt-2" />
              <Button
                type="button"
                onClick={() => {
                  resetState();
                  onOpenChange(false);
                }}
                className="mt-5 h-12 w-full rounded-xl text-[15px] font-extrabold text-white shadow-md shadow-primary/25"
              >
                Continue
              </Button>
            </div>
          )}

          {/* gateway footer */}
          <footer className="border-t border-border bg-white px-5 py-3 text-center">
            <p className="text-[10px] font-bold text-muted-foreground">
              {phase === "rail"
                ? "Powered by Flutterwave & Paystack · Escrow managed by DEAL"
                : `Powered by ${meta.label} · Escrow managed by DEAL · PCI-DSS secured`}
            </p>
            <p className="mt-0.5 text-[9px] font-semibold text-muted-foreground/70">
              Simulated checkout for demo
            </p>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}
