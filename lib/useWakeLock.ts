'use client';

import { useEffect } from 'react';

/** Keeps a phone screen awake while it is in a session. Silently unsupported on iOS Safari < 16.4. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let released = false;

    const acquire = async () => {
      try {
        sentinel = await (navigator as Navigator & { wakeLock: WakeLock }).wakeLock.request('screen');
      } catch {
        /* denied or unsupported */
      }
    };

    void acquire();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !released) void acquire();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}
