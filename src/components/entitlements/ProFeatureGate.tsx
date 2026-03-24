'use client';

import type { ReactNode } from 'react';
import { NavMenu } from '@/components/layout/NavMenu';
import { useEntitlements } from '@/lib/entitlements/EntitlementsProvider';
import type { ProGatedFeature } from '@/lib/entitlements/types';

type NavActive = 'payout' | 'sidepot' | 'history' | 'leaderboard' | 'stats';

const PRO_UPSELL_FEATURES: Array<{ title: string; desc: string }> = [
  { title: 'Unlimited sessions', desc: 'Keep every game in the cloud—no 10-session cap.' },
  { title: 'Stats & profit over time', desc: 'Lifetime totals, win rate, and charts across all play.' },
  { title: 'Groups & leaderboards', desc: 'Crews, invites, and rankings across sessions.' },
  { title: 'Export your data', desc: 'Download CSV when you need a spreadsheet backup.' },
];

function ProChipHeroIcon() {
  return (
    <svg className="pro-upsell-chip" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="pro-chip-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f0d78c" />
          <stop offset="45%" stopColor="#d4a832" />
          <stop offset="100%" stopColor="#9a7418" />
        </linearGradient>
        <linearGradient id="pro-chip-edge" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#3f3f46" />
          <stop offset="100%" stopColor="#18181b" />
        </linearGradient>
      </defs>
      <circle cx="40" cy="40" r="36" fill="url(#pro-chip-edge)" />
      <circle cx="40" cy="40" r="30" fill="url(#pro-chip-gold)" stroke="#27272a" strokeWidth="1" />
      <text
        x="40"
        y="45"
        textAnchor="middle"
        fill="#18181b"
        fontSize="13"
        fontWeight="800"
        fontFamily="system-ui, sans-serif"
        letterSpacing="-0.5"
      >
        PRO
      </text>
      <circle cx="40" cy="40" r="22" fill="none" stroke="rgba(24,24,27,0.2)" strokeWidth="1" />
    </svg>
  );
}

function ProFeatureCheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M3.5 8.2 6.4 11l6.1-6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ProUpsellPanel({
  description,
  onCta,
}: {
  description: string;
  onCta: () => void;
}) {
  return (
    <div className="pro-upsell">
      <div className="pro-upsell-hero">
        <div className="pro-upsell-glow" aria-hidden="true" />
        <div className="pro-upsell-chip-wrap">
          <ProChipHeroIcon />
        </div>
        <span className="pro-upsell-badge">One-time unlock</span>
        <p className="pro-upsell-headline">ChipHappens Pro</p>
        <p className="pro-upsell-lede">{description}</p>
      </div>
      <ul className="pro-upsell-features">
        {PRO_UPSELL_FEATURES.map((f) => (
          <li key={f.title} className="pro-upsell-feature">
            <span className="pro-upsell-feature-icon">
              <ProFeatureCheckIcon />
            </span>
            <div className="pro-upsell-feature-text">
              <p className="pro-upsell-feature-title">{f.title}</p>
              <p className="pro-upsell-feature-desc">{f.desc}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="pro-upsell-cta">
        <button type="button" className="btn btn-primary w-full" onClick={onCta}>
          Learn about Pro
        </button>
      </div>
      <p className="pro-upsell-note">Purchasing unlocks Pro when billing goes live—no subscription.</p>
    </div>
  );
}

function ToolbarSpadeIcon() {
  return (
    <span className="toolbar-icon" aria-hidden="true" title="Poker">
      <svg width="22" height="22" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img">
        <title>Spade</title>
        <path
          fill="#d4a832"
          d="M32 6C20 18 8 26 8 36c0 6 5 11 11 11 4 0 8-2 10-5-1 5-3 9-8 12h22c-5-3-7-7-8-12 2 3 6 5 10 5 6 0 11-5 11-11 0-10-12-18-24-30z"
        />
      </svg>
    </span>
  );
}

function HistoryStyleCardShell({
  title,
  navActivePage,
  children,
}: {
  title: string;
  navActivePage: NavActive;
  children: ReactNode;
}) {
  return (
    <div className="wrap">
      <h1 className="page-title">{title}</h1>
      <div className="card">
        <div className="toolbar">
          <NavMenu activePage={navActivePage} />
          <ToolbarSpadeIcon />
          <span className="spacer" />
        </div>
        <div className="card-content">{children}</div>
      </div>
    </div>
  );
}

interface ProFeatureGateProps {
  feature: ProGatedFeature;
  children: ReactNode;
  title?: string;
  description?: string;
  /** Use inside modals instead of full-page gate. */
  layout?: 'page' | 'inline' | 'cardWithNav';
  /**
   * Same shell as History: hamburger + card. Use with `layout="cardWithNav"` so FREE users keep menu access.
   */
  navActivePage?: NavActive;
}

export function ProFeatureGate({
  feature,
  children,
  title,
  description,
  layout = 'page',
  navActivePage = 'payout',
}: ProFeatureGateProps) {
  const { flags, loading, openUpgradeModal } = useEntitlements();

  const pageTitle = title ?? 'Pro feature';

  if (loading && layout === 'cardWithNav') {
    return (
      <HistoryStyleCardShell title={pageTitle} navActivePage={navActivePage}>
        <div className="pro-upsell-loading">
          <div className="pro-upsell-loading-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className="muted-text text-sm">Loading…</p>
        </div>
      </HistoryStyleCardShell>
    );
  }

  if (loading && layout === 'page') {
    return (
      <div className="wrap">
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p className="muted-text">Loading…</p>
        </div>
      </div>
    );
  }

  if (loading && layout === 'inline') {
    return <p className="muted-text">Loading…</p>;
  }

  if (!flags[feature]) {
    if (layout === 'inline') {
      return (
        <div className="text-center py-2">
          <p className="muted-text mb-4 text-sm">
            {description ??
              'This is part of ChipHappens Pro (one-time unlock). Billing is coming soon.'}
          </p>
          <button type="button" className="btn btn-primary" onClick={() => openUpgradeModal()}>
            Learn about Pro
          </button>
        </div>
      );
    }

    if (layout === 'cardWithNav') {
      const lede =
        description ??
        'This area is part of ChipHappens Pro (one-time unlock). Upgrade when billing is available.';
      return (
        <HistoryStyleCardShell title={pageTitle} navActivePage={navActivePage}>
          <ProUpsellPanel description={lede} onCta={() => openUpgradeModal()} />
        </HistoryStyleCardShell>
      );
    }

    return (
      <div className="wrap">
        <h1 className="page-title">{pageTitle}</h1>
        <div className="card">
          <div className="card-content text-center">
            <p className="muted-text mb-4">
              {description ??
                'This area is part of ChipHappens Pro (one-time unlock). Upgrade when billing is available.'}
            </p>
            <button type="button" className="btn btn-primary" onClick={() => openUpgradeModal()}>
              Learn about Pro
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
