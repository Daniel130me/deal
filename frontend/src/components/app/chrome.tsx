"use client";

import {
  Bell,
  CalendarCheck,
  ChevronDown,
  FileStack,
  FolderKanban,
  Home,
  Plus,
  Wallet,
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

const NAV = [
  { key: "dashboard", label: "Dashboard", icon: Home, href: "/dashboard" },
  { key: "deals", label: "Projects", icon: FolderKanban, href: "/deals" },
  { key: "requests", label: "Requests", icon: FileStack, href: "/requests" },
  { key: "bookings", label: "Bookings", icon: CalendarCheck, href: "/bookings" },
  { key: "money", label: "Money", icon: Wallet, href: "/money" },
] as const;

const TABS = [
  { key: "dashboard", label: "Home", icon: Home, href: "/dashboard" },
  { key: "deals", label: "Projects", icon: FolderKanban, href: "/deals" },
  { key: "new", label: "New deal", icon: Plus, href: "/deals/new", primary: true },
  { key: "bookings", label: "Bookings", icon: CalendarCheck, href: "/bookings" },
  { key: "money", label: "Money", icon: Wallet, href: "/money" },
] as const;

export type AppTab = (typeof NAV)[number]["key"];

function useInitials() {
  const { user } = useApp();
  return (user?.name ?? "D")
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function AccountMenu({ align = "end" }: { align?: "start" | "end" }) {
  const { user, logout, navigate } = useApp();
  const initials = useInitials();

  return (
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
      <DropdownMenuContent align={align} className="w-56">
        <div className="px-3 py-2">
          <p className="text-sm font-extrabold text-foreground">{user?.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate(`/u/${user?.handle}`)}>
          View my public page
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate("/onboarding")}>
          Edit profile, services & channels
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
  );
}

export function AppHeader({ backHref }: { backHref?: string }) {
  const { navigate } = useApp();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white/90 backdrop-blur-md">
      <div className="flex h-14 items-center justify-between px-4 sm:px-6 lg:px-10">
        <div className="flex items-center gap-3">
          {backHref ? (
            <a
              href={`#${backHref}`}
              aria-label="Go back"
              className="rounded-lg p-1 text-foreground transition-colors hover:bg-muted"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M19 12H5m0 0 6 6m-6-6 6-6" />
              </svg>
            </a>
          ) : null}
          <a href="#/dashboard" aria-label="DEAL dashboard" className="lg:hidden">
            <Logo />
          </a>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Requests & notifications"
            onClick={() => navigate("/requests")}
            className="relative rounded-lg p-2 text-foreground transition-colors hover:bg-muted"
          >
            <Bell className="h-5 w-5" />
          </button>
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}

function Sidebar() {
  const { route, user } = useApp();
  const active = route.split("/").filter(Boolean)[0] ?? "dashboard";
  const initials = useInitials();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-white lg:flex">
      <div className="flex h-16 shrink-0 items-center px-6">
        <a href="#/dashboard" aria-label="DEAL dashboard">
          <Logo />
        </a>
      </div>

      <div className="px-4">
        <a
          href="#/deals/new"
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-extrabold text-white shadow-lg shadow-primary/25 transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" strokeWidth={3} />
          New deal
        </a>
      </div>

      <nav aria-label="App sections" className="mt-6 flex-1 space-y-1 px-3">
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === active;
          return (
            <a
              key={item.key}
              href={`#${item.href}`}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-[18px] w-[18px]" strokeWidth={isActive ? 2.5 : 2} />
              {item.label}
            </a>
          );
        })}
      </nav>

      <div className="border-t border-border p-4">
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
            aria-label="Account menu"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-[12px] font-extrabold text-white">
              {initials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-extrabold text-foreground">
                {user?.name}
              </span>
              <span className="block truncate text-[11px] font-semibold text-muted-foreground">
                @{user?.handle}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <AccountMenuContent />
        </DropdownMenu>
      </div>
    </aside>
  );
}

/** Shared menu body so header + sidebar show identical items. */
function AccountMenuContent() {
  const { user, logout, navigate } = useApp();
  return (
    <DropdownMenuContent align="start" side="top" className="w-56">
      <div className="px-3 py-2">
        <p className="text-sm font-extrabold text-foreground">{user?.name}</p>
        <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => navigate(`/u/${user?.handle}`)}>
        View my public page
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => navigate("/onboarding")}>
        Edit profile, services & channels
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
  );
}

export function AppCanvas({
  activeTab,
  backHref,
  children,
}: {
  activeTab?: AppTab;
  backHref?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#f4f7f5]">
      <Sidebar />
      <div className="flex min-h-screen flex-col lg:pl-64">
        <AppHeader backHref={backHref} />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-12 pt-4 sm:px-6 lg:px-10 lg:pt-8">
          {children}
        </main>
        {activeTab ? (
          <BottomTabs active={activeTab} />
        ) : (
          <div className="pb-[env(safe-area-inset-bottom)] lg:hidden" />
        )}
      </div>
    </div>
  );
}

export function BottomTabs({ active }: { active?: AppTab }) {
  return (
    <nav
      aria-label="App sections"
      className="sticky bottom-0 z-40 mt-auto border-t border-border bg-white pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 lg:hidden"
    >
      <ol className="grid grid-cols-5 items-end px-2">
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          if ("primary" in tab && tab.primary) {
            return (
              <li key={tab.key} className="flex justify-center">
                <a
                  href={`#${tab.href}`}
                  aria-label={tab.label}
                  className="-mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-primary/35 transition-transform hover:scale-105"
                >
                  <Plus className="h-6 w-6" strokeWidth={2.5} />
                </a>
              </li>
            );
          }
          const Icon = tab.icon;
          return (
            <li key={tab.key}>
              <a
                href={`#${tab.href}`}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg py-1 text-[10px] font-bold",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
                {tab.label}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
