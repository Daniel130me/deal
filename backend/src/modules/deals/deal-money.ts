import { DealPayment, DealStatus } from '@prisma/client';

/**
 * Deal-money helpers — the server is the ONLY authority on deal amounts
 * (docs/target-architecture.md §4/§5). Ported 1:1 from the prototype's
 * lib/types.ts helpers, but operating on integer kobo everywhere: no floats,
 * no client-computed amounts ever trusted.
 *
 * Deliberately pure exported functions rather than a DI service: there is no
 * state, no I/O and nothing to mock behind an interface — integer math is
 * trivially testable as-is. (Flagged in the Phase 6 walkthrough as a
 * deviation from the doc's "MoneyService" naming; the API is identical.)
 */

/** Minimal deal money inputs — any projection carrying these fields works. */
export interface DealMoneyTerms {
  priceMinor: number;
  depositPercent: number;
  installmentsCount: number;
}

export interface ScheduleSlot {
  type: DealPayment['type'];
  label: string;
  amountMinor: number;
  status: 'paid' | 'due';
}

/** Deposit in kobo, rounded to the nearest kobo (prototype parity). */
export function depositAmount(terms: Pick<DealMoneyTerms, 'priceMinor' | 'depositPercent'>): number {
  // priceMinor * 100 fits safely in a JS double (max 2e9 * 100 << 2^53).
  return Math.round((terms.priceMinor * terms.depositPercent) / 100);
}

/** Sum of every payment recorded on the deal. */
export function paidTotal(payments: Pick<DealPayment, 'amountMinor'>[]): number {
  return payments.reduce((sum, p) => sum + p.amountMinor, 0);
}

/** Everything still unpaid on the deal — never negative. */
export function remainingBalance(terms: DealMoneyTerms, payments: Pick<DealPayment, 'amountMinor'>[]): number {
  return Math.max(0, terms.priceMinor - paidTotal(payments));
}

export function isFullyPaid(terms: DealMoneyTerms, payments: Pick<DealPayment, 'amountMinor'>[]): boolean {
  return remainingBalance(terms, payments) === 0;
}

/**
 * Work has been approved by the client — from this point new payments go
 * straight to the creator instead of escrow (prototype parity).
 */
export function isApprovedStatus(status: DealStatus): boolean {
  return status === DealStatus.APPROVED || status === DealStatus.FILES_RELEASED || status === DealStatus.COMPLETED;
}

/**
 * Ideal payment plan with each slot marked paid/due by consuming recorded
 * payments in chronological order. Slots: deposit first (or a single full
 * payment slot when depositPercent >= 100), then the balance either as one
 * slot (no installments) or n installments where the last one absorbs the
 * rounding remainder — integer math only, slots always sum to the price.
 */
export function paymentSchedule(terms: DealMoneyTerms, payments: Pick<DealPayment, 'amountMinor' | 'paidAt'>[]): ScheduleSlot[] {
  const slots: Omit<ScheduleSlot, 'status'>[] = [];

  if (terms.depositPercent >= 100) {
    slots.push({ type: 'DEPOSIT', label: 'Full payment', amountMinor: terms.priceMinor });
  } else {
    const deposit = depositAmount(terms);
    slots.push({ type: 'DEPOSIT', label: `Deposit (${terms.depositPercent}%)`, amountMinor: deposit });
    const balance = terms.priceMinor - deposit;
    const n = Math.max(0, terms.installmentsCount);
    if (n === 0) {
      slots.push({ type: 'BALANCE', label: 'Balance payment', amountMinor: balance });
    } else {
      const each = Math.floor(balance / n);
      for (let i = 1; i <= n; i++) {
        const amountMinor = i === n ? balance - each * (n - 1) : each;
        slots.push({
          type: 'INSTALLMENT',
          label: n === 1 ? 'Balance installment' : `Installment ${i} of ${n}`,
          amountMinor,
        });
      }
    }
  }

  // Consume payments oldest-first so partial payments fill slots in order.
  const ordered = [...payments].sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());
  let pool = paidTotal(ordered);
  const out: ScheduleSlot[] = [];
  for (const slot of slots) {
    if (pool >= slot.amountMinor) {
      out.push({ ...slot, status: 'paid' });
      pool -= slot.amountMinor;
    } else {
      out.push({ ...slot, status: 'due' });
    }
  }
  // Leftover money (e.g. an overpayment or merged "pay all remaining") clears everything.
  if (pool > 0) {
    for (const slot of out) slot.status = 'paid';
  }
  return out;
}

/** First unpaid slot of the schedule, or null when fully paid. */
export function nextDueSlot(terms: DealMoneyTerms, payments: Pick<DealPayment, 'amountMinor' | 'paidAt'>[]): ScheduleSlot | null {
  return paymentSchedule(terms, payments).find((s) => s.status === 'due') ?? null;
}

/** Kobo -> the human-facing naira label used in DealEvent labels. */
export function formatNairaMinor(amountMinor: number): string {
  return `₦${(amountMinor / 100).toLocaleString('en-NG')}`;
}

/** The server-computed amounts block every deal-facing response carries. */
export interface DealAmounts {
  totalMinor: number;
  depositMinor: number;
  paidMinor: number;
  dueMinor: number;
  heldMinor: number;
  fullyPaid: boolean;
  approved: boolean;
  schedule: ScheduleSlot[];
  nextDue: ScheduleSlot | null;
}

export function dealAmounts(
  status: DealStatus,
  terms: DealMoneyTerms,
  payments: Pick<DealPayment, 'amountMinor' | 'escrowStatus' | 'paidAt'>[],
): DealAmounts {
  const paid = paidTotal(payments);
  const schedule = paymentSchedule(terms, payments);
  return {
    totalMinor: terms.priceMinor,
    depositMinor: depositAmount(terms),
    paidMinor: paid,
    dueMinor: remainingBalance(terms, payments),
    heldMinor: payments.filter((p) => p.escrowStatus === 'HELD').reduce((s, p) => s + p.amountMinor, 0),
    fullyPaid: remainingBalance(terms, payments) === 0,
    approved: isApprovedStatus(status),
    schedule,
    nextDue: schedule.find((s) => s.status === 'due') ?? null,
  };
}
