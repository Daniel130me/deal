import { registerDecorator, type ValidationOptions } from 'class-validator';

/**
 * Validates a real Gregorian calendar day, not merely a yyyy-mm-dd shape.
 * JavaScript silently normalises impossible inputs such as 2026-02-31 into
 * March; accepting that at the API edge would persist a different date than
 * the client submitted.
 */
export function isValidCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year!, month! - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month! - 1 &&
    parsed.getUTCDate() === day
  );
}

export function IsCalendarDate(validationOptions?: ValidationOptions): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isCalendarDate',
      target: target.constructor,
      propertyName: propertyName.toString(),
      options: validationOptions,
      validator: { validate: isValidCalendarDate },
    });
  };
}

/** Safe conversion after IsCalendarDate has accepted the input. */
export function calendarDateToUtc(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day));
}
