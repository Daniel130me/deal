import { describe, expect, it } from './test-api';
import { calendarDateToUtc, isValidCalendarDate } from '../src/common/validation/calendar-date.validator';

describe('calendar-date validation', () => {
  it('accepts real dates including leap days', () => {
    expect(isValidCalendarDate('2028-02-29')).toBe(true);
    expect(calendarDateToUtc('2028-02-29').toISOString()).toBe('2028-02-29T00:00:00.000Z');
  });

  it('rejects values that match yyyy-mm-dd but are not calendar dates', () => {
    for (const value of ['2027-02-29', '2026-02-31', '2026-13-01', '2026-00-10', '26-01-01']) {
      expect(isValidCalendarDate(value)).toBe(false);
    }
  });
});
