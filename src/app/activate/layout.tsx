'use client';

import { ProvidersNoShell } from '@/components/layout/ProvidersNoShell';

/** Minimal layout for activate landing: no AppShell, no nav. Auth still runs so email-confirm hash can be processed. */
export default function ActivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProvidersNoShell>{children}</ProvidersNoShell>;
}
