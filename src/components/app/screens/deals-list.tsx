"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CalendarClock, FolderKanban, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { AppCanvas } from "@/components/app/chrome";
import { AppPage, StatusChip } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { useApp } from "@/components/app/context";
import { api } from "@/lib/api";
import { formatNaira, formatDate, remainingBalance, type Deal, type DealStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "attention", label: "Needs action" },
  { key: "completed", label: "Completed" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

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

const LIVE: DealStatus[] = [
  "sent",
  "active",
  "delivered",
  "revision",
  "approved",
  "files_released",
  "changes_requested",
];
const NEEDS_ACTION: DealStatus[] = ["draft", "sent", "delivered", "revision", "disputed"];

export default function DealsListScreen() {
  const { user } = useApp();
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");

  useEffect(() => {
    if (!user) return;
    let alive = true;
    api
      .deals(user.id)
      .then((d) => {
        if (alive) setDeals(d.deals);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Couldn't load projects."));
    return () => {
      alive = false;
    };
  }, [user]);

  const filtered = (deals ?? []).filter((deal) => {
    if (filter === "all") return true;
    if (filter === "live") return LIVE.includes(deal.status);
    if (filter === "attention") return NEEDS_ACTION.includes(deal.status);
    return deal.status === "completed";
  });

  return (
    <AppCanvas activeTab="deals">
      <AppPage
        title="Projects"
        subtitle="Every deal, from first agreement to final payment."
        action={
          <Button asChild className="rounded-xl font-bold">
            <HashLink href="#/deals/new">
              <Plus className="h-4 w-4" strokeWidth={2.5} /> New deal
            </HashLink>
          </Button>
        }
      >
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="space-y-5"
        >
          {/* filter chips */}
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={cn(
                  "rounded-full border px-3.5 py-2 text-[13px] font-extrabold transition-colors",
                  filter === f.key
                    ? "border-primary bg-accent text-accent-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
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
          ) : deals.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card p-8 text-center">
              <FolderKanban className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm font-extrabold text-foreground">No deals yet</p>
              <p className="max-w-xs text-[13px] font-semibold text-muted-foreground">
                Create your first deal and send it to a client in minutes.
              </p>
              <Button asChild className="mt-1 rounded-xl font-bold">
                <HashLink href="#/deals/new">
                  <Plus className="h-4 w-4" strokeWidth={2.5} /> New deal
                </HashLink>
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm font-semibold text-muted-foreground">
              No deals in this view right now.
            </p>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {filtered.map((deal) => {
                const remaining = remainingBalance(deal);
                return (
                  <HashLink
                    key={deal.id}
                    href={`#/deals/${deal.id}`}
                    className="group flex flex-col rounded-2xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md lg:p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] font-bold text-muted-foreground">
                          {deal.ref}
                        </p>
                        <h3 className="mt-0.5 truncate text-[15px] font-extrabold text-foreground transition-colors group-hover:text-primary">
                          {deal.title}
                        </h3>
                        <p className="mt-0.5 truncate text-[13px] font-semibold text-muted-foreground">
                          {deal.client.name}
                        </p>
                      </div>
                      <StatusChip status={deal.status} />
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs font-bold text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarClock className="h-3.5 w-3.5" />
                        Due {formatDate(deal.dueDate)}
                      </span>
                      <span className="text-[13px] font-extrabold text-foreground">
                        {formatNaira(deal.price)}
                        {remaining > 0 ? (
                          <span className="ml-1.5 font-bold text-amber-600">
                            · {formatNaira(remaining)} outstanding
                          </span>
                        ) : (
                          <span className="ml-1.5 font-bold text-primary">· Paid in full</span>
                        )}
                      </span>
                    </div>
                  </HashLink>
                );
              })}
            </div>
          )}
        </motion.div>
      </AppPage>
    </AppCanvas>
  );
}
