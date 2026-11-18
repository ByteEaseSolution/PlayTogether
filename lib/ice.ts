export type IceSource = 'cloudflare' | 'static' | 'stun-only';
export type IceConfig = { iceServers: RTCIceServer[]; source: IceSource };

const STUN_ONLY: IceConfig = {
  iceServers: [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }],
  source: 'stun-only',
};

/**
 * Asks the server for ICE config. Cloudflare TURN credentials are short-lived and
 * must be minted server-side, so this cannot be a build-time constant.
 * Any failure degrades to STUN rather than blocking the room.
 */
export async function loadIceServers(): Promise<IceConfig> {
  try {
    const res = await fetch('/api/turn', { cache: 'no-store' });
    if (!res.ok) return STUN_ONLY;
    const body = (await res.json()) as Partial<IceConfig>;
    if (!Array.isArray(body.iceServers) || !body.iceServers.length) return STUN_ONLY;
    return { iceServers: body.iceServers, source: body.source ?? 'stun-only' };
  } catch {
    return STUN_ONLY;
  }
}

/** Lightweight check for the landing page — does not mint credentials. */
export async function probeTurn(): Promise<{ configured: boolean; source: string }> {
  try {
    const res = await fetch('/api/turn?probe=1', { cache: 'no-store' });
    if (!res.ok) return { configured: false, source: 'none' };
    return (await res.json()) as { configured: boolean; source: string };
  } catch {
    return { configured: false, source: 'none' };
  }
}

/** True when a candidate list contains a TURN relay candidate. */
export function hasRelay(iceServers: RTCIceServer[]): boolean {
  return iceServers.some((s) => {
    const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
    return urls.some((u) => typeof u === 'string' && u.startsWith('turn'));
  });
}
