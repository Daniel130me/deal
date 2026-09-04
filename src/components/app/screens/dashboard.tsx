"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  CheckCircle2,
  ExternalLink,
  FileStack,
  FolderKanban,
  Loader2,
  Lock,
  PlusCircle,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip as ReTooltip, XAxis } from "recharts";
import { toast } from "sonner";
import { AppCanvas } from "@/components/app/chrome";
import { BookingChip, BookingWhen, PayazaMark, SectionCard, StatusChip } from "@/components/app/kit";
import { useApp } from "@/components/app/context";
import { api } from "@/lib/api";
import { formatDate, formatNaira } from "@/lib/types";
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

function initialsOf(name: string) {
  return (
    name
      .split(/\s+/)
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

function greetingFor(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function Reveal({ delay = 0, children }: { delay?: number; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

const STAT_TONES = {
  amber: "bg-amber-50 text-amber-600",
  violet: "bg-violet-50 text-violet-600",
  teal: "bg-teal-50 text-teal-600",
  green: "bg-accent text-primary",
} as const;

type StatTone = keyof typeof STAT_TONES;

function StatCard({
  href,
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  href: string;
  icon: typeof FolderKanban;
  label: string;
  value: number;
  sub?: string;
  tone: StatTone;
}) {
  return (
    <HashLink
      href={href}
      className="group rounded-2xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md lg:p-5"
    >
      <div className="flex items-center justify-between">
        <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", STAT_TONES[tone])}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <p className="mt-3 text-2xl font-extrabold text-foreground lg:text-3xl">{value}</p>
      <p className="text-[13px] font-extrabold text-foreground">{label}</p>
      {sub ? <p className="mt-0.5 text-xs font-semibold text-muted-foreground">{sub}</p> : null}
    </HashLink>
  );
}

function MoneyTile({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  icon: typeof Lock;
  tone: "violet" | "green" | "plain";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 lg:p-5",
        tone === "violet" && "border-violet-200/70 bg-violet-50/60",
        tone === "green" && "border-primary/20 bg-accent",
        tone === "plain" && "border-border bg-card"
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg",
            tone === "violet" && "bg-white text-violet-600",
            tone === "green" && "bg-white text-primary",
            tone === "plain" && "bg-muted text-muted-foreground"
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <p
          className={cn(
            "text-[11px] font-extrabold uppercase tracking-wide",
            tone === "violet" && "text-violet-700",
            tone === "green" && "text-accent-foreground",
            tone === "plain" && "text-muted-foreground"
          )}
        >
          {label}
        </p>
      </div>
      <p className="mt-2.5 text-xl font-extrabold text-foreground lg:text-2xl">{value}</p>
      {sub ? <div className="mt-1 text-xs font-semibold text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
  primary,
}: {
  href: string;
  icon: typeof PlusCircle;
  label: string;
  primary?: boolean;
}) {
  return (
    <HashLink
      href={href}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border p-4 text-center transition-all hover:-translate-y-0.5 hover:shadow-sm",
        primary
          ? "border-primary/30 bg-accent hover:border-primary/60"
          : "border-border bg-white hover:border-primary/40"
      )}
    >
      <Icon className="h-5 w-5 text-primary" />
      <span className="text-xs font-extrabold text-foreground">{label}</span>
    </HashLink>
  );
}

function EmptyHint({ icon: Icon, text }: { icon: typeof CalendarCheck; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-5 text-center">
      <Icon className="h-6 w-6 text-muted-foreground" />
      <p className="text-[13px] font-semibold text-muted-foreground">{text}</p>
    </div>
  );
}

export default function DashboardScreen() {
  const { user } = useApp();
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    api
      .overview(user.id)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : "Couldn't load your dashboard.")
      );
    return () => {
      alive = false;
    };
  }, [user]);

  if (!user) return null;

  const firstName = user.name.split(" ")[0];
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const series = data?.earningsSeries ?? [];
  const thisMonth = series.at(-1)?.amount ?? 0;
  const lastMonth = series.at(-2)?.amount ?? 0;
  const deltaPct = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null;

  const upcomingBookings = (data?.bookings ?? [])
    .filter((b) => b.status === "requested" || b.status === "confirmed")
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  return (
    <AppCanvas activeTab="dashboard">
      <div className="space-y-5 pb-2 lg:space-y-6">
        {/* greeting */}
        <Reveal>
          <header className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-xl font-extrabold text-white lg:h-16 lg:w-16">
              {initialsOf(user.name)}
            </span>
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-center gap-2 text-xl font-extrabold tracking-tight text-foreground lg:text-2xl">
                <span>{greetingFor(new Date().getHours())}, {firstName}</span>
                {user.verified ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-extrabold text-accent-foreground">
                    <BadgeCheck className="h-3.5 w-3.5" /> Verified
                  </span>
                ) : null}
              </h1>
              <p className="mt-0.5 truncate text-sm font-semibold text-muted-foreground">
                {user.craft}
                {user.location ? ` · ${user.location}` : ""} · {today}
              </p>
            </div>
          </header>
        </Reveal>

        {!data ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* stats */}
            <Reveal delay={0.05}>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
                <StatCard
                  href="#/requests"
                  icon={FileStack}
                  label="New requests"
                  value={data.stats.newRequests}
                  sub={`+${data.stats.newThisWeek} this week · ${data.stats.totalRequests} total`}
                  tone="amber"
                />
                <StatCard
                  href="#/deals"
                  icon={FolderKanban}
                  label="Ongoing deals"
                  value={data.stats.ongoingDeals}
                  sub="In progress"
                  tone="violet"
                />
                <StatCard
                  href="#/bookings"
                  icon={CalendarCheck}
                  label="Bookings"
                  value={data.stats.upcomingBookings}
                  sub="Upcoming sessions"
                  tone="teal"
                />
                <StatCard
                  href="#/deals"
                  icon={CheckCircle2}
                  label="Completed"
                  value={data.stats.completedDeals}
                  sub="All time"
                  tone="green"
                />
              </div>
            </Reveal>

            {/* money strip */}
            <Reveal delay={0.1}>
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-[15px] font-extrabold text-foreground">Money</h2>
                  <HashLink
                    href="#/money"
                    className="inline-flex items-center gap-1 text-[13px] font-bold text-primary hover:underline"
                  >
                    View money <ArrowRight className="h-3.5 w-3.5" />
                  </HashLink>
                </div>
                <div className="grid gap-3 sm:grid-cols-3 lg:gap-4">
                  <MoneyTile
                    label="In escrow"
                    value={formatNaira(data.money.inEscrow)}
                    sub="Held until clients approve"
                    icon={Lock}
                    tone="violet"
                  />
                  <MoneyTile
                    label="Released all-time"
                    value={formatNaira(data.money.releasedAllTime)}
                    sub={<PayazaMark />}
                    icon={Wallet}
                    tone="green"
                  />
                  <MoneyTile
                    label="Expected balance"
                    value={formatNaira(data.money.expectedBalance)}
                    sub="If all ongoing deals complete"
                    icon={TrendingUp}
                    tone="plain"
                  />
                </div>
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-secondary p-3.5 text-xs font-semibold leading-relaxed text-muted-foreground">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  Escrow releases to your Payaza payout account the moment your client approves the
                  completed work.
                </p>
              </section>
            </Reveal>

            {/* earnings + quick actions */}
            <Reveal delay={0.15}>
              <div className="grid gap-4 lg:grid-cols-5 lg:gap-5">
                <SectionCard
                  className="lg:col-span-3"
                  title="Earnings"
                  right={
                    <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
                      Last {series.length} months
                    </span>
                  }
                >
                  <p className="text-2xl font-extrabold text-foreground lg:text-3xl">
                    {formatNaira(data.money.earnedThisMonth)}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs font-bold text-primary">
                    {deltaPct !== null && deltaPct >= 0 ? (
                      <>
                        <TrendingUp className="h-3.5 w-3.5" />+{deltaPct}% vs last month ·
                      </>
                    ) : null}{" "}
                    released this month
                  </p>
                  <div className="mt-4 h-[200px] lg:h-[230px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={series} margin={{ top: 5, right: 0, bottom: 0, left: 0 }}>
                        <defs>
                          <linearGradient id="dashboardEarningsFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#0fa958" stopOpacity={0.25} />
                            <stop offset="100%" stopColor="#0fa958" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="month"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 10, fill: "#8aa094", fontWeight: 700 }}
                        />
                        <ReTooltip
                          formatter={(value) => [formatNaira(Number(value)), "Released"]}
                          contentStyle={{
                            borderRadius: 12,
                            border: "1px solid #e5ebe7",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="amount"
                          stroke="#0fa958"
                          strokeWidth={2.5}
                          fill="url(#dashboardEarningsFill)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </SectionCard>

                <SectionCard className="lg:col-span-2" title="Quick actions">
                  <div className="grid grid-cols-2 gap-3">
                    <QuickAction href="#/deals/new" icon={PlusCircle} label="New deal" primary />
                    <QuickAction
                      href={`#/u/${user.handle}`}
                      icon={ExternalLink}
                      label="My public page"
                    />
                    <QuickAction href="#/requests" icon={FileStack} label="Requests" />
                    <QuickAction href="#/bookings" icon={CalendarCheck} label="Bookings" />
                  </div>
                </SectionCard>
              </div>
            </Reveal>

            {/* upcoming bookings */}
            <Reveal delay={0.2}>
              <SectionCard
                title="Upcoming bookings"
                right={
                  <HashLink
                    href="#/bookings"
                    className="text-[13px] font-bold text-primary hover:underline"
                  >
                    Manage bookings
                  </HashLink>
                }
              >
                {upcomingBookings.length === 0 ? (
                  <EmptyHint
                    icon={CalendarCheck}
                    text="No upcoming sessions — bookings from your public page land here."
                  />
                ) : (
                  <div className="divide-y divide-border">
                    {upcomingBookings.map((booking) => (
                      <div
                        key={booking.id}
                        className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-extrabold text-primary">
                          {initialsOf(booking.clientName)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-extrabold text-foreground">
                            {booking.clientName}
                          </p>
                          <p className="truncate text-xs font-semibold text-muted-foreground">
                            {booking.sessionType}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <BookingWhen date={booking.date} time={booking.time} />
                          <div className="mt-1 flex justify-end">
                            <BookingChip status={booking.status} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </Reveal>

            {/* recent requests */}
            <Reveal delay={0.25}>
              <SectionCard
                title="Recent requests"
                right={
                  <HashLink href="#/requests" className="text-[13px] font-bold text-primary hover:underline">
                    View all
                  </HashLink>
                }
              >
                {data.requests.length === 0 ? (
                  <EmptyHint
                    icon={FileStack}
                    text="No requests yet — share your public link to get discovered."
                  />
                ) : (
                  <div className="divide-y divide-border">
                    {data.requests.slice(0, 3).map((req) => (
                      <HashLink
                        key={req.id}
                        href={`#/requests/${req.id}`}
                        className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-muted/50 first:pt-0 last:pb-0"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-extrabold text-primary">
                          {initialsOf(req.clientName)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-extrabold text-foreground">
                            {req.service?.title ?? "Custom request"}
                          </p>
                          <p className="truncate text-xs font-semibold text-muted-foreground">
                            {req.clientName} · {formatDate(req.eventDate)}
                            {req.location ? ` · ${req.location}` : ""}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          {req.status === "new" ? (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold text-amber-700">
                              New
                            </span>
                          ) : null}
                          <p className="text-[13px] font-extrabold text-foreground">
                            {req.budgetMax ? formatNaira(req.budgetMax) : "—"}
                          </p>
                        </div>
                      </HashLink>
                    ))}
                  </div>
                )}
              </SectionCard>
            </Reveal>

            {/* recent deals */}
            <Reveal delay={0.3}>
              <SectionCard
                title="Recent deals"
                right={
                  <HashLink href="#/deals" className="text-[13px] font-bold text-primary hover:underline">
                    View all
                  </HashLink>
                }
              >
                {data.deals.length === 0 ? (
                  <EmptyHint
                    icon={FolderKanban}
                    text="No deals yet — tap New deal to send your first agreement."
                  />
                ) : (
                  <div className="divide-y divide-border">
                    {data.deals.slice(0, 4).map((deal) => (
                      <HashLink
                        key={deal.id}
                        href={`#/deals/${deal.id}`}
                        className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-muted/50 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-extrabold text-foreground">
                            {deal.title}
                          </p>
                          <p className="truncate text-xs font-semibold text-muted-foreground">
                            <span className="font-mono">{deal.ref}</span> · {deal.client}
                          </p>
                        </div>
                        <StatusChip status={deal.status} />
                        <div className="hidden w-28 shrink-0 text-right sm:block">
                          <p className="text-[13px] font-extrabold text-foreground">
                            {formatNaira(deal.price)}
                          </p>
                          <p
                            className={cn(
                              "text-[11px] font-bold",
                              deal.balance > 0 ? "text-amber-600" : "text-primary"
                            )}
                          >
                            {deal.balance > 0
                              ? `${formatNaira(deal.balance)} outstanding`
                              : "Paid in full"}
                          </p>
                        </div>
                      </HashLink>
                    ))}
                  </div>
                )}
              </SectionCard>
            </Reveal>
          </>
        )}
      </div>
    </AppCanvas>
  );
}
