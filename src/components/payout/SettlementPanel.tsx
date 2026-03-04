'use client';

import { useEffect, useRef, useState } from 'react';
import { useSettings } from '@/hooks/useSettings';
import { normalizeRevtag, buildRevolutLink } from '@/lib/payments/revolut';
import { fmt, parseNum } from '@/lib/calc/formatting';
import { PayoutRowData, Transaction } from '@/lib/types';
import { normalizeSettingsData, loadSettingsData, saveSettingsData } from '@/lib/storage/settings-store';
import { useToast } from '@/hooks/useToast';

const EMPTY_SUSPECTS: { name: string; revtag: string }[] = [];

interface SettlementPanelProps {
  visible: boolean;
  rows: PayoutRowData[];
  settlementMode: 'banker' | 'greedy';
  currency: string;
  transactions: Transaction[];
  /** When set (e.g. from group members), used for revtag lookups instead of settings */
  usualSuspectsOverride?: { name: string; revtag: string }[];
}

interface PaymentItem {
  label: string;
  amount: number;
  link: string;
}

export function SettlementPanel({
  visible,
  rows,
  settlementMode,
  currency,
  transactions,
  usualSuspectsOverride,
}: SettlementPanelProps) {
  const { settings, reload } = useSettings();
  const { showToast } = useToast();
  const promptedRef = useRef(false);
  const [receiveItems, setReceiveItems] = useState<PaymentItem[]>([]);
  const [payItems, setPayItems] = useState<PaymentItem[]>([]);

  useEffect(() => {
    if (!visible) {
      promptedRef.current = false;
      return;
    }
    buildPaymentLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, rows, settlementMode, settings, usualSuspectsOverride]);

  const buildPaymentLinks = async () => {
    const raw = await loadSettingsData();
    const settingsData = normalizeSettingsData(raw, EMPTY_SUSPECTS);
    const suspectsList = usualSuspectsOverride ?? settingsData.usualSuspects;
    let settingsChanged = false;
    let profileRevtag = normalizeRevtag(settingsData.profile?.revtag);

    const ensureProfileRevtag = () => {
      if (!profileRevtag && !promptedRef.current) {
        const result = window.prompt('Enter your profile revtag', '@');
        if (result !== null) {
          const trimmed = result.trim();
          profileRevtag = trimmed === '@' ? '' : trimmed;
          if (profileRevtag) {
            settingsData.profile.revtag = profileRevtag;
            settingsChanged = true;
          }
        }
      }
      return profileRevtag;
    };

    const getSuspectRevtag = (name: string) => {
      const entry = suspectsList.find(
        (item) => (item.name || '').toLowerCase() === name.toLowerCase()
      );
      if (entry && normalizeRevtag(entry.revtag)) return entry.revtag;
      if (promptedRef.current) return '';
      const result = window.prompt(`Enter revtag for ${name}`, '@');
      if (result !== null) {
        const trimmed = result.trim();
        const entered = trimmed === '@' ? '' : trimmed;
        if (entered) {
          if (entry) {
            entry.revtag = entered;
          } else {
            settingsData.usualSuspects.push({ name, revtag: entered });
          }
          settingsChanged = true;
          return entered;
        }
      }
      return '';
    };

    const receive: PaymentItem[] = [];
    const pay: PaymentItem[] = [];

    if (settlementMode === 'greedy') {
      for (const txn of transactions) {
        const revtag = getSuspectRevtag(txn.to);
        const link = buildRevolutLink(revtag, txn.amount, currency);
        pay.push({
          label: `${txn.from} → ${txn.to}`,
          amount: txn.amount,
          link,
        });
      }
    } else {
      for (const row of rows) {
        const name = row.name.trim();
        if (!name) continue;
        const payout = parseNum(row.cashOut) - parseNum(row.buyIn);
        if (Math.abs(payout) < 0.005) continue;

        if (payout > 0) {
          const revtag = getSuspectRevtag(name);
          const link = buildRevolutLink(revtag, payout, currency);
          receive.push({ label: name, amount: payout, link });
        } else {
          const revtag = ensureProfileRevtag();
          const link = buildRevolutLink(revtag, Math.abs(payout), currency);
          pay.push({ label: name, amount: Math.abs(payout), link });
        }
      }
    }

    promptedRef.current = true;

    setReceiveItems(receive);
    setPayItems(pay);

    if (settingsChanged) {
      try {
        await saveSettingsData(settingsData);
        await reload();
      } catch {
        /* ignore */
      }
    }
  };

  const buildSummaryText = async (): Promise<string> => {
    const raw = await loadSettingsData();
    const settingsData = normalizeSettingsData(raw, EMPTY_SUSPECTS);
    const suspectsList = usualSuspectsOverride ?? settingsData.usualSuspects;
    let profileRevtag = normalizeRevtag(settingsData.profile?.revtag);

    const getSuspectRevtag = (name: string) => {
      const entry = suspectsList.find(
        (item) => (item.name || '').toLowerCase() === name.toLowerCase()
      );
      if (entry && normalizeRevtag(entry.revtag)) return entry.revtag;
      return '';
    };

    const lines: string[] = [];

    if (settlementMode === 'greedy') {
      for (const txn of transactions) {
        const revtag = getSuspectRevtag(txn.to);
        const link = buildRevolutLink(revtag, txn.amount, currency);
        const suffix = link ? ` - ${link}` : '';
        lines.push(`${txn.from} → ${txn.to}: ${fmt(txn.amount)} ${currency}${suffix}`);
      }
    } else {
      for (const row of rows) {
        const name = row.name.trim();
        if (!name) continue;
        const inVal = parseNum(row.buyIn);
        const outVal = parseNum(row.cashOut);
        const payout = outVal - inVal;
        if (payout >= -0.005) continue;
        const absAmount = Math.abs(payout);
        const link = buildRevolutLink(profileRevtag, absAmount, currency);
        const suffix = link ? ` - ${link}` : '';
        lines.push(`${name}: ${fmt(payout)} ${currency}${suffix}`);
      }
    }

    return lines.join('\n');
  };

  const handleCopyLinks = async () => {
    const text = await buildSummaryText();
    if (!text) {
      showToast('No payouts to summarize');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast('Summary copied to clipboard!');
    } catch {
      showToast('Failed to copy summary');
    }
  };

  if (!visible) return null;

  return (
    <>
      <div className="summary-actions">
        <button
          className="btn btn-secondary btn-wide"
          type="button"
          onClick={handleCopyLinks}
        >
          Copy Payment Links
        </button>
      </div>
      <div className="payment-summary">
        {settlementMode === 'banker' && (
          <div className="payment-col">
            <h3>Players To Receive</h3>
            <div className="payment-list">
              {receiveItems.length === 0 ? (
                <span className="muted-text">No players</span>
              ) : (
                receiveItems.map((item, i) => (
                  <div key={i} className="payment-row">
                    <span className="payment-name">{item.label}</span>
                    <span className="payment-amount">
                      {fmt(item.amount)} {currency}
                    </span>
                    {item.link && (
                      <a
                        className="payment-link"
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Revolut
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        <div className="payment-col">
          <h3>{settlementMode === 'greedy' ? 'Transactions' : 'Players To Pay'}</h3>
          <div className="payment-list">
            {payItems.length === 0 ? (
              <span className="muted-text">
                {settlementMode === 'greedy'
                  ? 'No transactions needed'
                  : 'No players'}
              </span>
            ) : (
              payItems.map((item, i) => (
                <div key={i} className="payment-row">
                  <span className="payment-name">{item.label}</span>
                  <span className="payment-amount">
                    {fmt(item.amount)} {currency}
                  </span>
                  {item.link && (
                    <a
                      className="payment-link"
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Revolut
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
