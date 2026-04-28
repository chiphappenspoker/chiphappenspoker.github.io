'use client';

import { useEffect } from 'react';
import { BASE_PATH } from '@/lib/constants';

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const base = BASE_PATH || '/';
    const scope = base.endsWith('/') ? base : `${base}/`;

    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations?.().then((registrations) => {
        registrations.forEach((registration) => {
          void registration.unregister();
        });
      });
      return;
    }

    navigator.serviceWorker
      .register(`${base}sw.js`, { scope })
      .catch(() => {
        /* SW registration failed — app still works */
      });
  }, []);

  return null;
}
