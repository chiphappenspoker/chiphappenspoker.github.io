/** YYYY-MM-DD helpers (UTC calendar days, matching session_date). */

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = parseDate(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDate(d);
}

function dayOfWeek(dateStr: string): number {
  return parseDate(dateStr).getUTCDay(); // 0=Sun … 6=Sat
}

function isWeekend(dateStr: string): boolean {
  const dow = dayOfWeek(dateStr);
  return dow === 0 || dow === 6;
}

/** Anonymous Gregorian algorithm → Easter Sunday as YYYY-MM-DD. */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return formatDate(new Date(Date.UTC(year, month - 1, day)));
}

function nthWeekdayOfMonth(
  year: number,
  monthIndex: number,
  weekday: number,
  n: number
): string {
  // n = 1..5; weekday 0=Sun..6=Sat
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const firstDow = first.getUTCDay();
  let day = 1 + ((weekday - firstDow + 7) % 7) + (n - 1) * 7;
  return formatDate(new Date(Date.UTC(year, monthIndex, day)));
}

function lastWeekdayOfMonth(year: number, monthIndex: number, weekday: number): string {
  const last = new Date(Date.UTC(year, monthIndex + 1, 0));
  const lastDow = last.getUTCDay();
  const delta = (lastDow - weekday + 7) % 7;
  last.setUTCDate(last.getUTCDate() - delta);
  return formatDate(last);
}

function fixedMd(year: number, month: number, day: number): string {
  return formatDate(new Date(Date.UTC(year, month - 1, day)));
}

/** Union of common public holidays in Ireland, Germany, and USA. */
export function isInternationalPublicHoliday(dateStr: string): boolean {
  const year = Number(dateStr.slice(0, 4));
  const easter = easterSunday(year);
  const holidays = new Set<string>([
    // Shared / multi-country fixed
    fixedMd(year, 1, 1), // New Year
    fixedMd(year, 3, 17), // St Patrick's Day (IE)
    fixedMd(year, 5, 1), // May Day / Labor Day (IE, DE)
    fixedMd(year, 6, 19), // Juneteenth (US)
    fixedMd(year, 7, 4), // Independence Day (US)
    fixedMd(year, 8, 15), // Assumption (DE/IE regions)
    fixedMd(year, 10, 3), // German Unity Day
    fixedMd(year, 11, 1), // All Saints (DE, IE)
    fixedMd(year, 11, 11), // Veterans / Armistice (US; DE regions)
    fixedMd(year, 12, 25), // Christmas
    fixedMd(year, 12, 26), // St Stephen's / Boxing Day (IE, DE)
    // Easter-linked (IE, DE)
    addDays(easter, -2), // Good Friday
    addDays(easter, 1), // Easter Monday
    addDays(easter, 39), // Ascension (DE)
    addDays(easter, 50), // Whit Monday (IE, DE)
    // US floating
    nthWeekdayOfMonth(year, 0, 1, 3), // MLK Day — 3rd Monday Jan
    nthWeekdayOfMonth(year, 1, 1, 3), // Presidents Day — 3rd Monday Feb
    lastWeekdayOfMonth(year, 4, 1), // Memorial Day — last Monday May
    nthWeekdayOfMonth(year, 8, 1, 1), // Labor Day — 1st Monday Sep
    nthWeekdayOfMonth(year, 9, 1, 2), // Columbus Day — 2nd Monday Oct
    nthWeekdayOfMonth(year, 10, 4, 4), // Thanksgiving — 4th Thursday Nov
    // IE bank holidays (first Mondays)
    nthWeekdayOfMonth(year, 5, 1, 1), // June Bank Holiday
    nthWeekdayOfMonth(year, 7, 1, 1), // August Bank Holiday
    lastWeekdayOfMonth(year, 9, 1), // October Bank Holiday — last Monday Oct
  ]);
  return holidays.has(dateStr);
}

export function isNonWorkingDay(dateStr: string): boolean {
  return isWeekend(dateStr) || isInternationalPublicHoliday(dateStr);
}

function onlyNonWorkingBetween(earlier: string, later: string): boolean {
  let d = addDays(earlier, 1);
  while (d < later) {
    if (!isNonWorkingDay(d)) return false;
    d = addDays(d, 1);
  }
  return true;
}

export type GroupStreaks = {
  current: number;
  longest: number;
};

export type CalcGroupStreaksOptions = {
  /** Inclusive period start; current streak does not walk before this date. */
  fromDate?: string;
};

/**
 * Group play-day streaks. Weekends and IE/DE/US public holidays do not break streaks.
 * Current streak is soft: today without a session yet does not break the streak.
 */
export function calcGroupStreaks(
  playDates: string[],
  today: string,
  options?: CalcGroupStreaksOptions
): GroupStreaks {
  const playSet = new Set(playDates.filter(Boolean));
  const sorted = [...playSet].sort();
  const fromDate = options?.fromDate;

  let longest = 0;
  let run = 0;
  for (let i = 0; i < sorted.length; i++) {
    const curr = sorted[i]!;
    if (i === 0) {
      run = 1;
    } else if (onlyNonWorkingBetween(sorted[i - 1]!, curr)) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
  }

  let current = 0;
  let d = today;
  if (!isNonWorkingDay(today) && !playSet.has(today)) {
    d = addDays(today, -1);
  }

  while (true) {
    if (fromDate && d < fromDate) break;
    if (isNonWorkingDay(d)) {
      d = addDays(d, -1);
      continue;
    }
    if (playSet.has(d)) {
      current += 1;
      d = addDays(d, -1);
      continue;
    }
    break;
  }

  return { current, longest };
}
