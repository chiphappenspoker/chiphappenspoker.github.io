'use client';

import { Providers } from '@/components/layout/Providers';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Providers>{children}</Providers>;
}
