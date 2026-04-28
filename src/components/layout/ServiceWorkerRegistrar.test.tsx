import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { ServiceWorkerRegistrar } from './ServiceWorkerRegistrar';

describe('ServiceWorkerRegistrar', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalServiceWorker = Object.getOwnPropertyDescriptor(window.navigator, 'serviceWorker');

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    if (originalServiceWorker) {
      Object.defineProperty(window.navigator, 'serviceWorker', originalServiceWorker);
    }
  });

  it('does not register service worker in development', () => {
    process.env.NODE_ENV = 'development';
    const register = vi.fn(async () => undefined);
    const getRegistrations = vi.fn(async () => []);
    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: { register, getRegistrations },
    });

    render(<ServiceWorkerRegistrar />);

    expect(register).not.toHaveBeenCalled();
  });
});
