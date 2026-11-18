'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Video } from './Video';
import { PeerPill } from './Pill';
import { useRoom } from '@/lib/useRoom';
import { useWakeLock } from '@/lib/useWakeLock';
import { unlockAllVideos } from '@/lib/unlock';
import { mediaErrorMessage, openCamera, stopSource, type Source } from '@/lib/media';

/**
 * Her device. Receives the gameplay from the laptop and his face from his phone,
 * and sends her camera + mic back to his phone only.
 */
export function GuestPane({ code }: { code: string }) {
  const [source, setSource] = useState<Source | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  const { peerByRole, status, error: roomError } = useRoom({
    code,
    role: 'guest',
    stream: source?.stream ?? null,
    enabled: Boolean(source),
  });
  useWakeLock(Boolean(source));

  const screen = peerByRole('screen');
  const face = peerByRole('face');

  const join = useCallback(async (withCamera: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const next = await openCamera('user');
      if (!withCamera) for (const t of next.stream.getVideoTracks()) t.enabled = false;
      setSource(next);
      setCamOn(withCamera);
      setMicOn(true);
      unlockAllVideos();
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

  const fullscreen = () => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => {});
  };

  if (!source) {
    return (
      <main className="wrap">
        <div className="brand">
          <span className="dot" />
          PlayTogether
        </div>
        <h1 style={{ fontSize: 30 }}>Come watch him play</h1>
        <p className="lead">
          You will see the game and his face, and he will hear you in his earphones.
        </p>

        <div className="card" style={{ marginTop: 20 }}>
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
          <button className="primary" onClick={() => join(true)} disabled={busy}>
            {busy ? 'Opening…' : 'Join with camera & mic'}
          </button>
          <button onClick={() => join(false)} disabled={busy}>
            Join with voice only
          </button>
        </div>
        <p className="tiny dim" style={{ marginTop: 14 }}>
          Earphones are a good idea here too, so the game audio does not loop back into your mic.
        </p>
      </main>
    );
  }

  return (
    <div className="stage" ref={stageRef}>
      <div className="topbar">
        <span className={`pill ${status === 'joined' ? 'on' : 'warn'}`}>
          <span className="led" />
          room {status}
        </span>
        <PeerPill label="Game" peer={screen} />
        <PeerPill label="Him" peer={face} />
        <span className="grow" />
      </div>

      <div className="stage-main">
        {/* The gameplay, with its sound. */}
        <Video stream={screen?.stream ?? null} onBlocked={setBlocked} />

        {!screen?.stream && (
          <div className="placeholder">
            <div style={{ fontSize: 30 }}>🎮</div>
            <div>
              Waiting for the gameplay.
              <br />
              He still has to press <strong>Go live</strong> on the laptop.
            </div>
          </div>
        )}

        {/* His face, with his voice. */}
        <div className="pip them">
          <Video stream={face?.stream ?? null} />
          {!face?.stream && <div className="placeholder tiny">his phone is not in yet</div>}
          <span className="tag">Him</span>
        </div>

        <div className="pip me mirror">
          <Video stream={source.stream} muted />
          {!camOn && <div className="placeholder tiny">cam off</div>}
          <span className="tag">You</span>
        </div>

        {blocked && (
          <div
            className="tap-overlay"
            onClick={() => {
              unlockAllVideos();
              setBlocked(false);
            }}
          >
            <div>
              <div style={{ fontSize: 30 }}>🔊</div>
              <strong>Tap to turn the sound on</strong>
              <p className="tiny dim">Your browser blocks audio until you touch the page.</p>
            </div>
          </div>
        )}
      </div>

      {roomError && <div className="note bad" style={{ margin: '0 10px 10px' }}>{roomError}</div>}

      <div className="bar">
        <button className={micOn ? '' : 'danger'} onClick={() => setMicOn((v) => !v)}>
          {micOn ? '🎙️ Mic on' : '🔇 Muted'}
        </button>
        <button className={camOn ? '' : 'danger'} onClick={() => setCamOn((v) => !v)}>
          {camOn ? '📷 Cam on' : '🚫 Cam off'}
        </button>
        <button className="small" onClick={fullscreen}>
          ⛶
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
