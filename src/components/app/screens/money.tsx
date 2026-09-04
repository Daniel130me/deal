"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Inbox, Loader2, Lock, ShieldCheck, TrendingUp, Wallet } from "lucide-react";
import { toast } from "sonner";
import { AppCanvas } from "@/components/app/chrome";
import { AppPage, PayazaMark, SectionCard } from "@/components/app/kit";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApp } from "@/components/app/context";
import { api } from "@/lib/api";
import { formatDateTime, formatNaira, type Deal } from "@/lib/types";
import { cn } from "@/lib/utils";

type Overview = Awaited<ReturnType<typeof api.overview>>;

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

interface PaymentRow {
  key: string;
  dealId: string;
  dealRef: string;
  dealTitle: string;
  label: string;
  amount: number;
  reference: string;
  status: "held" | "released";
  paidAt: string;
  releasedAt?: string;
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "held", label: "In escrow" },
  { key: "released", label: "Released" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

function referenceOf(reference: string) {
  return reference.startsWith("PZ-") ? reference : `PZ-${reference}`;
}

function PaymentStatusChip({ status }: { status: PaymentRow["status"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-extrabold",
        status === "held" ? "bg-violet-50 text-violet-700" : "bg-accent text-accent-foreground"
      )}
    >
      {status === "held" ? "In escrow" : "Released"}
    </span>
  );
}

export default function MoneyScreen() {
  const { user } = useApp();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");

  useEffect(() => {
    if (!user) return;
    let alive = true;
    Promise.all([api.overview(user.id), api.deals(user.id)])
      .then(([o, d]) => {
        if (!alive) return;
        setOverview(o);
        setDeals(d.deals);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Couldn't load your money."));
    return () => {
      alive = false;
    };
  }, [user]);

  const rows = useMemo<PaymentRow[]>(() => {
    return (deals ?? [])
      .flatMap((deal) =>
        deal.payments.map((payment) => ({
          key: `${deal.id}-${payment.id}`,
          dealId: deal.id,
          dealRef: deal.ref,
          dealTitle: deal.title,
          label: payment.label,
          amount: payment.amount,
          reference: payment.reference,
          status: payment.status,
          paidAt: payment.paidAt,
          releasedAt: payment.releasedAt,
        }))
      )
      .sort((a, b) => Date.parse(b.paidAt) - Date.parse(a.paidAt));
  }, [deals]);

  const filtered = rows.filter((row) => {
    if (filter === "all") return true;
    return row.status === filter;
  });

  const countFor = (key: FilterKey) =>
    key === "all" ? rows.length : rows.filter((row) => row.status === key).length;

  if (!user) return null;

  const firstName = user.name.split(" ")[0];

  return (
    <AppCanvas activeTab="money">
      <AppPage
        title="Money"
        subtitle="Every payment sits in Payaza escrow until your client approves the completed work."
      >
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="space-y-5 lg:space-y-6"
        >
          {!overview || !deals ? (
            <div className="flex min-h-[40vh] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* big tiles */}
              <div className="grid gap-3 sm:grid-cols-3 lg:gap-4">
                <div className="rounded-2xl border border-violet-200/70 bg-violet-50/60 p-5 lg:p-6">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-violet-600">
                      <Lock className="h-4 w-4" />
                    </span>
                    <p className="text-[11px] font-extrabold uppercase tracking-wide text-violet-700">
                      In escrow
                    </p>
                  </div>
                  <p className="mt-3 text-2xl font-extrabold text-foreground lg:text-3xl">
                    {formatNaira(overview.money.inEscrow)}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-violet-700/80">
                    Held until clients approve
                  </p>
                </div>

                <div className="rounded-2xl border border-primary/20 bg-accent p-5 lg:p-6">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-primary">
                      <Wallet className="h-4 w-4" />
                    </span>
                    <p className="text-[11px] font-extrabold uppercase tracking-wide text-accent-foreground">
                      Released all-time
                    </p>
                  </div>
                  <p className="mt-3 text-2xl font-extrabold text-foreground lg:text-3xl">
                    {formatNaira(overview.money.releasedAllTime)}
                  </p>
                  <div className="mt-1">
                    <PayazaMark />
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-card p-5 lg:p-6">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <TrendingUp className="h-4 w-4" />
                    </span>
                    <p className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                      Expected balance
                    </p>
                  </div>
                  <p className="mt-3 text-2xl font-extrabold text-foreground lg:text-3xl">
                    {formatNaira(overview.money.expectedBalance)}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-muted-foreground">
                    If all ongoing deals complete
                  </p>
                </div>
              </div>

              {/* payout account */}
              <SectionCard
                title="Payout account"
                right={
                  <Badge className="border-0 bg-accent text-accent-foreground">Active</Badge>
                }
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-white">
                    <PayazaMark />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold text-foreground">
                      Payaza payout · {firstName} Visuals •••4532
                    </p>
                    <p className="text-xs font-semibold text-muted-foreground">
                      Automatic payouts · no manual transfers needed
                    </p>
                  </div>
                </div>
                <p className="mt-4 rounded-xl bg-muted/60 p-3.5 text-xs font-medium leading-relaxed text-muted-foreground">
                  Money from every deal is held in <span className="font-bold text-foreground">Payaza escrow</span>{" "}
                  and paid out automatically when your client approves the completed work.
                </p>
              </SectionCard>

              {/* payments history */}
              <SectionCard
                title="Payments history"
                right={
                  <div className="flex flex-wrap gap-1.5">
                    {FILTERS.map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => setFilter(f.key)}
                        aria-pressed={filter === f.key}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-[12px] font-extrabold transition-colors",
                          filter === f.key
                            ? "border-primary bg-accent text-accent-foreground"
                            : "border-border bg-white text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {f.label} {countFor(f.key) > 0 ? `(${countFor(f.key)})` : ""}
                      </button>
                    ))}
                  </div>
                }
              >
                {rows.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-8 text-center">
                    <Inbox className="h-7 w-7 text-muted-foreground" />
                    <p className="text-sm font-extrabold text-foreground">No payments yet</p>
                    <p className="max-w-xs text-[13px] font-semibold text-muted-foreground">
                      When clients pay, every transaction lands here with its Payaza reference.
                    </p>
                  </div>
                ) : filtered.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border p-6 text-center text-[13px] font-semibold text-muted-foreground">
                    Nothing in this view right now.
                  </p>
                ) : (
                  <>
                    {/* desktop table */}
                    <div className="hidden md:block">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Deal</TableHead>
                            <TableHead>Payment</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Reference</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filtered.map((row) => (
                            <TableRow key={row.key}>
                              <TableCell>
                                <HashLink
                                  href={`#/deals/${row.dealId}`}
                                  className="block max-w-52 hover:underline"
                                >
                                  <span className="block truncate text-[13px] font-extrabold text-foreground">
                                    {row.dealTitle}
                                  </span>
                                  <span className="block truncate font-mono text-[11px] font-semibold text-muted-foreground">
                                    {row.dealRef}
                                  </span>
                                </HashLink>
                              </TableCell>
                              <TableCell className="text-[13px] font-semibold text-foreground">
                                {row.label}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-[13px] font-extrabold text-foreground">
                                {formatNaira(row.amount)}
                              </TableCell>
                              <TableCell className="whitespace-nowrap font-mono text-xs font-bold text-muted-foreground">
                                {referenceOf(row.reference)}
                              </TableCell>
                              <TableCell>
                                <PaymentStatusChip status={row.status} />
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-right text-xs font-semibold text-muted-foreground">
                                {formatDateTime(row.releasedAt ?? row.paidAt)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* mobile stacked cards */}
                    <div className="space-y-3 md:hidden">
                      {filtered.map((row) => (
                        <div key={row.key} className="rounded-2xl border border-border bg-card p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-extrabold text-foreground">
                                {row.dealTitle}
                              </p>
                              <p className="truncate font-mono text-[11px] font-semibold text-muted-foreground">
                                {row.dealRef} · {row.label}
                              </p>
                            </div>
                            <PaymentStatusChip status={row.status} />
                          </div>
                          <div className="mt-3 flex items-center justify-between">
                            <span className="text-[15px] font-extrabold text-foreground">
                              {formatNaira(row.amount)}
                            </span>
                            <span className="text-xs font-semibold text-muted-foreground">
                              {formatDateTime(row.releasedAt ?? row.paidAt)}
                            </span>
                          </div>
                          <p className="mt-1.5 font-mono text-[11px] font-bold text-muted-foreground">
                            {referenceOf(row.reference)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </SectionCard>

              {/* fine print */}
              <p className="flex items-start gap-2 rounded-2xl border border-border bg-secondary p-4 text-xs font-semibold leading-relaxed text-muted-foreground lg:p-5">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Every naira is held by Payaza escrow until your client approves the completed work —
                then it lands in your payout account automatically.
              </p>
            </>
          )}
        </motion.div>
      </AppPage>
    </AppCanvas>
  );
}
