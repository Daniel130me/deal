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
      "The moment your client approves the completed work. Everything they've paid — deposit and installments — is sitting in DEAL escrow, and on approval it releases automatically to you. No “confirm payout” step, no waiting around.",
  },
  {
    question: "Can my client pay in installments?",
    answer:
      "Yes. You set the structure: a deposit plus up to 3 installments, or any balance afterwards. Your client can pay the next installment whenever they're ready — and every single payment is secured in DEAL escrow until the work is approved.",
  },
  {
    question: "How do payments work?",
    answer:
      "Payments are processed by Flutterwave or Paystack — card, bank transfer or USSD. But the money is held by DEAL, not the gateway: DEAL escrow keeps every payment locked until the client approves the work, then releases it to the creator. The gateway processes the charge; DEAL protects both sides.",
  },
  {
    question: "Can clients book a session with me?",
    answer:
      "Yes. Your public page has a booking calendar — clients pick a service, a date and a time, and the request lands straight in your Bookings. Confirm it and the session is on.",
  },
  {
    question: "How are my files protected?",
    answer:
      "Clients review watermarked, reduced-quality previews — never the originals. Full-quality files unlock only when the work is approved AND the deal is fully paid, so nobody walks away with your work before you've been paid.",
  },
  {
    question: "Who is DEAL for?",
    answer:
      "DEAL is built for 7 creative crafts: photographers, videographers, motion designers, graphic designers, video editors, illustrators and voice artists. Niching down means the agreements, escrow and file protection are tuned to how creative work actually happens — not a generic freelancer app.",
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
