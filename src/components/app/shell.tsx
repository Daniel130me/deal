"use client";

import { Component, Suspense, lazy } from "react";
import { AppProvider, useApp } from "@/components/app/context";
import { Landing } from "@/components/landing/landing";
import { Loader2 } from "lucide-react";

const AuthScreen = lazy(() => import("@/components/app/screens/auth"));
const OnboardingScreen = lazy(() => import("@/components/app/screens/onboarding"));
const DashboardScreen = lazy(() => import("@/components/app/screens/dashboard"));
const RequestsScreen = lazy(() => import("@/components/app/screens/requests"));
const WizardScreen = lazy(() => import("@/components/app/screens/wizard"));
const DealDetailScreen = lazy(() => import("@/components/app/screens/deal-detail"));
const DealsListScreen = lazy(() => import("@/components/app/screens/deals-list"));
const ClientDealScreen = lazy(() => import("@/components/app/screens/client-deal"));
const PublicPageScreen = lazy(() => import("@/components/app/screens/public-page"));
const BookingsScreen = lazy(() => import("@/components/app/screens/bookings"));
const MoneyScreen = lazy(() => import("@/components/app/screens/money"));

function ScreenLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

class RouteErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-lg font-extrabold text-foreground">Something went wrong</p>
          <p className="max-w-sm text-sm text-muted-foreground">{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => {
              this.setState({ error: null });
              window.location.hash = "#/";
              window.location.reload();
            }}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white"
          >
            Back to home
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function Router() {
  const { route, user } = useApp();
  const parts = route.split("/").filter(Boolean);

  // public marketing landing
  if (parts.length === 0) {
    return <Landing />;
  }

  // client deal link — no auth required
  if (parts[0] === "c" && parts[1]) {
    return (
      <Suspense fallback={<ScreenLoading />}>
        <ClientDealScreen token={parts[1]} />
      </Suspense>
    );
  }

  // public creator page
  if (parts[0] === "u" && parts[1]) {
    return (
      <Suspense fallback={<ScreenLoading />}>
        <PublicPageScreen handle={parts[1]} />
      </Suspense>
    );
  }

  // auth screens
  if (parts[0] === "login" || parts[0] === "signup") {
    return (
      <Suspense fallback={<ScreenLoading />}>
        <AuthScreen mode={parts[0] === "login" ? "login" : "signup"} />
      </Suspense>
    );
  }

  // everything below requires a signed-in creator
  if (!user) {
    return (
      <Suspense fallback={<ScreenLoading />}>
        <AuthScreen mode="login" redirectTo={route} />
      </Suspense>
    );
  }

  if (parts[0] === "onboarding") {
    return (
      <Suspense fallback={<ScreenLoading />}>
        <OnboardingScreen />
      </Suspense>
    );
  }

  if (parts[0] === "dashboard") {
    return (
      <Suspense fallback={<ScreenLoading />}>
        <DashboardScreen />
      </Suspense>
    );
  }

  if (parts[0] === "requests") {
    return (
      <Suspense fallback={<ScreenLoading />}>
        <RequestsScreen requestId={parts[1] ?? null} />
      </Suspense>
    );
  }

  if (parts[0] === "bookings") {
    return (
      <Suspense fallback={<ScreenLoading />}>
        <BookingsScreen />
      </Suspense>
    );
  }

  if (parts[0] === "money") {
    return (
      <Suspense fallback={<ScreenLoading />}>
        <MoneyScreen />
      </Suspense>
    );
  }

  if (parts[0] === "deals") {
    if (parts[1] === "new") {
      return (
        <Suspense fallback={<ScreenLoading />}>
          <WizardScreen requestParam={parts[2] ?? null} />
        </Suspense>
      );
    }
    if (parts[1]) {
      return (
        <Suspense fallback={<ScreenLoading />}>
          <DealDetailScreen dealId={parts[1]} />
        </Suspense>
      );
    }
    return (
      <Suspense fallback={<ScreenLoading />}>
        <DealsListScreen />
      </Suspense>
    );
  }

  // unknown → home
  return <Landing />;
}

export function AppShell() {
  return (
    <AppProvider>
      <RouteErrorBoundary>
        <Router />
      </RouteErrorBoundary>
    </AppProvider>
  );
}
