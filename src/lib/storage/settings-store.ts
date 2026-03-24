import { SettingsData, UsualSuspect } from '../types';
import { SETTINGS_STORAGE_KEY, KNOWN_CURRENCIES, VALID_SETTLEMENT_MODES } from '../constants';

/* ── localStorage ── */

const loadSettingsLS = (): SettingsData | null => {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const saveSettingsLS = (payload: SettingsData): void => {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload, null, 2));
};

/* ── Normalize ── */

export function normalizeSettingsData(
  data: Partial<SettingsData> | null | undefined,
  defaultSuspects: UsualSuspect[] = []
): SettingsData {
  const profile = {
    name: data?.profile?.name ?? '',
    revtag: data?.profile?.revtag ?? '',
  };

  const normalizeSuspect = (item: unknown): UsualSuspect | null => {
    if (!item) return null;
    if (typeof item === 'string') {
      const name = item.trim();
      return name ? { name, revtag: '' } : null;
    }
    const obj = item as Record<string, unknown>;
    const name = String(obj.name ?? '').trim();
    if (!name) return null;
    return { name, revtag: String(obj.revtag ?? '').trim() };
  };

  const list = Array.isArray(data?.usualSuspects)
    ? data.usualSuspects
    : Array.isArray(defaultSuspects)
      ? defaultSuspects
      : [];

  const usualSuspects = (list as unknown[])
    .map(normalizeSuspect)
    .filter((item): item is UsualSuspect => item !== null);

  const rawCurrency = (data?.gameSettings?.currency ?? 'EUR').trim();
  const currency = KNOWN_CURRENCIES.includes(rawCurrency)
    ? rawCurrency
    : rawCurrency || 'EUR';
  const defaultBuyIn = String(data?.gameSettings?.defaultBuyIn ?? '30');
  const rawMode = (data?.gameSettings?.settlementMode ?? 'banker').trim();
  const settlementMode = (VALID_SETTLEMENT_MODES as readonly string[]).includes(rawMode)
    ? (rawMode as 'banker' | 'greedy')
    : 'banker';
  const gameSettings = { currency, defaultBuyIn, settlementMode };

  return { profile, usualSuspects, gameSettings };
}

/* ── Load ── */

export async function loadSettingsData(): Promise<SettingsData | null> {
  if (typeof window === 'undefined') return null;
  return loadSettingsLS();
}

/* ── Save ── */

export async function saveSettingsData(payload: SettingsData): Promise<void> {
  if (typeof window === 'undefined') return;
  saveSettingsLS(payload);
}
