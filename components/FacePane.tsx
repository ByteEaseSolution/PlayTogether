'use client';

import { useCallback, useEffect, useState } from 'react';
import { Video } from './Video';
import { PeerPill } from './Pill';
import { useRoom } from '@/lib/useRoom';
import { useWakeLock } from '@/lib/useWakeLock';
import { mediaErrorMessage, openCamera, stopSource, type Source } from '@/lib/media';
import { unlockAllVideos } from '@/lib/unlock';

/**
 * Your phone. It sends your face and voice, and it is the only device that plays
 * her voice out loud — so this is the one you point your earphones at.
 * It deliberately does not receive the gameplay: you are looking at the TV.
 */
export function FacePane({ code }: { code: string }) {
  const [source, setSource] = useState<Source | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);

  const { peerByRole, status, error: roomError } = useRoom({
    code,
    role: 'face',
    stream: source?.stream ?? null,
    enabled: Boolean(source),
  });
  useWakeLock(Boolean(source));

  const guest = peerByRole('guest');

  const open = useCallback(async (which: 'user' | 'environment') => {
    setBusy(true);
    setError(null);
    try {
      const next = await openCamera(which);
      setSource((prev) => {
        stopSource(prev);
        return next;
      });
      setFacing(which);
      setMicOn(true);
      setCamOn(true);
    } catch (err) {
      setError(mediaErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!source) return;
    for (const t of source.stream.getAudioTracks()) t.enabled = micOn;
    for (const t of source.stream.getVideoTracks()) t.enabled = camOn;
  }, [source, micOn, camOn]);

  useEffect(() => () => stopSource(source), [source]);

  if (!source) {
    return (
      <main className="wrap">
        <div className="brand">
          <span className="dot" />
          PlayTogether · my camera
        </div>
        <h1 style={{ fontSize: 28 }}>Be the face in the corner</h1>
        <p className="lead">
          Prop this phone up where it can see you. It sends your face and voice, and plays hers.
        </p>

        <div className="note warn" style={{ marginTop: 20 }}>
          <strong>Put earphones in first.</strong> This phone will play her voice while holding its mic
          open next to it. Without earphones you will both hear an echo.
        </div>

        <div className="card" style={{ marginTop: 14 }}>
          <div className="tiny dim">ROOM</div>
          <div className="code" style={{ fontSize: 22 }}>
            {code}
          </div>
        </div>

        {error && (
          <div className="note bad" style={{ marginTop: 14 }}>
            {error}
          </div>
        )}

        <div className="row" style={{ marginTop: 18 }}>
          <button className="primary" onClick={() => open('user')} disabled={busy}>
            {busy ? 'Opening camera…' : 'Join with camera & mic'}
          </button>
          <a className="btn ghost" href="/">
            Back
          </a>
        </div>
      </main>
    );
  }

  return (
    <div className="stage">
      <div className="topbar">
        <span className={`pill ${status === 'joined' ? 'on' : 'warn'}`}>
          <span className="led" />
          room {status}
        </span>
        <PeerPill label="Her" peer={guest} />
        <span className="grow" />
      </div>

      <div className="faces">
        <div className="face-tile">
          {/* Her: unmuted. This is the audio you actually listen to. */}
          <Video stream={guest?.stream ?? null} onBlocked={setAudioBlocked} />
          {!guest?.stream && <div className="empty">Waiting for her…</div>}
          <span className="tag">Her</span>
        </div>
        <div className={`face-tile ${facing === 'user' ? 'mirror' : ''}`}>
          <Video stream={source.stream} muted />
          {!camOn && <div className="empty">Camera off</div>}
          <span className="tag">You</span>
        </div>
      </div>

      {audioBlocked && (
        <button
          className="primary"
          style={{ margin: '0 10px 10px' }}
          onClick={() => {
            unlockAllVideos();
            setAudioBlocked(false);
          }}
        >
          Tap to hear her
        </button>
      )}

      {roomError && (
        <div className="note bad" style={{ margin: '0 10px 10px' }}>
          {roomError}
        </div>
      )}

      <div className="bar">
        <button className={micOn ? '' : 'danger'} onClick={() => setMicOn((v) => !v)}>
          {micOn ? '🎙️ Mic on' : '🔇 Muted'}
        </button>
        <button className={camOn ? '' : 'danger'} onClick={() => setCamOn((v) => !v)}>
          {camOn ? '📷 Cam on' : '🚫 Cam off'}
        </button>
        <button
          className="small"
          onClick={() => open(facing === 'user' ? 'environment' : 'user')}
          disabled={busy}
        >
          🔄 Flip
        </button>
        <span className="grow" />
        <button
          className="danger"
          onClick={() =>
            setSource((prev) => {
              stopSource(prev);
              return null;
            })
          }
        >
          Leave
        </button>
      </div>
    </div>
  );
}
