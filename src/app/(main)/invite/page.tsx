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
      <div className="wrap">
        <h1 className="page-title">Invalid invitation</h1>
        <div className="card">
          <div className="card-content text-center">
            <p className="muted-text mb-4">This invitation link is missing the group. Ask the group owner for a new link.</p>
            <Link href="/" className="btn btn-primary">
              Go to calculator
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="wrap">
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p className="muted-text">Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="wrap">
        <h1 className="page-title">You&apos;re invited</h1>
        <div className="card">
          <div className="card-content text-center">
            <p className="muted-text mb-4">You&apos;ve been invited to join <strong>{decodedName}</strong>. Sign in to join this group.</p>
            <Link href="/" className="btn btn-primary">
              Sign in and open app
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (joined) {
    return (
      <div className="wrap">
        <h1 className="page-title">You joined</h1>
        <div className="card">
          <div className="card-content text-center">
            <p className="muted-text mb-4">You joined <strong>{decodedName}</strong>. You can now use this group when starting a game session.</p>
            <Link href="/" className="btn btn-primary">
              Go to calculator
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <h1 className="page-title">You&apos;re invited</h1>
      <div className="card">
        <div className="card-content text-center">
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
        </div>
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={
      <div className="wrap">
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p className="muted-text">Loading…</p>
        </div>
      </div>
    }>
      <InviteContent />
    </Suspense>
  );
}
