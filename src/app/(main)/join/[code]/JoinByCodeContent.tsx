'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthProvider';
import { getRepository } from '@/lib/data/sync-repository';
import { cloudRepository } from '@/lib/data/cloud-repository';

export function JoinByCodeContent({ code }: { code: string }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!code) {
      setInvalid(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const repo = user ? getRepository(true) : cloudRepository;
      const group = await repo.getGroupByInviteCode(code);
      if (cancelled) return;
      if (group) {
        const url = `/invite?group=${group.id}&name=${encodeURIComponent(group.name)}`;
        router.replace(url);
        return;
      }
      setInvalid(true);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
      setLoading(false);
    };
  }, [code, user, authLoading, router]);

  if (authLoading || (loading && !invalid)) {
    return (
      <div className="wrap">
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p className="muted-text">Loading…</p>
        </div>
      </div>
    );
  }

  if (invalid) {
    return (
      <div className="wrap">
        <h1 className="page-title">Invalid invitation</h1>
        <div className="card">
          <div className="card-content text-center">
            <p className="muted-text mb-4">This invitation link is invalid or has expired. Ask the group owner for a new link.</p>
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
      <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
        <p className="muted-text">Redirecting…</p>
      </div>
    </div>
  );
}
