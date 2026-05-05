'use client';

import { ProvidersNoShell } from '@/components/layout/ProvidersNoShell';

/** Minimal layout for password reset: tokens are processed by Supabase client on load. */
export default function ResetPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProvidersNoShell>{children}</ProvidersNoShell>;
}
