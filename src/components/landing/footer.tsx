import { Instagram, Linkedin, Twitter } from "lucide-react";
import { Logo } from "@/components/landing/logo";

const PRODUCT_LINKS = [
  { label: "How it works", href: "#how" },
  { label: "Why DEAL", href: "#features" },
  { label: "The flow", href: "#flow" },
  { label: "Pricing", href: "#signup" },
];

const COMPANY_LINKS = [
  { label: "For creatives", href: "#creatives" },
  { label: "FAQ", href: "#faq" },
  { label: "Contact", href: "mailto:hello@deal.africa" },
];

const LEGAL_LINKS = [
  { label: "Terms of Service", href: "#" },
  { label: "Privacy Policy", href: "#" },
];

const SOCIALS = [
  { label: "DEAL on Instagram", href: "#", icon: Instagram },
  { label: "DEAL on X (Twitter)", href: "#", icon: Twitter },
  { label: "DEAL on LinkedIn", href: "#", icon: Linkedin },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto bg-[#0e1f33] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-slate-300">
      <div className="container-page pt-14">
        <div className="grid gap-10 pb-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          {/* Brand */}
          <div className="max-w-xs">
            <Logo wordmarkClassName="text-white" />
            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              The business side of creative work. Agree on the job, get paid in
              milestones, deliver with confidence — built for African creatives.
            </p>
            <div className="mt-5 flex items-center gap-2">
              {SOCIALS.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  aria-label={social.label}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/8 text-slate-300 transition-colors hover:bg-primary hover:text-white"
                >
                  <social.icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          <nav aria-label="Product">
            <h3 className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-slate-500">
              Product
            </h3>
            <ul className="mt-4 space-y-2.5">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm font-semibold text-slate-300 transition-colors hover:text-emerald-400"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Company">
            <h3 className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-slate-500">
              Company
            </h3>
            <ul className="mt-4 space-y-2.5">
              {COMPANY_LINKS.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm font-semibold text-slate-300 transition-colors hover:text-emerald-400"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Legal">
            <h3 className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-slate-500">
              Legal
            </h3>
            <ul className="mt-4 space-y-2.5">
              {LEGAL_LINKS.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm font-semibold text-slate-300 transition-colors hover:text-emerald-400"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="flex flex-col items-center justify-between gap-3 border-t border-white/10 py-6 text-[13px] font-medium text-slate-500 sm:flex-row">
          <p>© {new Date().getFullYear()} DEAL. All rights reserved.</p>
          <p className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-primary"
            />
            Made for African creatives
          </p>
        </div>
      </div>
    </footer>
  );
}
