# PlayTogether

Play on your TV. Your laptop streams the gameplay, your phone streams your face and
becomes your headset, and one other person joins from anywhere with a six-character code.

```
          ┌─────────────┐   gameplay video + audio    ┌──────────────┐
          │   laptop    │ ──────────────────────────▶  │   her phone  │
          │  (gameplay) │                             │   / laptop   │
          └─────────────┘                             └──────────────┘
                                                        ▲          │
          ┌─────────────┐   your face + voice           │          │ her face
          │  your phone │ ──────────────────────────────┘          │ + voice
          │  (+earbuds) │ ◀───────────────────────────────────────-┘
          └─────────────┘
```

Your phone and the laptop never connect to each other — you are looking at the TV, and
playing the game audio next to your own open mic is how you get an echo.

## 1. Get the PS5 picture into the laptop

**HDMI on a laptop is an output, not an input.** Plugging the PS5 into your laptop's HDMI
port does nothing. Two options:

### A. Remote Play relay — ₹0, play on the TV
1. Install [Chiaki-ng](https://github.com/streetpea/chiaki-ng) (the maintained Linux
   PS Remote Play client) and register it against your PS5.
2. Connect the laptop to the TV over HDMI and put the Chiaki window fullscreen on it.
   The TV now shows the laptop's output, so switch the TV to that input.
3. Pair the DualSense to the **laptop** (USB or Bluetooth) — Chiaki forwards your input.
4. In PlayTogether, choose **Share a screen or window** and pick the Chiaki window.

Adds roughly 20–60 ms over a wired LAN. Fine for most games, not for ranked shooters.
Note the PS5 blanks its own HDMI output while Remote Play is active — that is exactly why
the picture has to come back out through the laptop.

### B. Splitter + capture card — ~₹2–4k, zero added lag
PS5 → HDMI splitter → TV **and** → USB capture dongle → laptop. Get an MS2130-based
dongle for 1080p60 (the cheaper MS2109 ones cap at 1080p30), or a card with built-in
HDMI passthrough so you can skip the splitter.

In PlayTogether, choose **A capture card or camera** and pick the device. Nothing else
in the app changes.

### Game audio on Linux
Sharing a *window* never carries its sound, and Chrome on Linux cannot capture system
audio from a screen share either. So the app lets you pick the audio separately:

- **Remote Play path:** choose an audio input named `Monitor of …` — PulseAudio's loopback
  of whatever your speakers are playing. If nothing like that appears, run
  `pactl load-module module-loopback` once, or enable monitor sources in `pavucontrol`.
- **Capture card path:** choose the card's own audio input.

## 2. Set up signalling (Supabase)

WebRTC needs a signalling relay, and Vercel's serverless functions cannot hold a
WebSocket open. Supabase Realtime does it on the free tier. **No tables, no auth, no
schema** — the app only uses a broadcast channel.

1. Create a project at [supabase.com](https://supabase.com).
2. Project Settings → API → copy the **Project URL** and the **anon public** key.
3. `cp .env.example .env.local` and paste them in.

The media itself never touches Supabase — it goes peer-to-peer.

## 3. Add a TURN server (required unless you share a Wi-Fi network)

WebRTC sends media directly between the two devices. On the same Wi-Fi that just works,
and across most home internet STUN hole-punching is enough. But when the two of you are
on **different networks — especially Indian mobile data, which is behind carrier-grade
NAT — there is no port to punch and no direct path exists.** A TURN relay is then the
only way media flows at all.

### Cloudflare TURN (free tier, ~5 minutes)

1. [Cloudflare dashboard](https://dash.cloudflare.com) → **Realtime** → **TURN Keys** →
   *Create*.
2. Copy the **Key ID** and the **API Token**.
3. Set them as **server-side** variables — note there is deliberately no
   `NEXT_PUBLIC_` prefix:

```
CLOUDFLARE_TURN_KEY_ID=<key id>
CLOUDFLARE_TURN_API_TOKEN=<api token>
```

Cloudflare TURN keys are long-term secrets and **cannot be used as TURN credentials
directly**. [`app/api/turn/route.ts`](app/api/turn/route.ts) exchanges the key for
short-lived credentials (6 hour TTL) via Cloudflare's
`generate-ice-servers` endpoint, and the browser fetches those from `/api/turn` before
opening any peer connection. That is also why the key must never carry a
`NEXT_PUBLIC_` prefix: that would inline it into the public JavaScript bundle.

If Cloudflare is unreachable or rejects the key, the route degrades to STUN-only with
HTTP 200 rather than breaking the room, and logs the status server-side.

### Providers with static credentials

coturn, Metered and similar issue a fixed username/password, which needs no exchange.
Leave the Cloudflare variables unset and use these instead:

```
NEXT_PUBLIC_TURN_URLS=turn:your.host:3478?transport=udp,turn:your.host:3478?transport=tcp
NEXT_PUBLIC_TURN_USERNAME=<username>
NEXT_PUBLIC_TURN_CREDENTIAL=<password>
```

The free `openrelay.metered.ca` service that older guides recommend no longer issues
relay candidates — verified, do not bother.

### Checking it works

The landing page reports the active relay source, and the laptop's live panel shows a
`relay: cloudflare` pill. A relay cannot see your gameplay or hear either of you —
WebRTC media is DTLS-SRTP encrypted end to end, so the relay forwards opaque packets.

## 4. Run it

```bash
npm install
npm run dev
```

Cameras and screen capture need a secure context. `localhost` counts, but **your phone
does not** — to test on a phone either deploy, or use `npm run dev:https` and open the
LAN address it prints.

## 5. Deploy to Vercel

```bash
npx vercel
```

Add the variables from sections 2 and 3 under Project → Settings → Environment Variables,
then redeploy. `NEXT_PUBLIC_*` values are inlined **at build time**, so a variable added
after a build does nothing until you redeploy. Everything is static + client-side; there is no server runtime to pay for.

## Using it

1. On the laptop: **Start a session** → pick your picture and sound → **Go live**.
2. Copy **my phone link** to your phone. Earphones in. Join with camera & mic.
3. Send her **her link**. She taps Join, and taps once more if the browser blocked audio.

Each status pill shows `connecting` → `live`. If a pill sits on `connecting` for more than
about fifteen seconds, that is almost always the missing TURN server — the giveaway is the
game pill reading `live` while hers stays on `connecting`.

## Notes and limits

- **One guest.** The room has exactly three seats; a second guest device would take over
  the same seat. A fourth participant means moving to an SFU (LiveKit, mediasoup).
- **Anyone with the link can join** a room while it is open. Generate a new code per
  session; that is the whole access model.
- **Quality** is whatever WebRTC negotiates — typically 1080p when bandwidth allows, with
  the usual congestion backoff. Upload bandwidth on the laptop is the usual limit.
- **Keep the laptop tab open.** Minimising is fine, closing is not.

## Layout

| Path | What it is |
|---|---|
| `lib/roles.ts` | The three seats, who connects to whom, and who sends tracks |
| `lib/mesh.ts` | Peer connections, single-sided offers, ICE restart, track swapping |
| `lib/useRoom.ts` | Supabase presence + broadcast wired into the mesh |
| `lib/media.ts` | Screen share, capture devices, loopback audio, camera |
| `app/api/turn/route.ts` | Exchanges the Cloudflare TURN key for short-lived credentials |
| `components/HostPane.tsx` | Laptop: source picker, then the live panel |
| `components/FacePane.tsx` | Your phone: your face out, her voice in |
| `components/GuestPane.tsx` | Her device: gameplay big, faces in the corner |
