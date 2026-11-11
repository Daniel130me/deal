"use client";

import { useState } from "react";
import { ArrowRight, Check, FileCheck2, Loader2, Lock, Mail, ShieldCheck, User, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/landing/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type SessionUser } from "@/lib/api";
import { useApp } from "@/components/app/context";

export default function AuthScreen({
  mode,
  redirectTo,
}: {
  mode: "login" | "signup";
  redirectTo?: string;
}) {
  const { setUser, navigate } = useApp();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const authenticatedDestination = redirectTo
    ? `/${redirectTo.replace(/^\/+/, "")}`
    : "/dashboard";

  async function enter(user: SessionUser) {
    setUser(user);
    navigate(user.onboarded ? authenticatedDestination : "/onboarding");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "signup") {
        if (!name.trim() || !contact.trim() || password.length < 8) {
          toast.error("Check your details", {
            description: "Name, email/phone and an 8+ character password are required.",
          });
          return;
        }
        const { user } = await api.signup({ name, contact, password });
        setUser(user);
        navigate("/onboarding");
        toast.success(`Welcome to DEAL, ${name.split(" ")[0]}!`);
      } else {
        const { user } = await api.login({ contact, password });
        setUser(user);
        navigate(user.onboarded ? authenticatedDestination : "/onboarding");
        toast.success(`Welcome back, ${user.name.split(" ")[0]}!`);
      }
    } catch (err) {
      toast.error("Couldn't continue", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#edf3ef] p-0 lg:p-6">
      <main className="mx-auto grid min-h-screen w-full max-w-7xl overflow-hidden bg-background lg:min-h-[calc(100vh-3rem)] lg:grid-cols-[1.05fr_0.95fr] lg:rounded-[2rem] lg:shadow-[0_28px_80px_-36px_rgba(14,31,51,0.28)]">
        <section className="relative hidden overflow-hidden bg-[#0b3d2b] px-12 py-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-35"
            style={{
              backgroundImage:
                "radial-gradient(36rem 24rem at 15% 5%, rgba(65,196,126,.45), transparent 60%), radial-gradient(28rem 20rem at 90% 95%, rgba(16,185,129,.28), transparent 60%)",
            }}
          />
          <div className="relative">
            <Logo wordmarkClassName="text-white" />
            <p className="mt-20 max-w-xl text-5xl font-extrabold leading-[1.04] tracking-[-0.045em] text-balance">
              Clear terms before the work starts.
            </p>
            <p className="mt-5 max-w-lg text-lg font-medium leading-relaxed text-emerald-100/90">
              Put scope, payment stages and delivery records in one place your client can review.
            </p>
          </div>
          <div className="relative grid gap-3 sm:grid-cols-3">
            {[
              [FileCheck2, "Written scope", "Everyone sees the same agreement."] as const,
              [WalletCards, "Payment record", "Provider-confirmed charges stay attached."] as const,
              [ShieldCheck, "Protected files", "Review copies stay separate from originals."] as const,
            ].map(([Icon, title, copy]) => (
              <div key={String(title)} className="rounded-2xl border border-white/12 bg-white/8 p-4 backdrop-blur-sm">
                <Icon className="h-5 w-5 text-emerald-200" />
                <p className="mt-4 text-sm font-extrabold">{String(title)}</p>
                <p className="mt-1 text-xs font-medium leading-relaxed text-emerald-100/75">{String(copy)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex min-h-screen flex-col px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6 sm:px-12 lg:min-h-0 lg:px-16 lg:py-12">
        <button
          type="button"
          onClick={() => navigate("/")}
          aria-label="Back to landing page"
          className="flex items-center gap-2 self-start rounded-md focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Logo />
        </button>

        <div className="my-auto w-full max-w-xl py-10 lg:py-16">
          <div>
          <p className="mb-3 inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[0.14em] text-primary">
            <Check className="h-3.5 w-3.5" /> Creator workspace
          </p>
          <h1 className="text-4xl font-extrabold leading-[1.06] tracking-[-0.04em] text-foreground sm:text-5xl">
            {mode === "signup" ? (
              <>
                Create your <span className="text-primary">DEAL account</span>
              </>
            ) : (
              <>
                Welcome back to <span className="text-primary">DEAL</span>
              </>
            )}
          </h1>
          <p className="mt-2 text-[15px] font-medium text-muted-foreground">
            {mode === "signup"
              ? "Send clear agreements, get paid in milestones and deliver with confidence."
              : "Log in to manage your deals, requests and payment records."}
          </p>
          </div>

        <form onSubmit={submit} className="mt-8 space-y-4">
          {mode === "signup" && (
            <div className="relative">
              <User className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                autoComplete="name"
                className="h-12 rounded-xl border-input bg-muted/60 pl-11 font-semibold"
              />
            </div>
          )}
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Email or phone number"
              autoComplete="username"
              className="h-12 rounded-xl border-input bg-muted/60 pl-11 font-semibold"
            />
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "signup" ? "Create a password (8+ characters)" : "Password"}
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className="h-12 rounded-xl border-input bg-muted/60 pl-11 font-semibold"
            />
          </div>

          <Button
            type="submit"
            disabled={busy}
            className="h-12 w-full rounded-xl text-[15px] font-bold shadow-md shadow-primary/25"
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4.5 w-4.5 animate-spin" />
                Please wait…
              </>
            ) : (
              <>
                {mode === "signup" ? "Create my DEAL account" : "Log in"}
                <ArrowRight className="ml-1 h-4.5 w-4.5" />
              </>
            )}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm font-semibold text-muted-foreground">
          {mode === "signup" ? (
            <>
              Already have an account?{" "}
              <button type="button" onClick={() => navigate("/login")} className="font-extrabold text-primary">
                Log in
              </button>
            </>
          ) : (
            <>
              New to DEAL?{" "}
              <button type="button" onClick={() => navigate("/signup")} className="font-extrabold text-primary">
                Create a free account
              </button>
            </>
          )}
        </p>
        </div>
        </section>
      </main>
    </div>
  );
}
