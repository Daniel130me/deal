"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Copy,
  Loader2,
  MapPin,
  Minus,
  PartyPopper,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppCanvas } from "@/components/app/chrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { useApp } from "@/components/app/context";
import {
  formatNaira,
  formatDate,
  paymentSchedule,
  type ChannelType,
  type ClientRequest,
  type Deal,
  type DealPayment,
  type Service,
} from "@/lib/types";
import { CHANNEL_META } from "@/lib/channels";
import { cn } from "@/lib/utils";

const WIZARD_STEPS = ["Deal details", "Scope", "Terms", "Review"];

interface WizardState {
  title: string;
  clientName: string;
  clientContact: string;
  summary: string;
  eventDate: string;
  location: string;
  message: string;
  serviceTitle: string;
  scope: string;
  deliverables: string[];
  price: number;
  depositPercent: number;
  installmentsCount: number;
  startDate: string;
  dueDate: string;
  revisions: number;
}

const SHARE_CHANNEL_TYPES: ChannelType[] = ["whatsapp", "telegram", "email"];

function shareHref(type: ChannelType, url: string, text: string) {
  if (type === "whatsapp") return `https://wa.me/?text=${encodeURIComponent(text)}`;
  if (type === "telegram")
    return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  return `mailto:?subject=${encodeURIComponent("A deal for you on DEAL")}&body=${encodeURIComponent(text)}`;
}

export default function WizardScreen({ requestParam }: { requestParam: string | null }) {
  const { user, navigate } = useApp();
  const requestId = requestParam?.startsWith("r-") ? requestParam.slice(2) : null;

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [linkedRequest, setLinkedRequest] = useState<ClientRequest | null>(null);
  const [deliverableDraft, setDeliverableDraft] = useState("");
  const [sentDeal, setSentDeal] = useState<Deal | null>(null);

  const [form, setForm] = useState<WizardState>({
    title: "",
    clientName: "",
    clientContact: "",
    summary: "",
    eventDate: "",
    location: "",
    message: "",
    serviceTitle: "",
    scope: "",
    deliverables: [],
    price: 0,
    depositPercent: 50,
    installmentsCount: 2,
    startDate: "",
    dueDate: "",
    revisions: 2,
  });

  const set = <K extends keyof WizardState>(key: K, value: WizardState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (!user) return;
    api.deals(user.id).catch(() => undefined);
    fetch(`/api/users/${user.id}/services`)
      .then((r) => r.json())
      .then((d) => setServices(d.services ?? []))
      .catch(() => undefined);
    if (requestId) {
      api
        .requestDetail(requestId)
        .then(({ request: req, service }) => {
          setLinkedRequest(req);
          setForm((prev) => ({
            ...prev,
            title: service ? `${service.title}` : "Custom deal",
            serviceTitle: service?.title ?? "",
            clientName: req.clientName,
            clientContact: req.clientContact,
            eventDate: req.eventDate,
            location: req.location,
            price: service?.from ?? req.budgetMax ?? 0,
            summary: req.description,
            message: `Hi ${req.clientName},\n\nI'm excited to send you this custom deal. Please review the details and let me know if you have any questions.`,
            scope: req.description,
          }));
        })
        .catch(() => undefined);
    }
  }, [user, requestId]);

  const deposit = useMemo(
    () => Math.round((form.price * form.depositPercent) / 100),
    [form.price, form.depositPercent]
  );
  const balance = useMemo(() => form.price - deposit, [form.price, deposit]);

  // ideal schedule preview for the Review step (no deal exists yet, so we cast a minimal shape)
  const previewDeal = useMemo(
    () =>
      ({
        price: form.price,
        depositPercent: form.depositPercent,
        installmentsCount: form.depositPercent >= 100 ? 0 : form.installmentsCount,
        payments: [] as DealPayment[],
      } as Deal),
    [form.price, form.depositPercent, form.installmentsCount]
  );
  const previewSchedule = useMemo(() => paymentSchedule(previewDeal), [previewDeal]);

  function validateStep(current: number): string | null {
    if (current === 0) {
      if (!form.title.trim()) return "Give this deal a clear title.";
      if (!form.clientName.trim()) return "Who is this deal for? Add the client's name.";
      if (!form.clientContact.trim()) return "Add an email or phone so the client can be reached.";
    }
    if (current === 1) {
      if (!form.scope.trim()) return "Describe the scope of work.";
      if (form.deliverables.length === 0) return "Add at least one deliverable.";
    }
    if (current === 2) {
      if (!form.price || form.price <= 0) return "Set a price for this deal.";
      if (!form.dueDate) return "Add a delivery due date.";
    }
    return null;
  }

  function next() {
    const problem = validateStep(step);
    if (problem) {
      toast.error(problem);
      return;
    }
    setStep((s) => Math.min(s + 1, 3));
  }

  async function submit(send: boolean) {
    if (!user) return;
    const problem = validateStep(0) ?? validateStep(1) ?? validateStep(2);
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(true);
    try {
      const { deal } = await api.createDeal({
        creatorId: user.id,
        requestId: linkedRequest?.id ?? null,
        title: form.title,
        serviceTitle: form.serviceTitle,
        clientName: form.clientName,
        clientContact: form.clientContact,
      });
      await api.updateDeal(deal.id, {
        summary: form.summary,
        eventDate: form.eventDate,
        location: form.location,
        message: form.message,
        scope: form.scope,
        deliverables: form.deliverables,
        price: form.price,
        depositPercent: form.depositPercent,
        installmentsCount: form.depositPercent >= 100 ? 0 : form.installmentsCount,
        startDate: form.startDate,
        dueDate: form.dueDate,
        revisions: form.revisions,
      });
      if (send) {
        const { deal: sent } = await api.dealAction(deal.id, { action: "send" });
        setSentDeal(sent);
        toast.success("Deal sent!");
      } else {
        toast.success("Draft saved", {
          description: "Find it under Projects — you can finish and send it anytime.",
        });
        navigate("/deals");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save this deal.");
    } finally {
      setBusy(false);
    }
  }

  /* ---------------- sent confirmation ---------------- */
  if (sentDeal) {
    const shareUrl = `${window.location.origin}/#/c/${sentDeal.shareToken}`;
    const shareText = `Hi ${sentDeal.client.name}! I've sent you a deal on DEAL for "${sentDeal.title}" (${formatNaira(sentDeal.price)}). Review and accept here: ${shareUrl}`;
    const myChannels =
      user && (user.channels?.length ?? 0) > 0
        ? (user.channels ?? [])
        : user?.whatsapp
          ? [{ type: "whatsapp" as ChannelType, value: user.whatsapp, primary: true }]
          : [];
    const shareChannels = myChannels.filter((c) => SHARE_CHANNEL_TYPES.includes(c.type));
    return (
      <AppCanvas backHref="/dashboard">
        <div className="flex flex-1 flex-col px-5 pb-10 pt-8">
          <div className="flex justify-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-accent ring-8 ring-accent/40">
              <Check className="h-9 w-9 text-primary" strokeWidth={3} />
            </span>
          </div>
          <h1 className="mt-5 text-center text-2xl font-extrabold tracking-tight text-foreground">
            Your deal has been <span className="text-primary">sent!</span>
          </h1>
          <p className="mx-auto mt-2 max-w-xs text-center text-[15px] font-medium text-muted-foreground">
            {sentDeal.client.name} will review and accept. You'll be notified once they pay the
            deposit.
          </p>

          <div className="mt-6 rounded-2xl border border-border bg-card p-4">
            <p className="text-[13px] font-extrabold text-foreground">Client link</p>
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-border bg-muted/60 p-2 pl-3">
              <p className="min-w-0 flex-1 truncate text-[13px] font-bold text-foreground">{shareUrl}</p>
              <Button
                type="button"
                size="sm"
                className="shrink-0 rounded-lg font-bold"
                onClick={() => {
                  navigator.clipboard?.writeText(shareUrl).catch(() => undefined);
                  toast.success("Link copied!");
                }}
              >
                <Copy className="mr-1 h-3.5 w-3.5" /> Copy
              </Button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {shareChannels.map((channel) => {
                const meta = CHANNEL_META[channel.type];
                const Icon = meta.icon;
                const label =
                  channel.type === "whatsapp"
                    ? "Share on WhatsApp"
                    : channel.type === "telegram"
                      ? "Share via Telegram"
                      : "Share via Email";
                return (
                  <a
                    key={`${channel.type}-${channel.value}`}
                    href={shareHref(channel.type, shareUrl, shareText)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-11 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-accent text-[13px] font-extrabold text-accent-foreground transition-colors hover:bg-primary hover:text-white"
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </a>
                );
              })}
              <Button
                type="button"
                className="col-span-2 h-11 rounded-xl font-bold"
                onClick={() => {
                  navigator.clipboard?.writeText(shareUrl).catch(() => undefined);
                  toast.success("Link copied!");
                }}
              >
                <Copy className="mr-1.5 h-4 w-4" /> Copy link
              </Button>
            </div>
          </div>

          <Button
            type="button"
            onClick={() => navigate(`/deals/${sentDeal.id}`)}
            className="mt-6 h-13 w-full rounded-xl font-bold"
          >
            View deal <ArrowRight className="ml-1 h-4.5 w-4.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/dashboard")}
            className="mt-3 h-13 w-full rounded-xl font-bold"
          >
            Back to dashboard
          </Button>
        </div>
      </AppCanvas>
    );
  }

  /* ---------------- wizard ---------------- */
  return (
    <AppCanvas backHref="/dashboard">
      <div className="flex-1 px-5 pb-10 pt-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold tracking-tight text-foreground">Create DEAL</h1>
          <p className="text-[13px] font-bold text-muted-foreground">
            Step {step + 1} of 4
          </p>
        </div>

        {/* progress */}
        <ol className="mt-4 flex items-center">
          {WIZARD_STEPS.map((label, i) => (
            <li key={label} className={cn("flex items-center", i < WIZARD_STEPS.length - 1 && "flex-1")}>
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
                    "mt-1.5 whitespace-nowrap text-[11px] font-extrabold",
                    i === step ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {label}
                </span>
              </div>
              {i < WIZARD_STEPS.length - 1 && (
                <span className={cn("mx-2 mb-5 h-0.5 flex-1", i < step ? "bg-primary" : "bg-border")} />
              )}
            </li>
          ))}
        </ol>

        {/* STEP 1 — deal details */}
        {step === 0 && (
          <div className="mt-6 space-y-4">
            {linkedRequest && (
              <p className="rounded-xl border border-primary/20 bg-accent/60 px-4 py-3 text-[13px] font-bold text-accent-foreground">
                Creating a proposal for {linkedRequest.clientName}'s request ({linkedRequest.ref})
              </p>
            )}
            <div>
              <label className="text-[13px] font-extrabold text-foreground">
                Deal title <span className="text-red-500">*</span>
              </label>
              <Input
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="e.g. Pre-wedding Photography Package"
                className="mt-1.5 h-12 rounded-xl bg-muted/60 font-semibold"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[13px] font-extrabold text-foreground">
                  Client name <span className="text-red-500">*</span>
                </label>
                <Input
                  value={form.clientName}
                  onChange={(e) => set("clientName", e.target.value)}
                  placeholder="e.g. Lola & Tunde"
                  className="mt-1.5 h-12 rounded-xl bg-muted/60 font-semibold"
                />
              </div>
              <div>
                <label className="text-[13px] font-extrabold text-foreground">
                  Client contact <span className="text-red-500">*</span>
                </label>
                <Input
                  value={form.clientContact}
                  onChange={(e) => set("clientContact", e.target.value)}
                  placeholder="Email or phone"
                  className="mt-1.5 h-12 rounded-xl bg-muted/60 font-semibold"
                />
              </div>
            </div>
            <div>
              <label className="text-[13px] font-extrabold text-foreground">Short summary</label>
              <Textarea
                value={form.summary}
                onChange={(e) => set("summary", e.target.value.slice(0, 300))}
                placeholder="Briefly describe this deal and what it covers…"
                className="mt-1.5 min-h-20 rounded-xl bg-muted/60 font-semibold"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[13px] font-extrabold text-foreground">Event date</label>
                <Input
                  value={form.eventDate}
                  onChange={(e) => set("eventDate", e.target.value)}
                  type="date"
                  className="mt-1.5 h-12 rounded-xl bg-muted/60 font-semibold"
                />
              </div>
              <div>
                <label className="text-[13px] font-extrabold text-foreground">Location</label>
                <Input
                  value={form.location}
                  onChange={(e) => set("location", e.target.value)}
                  placeholder="e.g. Ikoyi, Lagos"
                  className="mt-1.5 h-12 rounded-xl bg-muted/60 font-semibold"
                />
              </div>
            </div>
            <div>
              <label className="text-[13px] font-extrabold text-foreground">
                Message to client <span className="font-semibold text-muted-foreground">(optional)</span>
              </label>
              <Textarea
                value={form.message}
                onChange={(e) => set("message", e.target.value.slice(0, 1000))}
                placeholder={`Hi ${form.clientName || "there"}, I'm excited to send you this deal…`}
                className="mt-1.5 min-h-24 rounded-xl bg-muted/60 font-semibold"
              />
            </div>
          </div>
        )}

        {/* STEP 2 — scope & deliverables */}
        {step === 1 && (
          <div className="mt-6 space-y-4">
            <div>
              <label className="text-[13px] font-extrabold text-foreground">Service</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {services.map((svc) => (
                  <button
                    key={svc.id}
                    type="button"
                    onClick={() => {
                      set("serviceTitle", svc.title);
                      if (!form.price) set("price", svc.from);
                      if (form.deliverables.length === 0 && svc.includes.length) {
                        set("deliverables", svc.includes.slice(0, 4));
                      }
                    }}
                    className={cn(
                      "rounded-full border px-3.5 py-2 text-[13px] font-bold transition-colors",
                      form.serviceTitle === svc.title
                        ? "border-primary bg-accent text-accent-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {svc.title}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => set("serviceTitle", "Custom service")}
                  className={cn(
                    "rounded-full border px-3.5 py-2 text-[13px] font-bold transition-colors",
                    form.serviceTitle === "Custom service"
                      ? "border-primary bg-accent text-accent-foreground"
                      : "border-dashed border-primary/40 text-primary hover:bg-accent/50"
                  )}
                >
                  + Custom
                </button>
              </div>
            </div>
            <div>
              <label className="text-[13px] font-extrabold text-foreground">
                Scope of work <span className="text-red-500">*</span>
              </label>
              <Textarea
                value={form.scope}
                onChange={(e) => set("scope", e.target.value)}
                placeholder="Describe exactly what you'll do — hours, locations, styles, what's included…"
                className="mt-1.5 min-h-28 rounded-xl bg-muted/60 font-semibold"
              />
            </div>
            <div>
              <label className="text-[13px] font-extrabold text-foreground">
                Deliverables <span className="text-red-500">*</span>
              </label>
              <div className="mt-2 space-y-2">
                {form.deliverables.map((d, i) => (
                  <div
                    key={`${d}-${i}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5"
                  >
                    <p className="min-w-0 flex-1 truncate text-[13px] font-bold text-foreground">{d}</p>
                    <button
                      type="button"
                      aria-label={`Remove ${d}`}
                      onClick={() => set("deliverables", form.deliverables.filter((_, j) => j !== i))}
                      className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input
                    value={deliverableDraft}
                    onChange={(e) => setDeliverableDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && deliverableDraft.trim()) {
                        e.preventDefault();
                        set("deliverables", [...form.deliverables, deliverableDraft.trim()]);
                        setDeliverableDraft("");
                      }
                    }}
                    placeholder="e.g. 40+ high-resolution edited photos"
                    className="h-11 flex-1 rounded-xl bg-muted/60 font-semibold"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 rounded-xl border-primary/40 px-4 font-bold text-primary"
                    onClick={() => {
                      if (!deliverableDraft.trim()) return;
                      set("deliverables", [...form.deliverables, deliverableDraft.trim()]);
                      setDeliverableDraft("");
                    }}
                  >
                    <Plus className="h-4.5 w-4.5" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3 — terms */}
        {step === 2 && (
          <div className="mt-6 space-y-4">
            <div>
              <label className="text-[13px] font-extrabold text-foreground">
                Price (₦) <span className="text-red-500">*</span>
              </label>
              <Input
                value={form.price ? String(form.price) : ""}
                onChange={(e) => set("price", Number(e.target.value.replace(/[^0-9]/g, "")))}
                placeholder="120000"
                inputMode="numeric"
                className="mt-1.5 h-12 rounded-xl bg-muted/60 text-lg font-extrabold"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {[50000, 80000, 120000, 150000].map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => set("price", amount)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-bold transition-colors",
                      form.price === amount
                        ? "border-primary bg-accent text-accent-foreground"
                        : "border-border bg-card text-muted-foreground"
                    )}
                  >
                    {formatNaira(amount)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[13px] font-extrabold text-foreground">Payment structure</label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {[
                  { pct: 50, label: "50 / 50", sub: "Deposit first" },
                  { pct: 70, label: "70 / 30", sub: "Deposit first" },
                  { pct: 100, label: "100%", sub: "Upfront" },
                ].map((opt) => (
                  <button
                    key={opt.pct}
                    type="button"
                    onClick={() => {
                      set("depositPercent", opt.pct);
                      if (opt.pct >= 100) set("installmentsCount", 0);
                      else if (form.installmentsCount === 0) set("installmentsCount", 2);
                    }}
                    className={cn(
                      "rounded-xl border p-3 text-center transition-colors",
                      form.depositPercent === opt.pct
                        ? "border-primary bg-accent"
                        : "border-border bg-card hover:bg-muted"
                    )}
                  >
                    <p className="text-sm font-extrabold text-foreground">{opt.label}</p>
                    <p className="text-[10px] font-bold text-muted-foreground">{opt.sub}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[13px] font-extrabold text-foreground">
                How should the balance be paid?
              </label>
              {form.depositPercent >= 100 ? (
                <p className="mt-2 rounded-xl bg-muted/60 p-3 text-[13px] font-semibold text-muted-foreground">
                  Deposit covers everything — no installments needed.
                </p>
              ) : (
                <>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[1, 2, 3].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => set("installmentsCount", n)}
                        className={cn(
                          "rounded-full border px-3.5 py-2 text-[13px] font-bold transition-colors",
                          form.installmentsCount === n
                            ? "border-primary bg-accent text-accent-foreground"
                            : "border-border bg-card text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {n === 1 ? "1 payment" : `${n} installments`}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] font-medium text-muted-foreground">
                    Equal parts of the {formatNaira(balance)} balance — clients can always pay
                    everything left in one go.
                  </p>
                </>
              )}
            </div>

            <div className="mt-2.5 rounded-xl bg-secondary p-3.5 text-[13px] font-semibold leading-relaxed text-secondary-foreground">
              Client pays <span className="font-extrabold text-primary">{formatNaira(deposit)}</span>{" "}
              deposit to start
              {form.depositPercent < 100 ? (
                <>
                  {" "}· the {formatNaira(balance)} balance is split into{" "}
                  <span className="font-extrabold text-foreground">
                    {form.installmentsCount} installment{form.installmentsCount === 1 ? "" : "s"}
                  </span>{" "}
                  (they can also pay it all at once)
                </>
              ) : null}
              . Every payment is held in Payaza escrow until your client approves the work — final
              files unlock after full payment.
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[13px] font-extrabold text-foreground">Work starts</label>
                <Input
                  value={form.startDate}
                  onChange={(e) => set("startDate", e.target.value)}
                  type="date"
                  className="mt-1.5 h-12 rounded-xl bg-muted/60 font-semibold"
                />
              </div>
              <div>
                <label className="text-[13px] font-extrabold text-foreground">
                  Delivery due <span className="text-red-500">*</span>
                </label>
                <Input
                  value={form.dueDate}
                  onChange={(e) => set("dueDate", e.target.value)}
                  type="date"
                  className="mt-1.5 h-12 rounded-xl bg-muted/60 font-semibold"
                />
              </div>
            </div>

            <div>
              <label className="text-[13px] font-extrabold text-foreground">Revisions included</label>
              <div className="mt-2 flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3">
                <button
                  type="button"
                  aria-label="Fewer revisions"
                  onClick={() => set("revisions", Math.max(0, form.revisions - 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground hover:bg-muted"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <p className="flex-1 text-center text-[15px] font-extrabold text-foreground">
                  {form.revisions} round{form.revisions === 1 ? "" : "s"}
                </p>
                <button
                  type="button"
                  aria-label="More revisions"
                  onClick={() => set("revisions", Math.min(5, form.revisions + 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground hover:bg-muted"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4 — review & send */}
        {step === 3 && (
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-primary">
                What your client will see
              </p>
              <h2 className="mt-2 text-lg font-extrabold leading-snug text-foreground">{form.title}</h2>
              <p className="text-[13px] font-semibold text-muted-foreground">
                For {form.clientName} · {form.clientContact}
              </p>
              {form.summary ? (
                <p className="mt-2 text-[13px] font-medium leading-relaxed text-foreground">{form.summary}</p>
              ) : null}
              <div className="mt-3 grid grid-cols-2 gap-2 text-[13px] font-semibold text-muted-foreground">
                {form.eventDate ? (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" /> {formatDate(form.eventDate)}
                  </span>
                ) : null}
                {form.location ? (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" /> {form.location}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-[13px] font-extrabold text-foreground">Scope</p>
              <p className="mt-1 text-[13px] font-medium leading-relaxed text-muted-foreground">{form.scope}</p>
              <p className="mt-3 text-[13px] font-extrabold text-foreground">Deliverables</p>
              <ul className="mt-1.5 space-y-1.5">
                {form.deliverables.map((d, i) => (
                  <li key={`${d}-${i}`} className="flex items-start gap-2 text-[13px] font-semibold text-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={3} />
                    {d}
                  </li>
                ))}
              </ul>
              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 text-[13px]">
                <div>
                  <p className="font-bold text-muted-foreground">Timeline</p>
                  <p className="mt-0.5 font-extrabold text-foreground">
                    {form.startDate ? formatDate(form.startDate) : "On deposit"} → {formatDate(form.dueDate)}
                  </p>
                </div>
                <div>
                  <p className="font-bold text-muted-foreground">Revisions</p>
                  <p className="mt-0.5 font-extrabold text-foreground">
                    {form.revisions} round{form.revisions === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-primary/20 bg-accent/60 p-4">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-extrabold text-accent-foreground">Payment plan</p>
                <p className="text-lg font-extrabold text-foreground">{formatNaira(form.price)}</p>
              </div>
              <div className="mt-2 divide-y divide-primary/10 border-t border-primary/10">
                {previewSchedule.map((slot) => (
                  <div key={slot.label} className="flex items-center justify-between py-2 text-[13px]">
                    <span className="font-semibold text-muted-foreground">{slot.label}</span>
                    <span className="font-extrabold text-foreground">{formatNaira(slot.amount)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] font-semibold leading-relaxed text-muted-foreground">
                Every payment is held in Payaza escrow and released to you only when the client
                approves the completed work.
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => submit(false)}
                className="h-13 flex-1 rounded-xl font-bold"
              >
                Save as draft
              </Button>
              <Button type="button" disabled={busy} onClick={() => submit(true)} className="h-13 flex-[1.4] rounded-xl font-bold">
                {busy ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <>Send deal <PartyPopper className="ml-1 hidden h-4.5 w-4.5" /> <ArrowRight className="ml-1 h-4.5 w-4.5" /></>}
              </Button>
            </div>
            <p className="flex items-center justify-center gap-1.5 text-center text-xs font-semibold text-muted-foreground">
              <ArrowLeft className="hidden h-3.5 w-3.5" />
              You can always edit and resend the deal before the client accepts it.
            </p>
          </div>
        )}

        {/* nav buttons for steps 0-2 */}
        {step < 3 && (
          <div className="mt-6 flex gap-3">
            {step > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep((s) => s - 1)}
                className="h-13 flex-1 rounded-xl font-bold"
              >
                ← Back
              </Button>
            )}
            <Button type="button" onClick={next} className="h-13 flex-[1.6] rounded-xl font-bold">
              Continue <ArrowRight className="ml-1 h-4.5 w-4.5" />
            </Button>
          </div>
        )}
      </div>
    </AppCanvas>
  );
}
