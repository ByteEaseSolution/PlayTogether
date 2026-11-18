'use client';

import { useEffect, useRef } from 'react';

type Props = {
  stream: MediaStream | null;
  muted?: boolean;
  className?: string;
  /** Fires true when the browser refuses to start playback without a user gesture. */
  onBlocked?: (blocked: boolean) => void;
};

/**
 * srcObject cannot be set declaratively, and iOS needs playsInline or it yanks the
 * video into its own fullscreen player.
 */
export function Video({ stream, muted = false, className, onBlocked }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const blockedCb = useRef(onBlocked);
  blockedCb.current = onBlocked;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (!stream) return;
    el.play().then(
      () => blockedCb.current?.(false),
      () => blockedCb.current?.(true),
    );
  }, [stream, muted]);

  useEffect(() => {
    const el = ref.current;
    if (el) el.muted = muted;
  }, [muted]);

  return <video ref={ref} className={className} autoPlay playsInline muted={muted} />;
}
