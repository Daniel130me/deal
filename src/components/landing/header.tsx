"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { Logo } from "@/components/landing/logo";
import { scrollToId } from "@/components/landing/landing";
import { useApp } from "@/components/app/context";
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
  { label: "How it works", id: "how" },
  { label: "Why DEAL", id: "features" },
  { label: "The flow", id: "flow" },
  { label: "FAQ", id: "faq" },
];

export function SiteHeader() {
  const { user, navigate } = useApp();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const go = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b bg-white/85 backdrop-blur-md transition-shadow",
        scrolled ? "border-border shadow-[0_1px_12px_rgba(14,31,51,0.06)]" : "border-transparent"
      )}
    >
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="DEAL home"
          className="rounded-md focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Logo />
        </button>

        {/* Desktop nav */}
        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <button
              key={link.id}
              onClick={() => scrollToId(link.id)}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {link.label}
            </button>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Button
            variant="ghost"
            className="font-bold text-primary hover:bg-accent hover:text-accent-foreground"
            onClick={() => navigate(user ? "/dashboard" : "/login")}
          >
            {user ? "My dashboard" : "Log in"}
          </Button>
          <Button className="font-bold shadow-sm shadow-primary/25" onClick={() => navigate("/signup")}>
            Get started
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
                <button
                  key={link.id}
                  onClick={go(() => scrollToId(link.id))}
                  className="rounded-lg px-3 py-2.5 text-left text-[15px] font-semibold text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  {link.label}
                </button>
              ))}
              <div className="mt-4 flex flex-col gap-2 border-t pt-4">
                <Button
                  variant="outline"
                  className="w-full font-bold"
                  onClick={go(() => navigate("/login"))}
                >
                  Log in
                </Button>
                <Button className="w-full font-bold" onClick={go(() => navigate("/signup"))}>
                  Get started free
                </Button>
              </div>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
