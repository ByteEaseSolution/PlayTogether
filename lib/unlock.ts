'use client';

/**
 * Called synchronously from a click so it runs inside the user-gesture stack —
 * that is the only reliable way to start audio playback on iOS Safari.
 */
export function unlockAllVideos() {
  document.querySelectorAll('video').forEach((el) => {
    void el.play().catch(() => {});
  });
}
