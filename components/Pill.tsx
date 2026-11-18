import type { PeerView } from '@/lib/mesh';

export function statusTone(state: RTCPeerConnectionState | 'absent'): 'on' | 'warn' | 'off' {
  if (state === 'connected') return 'on';
  if (state === 'failed' || state === 'closed' || state === 'absent') return 'off';
  return 'warn';
}

export function PeerPill({ label, peer }: { label: string; peer: PeerView | null }) {
  const state = peer?.state ?? 'absent';
  const text =
    state === 'absent'
      ? 'not here'
      : state === 'connected'
        ? 'live'
        : state === 'connecting' || state === 'new'
          ? 'connecting'
          : state;
  return (
    <span className={`pill ${statusTone(state)}`}>
      <span className="led" />
      {label}: {text}
    </span>
  );
}
