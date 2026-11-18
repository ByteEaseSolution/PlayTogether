'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { HostPane } from '@/components/HostPane';
import { FacePane } from '@/components/FacePane';
import { GuestPane } from '@/components/GuestPane';
import { ROLE_BLURB, ROLE_LABEL, ROLES, isRole, type Role } from '@/lib/roles';
import { normalizeCode } from '@/lib/room';
import { supabaseConfigured } from '@/lib/supabase';

const ICON: Record<Role, string> = { screen: '🎮', face: '🤳', guest: '💜' };

function Room() {
  const params = useParams<{ code: string }>();
  const search = useSearchParams();
  const code = normalizeCode(String(params?.code ?? ''));
  const role = search.get('role');

  if (!supabaseConfigured()) {
    return (
      <main className="wrap">
        <div className="note bad">
          Supabase env vars are missing, so there is nothing to signal through. Copy{' '}
          <span className="mono">.env.example</span> to <span className="mono">.env.local</span>, fill it
          in, and restart.
        </div>
      </main>
    );
  }

  if (!code) {
    return (
      <main className="wrap">
        <div className="note bad">That room code is not valid.</div>
      </main>
    );
  }

  if (!isRole(role)) {
    return (
      <main className="wrap">
        <div className="brand">
          <span className="dot" />
          PlayTogether
        </div>
        <h1 style={{ fontSize: 28 }}>Room {code}</h1>
        <p className="lead">Which device is this?</p>
        <div className="roles" style={{ marginTop: 20 }}>
          {ROLES.map((r) => (
            <a className="role" key={r} href={`/r/${code}?role=${r}`}>
              <div className="icon">{ICON[r]}</div>
              <div className="name">{ROLE_LABEL[r]}</div>
              <p className="blurb">{ROLE_BLURB[r]}</p>
            </a>
          ))}
        </div>
      </main>
    );
  }

  if (role === 'screen') return <HostPane code={code} />;
  if (role === 'face') return <FacePane code={code} />;
  return <GuestPane code={code} />;
}

export default function RoomPage() {
  return (
    <Suspense fallback={<main className="wrap"><p className="dim">Loading…</p></main>}>
      <Room />
    </Suspense>
  );
}
