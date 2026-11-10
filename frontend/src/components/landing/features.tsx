"use client";

import { motion } from "framer-motion";
import {
  BellRing,
  FileLock,
  FileText,
  Layers,
  ShieldCheck,
  Unlock,
} from "lucide-react";
import { SectionHeading } from "@/components/landing/section-heading";

const FEATURES = [
  {
    title: "Verified payment records",
    description:
      "Client charges are initialized on Flutterwave or Paystack and verified server-side before DEAL updates the agreement record.",
    icon: ShieldCheck,
    iconClass: "text-primary",
    tileClass: "bg-accent",
  },
  {
    title: "Clear agreements",
    description:
      "Scope, deliverables, timelines — everything in one place. No “but that's not what I asked for”.",
    icon: FileText,
    iconClass: "text-primary",
    tileClass: "bg-accent",
  },
  {
    title: "Clear payment schedule",
    description:
      "Deposits, installments and balances stay tied to the agreement and their provider references.",
    icon: BellRing,
    iconClass: "text-primary",
    tileClass: "bg-accent",
  },
  {
    title: "Installment-friendly",
    description:
      "Clients pay in parts — deposit first, then installments — so you stop demanding 100% upfront to start work.",
    icon: Layers,
    iconClass: "text-amber-500",
    tileClass: "bg-amber-50",
  },
  {
    title: "Approval-controlled ledger",
    description:
      "DEAL records provider-confirmed charges and client approval as separate, auditable events.",
    icon: Unlock,
    iconClass: "text-violet-600",
    tileClass: "bg-violet-50",
  },
  {
    title: "Protected file delivery",
    description:
      "Clients get watermarked, reduced-quality review copies until the deal is fully paid — full-quality files unlock on approval + full payment.",
    icon: FileLock,
    iconClass: "text-teal-600",
    tileClass: "bg-teal-50",
  },
];

export function Features() {
  return (
    <section id="features" className="py-16 sm:py-24">
      <div className="container-page">
        <SectionHeading
          eyebrow="Why DEAL"
          title="Everything between “yes” and delivery, organized"
          subtitle="Keep the agreement, provider-verified charges, approvals and protected file handoff in one workflow."
        />

        <div className="mt-12 grid gap-4 sm:grid-cols-2 sm:mt-14 lg:grid-cols-3 lg:gap-5">
          {FEATURES.map((feature, i) => (
            <motion.article
              key={feature.title}
              initial={{ opacity: 0, y: 22 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.45, delay: (i % 3) * 0.08, ease: "easeOut" }}
              className="group rounded-2xl border border-border bg-card p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_16px_40px_-18px_rgba(14,31,51,0.18)] sm:p-6"
            >
              <span
                className={`flex h-11 w-11 items-center justify-center rounded-xl ${feature.tileClass}`}
              >
                <feature.icon className={`h-5.5 w-5.5 ${feature.iconClass}`} strokeWidth={2.1} />
              </span>
              <h3 className="mt-4 text-[17px] font-extrabold tracking-tight text-foreground">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
