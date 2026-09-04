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
    question: "When do I actually receive my money?",
    answer:
      "The moment your client approves the completed work. Everything they've paid — deposit and installments — is sitting in Payaza escrow, and on approval it releases automatically to your Payaza payout account. No “confirm payout” step, no waiting around.",
  },
  {
    question: "Can my client pay in installments?",
    answer:
      "Yes. You set the structure: a deposit plus up to 3 installments, or any balance afterwards. Your client can pay the next installment whenever they're ready — and every single payment is secured in Payaza escrow until the work is approved.",
  },
  {
    question: "What is Payaza?",
    answer:
      "Payaza is a licensed Nigerian payment processor. It handles the checkout — card, bank transfer and USSD — and holds every payment in escrow until the deal is approved, so both sides are protected: clients know the money only moves when they're happy, and you know the money is real before you start.",
  },
  {
    question: "Can clients book a session with me?",
    answer:
      "Yes. Your public page has a booking calendar — clients pick a service, a date and a time, and the request lands straight in your Bookings. Confirm it and the session is on.",
  },
  {
    question: "Where do I talk to my clients?",
    answer:
      "Wherever you already do. Each deal carries your preferred channels — WhatsApp, Instagram DM, Telegram, email and more — so clients can always reach you the way you actually use, not the way an app decides.",
  },
  {
    question: "What if a client refuses to pay or approve the work?",
    answer:
      "Final files stay locked until the deal is fully paid, and DEAL sends automatic reminders on your behalf. Because the scope, revisions and approval terms were agreed upfront — and every payment and delivery sits on the record with a timestamp — you have everything you need for a fast, fair resolution, including dispute support.",
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
