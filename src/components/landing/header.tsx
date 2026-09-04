"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Logo } from "@/components/landing/logo";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { label: "How it works", href: "#how" },
  { label: "Why DEAL", href: "#features" },
  { label: "The flow", href: "#flow" },
  { label: "FAQ", href: "#faq" },
];

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b bg-white/85 backdrop-blur-md transition-shadow",
        scrolled ? "border-border shadow-[0_1px_12px_rgba(14,31,51,0.06)]" : "border-transparent"
      )}
    >
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link href="/" aria-label="DEAL home" className="rounded-md focus-visible:outline-2 focus-visible:outline-primary">
          <Logo />
        </Link>

        {/* Desktop nav */}
        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Button
            asChild
            variant="ghost"
            className="font-bold text-primary hover:bg-accent hover:text-accent-foreground"
          >
            <a href="#signup">Log in</a>
          </Button>
          <Button asChild className="font-bold shadow-sm shadow-primary/25">
            <a href="#signup">Get started</a>
          </Button>
        </div>

        {/* Mobile menu */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <SheetHeader className="border-b">
              <SheetTitle>
                <Logo />
              </SheetTitle>
            </SheetHeader>
            <nav aria-label="Mobile" className="flex flex-col gap-1 px-4">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-[15px] font-semibold text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  {link.label}
                </a>
              ))}
              <div className="mt-4 flex flex-col gap-2 border-t pt-4">
                <Button asChild variant="outline" className="w-full font-bold">
                  <a href="#signup" onClick={() => setOpen(false)}>
                    Log in
                  </a>
                </Button>
                <Button asChild className="w-full font-bold">
                  <a href="#signup" onClick={() => setOpen(false)}>
                    Get started free
                  </a>
                </Button>
              </div>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
