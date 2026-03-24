'use client';

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
}

export function UpgradeModal({ open, onClose }: UpgradeModalProps) {
  if (!open) return null;

  return (
    <div className="modal active" role="dialog" aria-modal="true" aria-labelledby="upgrade-title">
      <div className="modal-overlay" onClick={onClose} />
      <div className="modal-content" role="document">
        <div className="modal-header">
          <h2 id="upgrade-title" className="modal-title">
            ChipHappens Pro
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">
          <p className="muted-text mb-4">
            Pro is a <strong>one-time unlock</strong>. Purchasing will be available in a future update.
          </p>
          <ul className="muted-text space-y-2 text-sm list-disc pl-5 mb-6">
            <li>Unlimited saved sessions</li>
            <li>Lifetime stats (profit, win rate, average buy-in)</li>
            <li>Player insights and cross-session leaderboard</li>
            <li>Groups</li>
            <li>Profit over time</li>
            <li>Export your data (CSV)</li>
          </ul>
          <div className="settings-actions">
            <button type="button" className="btn btn-primary w-full" disabled>
              Unlock Pro — coming soon
            </button>
            <button type="button" className="btn btn-secondary w-full mt-2" onClick={onClose}>
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
