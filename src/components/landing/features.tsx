"use client";

import { motion } from "framer-motion";
import {
  BellRing,
  CalendarCheck,
  FileText,
  Layers,
  ShieldCheck,
  Unlock,
} from "lucide-react";
import { SectionHeading } from "@/components/landing/section-heading";

const FEATURES = [
  {
    title: "Protected payments",
    description:
      "Clients pay into Payaza escrow before you start. You're covered before you move a pixel.",
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
    title: "Less chasing",
    description:
      "Milestones, reminders and balance collection are built in. DEAL follows up so you don't have to.",
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
    title: "Escrow that releases on approval",
    description:
      "Money moves only when your client says the work is done — automatically, straight to your Payaza payout.",
    icon: Unlock,
    iconClass: "text-violet-600",
    tileClass: "bg-violet-50",
  },
  {
    title: "Bookings & your channels",
    description:
      "Clients book sessions from your public page and reach you on WhatsApp, Instagram, Telegram, email — you choose.",
    icon: CalendarCheck,
    iconClass: "text-primary",
    tileClass: "bg-accent",
  },
];

export function Features() {
  return (
    <section id="features" className="py-16 sm:py-24">
      <div className="container-page">
        <SectionHeading
          eyebrow="Why DEAL"
          title="Everything between “yes” and payment, handled"
          subtitle="Getting the client is not the hard part — managing the job and getting paid safely is. DEAL fixes that part."
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
