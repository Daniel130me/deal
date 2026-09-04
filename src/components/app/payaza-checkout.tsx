"use client";

import { useEffect, useRef, useState } from "react";
import {
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
import { PayazaMark } from "@/components/app/kit";
import { formatNaira, type Deal } from "@/lib/types";
import type { PayMethod } from "@/lib/api";
import { cn } from "@/lib/utils";

/* Payaza brand tokens — purple lives ONLY inside this checkout. */
const PURPLE = "#9545FE";
const PURPLE_DEEP = "#29003D";
const PURPLE_INK = "#440066";

const TEST_CARD = { number: "4084 0840 8408 4081", expiry: "09/28", cvv: "123" };
const TRANSFER_ACCOUNT = "88 0123456712";
const TRANSFER_BANK = "Payaza Commercial Bank";
const TRANSFER_BENEFICIARY = "DEAL Escrow Services";
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

interface PayazaCheckoutProps {
  open: boolean;
  onClose: () => void;
  /** What the client pays now. */
  amount: number;
  /** e.g. "Deposit (50%)" | "Installment 2 of 2" | "Balance payment" */
  paymentLabel: string;
  dealTitle: string;
  dealRef: string;
  creatorName: string;
  escrowNote?: string;
  /** Success-screen release line (defaults to the escrow-until-approval copy). */
  successNote?: string;
  /** Parent performs the API call and returns the updated deal. */
  onPay: (method: PayMethod) => Promise<Deal>;
}

type Phase = "select" | "processing" | "success";

export default function PayazaCheckout({
  open,
  onClose,
  amount,
  paymentLabel,
  dealTitle,
  dealRef,
  creatorName,
  escrowNote,
  successNote,
  onPay,
}: PayazaCheckoutProps) {
  const [phase, setPhase] = useState<Phase>("select");
  const [line, setLine] = useState<0 | 1>(0);
  const [method, setMethod] = useState<PayMethod>("card");
  const [card, setCard] = useState({ number: "", expiry: "", cvv: "", name: "" });
  const [bank, setBank] = useState<(typeof USSD_BANKS)[number]["key"]>("gtb");
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Deal | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // transfer countdown
  useEffect(() => {
    if (!open || phase !== "select" || method !== "transfer") return;
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
    setPhase("select");
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
      onClose();
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
      const [deal] = await Promise.all([onPay(method), delay(1800)]);
      if (!aliveRef.current) return;
      setResult(deal);
      setPhase("success");
    } catch (err) {
      clearTimeout(lineTimer);
      if (!aliveRef.current) return;
      setError(err instanceof Error ? err.message : "Payment failed. Try again.");
      setPhase("select");
    }
  }

  const reference = result?.payments.at(-1)?.reference ?? "PZ-DEMO0000";
  const ussdCode = `${USSD_BANKS.find((b) => b.key === bank)?.prefix ?? "*737*"}${amount}#`;
  const escrowCopy =
    escrowNote ??
    `Funds are held by Payaza escrow — ${creatorName} only receives this payment when you approve the completed work.`;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={phase !== "processing"}
        className="gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-md"
      >
        <div className="max-h-[90vh] overflow-y-auto">
          {/* gateway header */}
          <header className="flex items-center justify-between gap-2 border-b border-border bg-white px-5 py-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <img src="/payaza/payaza-logo.svg" alt="Payaza" className="h-6 w-auto shrink-0" />
              <DialogTitle className="truncate text-[11px] font-extrabold uppercase tracking-wide" style={{ color: PURPLE_INK }}>
                Secure checkout
              </DialogTitle>
            </div>
            <span
              className="shrink-0 rounded-full px-2.5 py-1 font-mono text-[10px] font-extrabold"
              style={{ backgroundColor: "rgba(149, 69, 254, 0.1)", color: PURPLE_INK }}
            >
              {dealRef}
            </span>
          </header>

          {phase === "select" && (
            <div className="px-5 py-5">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">
                Amount to pay
              </p>
              <p className="mt-1 text-4xl font-extrabold tracking-tight" style={{ color: PURPLE_DEEP }}>
                {formatNaira(amount)}
              </p>
              <p className="mt-1.5 text-[13px] font-extrabold text-foreground">{paymentLabel}</p>
              <p className="text-[13px] font-medium text-muted-foreground">
                {dealTitle} · for {creatorName}
              </p>

              {/* escrow explainer */}
              <div
                className="mt-4 flex items-start gap-2.5 rounded-xl border p-3"
                style={{ borderColor: "rgba(149, 69, 254, 0.25)", backgroundColor: "rgba(149, 69, 254, 0.06)" }}
              >
                <Lock className="mt-0.5 h-4 w-4 shrink-0" style={{ color: PURPLE }} />
                <p className="text-[12px] font-semibold leading-relaxed" style={{ color: PURPLE_INK }}>
                  {escrowCopy}
                </p>
              </div>

              {/* method tabs */}
              <div className="mt-4 grid grid-cols-3 gap-2">
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
                      style={active ? { borderColor: PURPLE, color: PURPLE_DEEP } : undefined}
                    >
                      <Icon className="h-4 w-4" />
                      {m.label}
                    </button>
                  );
                })}
              </div>

              {/* card form */}
              {method === "card" && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label htmlFor="pz-card-number" className="text-[12px] font-extrabold text-foreground">
                      Card number
                    </label>
                    <button
                      type="button"
                      onClick={() => setCard({ ...card, number: TEST_CARD.number, expiry: TEST_CARD.expiry, cvv: TEST_CARD.cvv })}
                      className="text-[11px] font-extrabold hover:underline"
                      style={{ color: PURPLE }}
                    >
                      Use test card
                    </button>
                  </div>
                  <Input
                    id="pz-card-number"
                    value={card.number}
                    onChange={(e) => setCard({ ...card, number: formatCardNumber(e.target.value) })}
                    placeholder="0000 0000 0000 0000"
                    inputMode="numeric"
                    autoComplete="cc-number"
                    className="h-11 rounded-xl bg-muted/60 font-mono font-semibold"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="pz-card-expiry" className="text-[12px] font-extrabold text-foreground">
                        Expiry
                      </label>
                      <Input
                        id="pz-card-expiry"
                        value={card.expiry}
                        onChange={(e) => setCard({ ...card, expiry: formatExpiry(e.target.value) })}
                        placeholder="MM/YY"
                        inputMode="numeric"
                        autoComplete="cc-exp"
                        className="mt-1 h-11 rounded-xl bg-muted/60 font-mono font-semibold"
                      />
                    </div>
                    <div>
                      <label htmlFor="pz-card-cvv" className="text-[12px] font-extrabold text-foreground">
                        CVV
                      </label>
                      <Input
                        id="pz-card-cvv"
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
                    <label htmlFor="pz-card-name" className="text-[12px] font-extrabold text-foreground">
                      Cardholder name
                    </label>
                    <Input
                      id="pz-card-name"
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
                <div className="mt-4">
                  <div
                    className="rounded-xl border p-4"
                    style={{ borderColor: "rgba(149, 69, 254, 0.25)", backgroundColor: "rgba(149, 69, 254, 0.06)" }}
                  >
                    <p className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color: PURPLE }}>
                      One-time account
                    </p>
                    <p className="mt-1 text-[15px] font-extrabold" style={{ color: PURPLE_DEEP }}>
                      {TRANSFER_BANK}
                    </p>
                    <p className="mt-1 font-mono text-2xl font-extrabold tracking-wider" style={{ color: PURPLE_DEEP }}>
                      {TRANSFER_ACCOUNT}
                    </p>
                    <p className="text-[12px] font-bold" style={{ color: PURPLE_INK }}>
                      {TRANSFER_BENEFICIARY}
                    </p>
                    <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-extrabold" style={{ color: PURPLE }}>
                      <Timer className="h-3.5 w-3.5" /> Expires in {formatCountdown(secondsLeft)}
                    </p>
                    <p className="mt-1.5 text-[11px] font-medium leading-relaxed text-muted-foreground">
                      Transfer exactly {formatNaira(amount)} — the payment reference is attached automatically.
                    </p>
                  </div>
                </div>
              )}

              {/* ussd */}
              {method === "ussd" && (
                <div className="mt-4">
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
                        style={bank === b.key ? { borderColor: PURPLE, color: PURPLE_DEEP } : undefined}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                  <div
                    className="mt-3 rounded-xl border p-4 text-center"
                    style={{ borderColor: "rgba(149, 69, 254, 0.25)", backgroundColor: "rgba(149, 69, 254, 0.06)" }}
                  >
                    <p className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color: PURPLE }}>
                      Dial on your phone
                    </p>
                    <p className="mt-1 font-mono text-2xl font-extrabold tracking-wider" style={{ color: PURPLE_DEEP }}>
                      {ussdCode}
                    </p>
                    <p className="mt-1.5 text-[11px] font-medium text-muted-foreground">
                      Approve {formatNaira(amount)} with the number linked to your bank.
                    </p>
                  </div>
                </div>
              )}

              {error && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3" role="alert">
                  <p className="text-[13px] font-bold text-red-700">{error}</p>
                </div>
              )}

              <Button
                type="button"
                disabled={method === "card" && !cardValid}
                onClick={startPayment}
                className="mt-5 h-12 w-full rounded-xl text-[15px] font-extrabold text-white shadow-md"
                style={{ backgroundColor: PURPLE }}
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

          {phase === "processing" && (
            <div className="flex flex-col items-center px-5 py-12 text-center">
              <Loader2 className="h-10 w-10 animate-spin" style={{ color: PURPLE }} />
              <p className="mt-4 text-[15px] font-extrabold" style={{ color: PURPLE_DEEP }}>
                {line === 0 ? "Contacting Payaza…" : "Authorizing payment…"}
              </p>
              <p className="mt-1 text-[12px] font-semibold text-muted-foreground">
                {METHOD_LABELS[method]} · {formatNaira(amount)}
              </p>
              <ol className="mt-6 w-full max-w-xs space-y-2.5 text-left">
                {["Contacting Payaza", "Authorizing payment"].map((label, i) => (
                  <li key={label} className="flex items-center gap-2.5">
                    {line > i ? (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500">
                        <Check className="h-3 w-3 text-white" strokeWidth={3} />
                      </span>
                    ) : (
                      <Loader2
                        className={cn("h-5 w-5", line === i ? "animate-spin" : "opacity-30")}
                        style={{ color: line === i ? PURPLE : undefined }}
                      />
                    )}
                    <span
                      className={cn(
                        "text-[13px] font-bold",
                        line > i ? "text-foreground" : line === i ? "text-foreground" : "text-muted-foreground/50"
                      )}
                    >
                      {label}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {phase === "success" && (
            <div className="flex flex-col items-center px-5 py-8 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 ring-8 ring-emerald-100">
                <Check className="h-8 w-8 text-white" strokeWidth={3} />
              </span>
              <p className="mt-4 text-lg font-extrabold" style={{ color: PURPLE_DEEP }}>
                {formatNaira(amount)} secured in escrow
              </p>
              <p className="mt-1 text-[13px] font-medium text-muted-foreground">
                {paymentLabel} · {dealTitle}
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
                {successNote ?? `Released to ${creatorName} only after you approve the completed work.`}
              </p>
              <PayazaMark className="mt-2" />
              <Button
                type="button"
                onClick={() => {
                  resetState();
                  onClose();
                }}
                className="mt-5 h-12 w-full rounded-xl text-[15px] font-extrabold text-white shadow-md"
                style={{ backgroundColor: PURPLE }}
              >
                Continue
              </Button>
            </div>
          )}

          {/* gateway footer */}
          <footer className="border-t border-border bg-white px-5 py-3 text-center">
            <p className="text-[10px] font-bold text-muted-foreground">
              Powered by Payaza · PCI-DSS secured · Escrow protected
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
