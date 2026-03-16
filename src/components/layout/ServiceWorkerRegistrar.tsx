'use client';

import { useEffect } from 'react';
import { BASE_PATH } from '@/lib/constants';

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const base = BASE_PATH || '/';
      const scope = base.endsWith('/') ? base : `${base}/`;
      navigator.serviceWorker
        .register(`${base}sw.js`, { scope })
        .catch(() => {
          /* SW registration failed — app still works */
        });
    }
  }, []);

  return null;
}
