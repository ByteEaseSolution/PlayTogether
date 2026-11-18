'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ROLE_BLURB, ROLE_LABEL, ROLES, type Role } from '@/lib/roles';
import { newRoomCode, normalizeCode } from '@/lib/room';
import { supabaseConfigured } from '@/lib/supabase';
import { probeTurn } from '@/lib/ice';

const ICON: Record<Role, string> = { screen: '🎮', face: '🤳', guest: '💜' };

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [turn, setTurn] = useState<{ configured: boolean; source: string } | null>(null);
  const configured = supabaseConfigured();

  useEffect(() => {
    void probeTurn().then(setTurn);
  }, []);

  const create = () => {
    const fresh = newRoomCode();
    router.push(`/r/${fresh}?role=screen`);
  };

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = normalizeCode(code);
    if (clean.length >= 4) router.push(`/r/${clean}`);
  };

  return (
    <main className="wrap">
      <div className="brand">
        <span className="dot" />
        PlayTogether
      </div>

      <h1>
        Play on your TV.
        <br />
        She watches, and talks to you.
      </h1>
      <p className="lead">
        Your laptop sends the gameplay. Your phone sends your face and becomes your headset. She
        joins from anywhere with a six-character code.
      </p>

      {!configured && (
        <div className="note bad" style={{ marginTop: 24 }}>
          <strong>Not configured yet.</strong> Set <span className="mono">NEXT_PUBLIC_SUPABASE_URL</span>{' '}
          and <span className="mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> (see{' '}
          <span className="mono">.env.example</span>), then restart. Rooms cannot connect without them.
        </div>
      )}

      <div className="row" style={{ marginTop: 26 }}>
        <button className="primary" onClick={create} disabled={!configured}>
          Start a session on this laptop
        </button>
        <form onSubmit={join} className="row" style={{ gap: 8 }}>
          <input
            value={code}
            onChange={(e) => setCode(normalizeCode(e.target.value))}
            placeholder="ROOM CODE"
            style={{ width: 160, letterSpacing: '0.18em', fontWeight: 700 }}
            inputMode="text"
            autoCapitalize="characters"
          />
          <button type="submit" disabled={!configured || normalizeCode(code).length < 4}>
            Join
          </button>
        </form>
      </div>

      <h2>The three seats</h2>
      <div className="roles">
        {ROLES.map((role) => (
          <div className="role" key={role} style={{ cursor: 'default' }}>
            <div className="icon">{ICON[role]}</div>
            <div className="name">{ROLE_LABEL[role]}</div>
            <p className="blurb">{ROLE_BLURB[role]}</p>
          </div>
        ))}
      </div>

      <h2>Two things that matter</h2>
      <div className="note" style={{ marginBottom: 10 }}>
        <strong>Wear earphones on your phone.</strong> Your phone plays her voice while its own mic is
        open a few centimetres away. Earphones are what keep that from howling.
      </div>
      <div className={turn?.configured ? 'note' : 'note warn'}>
        {turn === null ? (
          <>Checking the relay configuration…</>
        ) : turn.configured ? (
          <>
            <strong>TURN relay configured ({turn.source}).</strong> Connections should survive mobile
            data and strict routers, so this works between different cities.
          </>
        ) : (
          <>
            <strong>No TURN server set.</strong> Video goes peer-to-peer, which usually works when both
            of you are on the same Wi-Fi but often fails across networks and on mobile data. Set{' '}
            <span className="mono">CLOUDFLARE_TURN_KEY_ID</span> and{' '}
            <span className="mono">CLOUDFLARE_TURN_API_TOKEN</span> before relying on this.
          </>
        )}
      </div>
    </main>
  );
}
