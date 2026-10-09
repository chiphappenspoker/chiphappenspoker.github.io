import { describe, it, expect } from 'vitest';
import {
  calcGroupStreaks,
  isInternationalPublicHoliday,
  isNonWorkingDay,
} from './group-streaks';

describe('isInternationalPublicHoliday', () => {
  it('treats New Year, Christmas, and St Stephen/Boxing Day as holidays', () => {
    expect(isInternationalPublicHoliday('2026-01-01')).toBe(true);
    expect(isInternationalPublicHoliday('2026-12-25')).toBe(true);
    expect(isInternationalPublicHoliday('2026-12-26')).toBe(true);
  });

  it('includes IE/DE/US fixed national days (union)', () => {
    expect(isInternationalPublicHoliday('2026-03-17')).toBe(true); // St Patrick's (IE)
    expect(isInternationalPublicHoliday('2026-05-01')).toBe(true); // May Day (IE/DE)
    expect(isInternationalPublicHoliday('2026-07-04')).toBe(true); // US Independence
    expect(isInternationalPublicHoliday('2026-10-03')).toBe(true); // German Unity
    expect(isInternationalPublicHoliday('2026-11-01')).toBe(true); // All Saints (DE/IE)
    expect(isInternationalPublicHoliday('2026-06-19')).toBe(true); // Juneteenth (US)
  });

  it('includes Easter-linked holidays for IE/DE', () => {
    // Easter Sunday 2026-04-05
    expect(isInternationalPublicHoliday('2026-04-03')).toBe(true); // Good Friday
    expect(isInternationalPublicHoliday('2026-04-06')).toBe(true); // Easter Monday
    expect(isInternationalPublicHoliday('2026-05-14')).toBe(true); // Ascension (DE)
    expect(isInternationalPublicHoliday('2026-05-25')).toBe(true); // Whit Monday
  });

  it('includes US floating holidays', () => {
    expect(isInternationalPublicHoliday('2026-01-19')).toBe(true); // MLK Day
    expect(isInternationalPublicHoliday('2026-05-25')).toBe(true); // Memorial Day (same as Whit Mon 2026)
    expect(isInternationalPublicHoliday('2026-09-07')).toBe(true); // Labor Day
    expect(isInternationalPublicHoliday('2026-11-26')).toBe(true); // Thanksgiving
  });

  it('returns false for ordinary weekdays', () => {
    expect(isInternationalPublicHoliday('2026-03-10')).toBe(false);
    expect(isInternationalPublicHoliday('2026-06-02')).toBe(false);
  });
});

describe('isNonWorkingDay', () => {
  it('treats weekends as non-working even when not a holiday', () => {
    expect(isNonWorkingDay('2026-03-07')).toBe(true); // Saturday
    expect(isNonWorkingDay('2026-03-08')).toBe(true); // Sunday
  });

  it('treats weekday holidays as non-working', () => {
    expect(isNonWorkingDay('2026-07-04')).toBe(true); // Saturday actually in 2026... use 2025
    expect(isNonWorkingDay('2025-07-04')).toBe(true); // Friday
  });

  it('treats ordinary weekdays as working', () => {
    expect(isNonWorkingDay('2026-03-10')).toBe(false); // Tuesday
  });
});

describe('calcGroupStreaks', () => {
  it('returns zeros when there are no play dates', () => {
    expect(calcGroupStreaks([], '2026-03-10')).toEqual({ current: 0, longest: 0 });
  });

  it('counts consecutive weekdays with play, skipping weekends', () => {
    // Mon 9, Tue 10 played; weekend before does not break with Fri 6
    const playDates = ['2026-03-06', '2026-03-09', '2026-03-10'];
    expect(calcGroupStreaks(playDates, '2026-03-10')).toEqual({
      current: 3,
      longest: 3,
    });
  });

  it('does not break current streak when today is a working day without a session yet (soft)', () => {
    const playDates = ['2026-03-09']; // Monday
    // Tuesday today, no session yet
    expect(calcGroupStreaks(playDates, '2026-03-10')).toEqual({
      current: 1,
      longest: 1,
    });
  });

  it('breaks current streak after a full missed working day', () => {
    const playDates = ['2026-03-06']; // Friday
    // Tuesday today; Monday was missed
    expect(calcGroupStreaks(playDates, '2026-03-10')).toEqual({
      current: 0,
      longest: 1,
    });
  });

  it('skips public holidays when measuring streaks', () => {
    // Thu Jul 3 and Mon Jul 7 played; Fri Jul 4 is US holiday + weekend — streak continues
    const playDates = ['2025-07-03', '2025-07-07'];
    expect(calcGroupStreaks(playDates, '2025-07-07')).toEqual({
      current: 2,
      longest: 2,
    });
  });

  it('tracks longest separately from current', () => {
    const playDates = [
      '2026-03-02', // Mon
      '2026-03-03', // Tue
      '2026-03-04', // Wed — longest 3, then gap Thu
      '2026-03-09', // Mon
      '2026-03-10', // Tue — current 2
    ];
    expect(calcGroupStreaks(playDates, '2026-03-10')).toEqual({
      current: 2,
      longest: 3,
    });
  });

  it('stops current streak walk at fromDate when provided', () => {
    const playDates = ['2026-03-09', '2026-03-10'];
    expect(calcGroupStreaks(playDates, '2026-03-10', { fromDate: '2026-03-09' })).toEqual({
      current: 2,
      longest: 2,
    });
  });

  it('dedupes multiple sessions on the same day', () => {
    const playDates = ['2026-03-10', '2026-03-10', '2026-03-09'];
    expect(calcGroupStreaks(playDates, '2026-03-10')).toEqual({
      current: 2,
      longest: 2,
    });
  });
});
