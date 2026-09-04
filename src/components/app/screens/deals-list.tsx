"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { AppCanvas } from "@/components/app/chrome";
import { AppPage, StatusChip } from "@/components/app/kit";
import { api } from "@/lib/api";
import { useApp } from "@/components/app/context";
import {
  balanceAmount,
  formatNaira,
  formatDate,
  type Deal,
  type DealStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "attention", label: "Needs action" },
  { key: "completed", label: "Completed" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

const LIVE: DealStatus[] = ["active", "delivered", "revision", "approved", "balance_paid", "files_released"];
const ATTENTION: DealStatus[] = ["sent", "changes_requested", "revision", "approved"];

export default function DealsListScreen() {
  const { user } = useApp();
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");

  useEffect(() => {
    if (!user) return;
    let alive = true;
    api
      .deals(user.id)
      .then((d) => alive && setDeals(d.deals))
      .catch((err) => toast.error(err instanceof Error ? err.message : "Couldn't load deals."));
    return () => {
      alive = false;
    };
  }, [user]);

  const filtered = (deals ?? []).filter((deal) => {
    if (filter === "all") return true;
    if (filter === "live") return LIVE.includes(deal.status);
    if (filter === "attention") return ATTENTION.includes(deal.status);
    return deal.status === "completed";
  });

  return (
    <AppCanvas activeTab="deals">
      <AppPage title="Projects" subtitle="All your deals in one place.">
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-full border px-3.5 py-2 text-[13px] font-extrabold transition-colors",
                filter === f.key
                  ? "border-primary bg-accent text-accent-foreground"
                  : "border-border bg-card text-muted-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {!deals ? (
          <div className="flex min-h-[30vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((deal) => (
              <Link
                key={deal.id}
                href={`#/deals/${deal.id}`}
                className="block rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-extrabold text-foreground">{deal.title}</p>
                    <p className="truncate text-[13px] font-semibold text-muted-foreground">
                      {deal.ref} · {deal.client.name}
                    </p>
                  </div>
                  <StatusChip status={deal.status} />
                </div>
                <div className="mt-2.5 flex items-center justify-between text-xs font-bold text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="h-3.5 w-3.5" /> Due {formatDate(deal.dueDate)}
                  </span>
                  <span className="text-[13px] text-foreground">
                    {formatNaira(deal.price)}
                    {deal.status !== "completed" && balanceAmount(deal) > 0 ? (
                      <span className="ml-1 text-amber-600">
                        · {formatNaira(balanceAmount(deal))} due
                      </span>
                    ) : null}
                  </span>
                </div>
              </Link>
            ))}
            {filtered.length === 0 && (
              <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm font-semibold text-muted-foreground">
                No deals in this view yet.
              </p>
            )}
          </div>
        )}

        <Link
          href="#/deals/new"
          className="flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-bold text-white shadow-md shadow-primary/25"
        >
          <Plus className="h-5 w-5" strokeWidth={2.5} /> Create a new deal
        </Link>
      </AppPage>
    </AppCanvas>
  );
}
