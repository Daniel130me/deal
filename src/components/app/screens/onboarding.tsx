"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  ImagePlus,
  Link2,
  Loader2,
  Plus,
  Share2,
  Star,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/landing/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { useApp } from "@/components/app/context";
import { CHANNEL_META, CHANNEL_TYPES } from "@/lib/channels";
import { formatNaira, type ChannelType, type CreatorChannel } from "@/lib/types";
import { cn } from "@/lib/utils";

const ONBOARD_STEPS = ["Profile", "Services", "Preview", "Publish"];

const CRAFTS = [
  "Photographer",
  "Graphic Designer",
  "Videographer",
  "Writer",
  "Developer",
  "Illustrator",
  "Voice Artist",
  "Motion Designer",
];

export default function OnboardingScreen() {
  const { user, setUser, navigate } = useApp();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  // profile state
  const [name, setName] = useState(user?.name ?? "");
  const [craft, setCraft] = useState(user?.craft ?? "");
  const [location, setLocation] = useState(user?.location ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [craftOpen, setCraftOpen] = useState(false);

  // channels state — "How clients reach you"
  const [channels, setChannels] = useState<CreatorChannel[]>(() => {
    if (user?.channels?.length) return user.channels;
    return user?.whatsapp ? [{ type: "whatsapp", value: user.whatsapp, primary: true }] : [];
  });
  const [channelType, setChannelType] = useState<ChannelType>("whatsapp");
  const [channelValue, setChannelValue] = useState("");

  // services state (local, seeded from scratch for new creators)
  const [services, setServices] = useState<
    { title: string; desc: string; from: number; duration: string; includes: string[] }[]
  >([]);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState({ title: "", desc: "", from: "", duration: "2–3 hrs" });

  function addChannel() {
    const value = channelValue.trim();
    if (!value) {
      toast.error("Enter a value for the channel (number, username or link).");
      return;
    }
    if (channels.some((c) => c.type === channelType && c.value.toLowerCase() === value.toLowerCase())) {
      toast.error("That channel is already added.");
      return;
    }
    setChannels((prev) => [...prev, { type: channelType, value, primary: prev.length === 0 }]);
    setChannelValue("");
    toast.success(`${CHANNEL_META[channelType].label} added`);
  }

  function makePrimaryChannel(index: number) {
    setChannels((prev) => prev.map((c, i) => ({ ...c, primary: i === index })));
  }

  function removeChannel(index: number) {
    setChannels((prev) => {
      const wasPrimary = prev[index]?.primary ?? false;
      return prev
        .filter((_, i) => i !== index)
        .map((c, i) => ({ ...c, primary: wasPrimary ? i === 0 : c.primary }));
    });
  }

  async function saveProfile() {
    if (!user) return;
    if (!name.trim() || !craft) {
      toast.error("Add your display name and main service first.");
      return;
    }
    setBusy(true);
    try {
      const { user: updated } = await api.updateUser(user.id, {
        name: name.trim(),
        craft,
        location: location.trim(),
        bio: bio.trim(),
        channels,
      });
      setUser(updated);
      setStep(1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save profile.");
    } finally {
      setBusy(false);
    }
  }

  async function saveServicesAndPreview() {
    if (!user) return;
    if (services.length === 0) {
      toast.error("Add at least one service so clients can book you.");
      return;
    }
    setBusy(true);
    try {
      for (const svc of services) {
        await api.addService(user.id, svc);
      }
      setServices([]);
      setStep(2);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save services.");
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!user) return;
    setBusy(true);
    try {
      const { user: updated } = await api.updateUser(user.id, { onboarded: true, channels });
      setUser(updated);
      setStep(3);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't publish your page.");
    } finally {
      setBusy(false);
    }
  }

  const publicLink = useMemo(
    () => `${typeof window !== "undefined" ? window.location.origin : ""}/#/u/${user?.handle ?? ""}`,
    [user?.handle]
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#edf3ef]">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col bg-background px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-5">
        <div className="flex items-center justify-between">
          <Logo />
          <button
            type="button"
            onClick={() => {
              if (user) {
                setUser({ ...user, onboarded: true });
                navigate("/dashboard");
              }
            }}
            className="text-sm font-extrabold text-primary"
          >
            Skip
          </button>
        </div>

        {/* progress */}
        <ol className="mt-6 flex items-center">
          {ONBOARD_STEPS.map((label, i) => (
            <li key={label} className={cn("flex items-center", i < ONBOARD_STEPS.length - 1 && "flex-1")}>
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-extrabold",
                    i < step && "border-primary bg-primary text-white",
                    i === step && "border-primary bg-white text-primary",
                    i > step && "border-border bg-white text-muted-foreground"
                  )}
                >
                  {i < step ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
                </span>
                <span
                  className={cn(
                    "mt-1.5 text-[11px] font-extrabold",
                    i === step ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {label}
                </span>
              </div>
              {i < ONBOARD_STEPS.length - 1 && (
                <span className={cn("mx-2 mb-5 h-0.5 flex-1", i < step ? "bg-primary" : "bg-border")} />
              )}
            </li>
          ))}
        </ol>

        {/* STEP 1 — profile */}
        {step === 0 && (
          <div className="mt-7 flex-1">
            <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-foreground">
              Let's set up
              <br />
              your <span className="text-primary">DEAL profile</span>
            </h1>
            <p className="mt-2 text-[15px] font-medium text-muted-foreground">
              This is how clients will see you on your public DEAL page.
            </p>

            <div className="mt-6 rounded-2xl border border-primary/20 bg-accent/60 p-4">
              <div className="flex items-center gap-4">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white">
                  <ImagePlus className="h-6 w-6 text-primary" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold text-foreground">Upload a clear photo of you</p>
                  <p className="text-xs font-medium text-muted-foreground">
                    JPG, PNG or WEBP. Max 5MB.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-primary/40 font-bold text-primary"
                  onClick={() =>
                    toast.info("Photo upload is coming soon", {
                      description: "Your profile works great without it for this demo.",
                    })
                  }
                >
                  Upload
                </Button>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="text-[13px] font-extrabold text-foreground">Display name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Tobi A."
                  className="mt-1.5 h-12 rounded-xl bg-muted/60 font-semibold"
                />
              </div>
              <div className="relative">
                <label className="text-[13px] font-extrabold text-foreground">What do you do?</label>
                <button
                  type="button"
                  onClick={() => setCraftOpen((v) => !v)}
                  className="mt-1.5 flex h-12 w-full items-center justify-between rounded-xl border border-input bg-muted/60 px-4 text-left text-[15px] font-semibold text-foreground"
                >
                  <span className={craft ? "" : "text-muted-foreground"}>
                    {craft || "Select your main creative service"}
                  </span>
                  <ChevronDown className="h-4.5 w-4.5 text-muted-foreground" />
                </button>
                {craftOpen && (
                  <ul className="absolute z-20 mt-1 w-full rounded-xl border border-border bg-white p-1 shadow-lg">
                    {CRAFTS.map((c) => (
                      <li key={c}>
                        <button
                          type="button"
                          onClick={() => {
                            setCraft(c);
                            setCraftOpen(false);
                          }}
                          className="w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-foreground hover:bg-accent"
                        >
                          {c}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <label className="text-[13px] font-extrabold text-foreground">Location</label>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Akure, Ondo State"
                  className="mt-1.5 h-12 rounded-xl bg-muted/60 font-semibold"
                />
              </div>
              <div>
                <label className="text-[13px] font-extrabold text-foreground">Short bio</label>
                <Textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, 120))}
                  placeholder="Tell clients a bit about you and your work"
                  className="mt-1.5 min-h-24 rounded-xl bg-muted/60 font-semibold"
                />
                <p className="mt-1 text-right text-xs font-semibold text-muted-foreground">{bio.length}/120</p>
              </div>

              {/* how clients reach you */}
              <div>
                <label className="text-[13px] font-extrabold text-foreground">How clients reach you</label>
                <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                  Shown on your public page — clients tap to message you directly.
                </p>
                <div className="mt-2 space-y-2">
                  {channels.map((channel, i) => {
                    const meta = CHANNEL_META[channel.type];
                    if (!meta) return null;
                    const Icon = meta.icon;
                    return (
                      <div
                        key={`${channel.type}-${channel.value}-${i}`}
                        className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent">
                          <Icon className="h-4 w-4 text-primary" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-extrabold text-foreground">{meta.label}</p>
                          <p className="truncate text-xs font-semibold text-muted-foreground">{channel.value}</p>
                        </div>
                        <button
                          type="button"
                          aria-label={channel.primary ? `Primary channel` : `Make ${meta.label} primary`}
                          aria-pressed={channel.primary}
                          onClick={() => makePrimaryChannel(i)}
                          className="rounded-md p-1.5 transition-colors hover:bg-muted"
                        >
                          <Star
                            className={cn(
                              "h-4 w-4",
                              channel.primary ? "fill-amber-400 text-amber-400" : "text-muted-foreground/50"
                            )}
                          />
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${meta.label} channel`}
                          onClick={() => removeChannel(i)}
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-red-500"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}

                  {channels.length === 0 ? (
                    <p className="rounded-xl bg-muted/60 p-3 text-[12px] font-semibold text-muted-foreground">
                      Add at least one way for clients to reach you.
                    </p>
                  ) : null}

                  <div className="flex gap-2">
                    <Select value={channelType} onValueChange={(v) => setChannelType(v as ChannelType)}>
                      <SelectTrigger
                        aria-label="Channel type"
                        className="h-11 w-[9.5rem] shrink-0 rounded-xl bg-muted/60 font-semibold"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CHANNEL_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {CHANNEL_META[t].label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={channelValue}
                      onChange={(e) => setChannelValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addChannel();
                        }
                      }}
                      placeholder={CHANNEL_META[channelType].placeholder}
                      aria-label="Channel value"
                      className="h-11 min-w-0 flex-1 rounded-xl bg-muted/60 font-semibold"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      aria-label="Add channel"
                      onClick={addChannel}
                      className="h-11 shrink-0 rounded-xl border-primary/40 px-3.5 font-bold text-primary"
                    >
                      <Plus className="h-4.5 w-4.5" />
                    </Button>
                  </div>
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Tap the star to set your primary channel — that&rsquo;s the one shown first.
                  </p>
                </div>
              </div>
            </div>

            <Button
              type="button"
              onClick={saveProfile}
              disabled={busy}
              className="mt-6 h-13 w-full rounded-xl text-[15px] font-bold"
            >
              {busy ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <>Continue <ArrowRight className="ml-1 h-4.5 w-4.5" /></>}
            </Button>
            <p className="mt-3 text-center text-xs font-semibold text-muted-foreground">
              Info you add here can be changed anytime
            </p>
          </div>
        )}

        {/* STEP 2 — services */}
        {step === 1 && (
          <div className="mt-7 flex-1">
            <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-foreground">
              What services do
              <br />
              you <span className="text-primary">offer?</span>
            </h1>
            <p className="mt-2 text-[15px] font-medium text-muted-foreground">
              Add the services you want clients to book you for. You can add more or edit later.
            </p>

            <div className="mt-6 space-y-3">
              {services.map((svc, i) => (
                <div key={i} className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-card p-4">
                  <div className="min-w-0">
                    <p className="text-[15px] font-extrabold text-foreground">{svc.title}</p>
                    <p className="mt-0.5 text-[13px] font-medium leading-relaxed text-muted-foreground">
                      {svc.desc}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">From</p>
                    <p className="text-[15px] font-extrabold text-foreground">{formatNaira(svc.from)}</p>
                  </div>
                </div>
              ))}

              {services.length === 0 && (
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="w-full rounded-2xl border border-primary/30 bg-accent/50 p-4 text-center transition-colors hover:bg-accent"
                >
                  <p className="flex items-center justify-center gap-2 text-sm font-extrabold text-primary">
                    <Plus className="h-4.5 w-4.5" /> Add your first service
                  </p>
                  <p className="mt-1 text-xs font-medium text-muted-foreground">
                    e.g. Portrait Session — from ₦50,000
                  </p>
                </button>
              )}

              {services.length > 0 && (
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="w-full rounded-2xl border border-dashed border-primary/40 p-4 text-center font-extrabold text-primary transition-colors hover:bg-accent/50"
                >
                  + Add another service
                </button>
              )}
            </div>

            <Button
              type="button"
              onClick={saveServicesAndPreview}
              disabled={busy}
              className="mt-6 h-13 w-full rounded-xl text-[15px] font-bold"
            >
              {busy ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <>Continue to preview <ArrowRight className="ml-1 h-4.5 w-4.5" /></>}
            </Button>
          </div>
        )}

        {/* STEP 3 — preview */}
        {step === 2 && (
          <div className="mt-7 flex-1">
            <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-foreground">
              Preview your
              <br />
              <span className="text-primary">DEAL page</span>
            </h1>
            <p className="mt-2 text-[15px] font-medium text-muted-foreground">
              This is how clients will see you when they click your "Work with me" link.
            </p>

            <div className="mt-6 overflow-hidden rounded-2xl border border-border">
              <div className="bg-gradient-to-br from-emerald-700 via-emerald-600 to-emerald-500 px-5 pb-10 pt-8">
                <div className="flex items-center gap-3">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white/70 bg-emerald-800 text-xl font-extrabold text-white">
                    {(name || user?.name || "D").slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <p className="text-lg font-extrabold text-white">{name || user?.name}</p>
                    <p className="text-[13px] font-bold text-emerald-50">
                      {craft || "Creative"} {location ? `· ${location}` : ""}
                    </p>
                  </div>
                </div>
                {bio ? (
                  <p className="mt-3 text-[13px] font-medium leading-relaxed text-emerald-50">{bio}</p>
                ) : null}
              </div>
              <div className="bg-white p-4">
                <p className="text-center text-lg font-extrabold text-foreground">Work with me 👋</p>
                <div className="mt-3 space-y-2">
                  {services.length === 0 && (
                    <p className="rounded-xl bg-muted p-4 text-center text-sm font-semibold text-muted-foreground">
                      Your services will appear here
                    </p>
                  )}
                  {(services.length > 0 ? services : []).map((svc, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-extrabold text-foreground">{svc.title}</p>
                        <p className="truncate text-xs font-medium text-muted-foreground">{svc.desc}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[10px] font-bold text-muted-foreground">From</p>
                        <p className="text-sm font-extrabold text-foreground">{formatNaira(svc.from)}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-border bg-muted/60 px-3 py-3">
                  <Camera className="h-4 w-4 shrink-0 text-primary" />
                  <p className="text-[11px] font-semibold text-muted-foreground">
                    You can make changes anytime before publishing.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <Button type="button" variant="outline" className="h-13 flex-1 rounded-xl font-bold" onClick={() => setStep(1)}>
                ← Back
              </Button>
              <Button type="button" onClick={publish} disabled={busy} className="h-13 flex-[2] rounded-xl font-bold">
                {busy ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <>Looks good, publish my page <ArrowRight className="ml-1 h-4.5 w-4.5" /></>}
              </Button>
            </div>
          </div>
        )}

        {/* STEP 4 — published */}
        {step === 3 && (
          <div className="mt-8 flex-1">
            <div className="flex justify-center">
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-accent ring-8 ring-accent/40">
                <Check className="h-9 w-9 text-primary" strokeWidth={3} />
              </span>
            </div>
            <h1 className="mt-5 text-center text-[26px] font-extrabold tracking-tight text-foreground">
              Your <span className="text-primary">DEAL</span> page is live!
            </h1>
            <p className="mx-auto mt-2 max-w-xs text-center text-[15px] font-medium text-muted-foreground">
              Clients can now view your services and send you requests to work together.
            </p>

            <p className="mt-6 text-[13px] font-extrabold text-foreground">Your public link</p>
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-border bg-card p-2 pl-3">
              <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">
                deal.ng/{user?.handle}
              </p>
              <Button
                type="button"
                size="sm"
                className="shrink-0 rounded-lg font-bold"
                onClick={() => {
                  navigator.clipboard?.writeText(publicLink).catch(() => undefined);
                  toast.success("Link copied!");
                }}
              >
                Copy link
              </Button>
            </div>
            <p className="mt-2 text-center text-xs font-medium text-muted-foreground">
              Add it to your Instagram bio, WhatsApp and anywhere clients can find you.
            </p>

            <div className="mt-6 rounded-2xl border border-border bg-card p-4">
              <p className="text-center text-[15px] font-extrabold text-foreground">How it works</p>
              <ol className="mt-4 space-y-4">
                {[
                  ["Clients find your link", "They click your “Work with me” link from Instagram, WhatsApp or anywhere."],
                  ["They send a request", "Clients choose a service and send you the details of what they need."],
                  ["You create a DEAL", "Agree on scope, timeline and price, then send a DEAL to your client."],
                  ["Get paid & deliver", "Client pays a deposit, you deliver the work, and get paid the balance. Done!"],
                ].map(([title, desc], i) => (
                  <li key={title} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-extrabold text-white">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-extrabold text-foreground">{title}</p>
                      <p className="text-[13px] font-medium leading-relaxed text-muted-foreground">{desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <Button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="mt-6 h-13 w-full rounded-xl text-[15px] font-bold"
            >
              Go to my dashboard <ArrowRight className="ml-1 h-4.5 w-4.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(`/u/${user?.handle}`)}
              className="mt-3 h-13 w-full rounded-xl border-primary/40 font-bold text-primary hover:bg-accent"
            >
              <Share2 className="mr-2 h-4.5 w-4.5" /> View my public page
            </Button>
          </div>
        )}
      </div>

      {/* add service dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent aria-describedby={undefined} className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-extrabold">Add a service</DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5">
            <div>
              <label className="text-[13px] font-extrabold">Service name</label>
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="e.g. Portrait Session"
                className="mt-1.5 h-11 rounded-xl bg-muted/60 font-semibold"
              />
            </div>
            <div>
              <label className="text-[13px] font-extrabold">Short description</label>
              <Input
                value={draft.desc}
                onChange={(e) => setDraft({ ...draft, desc: e.target.value })}
                placeholder="e.g. Studio or outdoor portraits for individuals."
                className="mt-1.5 h-11 rounded-xl bg-muted/60 font-semibold"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[13px] font-extrabold">Starting from (₦)</label>
                <Input
                  value={draft.from}
                  onChange={(e) => setDraft({ ...draft, from: e.target.value.replace(/[^0-9]/g, "") })}
                  placeholder="50000"
                  inputMode="numeric"
                  className="mt-1.5 h-11 rounded-xl bg-muted/60 font-semibold"
                />
              </div>
              <div>
                <label className="text-[13px] font-extrabold">Duration</label>
                <Input
                  value={draft.duration}
                  onChange={(e) => setDraft({ ...draft, duration: e.target.value })}
                  placeholder="1–2 hrs"
                  className="mt-1.5 h-11 rounded-xl bg-muted/60 font-semibold"
                />
              </div>
            </div>
            <Button
              type="button"
              onClick={() => {
                if (!draft.title.trim() || !draft.from) {
                  toast.error("Add a service name and starting price.");
                  return;
                }
                setServices((prev) => [
                  ...prev,
                  {
                    title: draft.title.trim(),
                    desc: draft.desc.trim() || "Tell clients what's included.",
                    from: Number(draft.from),
                    duration: draft.duration,
                    includes: [],
                  },
                ]);
                setDraft({ title: "", desc: "", from: "", duration: "2–3 hrs" });
                setAddOpen(false);
                toast.success("Service added");
              }}
              className="h-11 w-full rounded-xl font-bold"
            >
              Add service
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
