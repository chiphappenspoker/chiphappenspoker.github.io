'use client';

import { useId } from 'react';

type Props = {
  /** When true, the user appears on group leaderboards (`leaderboardOptOut` is false). */
  showInLeaderboards: boolean;
  onShowInLeaderboardsChange: (show: boolean) => void;
};

export function LeaderboardVisibilitySwitch({
  showInLeaderboards,
  onShowInLeaderboardsChange,
}: Props) {
  const labelId = useId();
  return (
    <div className="settings-switch-row">
      <span className="settings-switch-label" id={labelId}>
        Show me in group leaderboards
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={showInLeaderboards}
        aria-labelledby={labelId}
        className={`settings-switch ${showInLeaderboards ? 'settings-switch-on' : ''}`}
        onClick={() => onShowInLeaderboardsChange(!showInLeaderboards)}
      >
        <span className="settings-switch-thumb" aria-hidden />
      </button>
    </div>
  );
}
