"use client";

import { motion } from "framer-motion";
import { SectionHeading } from "@/components/landing/section-heading";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQS = [
  {
    question: "Is DEAL a bank?",
    answer:
      "No. DEAL is a deal-management layer for creative work: the agreement, the milestones and the payment record. Payments are processed through licensed payment partners, and settled earnings go straight to your bank account or mobile money.",
  },
  {
    question: "When do I actually get paid?",
    answer:
      "The client funds the deposit before you start — you see it confirmed in the deal before you deliver anything. The balance is triggered the moment your client approves the work, and final files are released only after it lands.",
  },
  {
    question: "What if a client refuses to pay the balance?",
    answer:
      "Final files stay locked until full payment, and DEAL sends automatic reminders on your behalf. Because scope, revisions and approval were agreed upfront, you always have a clear record of what was promised — which makes resolution fast and fair.",
  },
  {
    question: "Does my client need to create an account?",
    answer:
      "No. You send them a single link. They review the agreement, accept, pay the deposit, watch progress, approve the work and pay the balance — all from that link, on any phone.",
  },
  {
    question: "How much does DEAL cost?",
    answer:
      "Creating deals is free — there are no monthly subscriptions. A small service fee is charged only when a deal completes and you get paid. If you don't get paid, you don't pay.",
  },
  {
    question: "I work with clients outside my country. Does that work?",
    answer:
      "Yes. DEAL is built for African creatives working with clients anywhere. Payment options expand as we roll out, starting with the channels you already use — bank transfer, mobile money and card payments.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="border-t bg-secondary/40 py-16 sm:py-24">
      <div className="container-page">
        <SectionHeading
          eyebrow="Questions"
          title="The things creatives ask us first"
        />

        <motion.div
          initial={{ opacity: 0, y: 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mx-auto mt-10 max-w-3xl sm:mt-12"
        >
          <Accordion type="single" collapsible className="space-y-3">
            {FAQS.map((faq, i) => (
              <AccordionItem
                key={faq.question}
                value={`faq-${i}`}
                className="overflow-hidden rounded-2xl border border-border bg-card px-5 shadow-sm last:border-border"
              >
                <AccordionTrigger className="py-4.5 text-left text-[15px] font-extrabold text-foreground hover:no-underline hover:text-primary">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="pb-5 text-sm leading-relaxed text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
}
