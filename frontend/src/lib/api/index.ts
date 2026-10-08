"use client";

/**
 * The DEAL api — every backend call the frontend makes, centralized.
 *
 * Callers receive prototype-shape data (naira, lowercase enums — see
 * mappers.ts); every backend-specific detail is normalized here so screens
 * never touch kobo, envelopes, tokens or UPPER_CASE enums.
 */

import type {
  Booking,
  ClientRequest,
  Deal,
  Service,
} from "@/lib/types";
import { transport, API_BASE_URL, ApiError } from "./client";
import {
  buildSessionUser,
  clearSession,
  getAccessToken,
  saveTokens,
  setSessionUser,
  stashSignupName,
  takeStashedSignupName,
  type SessionUser,
} from "./session";
import {
  mapBooking,
  mapDeal,
  mapOverview,
  mapPublicCreator,
  mapRequest,
  mapService,
  mapSharedProjection,
  toMinor,
  type Overview,
  type PublicCreator,
  type SharedData,
} from "./mappers";
import type {
  AuthPayload,
  BookingDto,
  ClientRequestDto,
  CreatorOverviewDto,
  DealDetailDto,
  FileDownloadDto,
  FileUploadUrlDto,
  OwnedProfile,
  PaymentInitiationDto,
  PaymentVerificationDto,
  PublicProfileDto,
  SafeUserDto,
  ServiceDto,
  SharedProjectionDto,
} from "./backend.types";

export { ApiError, API_BASE_URL };
export { humanFileSize } from "./mappers";
export type { SessionUser, SharedData };
export type { PublicCreator } from "./mappers";
export { getSessionUser, setSessionUser, clearSession, takeStashedSignupName } from "./session";

export type PayMethod = "card" | "transfer" | "ussd";

/* ---- internal session assembly ---- */

/**
 * Exchange an auth payload for a session: persist tokens, merge the auth user
 * with the creator profile (404 = profile-less user — fresh signup or admin).
 */
async function establishSession(payload: AuthPayload): Promise<SessionUser> {
  saveTokens(payload.accessToken, payload.refreshToken);
  const profile = await fetchProfileOrNull(payload.user);
  const session = buildSessionUser(payload.user, profile);
  setSessionUser(session);
  return session;
}

async function fetchProfileOrNull(user: SafeUserDto): Promise<OwnedProfile | null> {
  // CLIENT-role users never have a creator profile — skip the round-trip.
  if (user.role === "CLIENT") return null;
  try {
    return await transport.get<OwnedProfile>("/creators/me");
  } catch (err) {
    if (err instanceof ApiError && err.code === "CREATOR_PROFILE_NOT_FOUND") return null;
    throw err;
  }
}

/* ---- auth ---- */

function isEmail(contact: string): boolean {
  return contact.includes("@");
}

export const auth = {
  async signup(body: { name: string; contact: string; password: string }) {
    const contact = body.contact.trim();
    const payload = await transport.post<AuthPayload>("/auth/signup", {
      // Backend signup keys off email/phone; the display name is captured at
      // onboarding (it lives on the creator profile, not the auth user).
      ...(isEmail(contact) ? { email: contact } : { phone: contact }),
      password: body.password,
    });
    stashSignupName(body.name);
    const user = await establishSession(payload);
    return { user };
  },

  async login(body: { contact: string; password: string }) {
    const payload = await transport.post<AuthPayload>("/auth/login", {
      identifier: body.contact.trim(),
      password: body.password,
    });
    const user = await establishSession(payload);
    return { user };
  },

  /** Silent revalidation on app mount — refresh the merged session user. */
  async me(): Promise<SessionUser> {
    const user = await transport.get<SafeUserDto>("/auth/me");
    const profile = await fetchProfileOrNull(user);
    const session = buildSessionUser(user, profile);
    setSessionUser(session);
    return session;
  },

  async logout(): Promise<void> {
    // Best-effort server revocation; the local session dies regardless.
    try {
      const refreshToken = localStorage.getItem("deal_refresh_token");
      if (refreshToken) {
        await transport.post("/auth/logout", { refreshToken });
      }
    } catch {
      // already invalid / network gone — nothing to do
    }
    clearSession();
  },
};

/* ---- creator profile ---- */

export interface ProfileInput {
  name: string;
  handle?: string;
  craft?: string;
  location?: string;
  bio?: string;
  preferredProvider?: "flutterwave" | "paystack";
}

function providerToDto(provider?: "flutterwave" | "paystack") {
  return provider ? provider.toUpperCase() : undefined;
}

export const creators = {
  /** First save (onboarding) — creates the profile and promotes the account. */
  async createProfile(body: ProfileInput) {
    const profile = await transport.post<OwnedProfile>("/creators/me", {
      name: body.name,
      handle: body.handle,
      ...(body.craft ? { craft: body.craft } : {}),
      ...(body.location ? { location: body.location } : {}),
      ...(body.bio ? { bio: body.bio } : {}),
      ...(body.preferredProvider ? { preferredProvider: providerToDto(body.preferredProvider) } : {}),
    });
    return profile;
  },

  async updateProfile(body: Partial<Omit<ProfileInput, "handle">> & { onboarded?: boolean }) {
    return transport.patch<OwnedProfile>("/creators/me", {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.craft !== undefined ? { craft: body.craft } : {}),
      ...(body.location !== undefined ? { location: body.location } : {}),
      ...(body.bio !== undefined ? { bio: body.bio } : {}),
      ...(body.preferredProvider !== undefined
        ? { preferredProvider: providerToDto(body.preferredProvider) }
        : {}),
      ...(body.onboarded !== undefined ? { onboarded: body.onboarded } : {}),
    });
  },

  /** Replace the whole channel set (backend enforces the primary invariant). */
  async replaceChannels(channels: { type: string; value: string; primary?: boolean }[]) {
    return transport.put<OwnedProfile>("/creators/me/channels", {
      channels: channels.map((channel) => ({
        type: channel.type.toUpperCase(),
        value: channel.value,
        isPrimary: channel.primary ?? false,
      })),
    });
  },
};

/* ---- services ---- */

export const services = {
  async create(body: { title: string; desc: string; from: number; duration: string; includes: string[] }) {
    const row = await transport.post<ServiceDto>("/creators/me/services", {
      title: body.title,
      description: body.desc,
      startingPriceMinor: toMinor(body.from),
      ...(body.duration ? { duration: body.duration } : {}),
      ...(body.includes.length ? { includes: body.includes } : {}),
    });
    return { service: mapService(row) };
  },

  async update(id: string, body: Partial<{ title: string; desc: string; from: number; duration: string; includes: string[]; isActive: boolean }>) {
    const row = await transport.patch<ServiceDto>(`/services/${id}`, {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.desc !== undefined ? { description: body.desc } : {}),
      ...(body.from !== undefined ? { startingPriceMinor: toMinor(body.from) } : {}),
      ...(body.duration !== undefined ? { duration: body.duration } : {}),
      ...(body.includes !== undefined ? { includes: body.includes } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    });
    return { service: mapService(row) };
  },

  async listMine() {
    const data = await transport.get<{ services: ServiceDto[] }>("/creators/me/services");
    return { services: data.services.map(mapService) };
  },
};

/* ---- requests ---- */

export const requests = {
  async listMine() {
    const data = await transport.get<{ requests: ClientRequestDto[] }>("/creators/me/requests");
    return { requests: data.requests.map(mapRequest) };
  },

  async detail(id: string) {
    const data = await transport.get<{ request: ClientRequestDto }>(`/requests/${id}`);
    return { request: mapRequest(data.request), service: data.request.service ? mapService(data.request.service) : null };
  },

  async act(id: string, action: "decline" | "archive") {
    const data = await transport.post<{ request: ClientRequestDto }>(`/requests/${id}`, { action });
    return { request: mapRequest(data.request) };
  },
};

/* ---- bookings ---- */

export const bookings = {
  async listMine() {
    const data = await transport.get<{ bookings: BookingDto[] }>("/creators/me/bookings");
    return { bookings: data.bookings.map(mapBooking) };
  },

  async act(id: string, action: "confirm" | "decline" | "complete" | "cancel") {
    const data = await transport.post<{ booking: BookingDto }>(`/bookings/${id}`, { action });
    return { booking: mapBooking(data.booking) };
  },
};

/* ---- deals (owner) ---- */

export interface CreateDealInput {
  requestId?: string | null;
  title?: string;
  serviceTitle?: string;
  clientName?: string;
  clientContact?: string;
}

export interface UpdateDealInput {
  title?: string;
  serviceTitle?: string;
  summary?: string;
  message?: string;
  scope?: string;
  location?: string;
  eventDate?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  /** Whole naira — converted to kobo here. */
  price?: number;
  depositPercent?: number;
  installmentsCount?: number;
  revisions?: number;
  deliverables?: string[];
  clientName?: string;
  clientContact?: string;
}

function updateDealBody(body: UpdateDealInput) {
  return {
    ...(body.title !== undefined ? { title: body.title } : {}),
    ...(body.serviceTitle !== undefined ? { serviceTitle: body.serviceTitle } : {}),
    ...(body.summary !== undefined ? { summary: body.summary } : {}),
    ...(body.message !== undefined ? { message: body.message } : {}),
    ...(body.scope !== undefined ? { scope: body.scope } : {}),
    ...(body.location !== undefined ? { location: body.location } : {}),
    ...(body.eventDate !== undefined ? { eventDate: body.eventDate || null } : {}),
    ...(body.startDate !== undefined ? { startDate: body.startDate || null } : {}),
    ...(body.dueDate !== undefined ? { dueDate: body.dueDate || null } : {}),
    ...(body.price !== undefined ? { priceMinor: toMinor(body.price) } : {}),
    ...(body.depositPercent !== undefined ? { depositPercent: body.depositPercent } : {}),
    ...(body.installmentsCount !== undefined ? { installmentsCount: body.installmentsCount } : {}),
    ...(body.revisions !== undefined ? { revisions: body.revisions } : {}),
    ...(body.deliverables !== undefined ? { deliverables: body.deliverables } : {}),
    ...(body.clientName !== undefined ? { clientName: body.clientName } : {}),
    ...(body.clientContact !== undefined ? { clientContact: body.clientContact } : {}),
  };
}

export const deals = {
  async create(body: CreateDealInput) {
    const data = await transport.post<{ deal: DealDetailDto }>("/deals", {
      ...(body.requestId ? { requestId: body.requestId } : {}),
      ...(body.title ? { title: body.title } : {}),
      ...(body.serviceTitle ? { serviceTitle: body.serviceTitle } : {}),
      ...(body.clientName ? { clientName: body.clientName } : {}),
      ...(body.clientContact ? { clientContact: body.clientContact } : {}),
    });
    return { deal: mapDeal(data.deal) };
  },

  async list() {
    const data = await transport.get<{ deals: DealDetailDto[] }>("/deals");
    return { deals: data.deals.map(mapDeal) };
  },

  async detail(id: string) {
    const data = await transport.get<{ deal: DealDetailDto }>(`/deals/${id}`);
    return { deal: mapDeal(data.deal) };
  },

  async update(id: string, body: UpdateDealInput) {
    const data = await transport.patch<{ deal: DealDetailDto }>(`/deals/${id}`, updateDealBody(body));
    return { deal: mapDeal(data.deal) };
  },

  async act(id: string, body: { action: "send" | "deliver" | "release-files"; note?: string }) {
    const data = await transport.post<{ deal: DealDetailDto }>(`/deals/${id}/actions`, {
      action: body.action,
      ...(body.note ? { note: body.note } : {}),
    });
    return { deal: mapDeal(data.deal) };
  },
};

/* ---- shared (client capability link) ---- */

export type SharedAction = "request-changes" | "decline" | "approve" | "complete" | "review" | "dispute";

export const shared = {
  async deal(token: string): Promise<SharedData> {
    return mapSharedProjection(await transport.get<SharedProjectionDto>(`/shared/${token}`));
  },

  async act(token: string, body: { action: SharedAction; note?: string; rating?: number }): Promise<SharedData> {
    return mapSharedProjection(
      await transport.post<SharedProjectionDto>(`/shared/${token}/actions`, {
        action: body.action,
        ...(body.note ? { note: body.note } : {}),
        ...(body.rating !== undefined ? { rating: body.rating } : {}),
      }),
    );
  },

  /** Mint a hosted-checkout link — the amount is the server-computed next due slot. */
  async initializePayment(token: string, body: { provider: "flutterwave" | "paystack"; method: PayMethod }) {
    const data = await transport.post<PaymentInitiationDto>(`/shared/${token}/payments/initialize`, {
      provider: body.provider.toUpperCase(),
      method: body.method.toUpperCase(),
    });
    return {
      reference: data.reference,
      provider: data.provider.toLowerCase() as "flutterwave" | "paystack",
      method: data.method.toLowerCase() as PayMethod,
      amount: data.amountMinor / 100,
      label: data.label,
      link: data.link,
    };
  },

  /** Ask the rail (through the backend) what became of a charge. */
  async verifyPayment(token: string, reference: string) {
    const data = await transport.post<PaymentVerificationDto>(`/shared/${token}/payments/verify`, {
      reference,
    });
    return {
      status: data.status,
      reference: data.reference,
      paidAmount: data.payment ? data.payment.amountMinor / 100 : 0,
    };
  },

  /** Signed, time-limited download URL for one of the deal's files. */
  async fileDownloadUrl(token: string, fileId: string): Promise<string> {
    const data = await transport.get<FileDownloadDto>(`/shared/${token}/files/${fileId}/download-url`);
    return data.download.downloadUrl;
  },
};

/* ---- files (creator uploads) ---- */

export type UploadRole = "PREVIEW" | "FINAL";

export const files = {
  /**
   * Full browser-side upload: mint a presigned PUT, stream the bytes straight
   * to R2 (never through the API), then register the object server-side.
   */
  async upload(
    dealId: string,
    role: UploadRole,
    file: { name: string; mime: string; size: number; blob: Blob },
  ): Promise<void> {
    const mint = await transport.post<FileUploadUrlDto>("/files/upload-url", {
      dealId,
      role,
      filename: file.name,
      mime: file.mime,
      ...(file.size > 0 ? { sizeBytes: file.size } : {}),
    });
    const put = await fetch(mint.upload.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": mint.upload.mime },
      body: file.blob,
    });
    if (!put.ok) {
      throw new ApiError("UPLOAD_FAILED", "The file upload was rejected. Try again.", put.status);
    }
    await transport.post<{ file: unknown }>("/files/finalize", {
      dealId,
      role,
      storageKey: mint.upload.storageKey,
      mime: mint.upload.mime,
      filename: file.name,
    });
  },

  /** Signed download URL for an owner-side file (any role). */
  async downloadUrl(fileId: string): Promise<string> {
    const data = await transport.get<FileDownloadDto>(`/files/${fileId}/download-url`);
    return data.download.downloadUrl;
  },
};

/* ---- dashboard ---- */

export const dashboard = {
  overview(): Promise<Overview> {
    return transport.get<CreatorOverviewDto>("/creators/me/overview").then(mapOverview);
  },
};

/* ---- public creator pages (unauthenticated) ---- */

export const publicApi = {
  async creator(handle: string) {
    const data = await transport.get<{ creator: PublicProfileDto; services: ServiceDto[] }>(
      `/public/${encodeURIComponent(handle)}`,
    );
    return {
      creator: mapPublicCreator(data.creator),
      services: data.services.map(mapService),
    };
  },

  async sendRequest(
    handle: string,
    body: {
      serviceId: string;
      clientName: string;
      clientContact: string;
      eventDate?: string;
      location?: string;
      /** Whole naira — converted to kobo here. */
      budgetMin?: number;
      budgetMax?: number;
      description: string;
      notes?: string;
    },
  ) {
    const data = await transport.post<{ request: ClientRequestDto }>(
      `/public/${encodeURIComponent(handle)}/requests`,
      {
        serviceId: body.serviceId,
        clientName: body.clientName,
        clientContact: body.clientContact,
        ...(body.eventDate ? { eventDate: body.eventDate } : {}),
        ...(body.location ? { location: body.location } : {}),
        ...(body.budgetMin !== undefined ? { budgetMinMinor: toMinor(body.budgetMin) } : {}),
        ...(body.budgetMax !== undefined ? { budgetMaxMinor: toMinor(body.budgetMax) } : {}),
        description: body.description,
        ...(body.notes ? { notes: body.notes } : {}),
      },
    );
    return { request: mapRequest(data.request) };
  },

  async bookSession(
    handle: string,
    body: {
      sessionType: string;
      serviceId?: string;
      date: string;
      time: string;
      clientName: string;
      clientContact: string;
      note?: string;
    },
  ) {
    const data = await transport.post<{ booking: BookingDto }>(
      `/public/${encodeURIComponent(handle)}/bookings`,
      {
        sessionType: body.sessionType,
        ...(body.serviceId ? { serviceId: body.serviceId } : {}),
        date: body.date,
        time: body.time,
        clientName: body.clientName,
        clientContact: body.clientContact,
        ...(body.note ? { note: body.note } : {}),
      },
    );
    return { booking: mapBooking(data.booking) };
  },
};

/* ---- compatibility object ---- */

/**
 * Single import surface for screens. Kept as an `api` object (the prototype's
 * shape) so screen diffs stay minimal; me-scoped calls drop the id parameter
 * the prototype used to pass.
 */
export const api = {
  // auth / session
  signup: auth.signup,
  login: auth.login,
  logout: auth.logout,
  me: auth.me,
  // profile + services (onboarding, money)
  createProfile: creators.createProfile,
  updateProfile: creators.updateProfile,
  updateChannels: creators.replaceChannels,
  addService: services.create,
  updateService: services.update,
  myServices: services.listMine,
  // dashboard aggregates
  overview: dashboard.overview,
  // requests
  creatorRequests: requests.listMine,
  requestDetail: requests.detail,
  requestAction: requests.act,
  // bookings
  bookings: bookings.listMine,
  bookingAction: bookings.act,
  // deals
  createDeal: deals.create,
  deals: deals.list,
  deal: deals.detail,
  updateDeal: deals.update,
  dealAction: deals.act,
  // shared client surface
  sharedDeal: shared.deal,
  sharedAction: shared.act,
  initializeSharedPayment: shared.initializePayment,
  verifySharedPayment: shared.verifyPayment,
  sharedFileDownloadUrl: shared.fileDownloadUrl,
  // public creator pages
  publicCreator: publicApi.creator,
  sendRequest: publicApi.sendRequest,
  bookSession: publicApi.bookSession,
  // files
  uploadDealFile: files.upload,
  fileDownloadUrl: files.downloadUrl,
};

/** Session user type re-export for screens (prototype parity). */
export type { Booking, ClientRequest, Deal, Service } from "@/lib/types";
