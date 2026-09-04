"use client";

import { motion } from "framer-motion";
import {
  Brush,
  Camera,
  Clapperboard,
  Code2,
  Mic,
  Palette,
  PenLine,
  Shirt,
  Sparkles,
  Video,
} from "lucide-react";
import { SectionHeading } from "@/components/landing/section-heading";

const CREATIVE_TYPES = [
  { label: "Photographers", icon: Camera },
  { label: "Graphic designers", icon: Palette },
  { label: "Videographers", icon: Video },
  { label: "Video editors", icon: Clapperboard },
  { label: "Writers", icon: PenLine },
  { label: "Developers", icon: Code2 },
  { label: "Illustrators", icon: Brush },
  { label: "Voice artists", icon: Mic },
  { label: "Stylists", icon: Shirt },
  { label: "Motion designers", icon: Sparkles },
];

export function Audience() {
  return (
    <section id="creatives" className="py-16 sm:py-24">
      <div className="container-page">
        <SectionHeading
          eyebrow="Made for creatives"
          title="If clients find you in DMs, DEAL runs the business side"
          subtitle="Keep discovering work where it already happens. DEAL turns every “send me your price” into a deal you can manage and get paid for."
        />

        <div className="mt-12 flex flex-wrap justify-center gap-2.5 sm:gap-3">
          {CREATIVE_TYPES.map((type, i) => (
            <motion.span
              key={type.label}
              initial={{ opacity: 0, scale: 0.92 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.35, delay: i * 0.04, ease: "easeOut" }}
              className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <type.icon className="h-4 w-4 text-primary" strokeWidth={2.2} />
              {type.label}
            </motion.span>
          ))}
        </div>
      </div>
    </section>
  );
}
