"use client";

import { motion } from "framer-motion";
import {
  BadgeCheck,
  Image as ImageIcon,
  MessageCircle,
  Wallet,
} from "lucide-react";
import { SectionHeading } from "@/components/landing/section-heading";

const STEPS = [
  {
    number: "1",
    title: "Agree",
    description:
      "Send the agreement — scope, price and timeline. Your client accepts with one tap.",
    icon: MessageCircle,
    iconClass: "text-primary",
    circleClass: "bg-accent",
  },
  {
    number: "2",
    title: "Pay",
    description:
      "Client accepts & pays the deposit — then installments anytime. Every payment is locked in Payaza escrow.",
    icon: Wallet,
    iconClass: "text-amber-500",
    circleClass: "bg-amber-50",
  },
  {
    number: "3",
    title: "Create",
    description:
      "You do the work in peace — files stay locked until the deal is fully paid.",
    icon: ImageIcon,
    iconClass: "text-primary",
    circleClass: "bg-accent",
  },
  {
    number: "4",
    title: "Approve & Deliver",
    description:
      "Client approves → escrow releases your money automatically. Final files unlock once fully paid.",
    icon: BadgeCheck,
    iconClass: "text-violet-600",
    circleClass: "bg-violet-50",
  },
];

export function Steps() {
  return (
    <section id="how" className="border-t bg-secondary/40 py-16 sm:py-20">
      <div className="container-page">
        <SectionHeading
          eyebrow="How it works"
          title={
            <>
              From chat to cash, in four steps
            </>
          }
          subtitle="The familiar pay-in-parts arrangement — deposits and installments held in escrow, released only when the work is approved."
        />

        <div className="relative mt-12 sm:mt-14">
          {/* dotted connector — desktop only, sits behind the icon circles */}
          <div
            aria-hidden="true"
            className="step-connector absolute left-[12%] right-[12%] top-7 hidden h-[3px] lg:block"
          />
          <ol className="grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <motion.li
                key={step.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.45, delay: i * 0.1, ease: "easeOut" }}
                className="relative flex flex-col items-center text-center"
              >
                <span
                  className={`relative z-10 flex h-14 w-14 items-center justify-center rounded-full border border-border bg-white shadow-sm ${step.circleClass}`}
                >
                  <step.icon className={`h-6 w-6 ${step.iconClass}`} strokeWidth={2.2} />
                </span>
                <h3 className="mt-4 text-[15px] font-extrabold text-foreground">
                  {step.number}. {step.title}
                </h3>
                <p className="mt-1.5 max-w-[16rem] text-sm leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
