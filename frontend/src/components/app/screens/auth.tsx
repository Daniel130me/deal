"use client";

import { useState } from "react";
import { ArrowRight, Loader2, Lock, Mail, Sparkles, User } from "lucide-react";
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

  async function enter(user: SessionUser) {
    setUser(user);
    navigate(user.onboarded ? (redirectTo ? `/${redirectTo}` : "/dashboard") : "/onboarding");
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
        navigate(user.onboarded ? (redirectTo ? `/${redirectTo}` : "/dashboard") : "/onboarding");
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

  async function demoLogin() {
    if (busy) return;
    setBusy(true);
    try {
      const { user } = await api.login({ contact: "tobi@deal.ng", password: "demo1234" });
      setUser(user);
      navigate("/dashboard");
      toast.success("Signed in as Tobi A. — explore the full demo!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Demo login failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#edf3ef]">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col bg-background px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6">
        <button
          type="button"
          onClick={() => navigate("/")}
          aria-label="Back to landing page"
          className="flex items-center gap-2 self-start rounded-md focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Logo />
        </button>

        <div className="mt-10">
          <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-foreground">
            {mode === "signup" ? (
              <>
                Create your free
                <br />
                <span className="text-primary">DEAL account</span>
              </>
            ) : (
              <>
                Welcome back to
                <br />
                <span className="text-primary">DEAL</span>
              </>
            )}
          </h1>
          <p className="mt-2 text-[15px] font-medium text-muted-foreground">
            {mode === "signup"
              ? "Send clear agreements, get paid in milestones and deliver with confidence."
              : "Log in to manage your deals, requests and payouts."}
          </p>
        </div>

        <form onSubmit={submit} className="mt-7 space-y-3.5">
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

        <p className="mt-5 text-center text-sm font-semibold text-muted-foreground">
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

        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-[13px] font-semibold text-muted-foreground">or</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <button
          type="button"
          onClick={demoLogin}
          disabled={busy}
          className="flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-accent px-4 py-3.5 text-[14px] font-extrabold text-accent-foreground transition-colors hover:bg-primary hover:text-white"
        >
          <Sparkles className="h-4.5 w-4.5" />
          Explore the live demo as a creator
        </button>
        <p className="mt-3 text-center text-xs font-medium leading-relaxed text-muted-foreground">
          Demo creator: <span className="font-bold text-foreground">tobi@deal.ng</span> · password{" "}
          <span className="font-bold text-foreground">demo1234</span>. Clients don't need accounts —
          they open deals through a share link.
        </p>
      </div>
    </div>
  );
}
