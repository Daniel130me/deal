"use client";

import { motion } from "framer-motion";
import { ArrowRight, BadgePercent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/components/app/context";

export function PricingBanner() {
  const { navigate } = useApp();
  return (
    <section className="pb-16 sm:pb-24">
      <div className="container-page">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative overflow-hidden rounded-3xl bg-[#0e1f33] px-6 py-12 text-center sm:px-12 sm:py-16"
        >
          {/* green glow accents */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-primary/25 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-primary/20 blur-3xl"
          />

          <span className="relative inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-[13px] font-bold text-emerald-300">
            <BadgePercent className="h-4 w-4" />
            Simple pricing
          </span>
          <h2 className="relative mx-auto mt-5 max-w-2xl text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            No monthly fees.{" "}
            <span className="text-emerald-400">Pay only when you get paid.</span>
          </h2>
          <p className="relative mt-4 flex flex-wrap items-center justify-center gap-2.5 text-[13px] font-semibold text-slate-400">
            Payments powered by
            <img
              src="/flutterwave/logo-white.svg"
              alt="Flutterwave"
              width={86}
              height={16}
              className="h-4 w-auto"
            />
            <span className="text-slate-500">&</span>
            <img
              src="/paystack/logo-white.svg"
              alt="Paystack"
              width={69}
              height={16}
              className="h-4 w-auto"
            />
          </p>
          <p className="relative mx-auto mt-4 max-w-xl text-base leading-relaxed text-slate-300">
            Create and send deals for free. When a deal completes, a small
            service fee is taken from the payment — never from your pocket
            upfront.
          </p>
          <div className="relative mt-8">
            <Button
              size="lg"
              className="h-12 bg-primary px-7 text-[15px] font-bold text-white shadow-lg shadow-primary/30 hover:bg-primary/90"
              onClick={() => navigate("/signup")}
            >
              Start free
              <ArrowRight className="ml-1 h-4.5 w-4.5" />
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
