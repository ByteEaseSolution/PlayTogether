/**
 * PlayTogether has exactly three seats in a room.
 *
 *   screen  the laptop wired to / relaying the PS5. Publishes gameplay video + game audio.
 *   face    your phone. Publishes your camera + mic, and PLAYS HER VOICE — this is your headset.
 *   guest   her phone/laptop. Watches the gameplay + your face, publishes her camera + mic.
 *
 * Who connects to whom is deliberately NOT a full mesh. The laptop and your phone
 * never talk to each other: you are sitting in front of the TV, so you do not need
 * the gameplay streamed back to your own phone, and you must not play the game audio
 * there either or you get an echo against the TV.
 *
 *   screen --(game video+audio)--> guest
 *   face  <--(cam+mic both ways)--> guest
 *
 * That is 2 peer connections, and the laptop only uploads one video stream.
 */
export type Role = 'screen' | 'face' | 'guest';

export const ROLES: Role[] = ['screen', 'face', 'guest'];

export const ROLE_LABEL: Record<Role, string> = {
  screen: 'Gameplay',
  face: 'My camera',
  guest: 'Watching',
};

export const ROLE_BLURB: Record<Role, string> = {
  screen: 'The laptop connected to the PS5. Sends the gameplay picture and sound.',
  face: 'Your phone, propped next to you. Sends your face and voice, and plays hers.',
  guest: 'Her device. Sees the gameplay and your face, and talks to you.',
};

export function isRole(v: unknown): v is Role {
  return typeof v === 'string' && (ROLES as string[]).includes(v);
}

type Pair = {
  /** The side that always creates the offer, so there is never any glare. */
  initiator: Role;
  /** Roles that attach their local tracks on this connection. */
  senders: Role[];
};

const PAIRS: Record<string, Pair> = {
  'guest|screen': { initiator: 'screen', senders: ['screen'] },
  'face|guest': { initiator: 'face', senders: ['face', 'guest'] },
  // 'face|screen' is intentionally absent — those two never connect.
};

export type PairPlan = { iInitiate: boolean; iSend: boolean; theySend: boolean };

/** Returns null when the two roles should not connect at all. */
export function planFor(mine: Role, theirs: Role): PairPlan | null {
  if (mine === theirs) return null; // two devices claimed the same seat
  const pair = PAIRS[[mine, theirs].sort().join('|')];
  if (!pair) return null;
  return {
    iInitiate: pair.initiator === mine,
    iSend: pair.senders.includes(mine),
    theySend: pair.senders.includes(theirs),
  };
}

/** Does this role need a local camera/mic/capture before it can go live? */
export function publishes(role: Role): boolean {
  return ROLES.some((other) => planFor(role, other)?.iSend);
}
