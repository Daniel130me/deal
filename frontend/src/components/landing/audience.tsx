"use client";

import { motion } from "framer-motion";
import {
  Brush,
  Camera,
  Clapperboard,
  Mic,
  Palette,
  Sparkles,
  Video,
} from "lucide-react";
import { SectionHeading } from "@/components/landing/section-heading";

/** Mirrors CREATOR_CRAFTS in src/lib/types.ts — the exact 7 niches DEAL serves. */
const CRAFTS = [
  { label: "Photographers", icon: Camera },
  { label: "Videographers", icon: Video },
  { label: "Motion designers", icon: Sparkles },
  { label: "Graphic designers", icon: Palette },
  { label: "Video editors", icon: Clapperboard },
  { label: "Illustrators", icon: Brush },
  { label: "Voice artists", icon: Mic },
];

export function Audience() {
  return (
    <section id="creatives" className="py-16 sm:py-24">
      <div className="container-page">
        <SectionHeading
          eyebrow="Niche by design"
          title="Built for 7 creative crafts — and the clients who hire them"
          subtitle="No generic freelancer app. DEAL is tuned to how visual and audio creatives actually get hired, pay in parts and hand over files — so the protection actually fits."
        />

        <div className="mt-12 flex flex-wrap justify-center gap-2.5 sm:gap-3">
          {CRAFTS.map((craft, i) => (
            <motion.span
              key={craft.label}
              initial={{ opacity: 0, scale: 0.92 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.35, delay: i * 0.04, ease: "easeOut" }}
              className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <craft.icon className="h-4 w-4 text-primary" strokeWidth={2.2} />
              {craft.label}
            </motion.span>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.4, delay: 0.3, ease: "easeOut" }}
          className="mt-7 text-center text-sm font-semibold text-muted-foreground"
        >
          Focus is the feature — every agreement, escrow rule and file handoff
          is designed for your kind of work.
        </motion.p>
      </div>
    </section>
  );
}
