"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Check,
  Clock,
  Loader2,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Logo } from "@/components/landing/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChannelButtons } from "@/components/app/kit";
import { CHANNEL_META, primaryChannel } from "@/lib/channels";
import { api, type PublicCreator } from "@/lib/api";
import { formatNaira, type Booking, type Service } from "@/lib/types";
import { cn } from "@/lib/utils";

const BOOKING_TIMES = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];

const EMPTY_BOOKING = {
  sessionType: "",
  serviceId: undefined as string | undefined,
  date: "",
  time: "",
  clientName: "",
  clientContact: "",
  note: "",
};
type BookingForm = typeof EMPTY_BOOKING;

export default function PublicPageScreen({ handle }: { handle: string }) {
  const [data, setData] = useState<{ creator: PublicCreator; services: Service[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Service | null>(null);
  const [requestResult, setRequestResult] = useState<{ ref: string } | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingForm, setBookingForm] = useState<BookingForm>(EMPTY_BOOKING);
  const [bookingDone, setBookingDone] = useState<Booking | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    // New handle = fresh view: without this reset a previous lookup's error
    // (or its creator data) would stay on screen while the new one loads.
    setData(null);
    setError(null);
    api
      .publicCreator(handle)
      .then((d) => alive && setData(d))
      .catch((err) => alive && setError(err instanceof Error ? err.message : "Creator not found."));
    return () => {
      alive = false;
    };
  }, [handle]);

  const days = useMemo(() => {
    const out: { iso: string; weekday: string; day: number; month: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      out.push({
        iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
        weekday: d.toLocaleDateString("en-GB", { weekday: "short" }),
        day: d.getDate(),
        month: d.toLocaleDateString("en-GB", { month: "short" }),
      });
    }
    return out;
  }, []);

  function openBooking(service?: Service) {
    setBookingForm({
      ...EMPTY_BOOKING,
      sessionType: service ? service.title : "General consultation",
      serviceId: service?.id,
    });
    setBookingDone(null);
    setBookingOpen(true);
  }

  async function submitBooking() {
    if (!data || busy) return;
    const { sessionType, date, time, clientName, clientContact } = bookingForm;
    if (!sessionType || !date || !time || !clientName.trim() || !clientContact.trim()) {
      toast.error("Pick a session type, date and time, and add your name + contact.");
      return;
    }
    setBusy(true);
    try {
      const { booking } = await api.bookSession(data.creator.handle, {
        sessionType,
        serviceId: bookingForm.serviceId,
        date,
        time,
        clientName: clientName.trim(),
        clientContact: clientContact.trim(),
        note: bookingForm.note.trim() || undefined,
      });
      setBookingDone(booking);
      toast.success("Booking request sent!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send your booking.");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#edf3ef] px-6 text-center">
        <Logo />
        <p className="mt-4 text-lg font-extrabold text-foreground">Page not found</p>
        <p className="text-sm font-medium text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#edf3ef]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const { creator, services } = data;
  const primary = primaryChannel(creator.channels);

  /* ---------------- request flow (kept from v1, made responsive) ---------------- */

  if (requestResult && selected) {
    return (
      <PublicFrame creator={creator} onBook={() => openBooking()}>
        <div className="flex flex-1 flex-col px-4 pb-12 pt-8 sm:px-6 lg:py-10">
          <div className="flex justify-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-accent ring-8 ring-accent/40">
              <Check className="h-9 w-9 text-primary" strokeWidth={3} />
            </span>
          </div>
          <h1 className="mt-5 text-center text-2xl font-extrabold tracking-tight text-foreground">
            Your request has been <span className="text-primary">sent!</span>
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-center text-[15px] font-medium text-muted-foreground">
            {creator.name} will review your request and get back to you within 24 hours.
          </p>
          <p className="mx-auto mt-3 w-fit rounded-full bg-muted px-3.5 py-1.5 font-mono text-[12px] font-extrabold text-foreground">
            {requestResult.ref}
          </p>

          <div className="mx-auto mt-6 w-full max-w-md rounded-2xl border border-border bg-card p-5">
            <p className="text-center text-[15px] font-extrabold text-foreground">What happens next?</p>
            <ol className="mt-4 space-y-4">
              {[
                [`${creator.name} reviews your request`, "They'll go through your project details and may reach out for more info."],
                ["You'll get a deal", "You'll receive a message with a deal covering scope, timeline and price."],
                ["Approve to release payment", "Agree, pay safely into escrow, and only release when you're happy."],
              ].map(([title, desc], i) => (
                <li key={title} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-extrabold text-primary">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-[13px] font-extrabold text-foreground">{title}</p>
                    <p className="text-[13px] font-medium leading-relaxed text-muted-foreground">{desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="mx-auto mt-6 flex w-full max-w-md flex-col gap-3 sm:flex-row">
            {primary ? (
              <a
                href={CHANNEL_META[primary.type].href(primary.value)}
                target="_blank"
                rel="noreferrer"
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-accent font-bold text-accent-foreground transition-colors hover:bg-primary hover:text-white"
              >
                Chat on {CHANNEL_META[primary.type].label}
              </a>
            ) : null}
            <Button
              variant="outline"
              className="h-12 flex-1 rounded-xl font-bold"
              onClick={() => {
                setRequestResult(null);
                setSelected(null);
              }}
            >
              Back to {creator.name}&rsquo;s page
            </Button>
          </div>
        </div>
      </PublicFrame>
    );
  }

  if (selected) {
    return (
      <RequestForm
        creator={creator}
        service={selected}
        onBack={() => setSelected(null)}
        onSent={(ref) => setRequestResult({ ref })}
      />
    );
  }

  /* ---------------- public page ---------------- */

  return (
    <PublicFrame creator={creator} onBook={() => openBooking()}>
      {/* hero */}
      <div className="relative bg-gradient-to-br from-emerald-900 via-emerald-700 to-emerald-600">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(24rem 12rem at 80% 0%, rgba(255,255,255,0.5), transparent 60%)",
          }}
        />
        <div className="relative grid gap-8 px-4 py-8 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-10 lg:px-8 lg:py-12">
          <div>
            <div className="flex items-center gap-4">
              <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-white/60 bg-emerald-950 text-2xl font-extrabold text-white">
                {creator.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xl font-extrabold text-white lg:text-2xl">
                  <span className="truncate">{creator.name}</span>
                  {creator.verified ? <BadgeCheck className="h-5 w-5 shrink-0 text-emerald-200" /> : null}
                </p>
                <p className="text-[13px] font-bold text-emerald-100">
                  {creator.craft || "Creative"}
                  {creator.location ? ` · ${creator.location}` : ""}
                </p>
                <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-200">
                  <MapPin className="h-3.5 w-3.5" /> Available for projects
                </p>
              </div>
            </div>
            {creator.bio ? (
              <p className="mt-4 max-w-md text-[14px] font-medium leading-relaxed text-emerald-50">
                {creator.bio}
              </p>
            ) : null}
            <div className="mt-5">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-emerald-200">
                Reach {creator.name.split(" ")[0]} on
              </p>
              <ChannelButtons channels={creator.channels} className="mt-2 [&_a]:border-white/25 [&_a]:bg-white/10 [&_a]:text-white [&_a:hover]:border-white/50" />
            </div>
          </div>

          <div className="rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-sm lg:p-6">
            <h1 className="text-xl font-extrabold tracking-tight text-white lg:text-2xl">
              Work with me 👋
            </h1>
            <p className="mt-1.5 text-[14px] font-medium leading-relaxed text-emerald-50">
              Pick a service below to request a custom deal, or book a session directly on my calendar.
            </p>
            <Button
              className="mt-4 h-12 w-full rounded-xl text-[15px] font-bold shadow-md"
              onClick={() => openBooking()}
            >
              <CalendarDays className="mr-2 h-4.5 w-4.5" /> Book a session
            </Button>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-100">
              <ShieldCheck className="h-4 w-4" /> Payments protected by DEAL escrow
            </p>
          </div>
        </div>
      </div>

      {/* services */}
      <div className="px-4 pb-12 pt-6 sm:px-6 lg:px-8 lg:py-10">
        <h2 className="text-xl font-extrabold tracking-tight text-foreground lg:text-2xl">
          Services
        </h2>
        <p className="mt-1 text-[14px] font-medium text-muted-foreground">
          Request any service for a custom deal — I usually reply within 24 hours.
        </p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="mt-5 grid gap-3 sm:grid-cols-2 lg:gap-4"
        >
          {services.map((svc) => (
            <div
              key={svc.id}
              className="flex flex-col rounded-2xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md lg:p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {svc.popular ? (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-primary">
                      Popular
                    </span>
                  ) : null}
                  <p className="text-[15px] font-extrabold text-foreground">{svc.title}</p>
                  <p className="mt-0.5 text-[13px] font-medium leading-relaxed text-muted-foreground">
                    {svc.desc}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">From</p>
                  <p className="text-[15px] font-extrabold text-primary">{formatNaira(svc.from)}</p>
                </div>
              </div>
              {svc.includes.length > 0 ? (
                <ul className="mt-3 space-y-1">
                  {svc.includes.slice(0, 3).map((inc) => (
                    <li key={inc} className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                      <Check className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={3} /> {inc}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
                <p className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" /> {svc.duration}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-lg border-primary/40 px-3 text-xs font-bold text-primary"
                    onClick={() => setSelected(svc)}
                  >
                    Request this service
                  </Button>
                  <Button
                    size="sm"
                    className="h-9 rounded-lg px-3 text-xs font-bold"
                    onClick={() => openBooking(svc)}
                  >
                    Book
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {services.length === 0 && (
            <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm font-semibold text-muted-foreground sm:col-span-2">
              This creator hasn&rsquo;t added services yet — book a general consultation instead.
            </p>
          )}
        </motion.div>

        <div className="mt-8 flex items-center justify-center gap-2 text-center">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
          <p className="text-xs font-semibold text-muted-foreground">
            All projects on <span className="font-extrabold text-primary">DEAL</span> are protected by
            clear agreements and secure payments.
          </p>
        </div>
      </div>

      {/* booking dialog */}
      <Dialog
        open={bookingOpen}
        onOpenChange={(next) => {
          setBookingOpen(next);
          if (!next) setBookingDone(null);
        }}
      >
        <DialogContent aria-describedby={undefined} className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-md">
          {bookingDone ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-col items-center gap-3 pt-2 text-center">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent ring-8 ring-accent/50">
                    <Check className="h-8 w-8 text-primary" strokeWidth={3} />
                  </span>
                  <span className="text-xl font-extrabold tracking-tight text-foreground">
                    Booking request sent
                  </span>
                </DialogTitle>
              </DialogHeader>
              <p className="text-center text-[14px] font-medium text-muted-foreground">
                {creator.name} will confirm shortly.
              </p>
              <p className="mx-auto w-fit rounded-full bg-muted px-3.5 py-1.5 font-mono text-[12px] font-extrabold text-foreground">
                {bookingDone.ref}
              </p>
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                  Your session
                </p>
                <p className="mt-1 text-[14px] font-extrabold text-foreground">{bookingDone.sessionType}</p>
                <p className="text-[13px] font-semibold text-muted-foreground">
                  {formatDayLabel(bookingDone.date)} · {bookingDone.time}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-[13px] font-extrabold text-foreground">What happens next</p>
                <ol className="mt-2.5 space-y-2.5">
                  {[
                    `${creator.name} reviews the request and confirms the slot`,
                    "You'll get a confirmation with the details",
                    "Any payments happen securely through DEAL escrow",
                  ].map((step, i) => (
                    <li key={step} className="flex gap-2.5">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-extrabold text-primary">
                        {i + 1}
                      </span>
                      <p className="text-[13px] font-medium leading-relaxed text-muted-foreground">{step}</p>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="flex flex-col gap-2.5 sm:flex-row">
                {primary ? (
                  <a
                    href={CHANNEL_META[primary.type].href(primary.value)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-accent text-sm font-bold text-accent-foreground transition-colors hover:bg-primary hover:text-white"
                  >
                    Chat on {CHANNEL_META[primary.type].label}
                  </a>
                ) : null}
                <Button
                  variant="outline"
                  className="h-11 flex-1 rounded-xl font-bold"
                  onClick={() => setBookingOpen(false)}
                >
                  Back to {creator.name}&rsquo;s page
                </Button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-lg font-extrabold">Book a session</DialogTitle>
              </DialogHeader>
              <p className="-mt-2 text-[13px] font-medium text-muted-foreground">
                Pick what works for you — {creator.name} confirms every booking personally.
              </p>

              {/* (a) session type */}
              <div>
                <p className="text-[12px] font-extrabold text-foreground">Session type</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[
                    ...services.map((svc) => ({ title: svc.title, id: svc.id as string | undefined })),
                    { title: "General consultation", id: undefined },
                  ].map((opt) => (
                    <button
                      key={opt.title}
                      type="button"
                      onClick={() => setBookingForm({ ...bookingForm, sessionType: opt.title, serviceId: opt.id })}
                      className={cn(
                        "rounded-full border px-3.5 py-2 text-[13px] font-bold transition-colors",
                        bookingForm.sessionType === opt.title
                          ? "border-primary bg-accent text-accent-foreground"
                          : "border-border bg-card text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {opt.title}
                    </button>
                  ))}
                </div>
              </div>

              {/* (b) date grid */}
              <div>
                <p className="text-[12px] font-extrabold text-foreground">Pick a date</p>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {days.map((day) => {
                    const active = bookingForm.date === day.iso;
                    return (
                      <button
                        key={day.iso}
                        type="button"
                        onClick={() => setBookingForm({ ...bookingForm, date: day.iso })}
                        className={cn(
                          "rounded-xl border px-1 py-2 text-center transition-colors",
                          active
                            ? "border-primary bg-accent"
                            : "border-border bg-card hover:bg-muted"
                        )}
                      >
                        <p className={cn("text-[10px] font-bold uppercase", active ? "text-primary" : "text-muted-foreground")}>
                          {day.weekday}
                        </p>
                        <p className={cn("text-[15px] font-extrabold leading-tight", active ? "text-foreground" : "text-foreground")}>
                          {day.day}
                        </p>
                        <p className="text-[9px] font-semibold text-muted-foreground">{day.month}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* (c) time slots */}
              <div>
                <p className="text-[12px] font-extrabold text-foreground">Pick a time</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {BOOKING_TIMES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setBookingForm({ ...bookingForm, time: t })}
                      className={cn(
                        "rounded-full border px-3 py-1.5 font-mono text-[12px] font-bold transition-colors",
                        bookingForm.time === t
                          ? "border-primary bg-accent text-accent-foreground"
                          : "border-border bg-card text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* (d) details */}
              <div className="space-y-3">
                <div>
                  <label htmlFor="bk-name" className="text-[12px] font-extrabold text-foreground">
                    Your name
                  </label>
                  <Input
                    id="bk-name"
                    value={bookingForm.clientName}
                    onChange={(e) => setBookingForm({ ...bookingForm, clientName: e.target.value })}
                    placeholder="e.g. Lola Adewale"
                    className="mt-1 h-11 rounded-xl bg-muted/60 font-semibold"
                  />
                </div>
                <div>
                  <label htmlFor="bk-contact" className="text-[12px] font-extrabold text-foreground">
                    Email or phone
                  </label>
                  <Input
                    id="bk-contact"
                    value={bookingForm.clientContact}
                    onChange={(e) => setBookingForm({ ...bookingForm, clientContact: e.target.value })}
                    placeholder="So they can reach you"
                    className="mt-1 h-11 rounded-xl bg-muted/60 font-semibold"
                  />
                </div>
                <div>
                  <label htmlFor="bk-note" className="text-[12px] font-extrabold text-foreground">
                    Note <span className="font-semibold text-muted-foreground">(optional)</span>
                  </label>
                  <Textarea
                    id="bk-note"
                    value={bookingForm.note}
                    onChange={(e) => setBookingForm({ ...bookingForm, note: e.target.value.slice(0, 300) })}
                    placeholder={`Anything ${creator.name.split(" ")[0]} should know?`}
                    className="mt-1 min-h-16 rounded-xl bg-muted/60 font-semibold"
                  />
                </div>
              </div>

              <Button className="h-12 w-full rounded-xl font-bold" disabled={busy} onClick={submitBooking}>
                {busy ? (
                  <Loader2 className="h-4.5 w-4.5 animate-spin" />
                ) : (
                  <>
                    Send booking request <ArrowRight className="ml-1 h-4.5 w-4.5" />
                  </>
                )}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </PublicFrame>
  );
}

function formatDayLabel(date: string) {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/* ---------------- frame ---------------- */

function PublicFrame({
  creator,
  onBook,
  children,
}: {
  creator: PublicCreator;
  onBook: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#edf3ef]">
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col bg-background shadow-[0_0_60px_rgba(14,31,51,0.10)] lg:max-w-4xl">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-white/90 px-4 backdrop-blur-md sm:px-6">
          <Logo />
          <button
            type="button"
            onClick={onBook}
            className="inline-flex items-center gap-1.5 rounded-full border border-accent bg-accent px-3.5 py-1.5 text-[13px] font-extrabold text-accent-foreground transition-colors hover:bg-primary hover:text-white"
          >
            <CalendarDays className="h-3.5 w-3.5" /> Book a session
          </button>
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
        <p className="px-4 pb-6 text-center text-[11px] font-semibold text-muted-foreground">
          {creator.name.split(" ")[0]} uses DEAL for agreements, escrow payments and protected
          delivery.
        </p>
        <div className="pb-[env(safe-area-inset-bottom)]" />
      </div>
    </div>
  );
}

/* ---------------- request form ---------------- */

function RequestForm({
  creator,
  service,
  onBack,
  onSent,
}: {
  creator: PublicCreator;
  service: Service;
  onBack: () => void;
  onSent: (ref: string) => void;
}) {
  const [form, setForm] = useState({
    clientName: "",
    clientContact: "",
    eventDate: "",
    location: "",
    description: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!form.clientName.trim() || !form.clientContact.trim() || !form.description.trim()) {
      toast.error("Add your name, contact and a short project description.");
      return;
    }
    setBusy(true);
    try {
      const { request } = await api.sendRequest(creator.handle, {
        serviceId: service.id,
        clientName: form.clientName,
        clientContact: form.clientContact,
        eventDate: form.eventDate,
        location: form.location,
        budgetMin: Math.round(service.from * 0.8),
        budgetMax: Math.round(service.from * 1.3),
        description: form.description,
        notes: form.notes,
      });
      onSent(request.ref);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send your request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PublicFrame creator={creator} onBook={() => undefined}>
      <form onSubmit={submit} className="flex-1 px-4 pb-12 pt-5 sm:px-6 lg:py-10">
        <div className="mx-auto w-full max-w-md lg:max-w-lg">
          <button type="button" onClick={onBack} className="text-sm font-bold text-primary">
            ← Back to all services
          </button>

          <div className="mt-4 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[16px] font-extrabold text-foreground">{service.title}</p>
                <p className="mt-0.5 text-[13px] font-medium text-muted-foreground">{service.desc}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[10px] font-bold uppercase text-muted-foreground">From</p>
                <p className="text-[15px] font-extrabold text-primary">{formatNaira(service.from)}</p>
              </div>
            </div>
          </div>

          <h1 className="mt-5 text-xl font-extrabold tracking-tight text-foreground lg:text-2xl">
            Tell {creator.name.split(" ")[0]} about your project
          </h1>
          <p className="mt-1 text-[14px] font-medium text-muted-foreground">
            The more details you provide, the better they can understand your needs.
          </p>

          <div className="mt-5 space-y-4">
            <div>
              <label htmlFor="rq-name" className="text-[13px] font-extrabold text-foreground">
                Your name
              </label>
              <Input
                id="rq-name"
                value={form.clientName}
                onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                placeholder="e.g. Lola & Tunde"
                className="mt-1.5 h-12 rounded-xl bg-muted/60 font-semibold"
              />
            </div>
            <div>
              <label htmlFor="rq-contact" className="text-[13px] font-extrabold text-foreground">
                Email or phone
              </label>
              <Input
                id="rq-contact"
                value={form.clientContact}
                onChange={(e) => setForm({ ...form, clientContact: e.target.value })}
                placeholder="So they can reach you"
                className="mt-1.5 h-12 rounded-xl bg-muted/60 font-semibold"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="rq-date" className="text-[13px] font-extrabold text-foreground">
                  Event date
                </label>
                <Input
                  id="rq-date"
                  value={form.eventDate}
                  onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
                  type="date"
                  className="mt-1.5 h-12 rounded-xl bg-muted/60 font-semibold"
                />
              </div>
              <div>
                <label htmlFor="rq-location" className="text-[13px] font-extrabold text-foreground">
                  Location
                </label>
                <Input
                  id="rq-location"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="e.g. Ikoyi, Lagos"
                  className="mt-1.5 h-12 rounded-xl bg-muted/60 font-semibold"
                />
              </div>
            </div>
            <div>
              <label htmlFor="rq-desc" className="text-[13px] font-extrabold text-foreground">
                Project description
              </label>
              <Textarea
                id="rq-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value.slice(0, 500) })}
                placeholder="What do you have in mind? Any inspiration, ideas or specific requirements?"
                className="mt-1.5 min-h-24 rounded-xl bg-muted/60 font-semibold"
              />
            </div>
            <div>
              <label htmlFor="rq-notes" className="text-[13px] font-extrabold text-foreground">
                Additional notes <span className="font-semibold text-muted-foreground">(optional)</span>
              </label>
              <Textarea
                id="rq-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value.slice(0, 300) })}
                placeholder="Budget range, preferred time, anything else…"
                className="mt-1.5 min-h-16 rounded-xl bg-muted/60 font-semibold"
              />
            </div>
          </div>

          <Button type="submit" disabled={busy} className="mt-6 h-13 w-full rounded-xl text-[15px] font-bold">
            {busy ? (
              <Loader2 className="h-4.5 w-4.5 animate-spin" />
            ) : (
              <>
                Send request <ArrowRight className="ml-1 h-4.5 w-4.5" />
              </>
            )}
          </Button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs font-semibold text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            You&rsquo;ll review and agree on everything before any payment.
          </p>
        </div>
      </form>
    </PublicFrame>
  );
}
