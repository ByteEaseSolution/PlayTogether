import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Mints ICE server config for the browser.
 *
 * Cloudflare TURN keys are long-term secrets and cannot be used as TURN credentials
 * directly — they must be exchanged server-side for short-lived ones. That exchange
 * has to happen somewhere the key is not public, which is why this route exists.
 *
 *   CLOUDFLARE_TURN_KEY_ID      server-only (no NEXT_PUBLIC_ prefix)
 *   CLOUDFLARE_TURN_API_TOKEN   server-only
 *
 * Providers that do issue static credentials (coturn, Metered) can skip this and use
 * the NEXT_PUBLIC_TURN_* variables instead; the client falls back to those.
 */

const STUN: RTCIceServer[] = [
  { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] },
];

/** Credentials outlive a long gaming session but not much more. */
const TTL_SECONDS = 6 * 60 * 60;

function staticTurn(): RTCIceServer[] {
  const urls = (process.env.NEXT_PUBLIC_TURN_URLS ?? '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
  if (!urls.length) return [];
  return [
    {
      urls,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    },
  ];
}

function configuredSource(): 'cloudflare' | 'static' | 'none' {
  if (process.env.CLOUDFLARE_TURN_KEY_ID && process.env.CLOUDFLARE_TURN_API_TOKEN) return 'cloudflare';
  if (staticTurn().length) return 'static';
  return 'none';
}

export async function GET(request: Request) {
  const source = configuredSource();

  // Cheap check for the landing page — does not burn an API call or mint credentials.
  if (new URL(request.url).searchParams.has('probe')) {
    return NextResponse.json({ configured: source !== 'none', source });
  }

  if (source === 'cloudflare') {
    const keyId = process.env.CLOUDFLARE_TURN_KEY_ID!;
    try {
      const res = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.CLOUDFLARE_TURN_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ttl: TTL_SECONDS }),
          cache: 'no-store',
        },
      );

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        console.error('[turn] cloudflare rejected the key', res.status, detail.slice(0, 200));
        // Degrade to STUN rather than breaking the room entirely.
        return NextResponse.json(
          { iceServers: [...STUN, ...staticTurn()], source: 'stun-only', error: `cloudflare ${res.status}` },
          { status: 200 },
        );
      }

      const body = (await res.json()) as { iceServers?: RTCIceServer | RTCIceServer[] };
      const minted = Array.isArray(body.iceServers)
        ? body.iceServers
        : body.iceServers
          ? [body.iceServers]
          : [];

      return NextResponse.json({ iceServers: [...STUN, ...minted], source: 'cloudflare' });
    } catch (err) {
      console.error('[turn] could not reach cloudflare', err);
      return NextResponse.json({ iceServers: [...STUN, ...staticTurn()], source: 'stun-only' }, { status: 200 });
    }
  }

  const fallback = staticTurn();
  return NextResponse.json({
    iceServers: [...STUN, ...fallback],
    source: fallback.length ? 'static' : 'stun-only',
  });
}
