"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  CalendarCheck,
  Check,
  CheckCircle2,
  Globe,
  History,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppCanvas } from "@/components/app/chrome";
import { AppPage, BookingChip, BookingWhen, SectionCard } from "@/components/app/kit";
import { Button } from "@/components/ui/button";
import { useApp } from "@/components/app/context";
import { api } from "@/lib/api";
import type { Booking } from "@/lib/types";

type BookingAction = "confirm" | "decline" | "complete" | "cancel";

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

const byDateAsc = (a: Booking, b: Booking) => (a.date + a.time).localeCompare(b.date + b.time);
const byDateDesc = (a: Booking, b: Booking) => (b.date + b.time).localeCompare(a.date + a.time);

function actionToast(action: BookingAction, clientName: string) {
  switch (action) {
    case "confirm":
      return `Booking confirmed — ${clientName} will be notified`;
    case "decline":
      return `Booking declined — ${clientName} will be notified`;
    case "complete":
      return `Nice! Session with ${clientName} marked complete`;
    case "cancel":
      return "Booking cancelled";
  }
}

function BookingCard({
  booking,
  busy,
  onAction,
}: {
  booking: Booking;
  busy: boolean;
  onAction: (booking: Booking, action: BookingAction) => void;
}) {
  const actionable = booking.status === "requested" || booking.status === "confirmed";
  return (
    <div className="rounded-2xl border border-border bg-card p-4 lg:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-extrabold text-primary">
          {initialsOf(booking.clientName)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-extrabold text-foreground">{booking.clientName}</p>
          <p className="truncate text-xs font-semibold text-muted-foreground">
            {booking.clientContact}
          </p>
        </div>
        <BookingChip status={booking.status} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-extrabold text-muted-foreground">
          {booking.sessionType}
        </span>
        <BookingWhen date={booking.date} time={booking.time} />
        <span className="ml-auto font-mono text-[11px] font-bold text-muted-foreground">
          {booking.ref}
        </span>
      </div>

      {booking.note ? (
        <p className="mt-3 rounded-xl bg-muted/60 p-3 text-[13px] font-medium leading-relaxed text-foreground/90">
          {booking.note}
        </p>
      ) : null}

      {actionable ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {booking.status === "requested" ? (
            <>
              <Button
                size="sm"
                className="rounded-lg font-bold"
                disabled={busy}
                onClick={() => onAction(booking, "confirm")}
              >
                {busy ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-1.5 h-4 w-4" strokeWidth={3} />
                )}
                Confirm
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="font-bold text-red-600 hover:bg-red-50 hover:text-red-700"
                disabled={busy}
                onClick={() => onAction(booking, "decline")}
              >
                <X className="mr-1 h-4 w-4" /> Decline
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                className="rounded-lg font-bold"
                disabled={busy}
                onClick={() => onAction(booking, "complete")}
              >
                <CheckCircle2 className="mr-1.5 h-4 w-4" /> Mark complete
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="font-bold text-red-600 hover:bg-red-50 hover:text-red-700"
                disabled={busy}
                onClick={() => onAction(booking, "cancel")}
              >
                <X className="mr-1 h-4 w-4" /> Cancel
              </Button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function BookingsScreen() {
  const { user } = useApp();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    api
      .bookings()
      .then((d) => {
        if (alive) setBookings(d.bookings);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Couldn't load bookings."));
    return () => {
      alive = false;
    };
  }, [user]);

  if (!user) return null;
  const creatorId = user.id;
  const handle = user.handle;

  async function act(booking: Booking, action: BookingAction) {
    setBusyId(booking.id);
    try {
      const { booking: updated } = await api.bookingAction(booking.id, action);
      toast.success(actionToast(action, updated.clientName));
      const { bookings: fresh } = await api.bookings();
      setBookings(fresh);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update the booking.");
    } finally {
      setBusyId(null);
    }
  }

  const upcoming = (bookings ?? []).filter(
    (b) => b.status === "requested" || b.status === "confirmed"
  ).sort(byDateAsc);
  const history = (bookings ?? []).filter(
    (b) => b.status !== "requested" && b.status !== "confirmed"
  ).sort(byDateDesc);

  return (
    <AppCanvas activeTab="bookings">
      <AppPage title="Bookings" subtitle="Session requests from your public page">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="space-y-5 lg:space-y-6"
        >
          {/* explainer strip */}
          <div className="flex items-start gap-3 rounded-2xl border border-border bg-secondary p-4 lg:p-5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent">
              <Globe className="h-4 w-4 text-primary" />
            </span>
            <p className="text-[13px] font-medium leading-relaxed text-muted-foreground">
              Clients book sessions from your public page{" "}
              <HashLink href={`#/u/${handle}`} className="font-bold text-primary hover:underline">
                @{handle}
              </HashLink>{" "}
              — confirmed sessions sync here automatically.
            </p>
          </div>

          {!bookings ? (
            <div className="flex min-h-[35vh] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* upcoming */}
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="text-[15px] font-extrabold text-foreground">Upcoming</h2>
                  {upcoming.length > 0 ? (
                    <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-extrabold text-accent-foreground">
                      {upcoming.length}
                    </span>
                  ) : null}
                </div>
                {upcoming.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-card p-8 text-center">
                    <CalendarCheck className="h-7 w-7 text-muted-foreground" />
                    <p className="text-sm font-extrabold text-foreground">No upcoming sessions</p>
                    <p className="max-w-xs text-[13px] font-semibold text-muted-foreground">
                      Share your public page — booking requests will show up here for you to confirm.
                    </p>
                    <Button asChild variant="outline" className="mt-1 rounded-xl font-bold">
                      <HashLink href={`#/u/${handle}`}>View public page</HashLink>
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {upcoming.map((booking) => (
                      <BookingCard
                        key={booking.id}
                        booking={booking}
                        busy={busyId === booking.id}
                        onAction={act}
                      />
                    ))}
                  </div>
                )}
              </section>

              {/* history */}
              <SectionCard title="History">
                {history.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-6 text-center">
                    <History className="h-6 w-6 text-muted-foreground" />
                    <p className="text-[13px] font-semibold text-muted-foreground">
                      No past sessions yet — completed, declined and cancelled bookings land here.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {history.map((booking) => (
                      <BookingCard
                        key={booking.id}
                        booking={booking}
                        busy={busyId === booking.id}
                        onAction={act}
                      />
                    ))}
                  </div>
                )}
              </SectionCard>
            </>
          )}
        </motion.div>
      </AppPage>
    </AppCanvas>
  );
}
