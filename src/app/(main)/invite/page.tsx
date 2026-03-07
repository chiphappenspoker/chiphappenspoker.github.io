'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useGroups } from '@/hooks/useGroups';

function InviteContent() {
  const searchParams = useSearchParams();
  const groupId = searchParams.get('group');
  const groupName = searchParams.get('name') ?? 'this group';
  const decodedName = decodeURIComponent(groupName);
  const { user, loading: authLoading } = useAuth();
  const { addGroupMember, reload } = useGroups();
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async () => {
    if (!groupId || !user) return;
    setJoining(true);
    setError(null);
    try {
      await addGroupMember(groupId, user.id);
      await reload();
      setJoined(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setJoining(false);
    }
  };

  if (!groupId) {
    return (
      <div className="app-shell">
        <main className="app-main max-w-md mx-auto text-center py-10 px-4">
          <h1 className="text-xl font-semibold mb-2">Invalid invitation</h1>
          <p className="muted-text mb-4">This invitation link is missing the group. Ask the group owner for a new link.</p>
          <Link href="/" className="btn btn-primary">
            Go to calculator
          </Link>
        </main>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="app-shell">
        <main className="app-main max-w-md mx-auto text-center py-10 px-4">
          <p className="muted-text">Loading…</p>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-shell">
        <main className="app-main max-w-md mx-auto text-center py-10 px-4">
          <h1 className="text-xl font-semibold mb-2">You&apos;re invited</h1>
          <p className="muted-text mb-4">You&apos;ve been invited to join <strong>{decodedName}</strong>. Sign in to join this group.</p>
          <Link href="/" className="btn btn-primary">
            Sign in and open app
          </Link>
        </main>
      </div>
    );
  }

  if (joined) {
    return (
      <div className="app-shell">
        <main className="app-main max-w-md mx-auto text-center py-10 px-4">
          <h1 className="text-xl font-semibold mb-2">You joined {decodedName}</h1>
          <p className="muted-text mb-4">You can now use this group when starting a game session.</p>
          <Link href="/" className="btn btn-primary">
            Go to calculator
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <main className="app-main max-w-md mx-auto text-center py-10 px-4">
        <h1 className="text-xl font-semibold mb-2">You&apos;re invited</h1>
        <p className="muted-text mb-4">Join <strong>{decodedName}</strong> to appear in the player list when this group is used for a session.</p>
        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleJoin}
          disabled={joining}
        >
          {joining ? 'Joining…' : 'Join group'}
        </button>
        <p className="mt-4">
          <Link href="/" className="text-sm muted-text underline">
            Back to calculator
          </Link>
        </p>
      </main>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={
      <div className="app-shell">
        <main className="app-main max-w-md mx-auto text-center py-10 px-4">
          <p className="muted-text">Loading…</p>
        </main>
      </div>
    }>
      <InviteContent />
    </Suspense>
  );
}
