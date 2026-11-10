"use client";

import { Logo } from "@/components/landing/logo";
import { scrollToId } from "@/components/landing/landing";
import { useApp } from "@/components/app/context";

const PRODUCT_LINKS = [
  { label: "How it works", id: "how" },
  { label: "Why DEAL", id: "features" },
  { label: "The flow", id: "flow" },
  { label: "Pricing", id: "signup" },
];

const COMPANY_LINKS = [
  { label: "For creatives", id: "creatives" },
  { label: "FAQ", id: "faq" },
];

const LEGAL_LINKS = [
  { label: "Terms of Service", href: "/terms" },
  { label: "Privacy Policy", href: "/privacy" },
];

export function SiteFooter() {
  const { user, navigate } = useApp();

  const goSection = (id: string) => () => scrollToId(id);

  return (
    <footer className="mt-auto bg-[#0e1f33] pb-[max(1.5rem,env(safe-area-inset-bottom))] text-slate-300">
      <div className="container-page pt-14">
        <div className="grid gap-10 pb-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          {/* Brand */}
          <div className="max-w-xs">
            <Logo wordmarkClassName="text-white" />
            <p className="mt-4 flex flex-wrap items-center gap-2.5 text-[11px] font-semibold text-slate-400">
              Payments powered by
              <img
                src="/flutterwave/logo-white.svg"
                alt="Flutterwave"
                width={86}
                height={16}
                className="h-4 w-auto"
              />
              <span className="text-slate-500">&</span>
              <img
                src="/paystack/logo-white.svg"
                alt="Paystack"
                width={69}
                height={16}
                className="h-4 w-auto"
              />
            </p>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              The business side of creative work. Agree on the job, get paid in
              deposits and installments, deliver with confidence — built for
              African creatives.
            </p>
          </div>

          {/* Link columns */}
          <nav aria-label="Product">
            <h3 className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-slate-500">
              Product
            </h3>
            <ul className="mt-4 space-y-2.5">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.label}>
                  <button
                    onClick={goSection(link.id)}
                    className="text-sm font-semibold text-slate-300 transition-colors hover:text-emerald-400"
                  >
                    {link.label}
                  </button>
                </li>
              ))}
              <li>
                <button
                  onClick={() => navigate(user ? "/dashboard" : "/signup")}
                  className="text-sm font-semibold text-slate-300 transition-colors hover:text-emerald-400"
                >
                  {user ? "Open the app" : "Create free account"}
                </button>
              </li>
            </ul>
          </nav>

          <nav aria-label="Company">
            <h3 className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-slate-500">
              Company
            </h3>
            <ul className="mt-4 space-y-2.5">
              {COMPANY_LINKS.map((link) => (
                <li key={link.label}>
                  <button
                    onClick={goSection(link.id)}
                    className="text-sm font-semibold text-slate-300 transition-colors hover:text-emerald-400"
                  >
                    {link.label}
                  </button>
                </li>
              ))}
              <li>
                <a
                  href="mailto:hello@deal.ng"
                  className="text-sm font-semibold text-slate-300 transition-colors hover:text-emerald-400"
                >
                  Contact
                </a>
              </li>
            </ul>
          </nav>

          <nav aria-label="Legal">
            <h3 className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-slate-500">
              Legal
            </h3>
            <ul className="mt-4 space-y-2.5">
              {LEGAL_LINKS.map((link) => (
                <li key={link.label}>
                  <button
                    onClick={() => navigate(link.href)}
                    className="text-sm font-semibold text-slate-300 transition-colors hover:text-emerald-400"
                  >
                    {link.label}
                  </button>
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
