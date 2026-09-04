"use client";

import { useEffect, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Loader2,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Mail,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { AppCanvas } from "@/components/app/chrome";
import { AppPage, SectionCard } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { useApp } from "@/components/app/context";
import { formatNaira, formatDate, type ClientRequest, type Service } from "@/lib/types";
import { cn } from "@/lib/utils";

type RequestWithService = ClientRequest & { service: Service | null };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "replied", label: "Replied" },
] as const;

export default function RequestsScreen({ requestId }: { requestId: string | null }) {
  return requestId ? <RequestDetail id={requestId} /> : <RequestList />;
}

/* ---------------- list ---------------- */

function RequestList() {
  const { user } = useApp();
  const [requests, setRequests] = useState<RequestWithService[] | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");

  useEffect(() => {
    if (!user) return;
    let alive = true;
    api
      .creatorRequests(user.id)
      .then((d) => alive && setRequests(d.requests))
      .catch((err) => toast.error(err instanceof Error ? err.message : "Couldn't load requests."));
    return () => {
      alive = false;
    };
  }, [user]);

  const counts = {
    all: requests?.length ?? 0,
    new: requests?.filter((r) => r.status === "new").length ?? 0,
    replied: requests?.filter((r) => r.status === "replied").length ?? 0,
  };

  return (
    <AppCanvas activeTab="requests">
      <AppPage
        title="Requests"
        subtitle="Manage and respond to incoming project requests."
      >
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
              {f.label} {counts[f.key] > 0 && <span className="ml-1">{counts[f.key]}</span>}
            </button>
          ))}
        </div>

        {!requests ? (
          <div className="flex min-h-[30vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-3">
            {requests
              .filter((r) => filter === "all" || r.status === filter)
              .map((req) => (
                <a
                  key={req.id}
                  href={`#/requests/${req.id}`}
                  className="block rounded-2xl border border-border bg-card p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-extrabold text-foreground">
                        {req.service?.title ?? "Custom request"}
                      </p>
                      <p className="truncate text-[13px] font-semibold text-muted-foreground">
                        {req.clientName}
                      </p>
                    </div>
                    {req.status === "new" ? (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-extrabold text-amber-700">
                        NEW
                      </span>
                    ) : (
                      <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-extrabold text-muted-foreground">
                        {req.status.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5" /> {formatDate(req.eventDate)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" /> {req.location || "—"}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-[13px] font-medium leading-relaxed text-muted-foreground">
                    {req.description}
                  </p>
                  <div className="mt-2.5 flex items-center justify-between">
                    <p className="text-sm font-extrabold text-foreground">
                      {req.budgetMax
                        ? `${formatNaira(req.budgetMin)} – ${formatNaira(req.budgetMax)}`
                        : "Budget open"}
                    </p>
                    <span className="text-[11px] font-bold text-muted-foreground">{req.ref}</span>
                  </div>
                </a>
              ))}
            {requests.filter((r) => filter === "all" || r.status === filter).length === 0 && (
              <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm font-semibold text-muted-foreground">
                Nothing here yet.
              </p>
            )}
          </div>
        )}

        <div className="flex items-start gap-2.5 rounded-2xl border border-primary/20 bg-accent/60 p-3.5">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-[13px] font-semibold leading-relaxed text-accent-foreground">
            <span className="font-extrabold">Respond quickly to increase your chances.</span>{" "}
            Clients are more likely to hire creators who respond fast.
          </p>
        </div>
      </AppPage>
    </AppCanvas>
  );
}

/* ---------------- detail ---------------- */

function RequestDetail({ id }: { id: string }) {
  const { navigate } = useApp();
  const [data, setData] = useState<{ request: ClientRequest; service: Service | null } | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineNote, setDeclineNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .requestDetail(id)
      .then((d) => alive && setData(d))
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Request not found.");
        navigate("/requests");
      });
    return () => {
      alive = false;
    };
  }, [id, navigate]);

  if (!data) {
    return (
      <AppCanvas activeTab="requests" backHref="/requests">
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </AppCanvas>
    );
  }

  const { request: req, service } = data;
  const initials = req.clientName
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function decline() {
    setBusy(true);
    try {
      await api.requestAction(req.id, "decline");
      toast.success("Request declined");
      navigate("/requests");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't decline request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppCanvas activeTab="requests" backHref="/requests">
      <AppPage
        title="Review request"
        chip={
          req.status === "new" ? (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-extrabold text-amber-700">
              NEW
            </span>
          ) : undefined
        }
        subtitle={
          <>
            {req.ref} · received{" "}
            {formatDate(req.createdAt)}
          </>
        }
      >
        {/* brief */}
        <SectionCard>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[16px] font-extrabold text-foreground">
                {service?.title ?? "Custom request"}
              </p>
              <p className="mt-0.5 text-[13px] font-semibold text-muted-foreground">{req.clientName}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" /> {formatDate(req.eventDate)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> {req.location || "—"}
                </span>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[10px] font-bold uppercase text-muted-foreground">Budget</p>
              <p className="text-[15px] font-extrabold text-primary">
                {req.budgetMax ? `${formatNaira(req.budgetMin)}–${formatNaira(req.budgetMax)}` : "Open"}
              </p>
            </div>
          </div>
          <p className="mt-3 border-t border-border pt-3 text-[13px] font-medium leading-relaxed text-foreground">
            {req.description}
          </p>
          {req.notes ? (
            <p className="mt-2 rounded-xl bg-muted p-3 text-[13px] font-medium leading-relaxed text-muted-foreground">
              <span className="font-extrabold text-foreground">Notes: </span>
              {req.notes}
            </p>
          ) : null}
        </SectionCard>

        {/* client info */}
        <SectionCard title="Client information">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-sm font-extrabold text-primary">
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-extrabold text-foreground">
                {req.clientName}
                <span className="inline-flex items-center rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-extrabold text-accent-foreground">
                  <CheckCircle2 className="mr-0.5 h-3 w-3" /> Verified
                </span>
              </p>
              <p className="text-xs font-semibold text-muted-foreground">Member since Aug 2023</p>
            </div>
          </div>
          <div className="mt-3 space-y-2 border-t border-border pt-3">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" /> +234 801 234 5678
            </p>
            <p className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" /> {req.clientContact}
            </p>
          </div>
        </SectionCard>

        {/* next steps */}
        <SectionCard title="Your next steps">
          <ol className="space-y-3">
            {[
              "Review the request details and files",
              "Send a proposal or reply with questions",
              "Discuss, agree and get hired",
            ].map((step, i) => (
              <li key={step} className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold",
                    i === 0 ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                  )}
                >
                  {i + 1}
                </span>
                <p className="text-[13px] font-semibold text-foreground">{step}</p>
              </li>
            ))}
          </ol>
        </SectionCard>

        {/* actions */}
        <div className="grid grid-cols-[1fr_1fr_1.3fr] gap-2.5 pt-1">
          <Button
            variant="outline"
            className="h-12 rounded-xl text-[13px] font-bold"
            onClick={() =>
              toast.info("Messaging is coming soon", {
                description: "For now, send a proposal to start the conversation.",
              })
            }
          >
            <MessageCircle className="mr-1 h-4 w-4" /> Reply
          </Button>
          <Button
            variant="outline"
            className="h-12 rounded-xl text-[13px] font-bold text-red-600 hover:bg-red-50"
            onClick={() => setDeclineOpen(true)}
          >
            Decline
          </Button>
          <Button
            className="h-12 rounded-xl text-[13px] font-bold"
            onClick={() => navigate(`/deals/new/r-${req.id}`)}
          >
            Send proposal <MoreHorizontal className="ml-1 hidden h-4 w-4" />
          </Button>
        </div>
        <p className="flex items-center justify-center gap-1.5 text-center text-xs font-semibold text-muted-foreground">
          <UserRound className="h-3.5 w-3.5" /> Sending a proposal creates a deal you can customise
          and send.
        </p>
      </AppPage>

      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold">Decline this request?</DialogTitle>
          </DialogHeader>
          <p className="text-sm font-medium text-muted-foreground">
            {req.clientName} will be notified that you're unavailable for this project.
          </p>
          <Textarea
            value={declineNote}
            onChange={(e) => setDeclineNote(e.target.value)}
            placeholder="Optional note (e.g. fully booked that weekend)"
            className="min-h-20 rounded-xl bg-muted/60 font-semibold"
          />
          <div className="flex gap-3">
            <Button variant="outline" className="h-11 flex-1 rounded-xl font-bold" onClick={() => setDeclineOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" className="h-11 flex-1 rounded-xl font-bold" onClick={decline} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Decline request"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppCanvas>
  );
}
