"use client";

import type {
  ClientRequest,
  Deal,
  Service,
  User,
} from "@/lib/types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Something went wrong.");
  }
  return data as T;
}

export type SafeUser = Omit<User, "password">;

export const api = {
  signup: (body: { name: string; contact: string; password: string }) =>
    request<{ user: SafeUser }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  login: (body: { contact: string; password: string }) =>
    request<{ user: SafeUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateUser: (id: string, body: Partial<SafeUser>) =>
    request<{ user: SafeUser }>(`/api/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  addService: (
    id: string,
    body: { title: string; desc: string; from: number; duration: string; includes: string[] }
  ) =>
    request<{ service: Service }>(`/api/users/${id}/services`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  overview: (id: string) =>
    request<{
      creator: SafeUser;
      stats: {
        totalRequests: number;
        newRequests: number;
        pendingDeals: number;
        ongoingDeals: number;
        completedDeals: number;
        newThisWeek: number;
      };
      money: { earnedThisMonth: number; inEscrow: number; expectedBalance: number };
      earningsSeries: { month: string; amount: number }[];
      requests: (ClientRequest & { service: Service | null })[];
      deals: {
        id: string;
        ref: string;
        title: string;
        client: string;
        status: Deal["status"];
        price: number;
        balance: number;
        dueDate: string;
        updatedAt: string;
      }[];
    }>(`/api/creators/${id}/overview`),

  creatorRequests: (id: string) =>
    request<{ requests: (ClientRequest & { service: Service | null })[] }>(
      `/api/creators/${id}/requests`
    ),

  requestDetail: (id: string) =>
    request<{ request: ClientRequest; service: Service | null }>(`/api/requests/${id}`),

  requestAction: (id: string, action: "decline" | "archive") =>
    request<{ request: ClientRequest }>(`/api/requests/${id}`, {
      method: "POST",
      body: JSON.stringify({ action }),
    }),

  createDeal: (body: {
    creatorId: string;
    requestId?: string | null;
    title?: string;
    serviceTitle?: string;
    clientName?: string;
    clientContact?: string;
  }) =>
    request<{ deal: Deal }>("/api/deals", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  deals: (creatorId: string) =>
    request<{ deals: Deal[] }>(`/api/deals?creatorId=${creatorId}`),

  deal: (id: string) =>
    request<{ deal: Deal; creator: SafeUser }>(`/api/deals/${id}`),

  updateDeal: (id: string, body: Partial<Deal>) =>
    request<{ deal: Deal }>(`/api/deals/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  dealAction: (
    id: string,
    body: { action: "send" | "deliver" | "release-files" | "confirm-payout"; note?: string }
  ) =>
    request<{ deal: Deal }>(`/api/deals/${id}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  publicCreator: (handle: string) =>
    request<{ creator: SafeUser; services: Service[] }>(`/api/public/${handle}`),

  sendRequest: (
    handle: string,
    body: {
      serviceId: string;
      clientName: string;
      clientContact: string;
      eventDate?: string;
      location?: string;
      budgetMin?: number;
      budgetMax?: number;
      description: string;
      notes?: string;
    }
  ) =>
    request<{ request: ClientRequest }>(`/api/public/${handle}/requests`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  sharedDeal: (token: string) =>
    request<{
      deal: Deal;
      creator: {
        id: string;
        name: string;
        handle: string;
        craft: string;
        location: string;
        verified: boolean;
        whatsapp: string;
      };
      amounts: { total: number; deposit: number; balance: number; paid: number; due: number };
    }>(`/api/shared/${token}`),

  sharedAction: (
    token: string,
    body: {
      action:
        | "pay-deposit"
        | "request-changes"
        | "approve"
        | "pay-balance"
        | "dispute"
        | "review";
      note?: string;
      method?: string;
      rating?: number;
    }
  ) =>
    request<{ deal: Deal }>(`/api/shared/${token}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  resetDemo: () => request<{ ok: boolean }>("/api/admin/reset", { method: "POST" }),
};
