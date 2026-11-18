export function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];

  const urls = (process.env.NEXT_PUBLIC_TURN_URLS ?? '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);

  if (urls.length) {
    servers.push({
      urls,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  }
  return servers;
}

export const hasTurn = () => Boolean((process.env.NEXT_PUBLIC_TURN_URLS ?? '').trim());
