/**
 * Demo records ported 1:1 from the prototype's `frontend/db/seed.json` (Phase 3 migration).
 *
 * Embedded as typed constants (instead of reading the prototype JSON at runtime) so the
 * backend stays deployable standalone — docs/target-architecture.md §2 forbids any
 * frontend↔backend coupling, including file reads.
 *
 * Transformations applied vs. the prototype JSON (documented in docs/migration-plan.md §2):
 *   - money: naira integers -> kobo (×100) in every *Minor field
 *   - enums: lowercase strings -> SCREAMING_CASE Prisma enum values
 *   - password: stored as Argon2id hash at seed time (see seed.ts)
 *   - deliverables/payments/events/deliveries/finalFiles: embedded arrays -> relational rows
 *
 * NOT ported (decision recorded in the Phase 3 walkthrough):
 *   - settings.earningsSeries — the dashboard chart is aggregated from released
 *     DealPayment rows (Phase 9); a static series would drift from the source of truth.
 *   - (superseded in Phase 9) the 5-star review mentioned in DEAL-005's completion
 *     event is now stored for real — see DEMO_REVIEWS.
 */
import type { Prisma } from '@prisma/client';

/** Prototype timestamps were generated around this instant; kept for demo realism. */
const T = '2026-02-24T02:18:33.249Z';

export const DEMO_USER = {
  id: 'u_tobi',
  email: 'tobi@deal.ng',
  phone: '+234 801 234 5678',
  role: 'CREATOR',
  status: 'ACTIVE',
  createdAt: new Date(T),
} satisfies Prisma.UserUncheckedCreateInput;

/**
 * 1:1 User ↔ CreatorProfile share the id value on purpose: every prototype route,
 * share link and public handle resolves via "u_tobi", and seed ids are preserved so
 * existing demo links keep working after the Phase 10 cutover.
 */
export const DEMO_PROFILE = {
  id: 'u_tobi',
  userId: 'u_tobi',
  name: 'Tobi A.',
  handle: 'tobi-a',
  craft: 'Photographer',
  location: 'Akure, Ondo State',
  bio: 'Story-driven photography for brands, weddings and people. 6 years behind the lens, 200+ happy clients across Nigeria.',
  verified: true,
  onboarded: true,
  preferredProvider: 'PAYSTACK',
  createdAt: new Date(T),
} satisfies Prisma.CreatorProfileUncheckedCreateInput;

export const DEMO_CHANNELS: Prisma.CreatorChannelUncheckedCreateInput[] = [
  { creatorId: 'u_tobi', type: 'WHATSAPP', value: '+2348012345678', isPrimary: true },
  { creatorId: 'u_tobi', type: 'INSTAGRAM', value: '@tobi.a.visuals', isPrimary: false },
  { creatorId: 'u_tobi', type: 'EMAIL', value: 'hello@tobiavisuals.ng', isPrimary: false },
];

export const DEMO_SERVICES: Prisma.ServiceUncheckedCreateInput[] = [
  {
    id: 'sv_prewedding',
    creatorId: 'u_tobi',
    title: 'Pre-wedding Photography',
    description:
      "A relaxed couple's session that tells your story — location scouting, styling guide and a same-week gallery.",
    startingPriceMinor: 12_000_000,
    duration: 'Half day',
    isPopular: true,
    includes: ['2 outfit changes', '40+ edited photos', 'Private online gallery', 'Print release'],
  },
  {
    id: 'sv_portrait',
    creatorId: 'u_tobi',
    title: 'Portrait Session',
    description: 'Clean studio or outdoor portraits for personal brands, LinkedIn and family keepsakes.',
    startingPriceMinor: 5_000_000,
    duration: '2 hours',
    isPopular: false,
    includes: ['1 outfit change', '15 edited photos', 'Web + print sizes'],
  },
  {
    id: 'sv_event',
    creatorId: 'u_tobi',
    title: 'Event Photography',
    description:
      'Full coverage of your event — arrivals to the last dance, delivered in a shareable gallery.',
    startingPriceMinor: 15_000_000,
    duration: 'Full day',
    isPopular: false,
    includes: [
      'Up to 8 hours coverage',
      '150+ edited photos',
      '48-hour highlight set',
      'Private online gallery',
    ],
  },
  {
    id: 'sv_video',
    creatorId: 'u_tobi',
    title: 'Short Video Coverage',
    description:
      'A 60–90 second cinematic recap of your event or brand day, vertical and landscape cuts.',
    startingPriceMinor: 8_000_000,
    duration: 'Half day',
    isPopular: false,
    includes: ['Cinematic edit', 'Vertical + 16:9 cuts', 'Licensed music', '3 revision rounds'],
  },
];

export const DEMO_REQUESTS: Prisma.ClientRequestUncheckedCreateInput[] = [
  {
    id: 'r_lola',
    ref: 'REQ-2025-00021',
    creatorId: 'u_tobi',
    serviceId: 'sv_prewedding',
    clientName: 'Lola Adeyemi',
    clientContact: '+234 802 555 1212',
    eventDate: new Date('2026-11-06'),
    location: 'Ikoyi, Lagos',
    budgetMinMinor: 10_000_000,
    budgetMaxMinor: 15_000_000,
    description:
      'We got engaged in December and want a pre-wedding session that feels like us — warm, playful, maybe Lekki conservation centre at golden hour.',
    notes: 'Fiance is camera-shy, so a relaxed vibe is key.',
    status: 'NEW',
    createdAt: new Date('2026-09-30T02:18:33.249Z'),
  },
  {
    id: 'r_tech',
    ref: 'REQ-2025-00022',
    creatorId: 'u_tobi',
    serviceId: 'sv_event',
    clientName: 'TechConnect Africa',
    clientContact: 'events@techconnect.africa',
    eventDate: new Date('2026-10-23'),
    location: 'Landmark Centre, Victoria Island',
    budgetMinMinor: 12_000_000,
    budgetMaxMinor: 20_000_000,
    description:
      'Annual tech summit — about 300 guests. We need arrivals, panel sessions, networking and the after-party covered, plus a quick highlight set for press.',
    notes: 'Press team needs 10 photos within 24 hours.',
    status: 'NEW',
    createdAt: new Date('2026-10-01T02:18:33.249Z'),
  },
  {
    id: 'r_glow',
    ref: 'REQ-2025-00020',
    creatorId: 'u_tobi',
    serviceId: 'sv_portrait',
    clientName: 'Glow Skincare',
    clientContact: '+234 809 444 2020',
    eventDate: new Date('2026-10-16'),
    location: 'Lekki Phase 1, Lagos',
    budgetMinMinor: 5_000_000,
    budgetMaxMinor: 9_000_000,
    description: 'Founder portraits + team headshots for our new website launch.',
    notes: '',
    status: 'REPLIED',
    createdAt: new Date('2026-09-26T02:18:33.249Z'),
  },
];

export const DEMO_BOOKINGS: Prisma.BookingUncheckedCreateInput[] = [
  {
    id: 'bk_001',
    ref: 'BKG-001',
    creatorId: 'u_tobi',
    serviceId: 'sv_portrait',
    sessionType: 'Portrait Session',
    clientName: 'Lola Adeyemi',
    clientContact: '+234 802 555 1212',
    date: new Date('2026-10-05'),
    time: '11:00',
    note: 'Want to visit the studio and talk through our pre-wedding shoot ideas before we book the date.',
    status: 'REQUESTED',
    createdAt: new Date('2026-10-01T02:18:33.249Z'),
  },
  {
    id: 'bk_002',
    ref: 'BKG-002',
    creatorId: 'u_tobi',
    serviceId: 'sv_event',
    sessionType: 'Event Photography',
    clientName: 'TechConnect Africa',
    clientContact: 'events@techconnect.africa',
    date: new Date('2026-10-08'),
    time: '09:00',
    note: 'Venue walkthrough at Landmark Centre to plan the summit shot list.',
    status: 'CONFIRMED',
    createdAt: new Date('2026-09-29T02:18:33.249Z'),
  },
  {
    id: 'bk_003',
    ref: 'BKG-003',
    creatorId: 'u_tobi',
    serviceId: 'sv_portrait',
    sessionType: 'General consultation',
    clientName: 'Glow Skincare',
    clientContact: '+234 809 444 2020',
    date: new Date('2026-09-26'),
    time: '14:00',
    note: 'Brand planning call ahead of the website relaunch shoot.',
    status: 'COMPLETED',
    createdAt: new Date('2026-09-23T02:18:33.249Z'),
  },
];

/** Prototype delivery file rows (display size/kind) — seed.ts derives bytes + mime. */
export interface DemoFile {
  id: string;
  name: string;
  size: string;
  kind: string;
}

interface DemoDeal {
  id: string;
  ref: string;
  requestId: string | null;
  shareToken: string;
  title: string;
  serviceTitle: string;
  clientName: string;
  clientContact: string;
  summary: string;
  eventDate: string;
  location: string;
  message: string;
  scope: string;
  deliverables: string[];
  priceMinor: number;
  depositPercent: number;
  installmentsCount: number;
  revisions: number;
  startDate: string;
  dueDate: string;
  status: string;
  events: { at: string; type: string; label: string; actor: string }[];
  payments: {
    id: string;
    type: string;
    label: string;
    amountMinor: number;
    method: string;
    provider: string;
    reference: string;
    escrowStatus: string;
    paidAt: string;
    releasedAt?: string;
  }[];
  deliveries: { id: string; note: string; files: DemoFile[]; submittedAt: string }[];
  finalFiles: DemoFile[];
  createdAt: string;
  sentAt?: string;
  acceptedAt?: string;
  depositPaidAt?: string;
  deliveredAt?: string;
  approvedAt?: string;
  balancePaidAt?: string;
  filesReleasedAt?: string;
  paymentReleasedAt?: string;
  completedAt?: string;
}

export const DEMO_DEALS: DemoDeal[] = [
  {
    id: 'd_deal001',
    ref: 'DEAL-001',
    requestId: 'r_lola',
    shareToken: 'tok_lola001',
    title: 'Lola & Tunde Pre-wedding Shoot',
    serviceTitle: 'Pre-wedding Photography',
    clientName: 'Lola Adeyemi',
    clientContact: '+234 802 555 1212',
    summary:
      'Golden-hour couple session at Lekki Conservation Centre with 2 outfit changes and a same-week private gallery.',
    eventDate: '2026-11-06',
    location: 'Lekki Conservation Centre, Lagos',
    message:
      "Hi Lola! Thank you for reaching out on DEAL. Here is the full plan for your pre-wedding session — deposit is all I need to lock the date.",
    scope:
      'Pre-shoot styling call, location scouting, 4-hour golden-hour session, 2 outfit changes, same-week gallery delivery.',
    deliverables: [
      '40+ edited high-resolution photos',
      'Private online gallery (12 months)',
      'Web + print size exports',
      'Print release letter',
    ],
    priceMinor: 12_000_000,
    depositPercent: 50,
    installmentsCount: 2,
    revisions: 2,
    startDate: '2026-11-04',
    dueDate: '2026-11-10',
    status: 'ACTIVE',
    events: [
      { at: '2026-09-25T02:18:33.249Z', type: 'CREATED', label: "Deal created from Lola's request", actor: 'CREATOR' },
      { at: '2026-09-25T02:18:33.249Z', type: 'SENT', label: 'Deal sent to Lola Adeyemi', actor: 'CREATOR' },
      { at: '2026-09-26T02:18:33.249Z', type: 'ACCEPTED', label: 'Deal accepted', actor: 'CLIENT' },
      {
        at: '2026-09-26T02:18:33.249Z',
        type: 'DEPOSIT_PAID',
        label: 'Deposit paid — ₦60,000 held in DEAL escrow via Paystack (ref PSK-8KD92MAQ)',
        actor: 'CLIENT',
      },
      {
        at: '2026-09-30T02:18:33.249Z',
        type: 'BALANCE_PAID',
        label: 'Installment 1 of 2 paid — ₦30,000 held in DEAL escrow via Flutterwave (ref FLW-3FJ81XWP)',
        actor: 'CLIENT',
      },
    ],
    payments: [
      {
        id: 'p_lola_dep',
        type: 'DEPOSIT',
        label: 'Deposit (50%)',
        amountMinor: 6_000_000,
        method: 'CARD',
        provider: 'PAYSTACK',
        reference: 'PSK-8KD92MAQ',
        escrowStatus: 'HELD',
        paidAt: '2026-09-26T02:18:33.249Z',
      },
      {
        id: 'p_lola_inst1',
        type: 'INSTALLMENT',
        label: 'Installment 1 of 2',
        amountMinor: 3_000_000,
        method: 'TRANSFER',
        provider: 'FLUTTERWAVE',
        reference: 'FLW-3FJ81XWP',
        escrowStatus: 'HELD',
        paidAt: '2026-09-30T02:18:33.249Z',
      },
    ],
    deliveries: [],
    finalFiles: [],
    createdAt: '2026-09-25T02:18:33.249Z',
    sentAt: '2026-09-25T02:18:33.249Z',
    acceptedAt: '2026-09-26T02:18:33.249Z',
    depositPaidAt: '2026-09-26T02:18:33.249Z',
  },
  {
    id: 'd_deal002',
    ref: 'DEAL-002',
    requestId: null,
    shareToken: 'tok_glow002',
    title: 'Glow Skincare Brand Portraits',
    serviceTitle: 'Portrait Session',
    clientName: 'Amara Okafor',
    clientContact: '+234 809 444 2020',
    summary:
      "Founder portraits and product-in-hand shots for Glow Skincare's website relaunch, studio session.",
    eventDate: '2026-10-16',
    location: 'Studio 9, Lekki Phase 1, Lagos',
    message:
      'Hi Amara, lovely speaking with you. This covers the founder portraits and team headshots we discussed — accept and pay the deposit to lock the studio date.',
    scope:
      'Studio session (3 hours), 2 backdrop looks, founder portraits + 4 team headshots, retouching included.',
    deliverables: [
      '25+ edited portraits',
      'Web-optimised exports for the site',
      '1 retried look on request',
      'Commercial usage licence (12 months)',
    ],
    priceMinor: 6_000_000,
    depositPercent: 50,
    installmentsCount: 2,
    revisions: 2,
    startDate: '2026-10-16',
    dueDate: '2026-10-20',
    status: 'SENT',
    events: [
      { at: '2026-10-01T02:18:33.249Z', type: 'CREATED', label: 'Deal created for Glow Skincare', actor: 'CREATOR' },
      { at: '2026-10-01T02:18:33.249Z', type: 'SENT', label: 'Deal sent to Amara Okafor', actor: 'CREATOR' },
    ],
    payments: [],
    deliveries: [],
    finalFiles: [],
    createdAt: '2026-10-01T02:18:33.249Z',
    sentAt: '2026-10-01T02:18:33.249Z',
  },
  {
    id: 'd_deal003',
    ref: 'DEAL-003',
    requestId: 'r_tech',
    shareToken: 'tok_tech003',
    title: 'TechConnect Summit Coverage',
    serviceTitle: 'Event Photography',
    clientName: 'TechConnect Africa',
    clientContact: 'events@techconnect.africa',
    summary:
      'Full-day coverage of the annual summit at Landmark Centre — 300 guests, panels, networking and after-party.',
    eventDate: '2026-10-23',
    location: 'Landmark Centre, Victoria Island, Lagos',
    message:
      "Hello! Here's the coverage plan for TechConnect Summit. Everything you approved is inside — the 24-hour press set is included.",
    scope:
      '8 hours on-site coverage, 2 photographers\u2019 shot list, 48-hour highlight set, press-priority edits within 24 hours.',
    deliverables: [
      '150+ edited photos',
      '10-photo press set within 24 hours',
      '48-hour highlight gallery',
      'Full private gallery (12 months)',
    ],
    priceMinor: 15_000_000,
    depositPercent: 50,
    installmentsCount: 2,
    revisions: 2,
    startDate: '2026-10-23',
    dueDate: '2026-10-28',
    status: 'DELIVERED',
    events: [
      { at: '2026-09-23T02:18:33.249Z', type: 'CREATED', label: "Deal created from TechConnect's request", actor: 'CREATOR' },
      { at: '2026-09-23T02:18:33.249Z', type: 'SENT', label: 'Deal sent to TechConnect Africa', actor: 'CREATOR' },
      { at: '2026-09-24T02:18:33.249Z', type: 'ACCEPTED', label: 'Deal accepted', actor: 'CLIENT' },
      {
        at: '2026-09-24T02:18:33.249Z',
        type: 'DEPOSIT_PAID',
        label: 'Deposit paid — ₦75,000 held in DEAL escrow via Flutterwave (ref FLW-9QM41NTV)',
        actor: 'CLIENT',
      },
      { at: '2026-10-01T02:18:33.249Z', type: 'DELIVERED', label: 'Delivery submitted for review', actor: 'CREATOR' },
    ],
    payments: [
      {
        id: 'p_tech_dep',
        type: 'DEPOSIT',
        label: 'Deposit (50%)',
        amountMinor: 7_500_000,
        method: 'USSD',
        provider: 'FLUTTERWAVE',
        reference: 'FLW-9QM41NTV',
        escrowStatus: 'HELD',
        paidAt: '2026-09-24T02:18:33.249Z',
      },
    ],
    deliveries: [
      {
        id: 'dl_tech1',
        note: 'Highlight gallery for your review — 60 selects from the summit. Press set is included. Final full gallery follows after approval.',
        files: [
          { id: 'f_tech1', name: 'TechConnect-summit-highlights.zip', size: '212.4 MB', kind: 'ZIP' },
          { id: 'f_tech2', name: 'Press-set (24hr).zip', size: '48.1 MB', kind: 'ZIP' },
        ],
        submittedAt: '2026-10-01T02:18:33.249Z',
      },
    ],
    finalFiles: [],
    createdAt: '2026-09-23T02:18:33.249Z',
    sentAt: '2026-09-23T02:18:33.249Z',
    acceptedAt: '2026-09-24T02:18:33.249Z',
    depositPaidAt: '2026-09-24T02:18:33.249Z',
    deliveredAt: '2026-10-01T02:18:33.249Z',
  },
  {
    id: 'd_deal004',
    ref: 'DEAL-004',
    requestId: null,
    shareToken: 'tok_ezek004',
    title: 'Ezekiel Studio Session',
    serviceTitle: 'Portrait Session',
    clientName: 'Ezekiel Danjuma',
    clientContact: '+234 803 777 9090',
    summary: "Personal-brand studio portraits for Ezekiel's coaching business relaunch.",
    eventDate: '2026-10-05',
    location: 'Studio 9, Lekki Phase 1, Lagos',
    message:
      "Brother Ezekiel — here's our agreed plan. Paid in full upfront, so once you approve the work everything releases automatically.",
    scope: 'Studio session (2 hours), 1 backdrop look, 15 edited portraits, retouching included.',
    deliverables: ['15 edited portraits', 'Web + print sizes', 'Personal usage licence'],
    priceMinor: 12_000_000,
    depositPercent: 100,
    installmentsCount: 0,
    revisions: 1,
    startDate: '2026-10-05',
    dueDate: '2026-10-07',
    status: 'APPROVED',
    events: [
      { at: '2026-09-20T02:18:33.249Z', type: 'CREATED', label: 'Deal created for Ezekiel Danjuma', actor: 'CREATOR' },
      { at: '2026-09-20T02:18:33.249Z', type: 'SENT', label: 'Deal sent to Ezekiel Danjuma', actor: 'CREATOR' },
      { at: '2026-09-21T02:18:33.249Z', type: 'ACCEPTED', label: 'Deal accepted', actor: 'CLIENT' },
      {
        at: '2026-09-21T02:18:33.249Z',
        type: 'DEPOSIT_PAID',
        label: 'Full payment paid — ₦120,000 held in DEAL escrow via Paystack (ref PSK-77AXQ2LM)',
        actor: 'CLIENT',
      },
      { at: '2026-09-28T02:18:33.249Z', type: 'DELIVERED', label: 'Delivery submitted for review', actor: 'CREATOR' },
      { at: '2026-09-29T02:18:33.249Z', type: 'APPROVED', label: 'Work approved by client — completed', actor: 'CLIENT' },
      {
        at: '2026-09-29T02:18:33.249Z',
        type: 'PAYMENT_RELEASED',
        label: "₦120,000 released from escrow to the creator's payout account",
        actor: 'SYSTEM',
      },
    ],
    payments: [
      {
        id: 'p_ez_full',
        type: 'DEPOSIT',
        label: 'Full payment',
        amountMinor: 12_000_000,
        method: 'CARD',
        provider: 'PAYSTACK',
        reference: 'PSK-77AXQ2LM',
        escrowStatus: 'RELEASED',
        paidAt: '2026-09-21T02:18:33.249Z',
        releasedAt: '2026-09-29T02:18:33.249Z',
      },
    ],
    deliveries: [
      {
        id: 'dl_ez1',
        note: 'Watermarked selects for your review — pick any tweaks and approve when happy.',
        files: [{ id: 'f_ez1', name: 'Ezekiel-selects.zip', size: '96.2 MB', kind: 'ZIP' }],
        submittedAt: '2026-09-28T02:18:33.249Z',
      },
    ],
    finalFiles: [],
    createdAt: '2026-09-20T02:18:33.249Z',
    sentAt: '2026-09-20T02:18:33.249Z',
    acceptedAt: '2026-09-21T02:18:33.249Z',
    depositPaidAt: '2026-09-21T02:18:33.249Z',
    deliveredAt: '2026-09-28T02:18:33.249Z',
    approvedAt: '2026-09-29T02:18:33.249Z',
    paymentReleasedAt: '2026-09-29T02:18:33.249Z',
  },
  {
    id: 'd_deal005',
    ref: 'DEAL-005',
    requestId: null,
    shareToken: 'tok_lekki005',
    title: 'Lekki Property Shoot',
    serviceTitle: 'Short Video Coverage',
    clientName: 'Chidi Bello',
    clientContact: '+234 805 222 3344',
    summary: "Cinematic walkthrough video of a 4-bedroom terrace for a realtor's listing.",
    eventDate: '2026-09-16',
    location: 'Chevron Drive, Lekki, Lagos',
    message: 'Mr Chidi — full plan for the walkthrough video as agreed. It was a pleasure.',
    scope: 'On-site cinematic walkthrough (3 hours), drone shots, licensed music, vertical + landscape cuts.',
    deliverables: [
      '60–90s cinematic walkthrough',
      'Vertical cut for Instagram',
      'Landscape cut for YouTube',
      '10 photo stills',
    ],
    priceMinor: 8_000_000,
    depositPercent: 50,
    installmentsCount: 1,
    revisions: 2,
    startDate: '2026-09-16',
    dueDate: '2026-09-21',
    status: 'COMPLETED',
    events: [
      { at: '2026-09-08T02:18:33.249Z', type: 'CREATED', label: 'Deal created for Chidi Bello', actor: 'CREATOR' },
      { at: '2026-09-08T02:18:33.249Z', type: 'SENT', label: 'Deal sent to Chidi Bello', actor: 'CREATOR' },
      { at: '2026-09-09T02:18:33.249Z', type: 'ACCEPTED', label: 'Deal accepted', actor: 'CLIENT' },
      {
        at: '2026-09-09T02:18:33.249Z',
        type: 'DEPOSIT_PAID',
        label: 'Deposit paid — ₦40,000 held in DEAL escrow via Paystack (ref PSK-5HTR29KD)',
        actor: 'CLIENT',
      },
      { at: '2026-09-16T02:18:33.249Z', type: 'DELIVERED', label: 'Delivery submitted for review', actor: 'CREATOR' },
      {
        at: '2026-09-20T02:18:33.249Z',
        type: 'CHANGES_REQUESTED',
        label: 'Revision requested: \u201cMake the opening drone shot slower\u201d',
        actor: 'CLIENT',
      },
      { at: '2026-09-22T02:18:33.249Z', type: 'DELIVERED', label: 'Revised delivery submitted', actor: 'CREATOR' },
      { at: '2026-09-23T02:18:33.249Z', type: 'APPROVED', label: 'Work approved by client — completed', actor: 'CLIENT' },
      {
        at: '2026-09-23T02:18:33.249Z',
        type: 'PAYMENT_RELEASED',
        label: "₦40,000 released from escrow to the creator's payout account",
        actor: 'SYSTEM',
      },
      {
        at: '2026-09-24T02:18:33.249Z',
        type: 'BALANCE_PAID',
        label:
          'Balance installment paid — ₦40,000 received by creator instantly (work already approved, ref FLW-1WYB64FS)',
        actor: 'CLIENT',
      },
      { at: '2026-09-25T02:18:33.249Z', type: 'FILES_RELEASED', label: 'Final files released to client', actor: 'CREATOR' },
      {
        at: '2026-09-26T02:18:33.249Z',
        type: 'COMPLETED',
        label: 'Client downloaded final files and left a 5-star review',
        actor: 'CLIENT',
      },
    ],
    payments: [
      {
        id: 'p_lekki_dep',
        type: 'DEPOSIT',
        label: 'Deposit (50%)',
        amountMinor: 4_000_000,
        method: 'CARD',
        provider: 'PAYSTACK',
        reference: 'PSK-5HTR29KD',
        escrowStatus: 'RELEASED',
        paidAt: '2026-09-09T02:18:33.249Z',
        releasedAt: '2026-09-23T02:18:33.249Z',
      },
      {
        id: 'p_lekki_bal',
        type: 'INSTALLMENT',
        label: 'Balance installment',
        amountMinor: 4_000_000,
        method: 'TRANSFER',
        provider: 'FLUTTERWAVE',
        reference: 'FLW-1WYB64FS',
        escrowStatus: 'RELEASED',
        paidAt: '2026-09-24T02:18:33.249Z',
        releasedAt: '2026-09-24T02:18:33.249Z',
      },
    ],
    deliveries: [
      {
        id: 'dl_lekki1',
        note: 'First cut of the walkthrough — review and let me know any tweaks.',
        files: [{ id: 'f_lk1', name: 'Lekki-walkthrough-v1.mp4', size: '184.7 MB', kind: 'MP4' }],
        submittedAt: '2026-09-16T02:18:33.249Z',
      },
      {
        id: 'dl_lekki2',
        note: 'Slower opening drone shot as requested — ready for your approval.',
        files: [{ id: 'f_lk2', name: 'Lekki-walkthrough-v2.mp4', size: '186.1 MB', kind: 'MP4' }],
        submittedAt: '2026-09-22T02:18:33.249Z',
      },
    ],
    finalFiles: [
      { id: 'f_lk3', name: 'Lekki-walkthrough-FINAL-16x9.mp4', size: '188.3 MB', kind: 'MP4' },
      { id: 'f_lk4', name: 'Lekki-walkthrough-FINAL-9x16.mp4', size: '97.6 MB', kind: 'MP4' },
      { id: 'f_lk5', name: 'Photo-stills.zip', size: '62.9 MB', kind: 'ZIP' },
    ],
    createdAt: '2026-09-08T02:18:33.249Z',
    sentAt: '2026-09-08T02:18:33.249Z',
    acceptedAt: '2026-09-09T02:18:33.249Z',
    depositPaidAt: '2026-09-09T02:18:33.249Z',
    deliveredAt: '2026-09-22T02:18:33.249Z',
    approvedAt: '2026-09-23T02:18:33.249Z',
    paymentReleasedAt: '2026-09-23T02:18:33.249Z',
    balancePaidAt: '2026-09-24T02:18:33.249Z',
    filesReleasedAt: '2026-09-25T02:18:33.249Z',
    completedAt: '2026-09-26T02:18:33.249Z',
  },
];

/**
 * Phase 9: reviews become a stored domain record. The prototype only TOLD the
 * story (DEAL-005's completion event: "Client downloaded final files and left
 * a 5-star review"); the demo database now carries the matching row so the
 * dashboard's rating summary and the creator's reviews list have source data.
 */
export const DEMO_REVIEWS: Prisma.ReviewUncheckedCreateInput[] = [
  {
    id: 'rv_lekki',
    dealId: 'd_deal005',
    creatorId: 'u_tobi',
    rating: 5,
    comment: 'Chidi loved the walkthrough — the drone opening sold the listing within days.',
    createdAt: new Date('2026-09-26T02:30:00.000Z'),
  },
];
