"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  ClipboardList,
  FolderKanban,
  Loader2,
  PlusCircle,
  TrendingUp,
  UserRound,
  Wallet,
  WalletCards,
} from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
} from "recharts";
import { toast } from "sonner";
import { AppCanvas } from "@/components/app/chrome";
import { StatusChip } from "@/components/app/kit";
import { api } from "@/lib/api";
import { useApp } from "@/components/app/context";
import { formatNaira, formatDate, type DealStatus } from "@/lib/types";

type Overview = Awaited<ReturnType<typeof api.overview>>;

export default function DashboardScreen() {
  const { user, navigate } = useApp();
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    api
      .overview(user.id)
      .then((d) => alive && setData(d))
      .catch((err) => toast.error(err instanceof Error ? err.message : "Couldn't load dashboard."));
    return () => {
      alive = false;
    };
  }, [user]);

  if (!user) return null;

  const quickActions = [
    { label: "Create deal", icon: PlusCircle, onClick: () => navigate("/deals/new") },
    { label: "My services", icon: ClipboardList, onClick: () => navigate("/onboarding") },
    { label: "Requests", icon: FolderKanban, onClick: () => navigate("/requests") },
    { label: "Payouts", icon: WalletCards, onClick: () => toast.info("Payouts go to your bank account within minutes after each completed deal.") },
  ];

  return (
    <AppCanvas activeTab="dashboard">
      <div className="flex-1 px-5 pb-8 pt-5">
        {/* greeting */}
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-lg font-extrabold text-white">
            {user.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-extrabold tracking-tight text-foreground">
              Welcome back, {user.name.split(" ")[0]}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {user.verified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-extrabold text-accent-foreground">
                  <BadgeCheck className="h-3 w-3" /> Verified creator
                </span>
              )}
              {user.craft && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                  <UserRound className="h-3 w-3" /> {user.craft}
                </span>
              )}
            </div>
          </div>
        </div>

        {!data ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* stats */}
            <div className="mt-5 grid grid-cols-4 gap-2.5">
              {[
                { label: "Total requests", value: data.stats.totalRequests, sub: `+${data.stats.newThisWeek} this week`, subClass: "text-primary" },
                { label: "Pending", value: data.stats.pendingDeals, sub: "Awaiting response", subClass: "text-amber-600" },
                { label: "Ongoing", value: data.stats.ongoingDeals, sub: "In progress", subClass: "text-sky-600" },
                { label: "Completed", value: data.stats.completedDeals, sub: "All time", subClass: "text-primary" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-border bg-card p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    {stat.label}
                  </p>
                  <p className="mt-1 text-2xl font-extrabold text-foreground">{stat.value}</p>
                  <p className={`mt-0.5 text-[10px] font-bold ${stat.subClass}`}>{stat.sub}</p>
                </div>
              ))}
            </div>

            {/* earnings */}
            <section id="earnings" className="mt-4 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[13px] font-extrabold text-foreground">
                    Earnings <span className="font-semibold text-muted-foreground">(this month)</span>
                  </p>
                  <p className="mt-1 text-2xl font-extrabold text-foreground">
                    {formatNaira(data.money.earnedThisMonth)}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs font-bold text-primary">
                    <TrendingUp className="h-3.5 w-3.5" /> +22% vs last month
                  </p>
                </div>
                <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground">
                  This month
                </span>
              </div>
              <div className="mt-2 h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.earningsSeries} margin={{ top: 5, right: 0, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="earningsFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0fa958" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#0fa958" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#8aa094", fontWeight: 700 }} />
                    <ReTooltip
                      formatter={(value) => [formatNaira(Number(value)), "Earned"]}
                      contentStyle={{ borderRadius: 12, border: "1px solid #e5ebe7", fontSize: 12, fontWeight: 700 }}
                    />
                    <Area type="monotone" dataKey="amount" stroke="#0fa958" strokeWidth={2.5} fill="url(#earningsFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2.5">
                <div className="rounded-xl bg-accent p-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-wide text-accent-foreground">In escrow</p>
                  <p className="mt-0.5 text-sm font-extrabold text-foreground">{formatNaira(data.money.inEscrow)}</p>
                </div>
                <div className="rounded-xl bg-muted p-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">Expected balance</p>
                  <p className="mt-0.5 text-sm font-extrabold text-foreground">{formatNaira(data.money.expectedBalance)}</p>
                </div>
              </div>
            </section>

            {/* quick actions */}
            <div className="mt-4 flex items-center justify-between">
              <h2 className="text-[15px] font-extrabold text-foreground">Quick actions</h2>
              <Link href={`#/u/${user.handle}`} className="text-[13px] font-bold text-primary">
                View my page →
              </Link>
            </div>
            <div className="mt-2.5 grid grid-cols-4 gap-2.5">
              {quickActions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-card p-3 text-center transition-all hover:-translate-y-0.5 hover:shadow-sm"
                >
                  <action.icon className="h-5 w-5 text-primary" strokeWidth={2} />
                  <span className="text-[11px] font-extrabold leading-tight text-foreground">{action.label}</span>
                </button>
              ))}
            </div>

            {/* recent requests */}
            <div className="mt-5 flex items-center justify-between">
              <h2 className="text-[15px] font-extrabold text-foreground">Recent requests</h2>
              <Link href="#/requests" className="text-[13px] font-bold text-primary">
                View all
              </Link>
            </div>
            <div className="mt-2.5 space-y-2.5">
              {data.requests.length === 0 && (
                <p className="rounded-2xl border border-dashed border-border bg-card p-5 text-center text-sm font-semibold text-muted-foreground">
                  No requests yet — share your public link to get booked.
                </p>
              )}
              {data.requests.map((req) => (
                <Link
                  key={req.id}
                  href={`#/requests/${req.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 transition-colors hover:bg-muted/50"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-sm font-extrabold text-primary">
                    {req.clientName.slice(0, 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-extrabold text-foreground">
                      {req.service?.title ?? "Custom request"}
                    </p>
                    <p className="truncate text-xs font-semibold text-muted-foreground">
                      {req.clientName} · {formatDate(req.eventDate)} · {req.location || "—"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">
                      {req.status === "new" ? "New" : "Replied"}
                    </p>
                    <p className="text-sm font-extrabold text-foreground">
                      {req.budgetMax ? formatNaira(req.budgetMax) : "—"}
                    </p>
                  </div>
                </Link>
              ))}
            </div>

            {/* active deals */}
            <div className="mt-5 flex items-center justify-between">
              <h2 className="text-[15px] font-extrabold text-foreground">Your deals</h2>
              <Link href="#/deals" className="text-[13px] font-bold text-primary">
                View all
              </Link>
            </div>
            <div className="mt-2.5 space-y-2.5">
              {data.deals.length === 0 && (
                <p className="rounded-2xl border border-dashed border-border bg-card p-5 text-center text-sm font-semibold text-muted-foreground">
                  No deals yet — tap + to create your first deal.
                </p>
              )}
              {data.deals.map((deal) => (
                <Link
                  key={deal.id}
                  href={`#/deals/${deal.id}`}
                  className="block rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-extrabold text-foreground">{deal.title}</p>
                      <p className="truncate text-xs font-semibold text-muted-foreground">
                        {deal.ref} · {deal.client}
                      </p>
                    </div>
                    <StatusChip status={deal.status as DealStatus} />
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-xs font-bold text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock className="h-3.5 w-3.5" /> Due {formatDate(deal.dueDate)}
                    </span>
                    <span className="text-foreground">
                      {formatNaira(deal.price)}
                      {deal.balance > 0 && deal.status !== "completed" ? (
                        <span className="ml-1 text-amber-600">· {formatNaira(deal.balance)} due</span>
                      ) : null}
                    </span>
                  </div>
                </Link>
              ))}
            </div>

            <button
              type="button"
              onClick={() => navigate("/deals/new")}
              className="mt-5 flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-bold text-white shadow-md shadow-primary/25 transition-transform hover:scale-[1.01]"
            >
              Create a new deal <ArrowRight className="h-4.5 w-4.5" />
            </button>
          </>
        )}
      </div>
    </AppCanvas>
  );
}
