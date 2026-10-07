# DEAL Prototype — Upgrade Spec (v2)

Five upgrades requested by the client. The prototype already exists (SPA at `/`, hash router, JSON store in `db/db.json`, API routes under `src/app/api`, shared kit `src/components/app/kit.tsx`). This spec is the single source of truth — implement exactly these contracts.

## U1. Installments + escrow releases ONLY on client approval

Money rule: **every payment the client makes goes into Payaza escrow and is NOT received by the creator until the client approves the completed work.** Payments made after approval are released instantly (work already approved).

### New deal payment plan
- `Deal.depositPercent` (30 | 50 | 70 | 100) — unchanged.
- NEW `Deal.installmentsCount: number` (0 | 1 | 2 | 3) — how many installments the remaining balance is split into. `0` when `depositPercent === 100`. Default 2.
- Schedule: deposit first, then N equal installments (last absorbs rounding).
- Client can pay **next due** (one schedule slot) or **pay all remaining** (single payment covering what's left) at any time after acceptance.

### New payment record (`DealPayment`)
```ts
{ id, type: "deposit" | "installment" | "balance", label: string, amount: number,
  method: "card" | "transfer" | "ussd", methodLabel: string,
  provider: "payaza", reference: string /* PZ-XXXXXXXX */,
  status: "held" | "released", paidAt: string, releasedAt?: string }
```
- `label`: "Deposit (50%)", "Installment 1 of 2", "Balance payment".
- `reference` format: `PZ-` + 8 uppercase hex chars.

### Status flow (changed parts only)
```
sent --pay-deposit(Payaza, held)--> active --deliver--> delivered
delivered --client approve--> approved   ← ALL held payments auto-release here
approved --client pays remaining (released instantly)--> (stays approved; fullyPaid computed)
approved + fullyPaid --creator "upload final files"--> files_released --client confirm/review--> completed
```
- `balance_paid` status is REMOVED from the flow (keep in the type union so old switch statements don't break, but never set it).
- `confirm-payout` creator action is REMOVED — release happens automatically on `approve`.
- Client `approve` action: set `approvedAt`, mark every `held` payment `released` (+`releasedAt`), push events: `approved` (client) then `payment_released` (system, "₦X released to creator's Payaza payout account"). If remaining > 0, also a client-facing hint that balance still unlocks files.
- Shared actions on `/api/shared/[token]` POST: `pay-deposit` (unchanged name, now `method: "card"|"transfer"|"ussd"`, generates PZ reference), NEW `pay-next` (next schedule slot; allowed in `active|delivered|revision|approved`), NEW `pay-remaining` (single payment for everything left; allowed in same states; `type:"balance"`, `label:"Balance payment"`), NEW `complete` (from `files_released`, sets `completedAt`, optional rating → pushes `completed` event). Pre-approval states (`active|delivered|revision`) → payment `held`; post-approval (`approved|files_released|completed`) → payment `released` immediately + event "Payment received — work already approved".
- Creator actions on `/api/deals/[id]` POST: `send`, `deliver` unchanged; `release-files` now requires `status === "approved"` AND remaining === 0 (message otherwise: "Final files unlock when the deal is fully paid and approved."), sets `files_released`; `confirm-payout` deleted.

### Shared helpers in `src/lib/types.ts`
```ts
export function remainingBalance(deal: Deal): number            // price - Σpayments
export function isFullyPaid(deal: Deal): boolean                // remaining === 0
export function isApproved(deal: Deal): boolean                 // status in approved|files_released|completed
export function paymentSchedule(deal: Deal)                     // slots [{type,label,amount,status:"paid"|"due"}]
  // walks payments in order consuming amounts against the ideal schedule
export function nextDueSlot(deal: Deal)                         // first "due" slot or null
```

## U2. Payaza checkout (investor-realistic)

- Payaza = real Nigerian payment processor. Brand: **purple #9545FE**, deep purple #29003D / #440066, mint #F2F9EF. Official logo file already at **`/payaza/payaza-logo.svg`** (public folder).
- Build ONE reusable component `src/components/app/payaza-checkout.tsx` (owned by Task 2-b): a Dialog that mimics a real Payaza checkout:
  1. **Header**: Payaza logo (img `/payaza/payaza-logo.svg`, h-6), "Secure checkout" + deal ref; footer "Powered by Payaza · PCI-DSS secured".
  2. **Summary**: amount due big, deal title, creator name, escrow explainer line: "Funds are held by Payaza escrow — {creator} only receives payment when you approve the completed work."
  3. **Method tabs**: Card (purple-accented form: number/expiry/CVV/name, demo-prefill button), Bank Transfer (one-time account "Payaza Commercial Bank 88 0123456712" + 30:00 countdown + "I've sent it"), USSD (`*737*000*amount#` style code per method).
  4. **Processing**: 1.6s "Contacting Payaza…" → "Authorizing payment…" spinner states, then success screen: green check, "₦X secured in escrow", PZ reference with copy button, "Released to {creator} only after you approve the completed work."
  5. On success it calls the API pay action (`method` passed through), then shows the returned `reference`.
- Payaza badges also appear: creator Money screen ("Payouts via Payaza" card with payout account `Tobi Visuals •••4532`), client deal escrow banners, deal record rows show PZ references.

## U3. Booking feature

Client can book a session with the creator (from the public page). Creator manages bookings.

### Data
```ts
export interface Booking {
  id: string; ref: string;           // BKG-001 via nextRef("BKG", db.bookings)
  creatorId: string; serviceId?: string;
  sessionType: string;               // service title or "General consultation"
  clientName: string; clientContact: string;
  date: string;                      // ISO yyyy-mm-dd
  time: string;                      // "10:00"
  note: string;
  status: "requested" | "confirmed" | "completed" | "declined" | "cancelled";
  createdAt: string;
}
```
`DB` gains `bookings: Booking[]`.

### API
- `POST /api/public/[handle]/bookings` `{sessionType, serviceId?, date, time, clientName, clientContact, note?}` → creates `requested`, returns `{booking}`. 400 if missing fields.
- `GET /api/creators/[id]/bookings` → `{bookings}` sorted newest first.
- `POST /api/bookings/[id]` `{action: "confirm"|"decline"|"complete"|"cancel"}` → status transitions requested→confirmed/declined, confirmed→completed/cancelled.
- `overview` response gains `bookingsUpcoming: number` and `bookings: Booking[]` (top 3).

### UI
- Public page (`#/u/:handle`): "Book a session" button next to each service + in hero. Opens booking form: session type chips (services + "General consultation"), date picker (next 14 days as a grid), time slots (09:00–17:00), name/contact/note → success screen ("Booking request sent — {creator} will confirm shortly").
- Creator: new `#/bookings` screen (Task 2-a): cards with client, session type, date/time, ref, StatusChip; actions Confirm/Decline (requested), Complete/Cancel (confirmed). Upcoming bookings card on dashboard too.

## U4. Multiple communication channels (creator's choice)

```ts
export type ChannelType = "whatsapp" | "telegram" | "instagram" | "email" | "phone_call" | "sms" | "x_twitter" | "linkedin" | "tiktok";
export interface CreatorChannel { type: ChannelType; value: string; primary?: boolean }
```
- `User.channels: CreatorChannel[]` (keep `whatsapp` field for compat).
- `CHANNEL_META` in `src/lib/types.ts`: `{ label, icon: LucideIcon name string, href(value): string }` per type — deep links: `wa.me/<digits>`, `t.me/<user>`, `ig.me/m/<user>`, `mailto:`, `tel:`, `sms:`, `x.com/<user>`, `linkedin.com/in/<user>`, `tiktok.com/@<user>`.
- Onboarding (Task 2-b): profile step gains a "How clients reach you" editor — add channels (type select + value input), set one primary, remove.
- Public page (Task 2-b): "Reach {name} on" row of channel icon-buttons using deep links.
- Client deal (Task 2-b): "Message {creator}" opens a popover listing the creator's channels (from shared payload — add `channels` to the safe creator in `shared/[token]` GET).
- Wizard sent screen (Task 2-b): keep copy-link; share row uses channels (WhatsApp share, Telegram share `t.me/share/url`, Email with subject/body) when available.
- Seed Tobi with: whatsapp +2348012345678 (primary), instagram `@tobi.a.visuals`, email `hello@tobiavisuals.ng`.

## U5. Responsive app-like redesign (ALL screen sizes)

Kill the `max-w-lg` phone canvas. New chrome in `src/components/app/chrome.tsx` (owned by main agent):

- **Desktop (lg+)**: fixed left **sidebar** `w-64` — logo, nav (Dashboard `/dashboard`, Projects `/deals`, Requests `/requests`, Bookings `/bookings`, Money `/money`), prominent "New deal" button, user card at bottom (avatar, name, "View public page", account menu incl. Reset demo data). Content column `lg:pl-64`; page container `mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-10 py-6 lg:py-10`.
- **Mobile (<lg)**: keep sticky `AppHeader` + bottom tab bar. Bottom tabs (5): Dashboard, Projects, [center + FAB New deal], Bookings, Money. Requests reachable via header bell (badge = new requests count).
- **Money screen** (new `#/money`, Task 2-a): tiles (In escrow / Released all-time / Expected balance), "Payouts via Payaza" payout-account card, payments table (deal, type, amount, PZ ref, Held/Released chip, date) with filter chips.
- Client deal + public page frames: widen to `max-w-2xl lg:max-w-4xl` with generous padding; public page hero can go 2-column at lg. No cramped content anywhere: cards `p-5 lg:p-6`, sections `space-y-6 lg:space-y-8`.
- Stats grids: `grid-cols-2 lg:grid-cols-4`. Lists: `space-y-3`, hover states. Everything stays light-theme, green #0FA958 primary, navy ink, Plus Jakarta Sans.

## Design language (unchanged)
- Primary green `#0fa958`, ink `#0e1f33`, mint accent `#e8f6ee`, canvas `#f4f7f5` app / white cards, radius `0.75rem`, shadcn/ui components, lucide icons, sonner toasts, framer-motion for screen transitions (subtle, 200–300ms).
- Payaza purple ONLY inside checkout + payout/pay branding elements — never as DEAL's primary.

## API client contract (`src/lib/api.ts` — updated by main agent before screens are built)
- `api.bookings(creatorId)`, `api.bookingAction(id, action)`, `api.bookSession(handle, body)` (public).
- `api.sharedAction` actions: `"pay-deposit" | "pay-next" | "pay-remaining" | "request-changes" | "approve" | "complete" | "dispute" | "review"` with `method?: "card"|"transfer"|"ussd"`.
- `api.dealAction` actions: `"send" | "deliver" | "release-files"`.
- `sharedDeal` response creator includes `channels: CreatorChannel[]`.
- `overview` response adds `money.releasedAllTime`, `bookingsUpcoming`, `bookings`.
- `updateUser` PATCH whitelist adds `channels`.

## Seed data (main agent rewrites `db/seed.json` + `db/db.json`)
Users: Tobi A. (u_tobi, channels above). Services: 4 (unchanged). Bookings: 3 (Lola requested Fri 11:00 consultation; TechConnect confirmed scouting day; Glow completed portrait session). Deals:
1. DEAL-001 Lola & Tunde ₦120,000 · 50% · 2 installments · **active** — deposit ₦60,000 held (card, PZ-…) + installment ₦30,000 held (transfer).
2. DEAL-002 Glow Skincare ₦60,000 · 50% · 2 installments · **sent**.
3. DEAL-003 TechConnect ₦150,000 · 50% · 2 installments · **delivered** — deposit ₦75,000 held (awaiting client review).
4. DEAL-004 Ezekiel ₦120,000 · 100% · 0 installments · **approved** — ₦120,000 released (fully paid, awaiting final files upload).
5. DEAL-005 Lekki Property ₦80,000 · 50% · 1 installment · **completed** — deposit ₦40,000 released + installment ₦40,000 released, full event trail + finalFiles.
All payment records carry `provider:"payaza"`, PZ references, method/methodLabel.

## File ownership (to avoid conflicts)
- Main agent: `src/lib/types.ts`, `store.ts`, `api.ts`, all API routes, `db/*.json`, `chrome.tsx`, `shell.tsx`, `kit.tsx`.
- Task 2-a: `screens/dashboard.tsx`, `screens/money.tsx` (new), `screens/bookings.tsx` (new), `screens/deals-list.tsx`, `screens/deal-detail.tsx`.
- Task 2-b: `screens/client-deal.tsx`, `components/app/payaza-checkout.tsx` (new), `screens/public-page.tsx`, `screens/wizard.tsx`, `screens/onboarding.tsx`, `screens/auth.tsx` (only if needed).
- Task 2-c: `src/components/landing/*` only.
