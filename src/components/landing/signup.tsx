"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionHeading } from "@/components/landing/section-heading";
import { api } from "@/lib/api";
import { useApp } from "@/components/app/context";

const signupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter your full name")
    .max(80, "Name is too long"),
  contact: z
    .string()
    .trim()
    .min(7, "Enter your email or phone number")
    .max(80, "That looks too long")
    .refine(
      (value) =>
        /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) ||
        /^\+?[0-9][0-9\s-]{6,17}$/.test(value),
      "Enter a valid email or phone number"
    ),
  password: z
    .string()
    .min(8, "Use at least 8 characters")
    .max(100, "Password is too long"),
});

type SignupValues = z.infer<typeof signupSchema>;

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.87c2.27-2.09 3.58-5.17 3.58-8.81z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.1A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.29a12 12 0 0 0 0 10.76l3.98-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.76c1.76 0 3.34.6 4.59 1.8l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.29 6.62l3.98 3.1C6.22 6.87 8.87 4.76 12 4.76z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-foreground" aria-hidden="true">
      <path d="M17.05 12.54c-.03-2.89 2.36-4.27 2.47-4.34-1.35-1.97-3.44-2.24-4.18-2.27-1.78-.18-3.47 1.05-4.37 1.05-.9 0-2.29-1.02-3.77-1-1.94.03-3.72 1.13-4.72 2.86-2.01 3.49-.51 8.66 1.45 11.49.96 1.39 2.1 2.94 3.6 2.88 1.45-.06 1.99-.93 3.74-.93s2.24.93 3.77.9c1.56-.03 2.54-1.41 3.49-2.8 1.1-1.61 1.56-3.17 1.58-3.25-.03-.02-3.03-1.16-3.06-4.59zM14.17 4.06c.8-.97 1.34-2.32 1.19-3.66-1.15.05-2.55.77-3.38 1.73-.74.86-1.39 2.23-1.22 3.55 1.29.1 2.6-.65 3.41-1.62z" />
    </svg>
  );
}

const SIGNUP_PERKS = [
  "Protected payments — deposit covered before you start",
  "Clear agreements — scope, deliverables and timelines",
  "Less chasing — reminders and balance collection built in",
];

export function Signup() {
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { setUser, navigate } = useApp();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: "", contact: "", password: "" },
  });

  async function onSubmit(values: SignupValues) {
    setSubmitting(true);
    try {
      const { user } = await api.signup({
        name: values.name,
        contact: values.contact,
        password: values.password,
      });
      setUser(user);
      toast.success(`Welcome to DEAL, ${user.name.split(" ")[0]}!`, {
        description: "Let's set up your creator profile.",
      });
      reset();
      navigate("/onboarding");
    } catch (err) {
      toast.error("Couldn't create your account", {
        description: err instanceof Error ? err.message : "Please try again in a moment.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="signup" className="relative overflow-hidden py-16 sm:py-24">
      {/* soft mint wash */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(48rem 26rem at 50% 115%, rgba(15,169,88,0.10), transparent 65%)",
        }}
      />

      <div className="container-page grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        {/* Left copy */}
        <div>
          <SectionHeading
            align="left"
            eyebrow="Get started"
            title="Create your free DEAL account"
            subtitle="No monthly fees. Pay only when you get paid. Set up your first deal in minutes and stop chasing payments for good."
          />

          <motion.ul
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
            className="mt-7 space-y-3.5"
          >
            {SIGNUP_PERKS.map((perk) => (
              <li key={perk} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full bg-accent">
                  <Check className="h-3.5 w-3.5 text-primary" strokeWidth={3} />
                </span>
                <span className="text-[15px] font-semibold text-foreground">
                  {perk}
                </span>
              </li>
            ))}
          </motion.ul>

          <motion.blockquote
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.5, delay: 0.18, ease: "easeOut" }}
            className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-sm"
          >
            <p className="text-[15px] font-semibold leading-relaxed text-foreground">
              “My client paid the deposit the same day I sent the deal. No more
              ‘I'll pay you later’ — everything is agreed before I lift a
              finger.”
            </p>
            <footer className="mt-3 flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-extrabold text-primary"
              >
                T
              </span>
              <div className="text-sm">
                <p className="font-extrabold text-foreground">Tola A.</p>
                <p className="text-muted-foreground">
                  Photographer · Lagos, Nigeria
                </p>
              </div>
            </footer>
          </motion.blockquote>
        </div>

        {/* Form card */}
        <motion.div
          initial={{ opacity: 0, y: 26 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="rounded-2xl border border-border bg-card p-6 shadow-[0_24px_60px_-24px_rgba(14,31,51,0.22)] sm:p-8"
        >
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div>
              <label htmlFor="name" className="sr-only">
                Full name
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Full name"
                  aria-invalid={!!errors.name}
                  className="h-12 rounded-xl border-input bg-muted/60 pl-11 text-[15px] font-semibold placeholder:font-medium placeholder:text-muted-foreground focus-visible:bg-white"
                  {...register("name")}
                />
              </div>
              {errors.name && (
                <p className="mt-1.5 pl-1 text-[13px] font-semibold text-destructive">
                  {errors.name.message}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="contact" className="sr-only">
                Email or phone number
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="contact"
                  type="text"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="Email or phone number"
                  aria-invalid={!!errors.contact}
                  className="h-12 rounded-xl border-input bg-muted/60 pl-11 text-[15px] font-semibold placeholder:font-medium placeholder:text-muted-foreground focus-visible:bg-white"
                  {...register("contact")}
                />
              </div>
              {errors.contact && (
                <p className="mt-1.5 pl-1 text-[13px] font-semibold text-destructive">
                  {errors.contact.message}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="sr-only">
                Create a password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Create a password"
                  aria-invalid={!!errors.password}
                  className="h-12 rounded-xl border-input bg-muted/60 pl-11 pr-12 text-[15px] font-semibold placeholder:font-medium placeholder:text-muted-foreground focus-visible:bg-white"
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-4.5 w-4.5" />
                  ) : (
                    <Eye className="h-4.5 w-4.5" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1.5 pl-1 text-[13px] font-semibold text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="h-12 w-full rounded-xl text-[15px] font-bold shadow-md shadow-primary/25"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4.5 w-4.5 animate-spin" />
                  Creating your account…
                </>
              ) : (
                <>
                  Create my DEAL account
                  <ArrowRight className="ml-1 h-4.5 w-4.5" />
                </>
              )}
            </Button>

            <div className="flex items-center gap-3 pt-1">
              <span className="h-px flex-1 bg-border" />
              <span className="text-[13px] font-semibold text-muted-foreground">
                or continue with
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  toast.info("Google sign-in is coming soon", {
                    description: "Use your email or phone for now.",
                  })
                }
                className="h-12 rounded-xl border-input bg-white font-bold text-foreground hover:bg-muted"
              >
                <GoogleIcon />
                Google
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  toast.info("Apple sign-in is coming soon", {
                    description: "Use your email or phone for now.",
                  })
                }
                className="h-12 rounded-xl border-input bg-white font-bold text-foreground hover:bg-muted"
              >
                <AppleIcon />
                Apple
              </Button>
            </div>

            <p className="flex items-start justify-center gap-1.5 pt-1 text-center text-[13px] leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                By creating an account, you agree to DEAL's{" "}
                <a href="#" className="font-bold text-primary hover:underline">
                  Terms of Service
                </a>{" "}
                and{" "}
                <a href="#" className="font-bold text-primary hover:underline">
                  Privacy Policy
                </a>
                .
              </span>
            </p>
          </form>
        </motion.div>
      </div>
    </section>
  );
}
