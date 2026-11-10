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

const SIGNUP_PERKS = [
  "Verified payments — every successful charge is recorded against the agreement",
  "Clear agreements — scope, deliverables and timelines",
  "Installment-friendly — collect deposits, installments and balances",
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
      toast.success(`Welcome to DEAL, ${values.name.split(" ")[0]}!`, {
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
            subtitle="No monthly subscription. Set up your first agreement and keep scope, payment records and delivery in one place."
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

            <p className="flex items-start justify-center gap-1.5 pt-1 text-center text-[13px] leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                By creating an account, you agree to DEAL's{" "}
                <a href="#/terms" className="font-bold text-primary hover:underline">
                  Terms of Service
                </a>{" "}
                and{" "}
                <a href="#/privacy" className="font-bold text-primary hover:underline">
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
