import type { Metadata, Viewport } from 'next';
import { Montserrat } from 'next/font/google';
import './globals.css';
import { BASE_PATH } from '@/lib/constants';
import { ServiceWorkerRegistrar } from '@/components/layout/ServiceWorkerRegistrar';

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-montserrat',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ChipHappens – Poker Payout Calculator',
  description: 'Calculate poker cash game payouts and side pots instantly.',
  manifest: `${BASE_PATH}/manifest.webmanifest`,
  icons: {
    icon: `${BASE_PATH}/icons/app_icon.png`,
    apple: `${BASE_PATH}/icons/app_icon.png`,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'ChipHappens',
  },
};

export const viewport: Viewport = {
  themeColor: '#09090b',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={montserrat.variable}>
      <body>
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}
