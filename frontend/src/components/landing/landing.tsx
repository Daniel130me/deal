"use client";

import { Hero } from "@/components/landing/hero";
import { Steps } from "@/components/landing/steps";
import { Features } from "@/components/landing/features";
import { Flow } from "@/components/landing/flow";
import { Audience } from "@/components/landing/audience";
import { PricingBanner } from "@/components/landing/pricing-banner";
import { Faq } from "@/components/landing/faq";
import { Signup } from "@/components/landing/signup";
import { SiteFooter } from "@/components/landing/footer";
import { SiteHeader } from "@/components/landing/header";

export function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function Landing() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Steps />
        <Features />
        <Flow />
        <Audience />
        <PricingBanner />
        <Faq />
        <Signup />
      </main>
      <SiteFooter />
    </div>
  );
}
