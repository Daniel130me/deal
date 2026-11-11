import { z } from 'zod';

/** Complete mutable contract terms. This is the only shape stored in revision JSON. */
export const dealContractSchema = z.object({
  title: z.string(),
  serviceTitle: z.string(),
  clientName: z.string(),
  clientContact: z.string(),
  summary: z.string().nullable(),
  eventDate: z.string().datetime().nullable(),
  location: z.string().nullable(),
  message: z.string().nullable(),
  scope: z.string().nullable(),
  priceMinor: z.number().int().nonnegative(),
  depositPercent: z.number().int().min(1).max(100),
  installmentsCount: z.number().int().nonnegative(),
  revisions: z.number().int().nonnegative(),
  startDate: z.string().datetime().nullable(),
  dueDate: z.string().datetime().nullable(),
  deliverables: z.array(z.string()),
});

export type DealContractSnapshot = z.infer<typeof dealContractSchema>;

type ContractSource = Omit<DealContractSnapshot, 'eventDate' | 'startDate' | 'dueDate' | 'deliverables'> & {
  eventDate: Date | null;
  startDate: Date | null;
  dueDate: Date | null;
  deliverables: Array<{ name: string }>;
};

export function snapshotContract(deal: ContractSource): DealContractSnapshot {
  return {
    title: deal.title,
    serviceTitle: deal.serviceTitle,
    clientName: deal.clientName,
    clientContact: deal.clientContact,
    summary: deal.summary,
    eventDate: deal.eventDate?.toISOString() ?? null,
    location: deal.location,
    message: deal.message,
    scope: deal.scope,
    priceMinor: deal.priceMinor,
    depositPercent: deal.depositPercent,
    installmentsCount: deal.installmentsCount,
    revisions: deal.revisions,
    startDate: deal.startDate?.toISOString() ?? null,
    dueDate: deal.dueDate?.toISOString() ?? null,
    deliverables: deal.deliverables.map((item) => item.name),
  };
}

/** Database JSON is treated as untrusted: malformed snapshots fail closed. */
export function parseContractSnapshot(value: unknown): DealContractSnapshot {
  return dealContractSchema.parse(value);
}

export function contractScalarData(snapshot: DealContractSnapshot) {
  return {
    title: snapshot.title,
    serviceTitle: snapshot.serviceTitle,
    clientName: snapshot.clientName,
    clientContact: snapshot.clientContact,
    summary: snapshot.summary,
    eventDate: snapshot.eventDate ? new Date(snapshot.eventDate) : null,
    location: snapshot.location,
    message: snapshot.message,
    scope: snapshot.scope,
    priceMinor: snapshot.priceMinor,
    depositPercent: snapshot.depositPercent,
    installmentsCount: snapshot.installmentsCount,
    revisions: snapshot.revisions,
    startDate: snapshot.startDate ? new Date(snapshot.startDate) : null,
    dueDate: snapshot.dueDate ? new Date(snapshot.dueDate) : null,
  };
}
