"use client";

import Link from "next/link";
import {
  Home,
  FolderKanban,
  Plus,
  FileStack,
  Wallet,
  Bell,
  ChevronDown,
} from "lucide-react";
import { Logo } from "@/components/landing/logo";
import { useApp } from "@/components/app/context";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppHeader({ backHref }: { backHref?: string }) {
  const { user, logout, navigate } = useApp();
  const initials = (user?.name ?? "D")
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white/90 backdrop-blur-md">
      <div className="flex h-14 items-center justify-between px-5">
        <div className="flex items-center gap-3">
          {backHref ? (
            <Link
              href={`#${backHref}`}
              aria-label="Go back"
              className="rounded-lg p-1 text-foreground transition-colors hover:bg-muted"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M19 12H5m0 0 6 6m-6-6 6-6" />
              </svg>
            </Link>
          ) : null}
          <Link href="#/dashboard" aria-label="DEAL dashboard">
            <Logo />
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              user?.whatsapp
                ? window.open(`https://wa.me/${user.whatsapp.replace(/\D/g, "")}`, "_blank")
                : undefined
            }
            className="hidden items-center gap-1.5 rounded-full border border-accent bg-accent px-3 py-1.5 text-[13px] font-bold text-accent-foreground sm:inline-flex"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
              <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.5 14.1c-.2.7-1.3 1.3-1.9 1.4-.5.1-1.1.2-3.4-.7-2.9-1.2-4.7-4.1-4.9-4.3-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.4l.9 2.1c.1.2.1.4 0 .6l-.4.6-.5.5c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.7-.1l1-1.2c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.6.4 0 .1 0 .7-.5 1.7Z" />
            </svg>
            Chat on WhatsApp
          </button>
          <button
            type="button"
            aria-label="Notifications"
            onClick={() => navigate("/requests")}
            className="relative rounded-lg p-2 text-foreground transition-colors hover:bg-muted"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[9px] font-extrabold text-white">
              3
            </span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="flex items-center gap-1 rounded-full focus-visible:outline-2 focus-visible:outline-primary"
              aria-label="Account menu"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-[12px] font-extrabold text-white">
                {initials}
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <div className="px-3 py-2">
                <p className="text-sm font-extrabold text-foreground">{user?.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate(`/u/${user?.handle}`)}>
                View my public page
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/onboarding")}>
                Edit profile & services
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  await fetch("/api/admin/reset", { method: "POST" });
                  window.location.reload();
                }}
              >
                Reset demo data
              </DropdownMenuItem>
              <DropdownMenuItem onClick={logout} className="text-red-600">
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

export function AppCanvas({
  activeTab,
  backHref,
  children,
}: {
  activeTab?: "dashboard" | "requests" | "deals";
  backHref?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#edf3ef]">
      <div className="relative mx-auto flex min-h-screen w-full max-w-lg flex-col bg-background shadow-[0_0_60px_rgba(14,31,51,0.10)]">
        <AppHeader backHref={backHref} />
        <main className="flex flex-1 flex-col">{children}</main>
        {activeTab ? (
          <BottomTabs active={activeTab} />
        ) : (
          <div className="pb-[env(safe-area-inset-bottom)]" />
        )}
      </div>
    </div>
  );
}

const TABS = [
  { key: "dashboard", label: "Dashboard", icon: Home, href: "/dashboard" },
  { key: "requests", label: "Requests", icon: FileStack, href: "/requests" },
  { key: "new", label: "Add New", icon: Plus, href: "/deals/new", primary: true },
  { key: "deals", label: "Projects", icon: FolderKanban, href: "/deals" },
  { key: "earnings", label: "Earnings", icon: Wallet, href: "/dashboard#earnings" },
] as const;

export function BottomTabs({ active }: { active: "dashboard" | "requests" | "deals" }) {
  return (
    <nav
      aria-label="App sections"
      className="sticky bottom-0 z-40 mt-auto border-t border-border bg-white pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2"
    >
      <ol className="grid grid-cols-5 items-end px-2">
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          if (tab.primary) {
            return (
              <li key={tab.key} className="flex justify-center">
                <Link
                  href={`#${tab.href}`}
                  aria-label={tab.label}
                  className="-mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/35 transition-transform hover:scale-105"
                >
                  <Plus className="h-6 w-6" strokeWidth={2.5} />
                </Link>
              </li>
            );
          }
          const Icon = tab.icon;
          return (
            <li key={tab.key}>
              <Link
                href={`#${tab.href}`}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg py-1 text-[10px] font-bold",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
