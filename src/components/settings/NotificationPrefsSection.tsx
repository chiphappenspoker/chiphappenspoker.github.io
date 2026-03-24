'use client';

import { useEntitlements } from '@/lib/entitlements/EntitlementsProvider';

/** Preferences stored in `profiles.notification_prefs` for future FCM / push delivery. */
export function NotificationPrefsSection() {
  const { notificationPrefs, setNotificationPrefs, loading } = useEntitlements();

  if (loading) return null;

  return (
    <div className="settings-section mt-6">
      <h3 className="text-sm font-semibold mb-2">Notification preferences</h3>
      <p className="muted-text text-sm mb-3">
        Saved to your account. Push delivery will use these when mobile notifications are enabled.
      </p>
      <label className="settings-field flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={notificationPrefs.groupInvite}
          onChange={(e) => void setNotificationPrefs({ groupInvite: e.target.checked })}
        />
        <span>Group invitations</span>
      </label>
      <label className="settings-field flex items-center gap-2 cursor-pointer mt-2">
        <input
          type="checkbox"
          checked={notificationPrefs.sessionSettled}
          onChange={(e) => void setNotificationPrefs({ sessionSettled: e.target.checked })}
        />
        <span>Session settled summary</span>
      </label>
      <label className="settings-field flex items-center gap-2 cursor-pointer mt-2">
        <input
          type="checkbox"
          checked={notificationPrefs.settlementReminder}
          onChange={(e) => void setNotificationPrefs({ settlementReminder: e.target.checked })}
        />
        <span>Settlement reminders</span>
      </label>
    </div>
  );
}
