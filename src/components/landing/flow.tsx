"use client";

import { motion } from "framer-motion";
import {
  CheckCheck,
  ClipboardCheck,
  FileSignature,
  FolderOutput,
  HandCoins,
  FileCheck2,
  UserRound,
  Wallet,
} from "lucide-react";
import { SectionHeading } from "@/components/landing/section-heading";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const CREATOR_STEPS = [
  "Create deal",
  "Client information",
  "Service / project",
  "Scope",
  "Deliverables",
  "Price",
  "Payment structure",
  "Timeline",
  "Revisions",
  "Send deal",
];

const CLIENT_STEPS = [
  "Review deal",
  "Accept",
  "Pay deposit",
  "View progress",
  "Review work",
  "Approve",
  "Pay balance",
  "Complete",
];

const RECORD_ITEMS = [
  {
    title: "What was agreed",
    description: "Scope, deliverables, price, timeline and revision rounds — signed by both sides.",
    icon: FileSignature,
  },
  {
    title: "What was paid",
    description: "Every deposit and balance, with amounts, dates and payment references.",
    icon: HandCoins,
  },
  {
    title: "What was delivered",
    description: "Each submission, preview and revision — timestamped against the deadline.",
    icon: FolderOutput,
  },
  {
    title: "What was approved",
    description: "Client sign-off on each milestone, with receipts for the final settlement.",
    icon: ClipboardCheck,
  },
];

function StepList({ steps }: { steps: string[] }) {
  return (
    <ol className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {steps.map((step, i) => (
        <li
          key={step}
          className="flex items-center gap-3 rounded-xl border border-border bg-white px-4 py-3"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-extrabold text-primary">
            {i + 1}
          </span>
          <span className="text-sm font-semibold text-foreground">{step}</span>
        </li>
      ))}
    </ol>
  );
}

export function Flow() {
  return (
    <section id="flow" className="border-t bg-secondary/40 py-16 sm:py-24">
      <div className="container-page">
        <SectionHeading
          eyebrow="One flow, both sides"
          title="A deal both sides can trust"
          subtitle="Creators send clear agreements. Clients pay with confidence. DEAL keeps the record of everything in between."
        />

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mt-10 sm:mt-12"
        >
          <Tabs defaultValue="creator" className="w-full">
            <div className="flex justify-center">
              <TabsList className="h-11 rounded-full border border-border bg-white p-1">
                <TabsTrigger
                  value="creator"
                  className="rounded-full px-4 py-2 text-sm font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <UserRound className="mr-1.5 h-4 w-4" />
                  Creator
                </TabsTrigger>
                <TabsTrigger
                  value="client"
                  className="rounded-full px-4 py-2 text-sm font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <Wallet className="mr-1.5 h-4 w-4" />
                  Client
                </TabsTrigger>
                <TabsTrigger
                  value="record"
                  className="rounded-full px-4 py-2 text-sm font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <FileCheck2 className="mr-1.5 h-4 w-4" />
                  DEAL keeps the record
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="creator" className="mt-8">
              <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-8">
                <div className="mb-6 flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent">
                    <UserRound className="h-5 w-5 text-primary" />
                  </span>
                  <div>
                    <h3 className="text-lg font-extrabold text-foreground">
                      You set the terms in minutes
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Guided steps turn your WhatsApp agreement into a real deal — nothing forgotten.
                    </p>
                  </div>
                </div>
                <StepList steps={CREATOR_STEPS} />
              </div>
            </TabsContent>

            <TabsContent value="client" className="mt-8">
              <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-8">
                <div className="mb-6 flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
                    <Wallet className="h-5 w-5 text-amber-500" />
                  </span>
                  <div>
                    <h3 className="text-lg font-extrabold text-foreground">
                      Your client always knows what's next
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      A simple link to review, pay and approve — no account needed to get started.
                    </p>
                  </div>
                </div>
                <StepList steps={CLIENT_STEPS} />
              </div>
            </TabsContent>

            <TabsContent value="record" className="mt-8">
              <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-8">
                <div className="grid gap-4 sm:grid-cols-2">
                  {RECORD_ITEMS.map((item) => (
                    <div
                      key={item.title}
                      className="rounded-2xl border border-border bg-white p-5"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent">
                        <item.icon className="h-5 w-5 text-primary" />
                      </span>
                      <h4 className="mt-3 text-[15px] font-extrabold text-foreground">
                        {item.title}
                      </h4>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-6 flex items-center justify-center gap-2 text-center text-sm font-bold text-primary">
                  <CheckCheck className="h-4.5 w-4.5" />
                  Agreed + Paid + Delivered + Approved — one link, no arguments.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </section>
  );
}
