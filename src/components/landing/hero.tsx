"use client";

import { motion } from "framer-motion";
import {
  ArrowRight,
  Camera,
  Check,
  Clock3,
  Lock,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const fadeUp = {
  initial: { opacity: 0, y: 22 },
  animate: { opacity: 1, y: 0 },
};

function DealMockupCard() {
  return (
    <div
      aria-hidden="true"
      className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-[0_24px_60px_-24px_rgba(14,31,51,0.25)]"
    >
      {/* Project header */}
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent">
          <Camera className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold text-foreground">
            Brand photoshoot · 12 photos
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Adaeze O. · found on Instagram
          </p>
        </div>
        <Badge className="shrink-0 bg-accent text-accent-foreground hover:bg-accent">
          Deposit paid
        </Badge>
      </div>

      <Separator className="my-5" />

      {/* Payment summary */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl bg-muted p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Total
          </p>
          <p className="mt-1 text-sm font-extrabold text-foreground">₦450,000</p>
        </div>
        <div className="rounded-xl bg-accent p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-accent-foreground">
            Deposit
          </p>
          <p className="mt-1 text-sm font-extrabold text-primary">₦225,000</p>
        </div>
        <div className="rounded-xl bg-muted p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Balance
          </p>
          <p className="mt-1 text-sm font-extrabold text-foreground">₦225,000</p>
        </div>
      </div>

      {/* Milestones */}
      <ul className="mt-5 space-y-3">
        <li className="flex items-center gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent">
            <Check className="h-3.5 w-3.5 text-primary" strokeWidth={3} />
          </span>
          <span className="text-sm font-semibold text-foreground line-through decoration-muted-foreground/40">
            Brief & scope agreed
          </span>
        </li>
        <li className="flex items-center gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent">
            <Check className="h-3.5 w-3.5 text-primary" strokeWidth={3} />
          </span>
          <span className="text-sm font-semibold text-foreground line-through decoration-muted-foreground/40">
            Deposit received
          </span>
        </li>
        <li className="flex items-center gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100">
            <Clock3 className="h-3.5 w-3.5 text-amber-600" strokeWidth={2.5} />
          </span>
          <span className="text-sm font-semibold text-foreground">
            Work delivered — client reviewing
          </span>
        </li>
        <li className="flex items-center gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
            <Lock className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2.5} />
          </span>
          <span className="text-sm font-semibold text-muted-foreground">
            Final files released after balance
          </span>
        </li>
      </ul>

      <div className="mt-5 flex items-center gap-2.5 rounded-xl bg-secondary px-4 py-3">
        <ShieldCheck className="h-4.5 w-4.5 shrink-0 text-primary" />
        <p className="text-[13px] font-semibold text-secondary-foreground">
          Payment protected — files unlock only after full payment
        </p>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* soft mint wash behind hero */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60rem 30rem at 85% -10%, rgba(15,169,88,0.10), transparent 60%), radial-gradient(40rem 24rem at -10% 20%, rgba(15,169,88,0.06), transparent 60%)",
        }}
      />

      <div className="container-page grid items-center gap-12 pb-16 pt-12 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:pb-24 lg:pt-20">
        {/* Copy */}
        <div className="max-w-xl">
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-3.5 py-1.5"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="text-[13px] font-bold text-accent-foreground">
              Built for African creatives
            </span>
          </motion.div>

          <motion.h1
            {...fadeUp}
            transition={{ duration: 0.5, delay: 0.08, ease: "easeOut" }}
            className="mt-6 text-[2.6rem] font-extrabold leading-[1.04] tracking-tight text-foreground sm:text-6xl lg:text-[3.6rem]"
          >
            Agree. Pay.
            <br />
            <span className="text-primary">Create. Deliver.</span>
          </motion.h1>

          <motion.p
            {...fadeUp}
            transition={{ duration: 0.5, delay: 0.16, ease: "easeOut" }}
            className="mt-6 text-lg leading-relaxed text-muted-foreground"
          >
            DEAL helps you turn client conversations into clear agreements,
            secure payments and successful projects — without the stress of
            chasing or confusion.
          </motion.p>

          <motion.div
            {...fadeUp}
            transition={{ duration: 0.5, delay: 0.24, ease: "easeOut" }}
            className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <Button
              asChild
              size="lg"
              className="h-12 px-6 text-[15px] font-bold shadow-md shadow-primary/25"
            >
              <a href="#signup">
                Create my free account
                <ArrowRight className="ml-1 h-4.5 w-4.5" />
              </a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 border-input px-6 text-[15px] font-bold text-foreground hover:bg-muted"
            >
              <a href="#how">See how it works</a>
            </Button>
          </motion.div>

          <motion.ul
            {...fadeUp}
            transition={{ duration: 0.5, delay: 0.32, ease: "easeOut" }}
            className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2"
          >
            {[
              "No monthly fees",
              "Pay only when you get paid",
              "Start from IG, WhatsApp or referrals",
            ].map((item) => (
              <li
                key={item}
                className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground"
              >
                <Check className="h-4 w-4 text-primary" strokeWidth={3} />
                {item}
              </li>
            ))}
          </motion.ul>
        </div>

        {/* Product mockup (desktop enhancement) */}
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
          className="relative hidden lg:block"
        >
          <div className="mx-auto w-fit">
            <DealMockupCard />

            {/* floating chips */}
            <div className="animate-float-soft absolute -right-12 -top-10 flex items-center gap-2 rounded-full border border-border bg-white px-4 py-2.5 shadow-lg shadow-foreground/5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent">
                <Wallet className="h-3.5 w-3.5 text-primary" />
              </span>
              <div className="leading-tight">
                <p className="text-[11px] font-semibold text-muted-foreground">
                  Deposit received
                </p>
                <p className="text-[13px] font-extrabold text-foreground">
                  ₦225,000
                </p>
              </div>
            </div>

            <div
              className="animate-float-soft absolute -bottom-6 -left-10 flex items-center gap-2 rounded-full border border-border bg-white px-4 py-2.5 shadow-lg shadow-foreground/5"
              style={{ animationDelay: "1.6s" }}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-100">
                <ShieldCheck className="h-3.5 w-3.5 text-violet-600" />
              </span>
              <p className="text-[13px] font-extrabold text-foreground">
                Client approved · balance settled
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
