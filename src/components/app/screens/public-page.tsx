"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Check,
  Clock,
  Loader2,
  MapPin,
  MessageCircle,
  PartyPopper,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/landing/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { formatNaira, type SafeUser, type Service } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function PublicPageScreen({ handle }: { handle: string }) {
  const [data, setData] = useState<{ creator: SafeUser; services: Service[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Service | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .publicCreator(handle)
      .then((d) => alive && setData(d))
      .catch((err) => alive && setError(err instanceof Error ? err.message : "Creator not found."));
    return () => {
      alive = false;
    };
  }, [handle]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col bg-[#edf3ef]">
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-3 bg-background px-6 text-center">
          <Logo />
          <p className="mt-4 text-lg font-extrabold text-foreground">Page not found</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
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

  if (sent && selected) {
    return (
      <div className="min-h-screen bg-[#edf3ef]">
        <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col bg-background px-5 pb-10 pt-8 shadow-[0_0_60px_rgba(14,31,51,0.10)]">
          <div className="flex justify-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-accent ring-8 ring-accent/40">
              <Check className="h-9 w-9 text-primary" strokeWidth={3} />
            </span>
          </div>
          <h1 className="mt-5 text-center text-2xl font-extrabold tracking-tight text-foreground">
            Your request has been <span className="text-primary">sent!</span>
          </h1>
          <p className="mx-auto mt-2 max-w-xs text-center text-[15px] font-medium text-muted-foreground">
            {creator.name} will review your request and get back to you within 24 hours.
          </p>

          <div className="mt-6 rounded-2xl border border-border bg-card p-4">
            <p className="text-center text-[15px] font-extrabold text-foreground">What happens next?</p>
            <ol className="mt-4 space-y-4">
              {[
                ["MessageCircle", `${creator.name} reviews your request`, "They'll go through your project details and may reach out if they need more info."],
                ["Mail", "You'll get a response", "You'll receive a message with a deal covering scope, timeline and price."],
                ["ShieldCheck", "Review & agree", "Discuss the details, agree on the terms and make a secure payment on DEAL."],
                ["PartyPopper", "Project begins!", "Once everything is agreed, work starts and you'll get updates."],
              ].map(([, title, desc]) => (
                <li key={title} className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                    <Check className="h-4 w-4" strokeWidth={3} />
                  </span>
                  <div>
                    <p className="text-sm font-extrabold text-foreground">{title}</p>
                    <p className="text-[13px] font-medium leading-relaxed text-muted-foreground">{desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {creator.whatsapp ? (
            <a
              href={`https://wa.me/${creator.whatsapp.replace(/\D/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-accent font-bold text-accent-foreground"
            >
              <MessageCircle className="h-4.5 w-4.5" /> Have questions? Chat on WhatsApp
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setSelected(null);
            }}
            className="mt-3 h-12 w-full rounded-xl border border-border font-bold text-foreground"
          >
            Back to {creator.name}'s page
          </button>
        </div>
      </div>
    );
  }

  if (selected) {
    return (
      <RequestForm
        creator={creator}
        service={selected}
        onBack={() => setSelected(null)}
        onSent={() => setSent(true)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#edf3ef]">
      <div className="mx-auto min-h-screen w-full max-w-lg bg-background shadow-[0_0_60px_rgba(14,31,51,0.10)]">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-white/90 px-5 backdrop-blur-md">
          <Logo />
          {creator.whatsapp ? (
            <a
              href={`https://wa.me/${creator.whatsapp.replace(/\D/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-accent bg-accent px-3 py-1.5 text-[13px] font-bold text-accent-foreground"
            >
              <MessageCircle className="h-3.5 w-3.5" /> Chat on WhatsApp
            </a>
          ) : null}
        </header>

        {/* hero */}
        <div className="relative bg-gradient-to-br from-emerald-900 via-emerald-700 to-emerald-600 px-5 pb-8 pt-10">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "radial-gradient(24rem 12rem at 80% 0%, rgba(255,255,255,0.5), transparent 60%)",
            }}
          />
          <div className="relative flex items-center gap-4">
            <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-white/60 bg-emerald-950 text-2xl font-extrabold text-white">
              {creator.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xl font-extrabold text-white">
                <span className="truncate">{creator.name}</span>
                {creator.verified ? <BadgeCheck className="h-5 w-5 shrink-0 text-emerald-200" /> : null}
              </p>
              <p className="text-[13px] font-bold text-emerald-100">
                {creator.craft || "Creative"} {creator.location ? `· ${creator.location}` : ""}
              </p>
              <p className="mt-1 text-[13px] font-medium leading-relaxed text-emerald-50">
                {creator.bio}
              </p>
            </div>
          </div>
        </div>

        {/* services */}
        <div className="px-5 pb-12 pt-6">
          <h1 className="text-center text-2xl font-extrabold tracking-tight text-foreground">
            Work with me 👋
          </h1>
          <p className="mx-auto mt-1.5 max-w-xs text-center text-[14px] font-medium text-muted-foreground">
            Choose a service to get started. I'll respond to your request within 24 hours.
          </p>

          <div className="mt-6 space-y-3">
            {services.map((svc) => (
              <button
                key={svc.id}
                type="button"
                onClick={() => setSelected(svc)}
                className="w-full rounded-2xl border border-border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {svc.popular ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-primary">
                          Popular
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-[15px] font-extrabold text-foreground">{svc.title}</p>
                    <p className="mt-0.5 text-[13px] font-medium leading-relaxed text-muted-foreground">
                      {svc.desc}
                    </p>
                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" /> {svc.duration}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] font-bold uppercase text-muted-foreground">From</p>
                    <p className="text-[15px] font-extrabold text-foreground">{formatNaira(svc.from)}</p>
                    <span className="mt-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent text-primary">
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                </div>
              </button>
            ))}
            {services.length === 0 && (
              <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm font-semibold text-muted-foreground">
                This creator hasn't added services yet.
              </p>
            )}
          </div>

          <div className="mt-6 flex items-center justify-center gap-2 text-center">
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
            <p className="text-xs font-semibold text-muted-foreground">
              All projects on <span className="font-extrabold text-primary">DEAL</span> are protected
              by clear agreements and secure payments.
            </p>
          </div>
        </div>
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
  creator: SafeUser;
  service: Service;
  onBack: () => void;
  onSent: () => void;
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
      await api.sendRequest(creator.handle, {
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
      onSent();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send your request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#edf3ef]">
      <div className="mx-auto min-h-screen w-full max-w-lg bg-background shadow-[0_0_60px_rgba(14,31,51,0.10)]">
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-white/90 px-5 backdrop-blur-md">
          <Logo />
          {creator.whatsapp ? (
            <a
              href={`https://wa.me/${creator.whatsapp.replace(/\D/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[13px] font-bold text-primary"
            >
              <MessageCircle className="h-4 w-4" /> Chat on WhatsApp
            </a>
          ) : null}
        </header>

        <form onSubmit={submit} className="px-5 pb-12 pt-5">
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

          <h1 className="mt-5 text-xl font-extrabold tracking-tight text-foreground">
            Tell {creator.name.split(" ")[0]} about your project
          </h1>
          <p className="mt-1 text-[14px] font-medium text-muted-foreground">
            The more details you provide, the better they can understand your needs.
          </p>

          <div className="mt-5 space-y-4">
            <div>
              <label className="text-[13px] font-extrabold text-foreground">Your name</label>
              <Input
                value={form.clientName}
                onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                placeholder="e.g. Lola & Tunde"
                className="mt-1.5 h-12 rounded-xl bg-muted/60 font-semibold"
              />
            </div>
            <div>
              <label className="text-[13px] font-extrabold text-foreground">Email or phone</label>
              <Input
                value={form.clientContact}
                onChange={(e) => setForm({ ...form, clientContact: e.target.value })}
                placeholder="So they can reach you"
                className="mt-1.5 h-12 rounded-xl bg-muted/60 font-semibold"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[13px] font-extrabold text-foreground">Event date</label>
                <Input
                  value={form.eventDate}
                  onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
                  type="date"
                  className="mt-1.5 h-12 rounded-xl bg-muted/60 font-semibold"
                />
              </div>
              <div>
                <label className="text-[13px] font-extrabold text-foreground">Location</label>
                <Input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="e.g. Ikoyi, Lagos"
                  className="mt-1.5 h-12 rounded-xl bg-muted/60 font-semibold"
                />
              </div>
            </div>
            <div>
              <label className="text-[13px] font-extrabold text-foreground">Project description</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value.slice(0, 500) })}
                placeholder="What do you have in mind? Any inspiration, ideas or specific requirements?"
                className="mt-1.5 min-h-24 rounded-xl bg-muted/60 font-semibold"
              />
            </div>
            <div>
              <label className="text-[13px] font-extrabold text-foreground">
                Additional notes <span className="font-semibold text-muted-foreground">(optional)</span>
              </label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value.slice(0, 300) })}
                placeholder="Budget range, preferred time, anything else…"
                className="mt-1.5 min-h-16 rounded-xl bg-muted/60 font-semibold"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={busy}
            className={cn("mt-6 h-13 w-full rounded-xl text-[15px] font-bold")}
          >
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
            You'll review and agree on everything before any payment.
          </p>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-center text-xs font-semibold text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            Your information is secure and will only be shared with {creator.name.split(" ")[0]}.
          </p>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-center text-xs font-semibold text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            Typically replied to within 24 hours.
          </p>
        </form>
      </div>
    </div>
  );
}
