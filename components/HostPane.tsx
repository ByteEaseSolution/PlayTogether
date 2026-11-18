'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Video } from './Video';
import { ShareBox } from './ShareBox';
import { PeerPill } from './Pill';
import { useRoom } from '@/lib/useRoom';
import {
  listDevices,
  mediaErrorMessage,
  openHostSource,
  stopSource,
  type DeviceList,
  type HostChoice,
  type Source,
} from '@/lib/media';

const LOOPBACK_HINT = /monitor|loopback|stereo mix|what u hear/i;

export function HostPane({ code }: { code: string }) {
  const [devices, setDevices] = useState<DeviceList>({ video: [], audio: [] });
  const [videoKind, setVideoKind] = useState<'display' | 'device'>('display');
  const [videoDeviceId, setVideoDeviceId] = useState('');
  const [audioKind, setAudioKind] = useState<'with-video' | 'device' | 'none'>('device');
  const [audioDeviceId, setAudioDeviceId] = useState('');
  const [source, setSource] = useState<Source | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const found = await listDevices();
      setDevices(found);
      setVideoDeviceId((prev) => prev || found.video[0]?.deviceId || '');
      setAudioDeviceId((prev) => {
        if (prev) return prev;
        const loopback = found.audio.find((d) => LOOPBACK_HINT.test(d.label));
        return (loopback ?? found.audio[0])?.deviceId ?? '';
      });
    } catch (err) {
      setError(mediaErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
    navigator.mediaDevices?.addEventListener('devicechange', refresh);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', refresh);
  }, [refresh]);

  // Device labels stay blank until the page has been granted media access once.
  const labelsHidden = devices.audio.length > 0 && devices.audio.every((d) => !d.label);
  const unlockLabels = async () => {
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const t of probe.getTracks()) t.stop();
      await refresh();
    } catch (err) {
      setError(mediaErrorMessage(err));
    }
  };

  const { peerByRole, status, error: roomError, iceSource } = useRoom({
    code,
    role: 'screen',
    stream: source?.stream ?? null,
    enabled: Boolean(source),
  });

  const choice: HostChoice = useMemo(
    () => ({
      video: videoKind === 'display' ? { kind: 'display' } : { kind: 'device', deviceId: videoDeviceId },
      audio:
        audioKind === 'device'
          ? { kind: 'device', deviceId: audioDeviceId }
          : audioKind === 'with-video'
            ? { kind: 'with-video' }
            : { kind: 'none' },
    }),
    [videoKind, videoDeviceId, audioKind, audioDeviceId],
  );

  const goLive = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await openHostSource(choice);
      if (!next.stream.getVideoTracks().length) {
        stopSource(next);
        throw new Error('That source produced no video track.');
      }
      // The share picker has its own stop button; mirror it into our state.
      next.stream.getVideoTracks()[0].addEventListener('ended', () => {
        setSource((current) => {
          if (current !== next) return current;
          stopSource(next);
          return null;
        });
      });
      setSource((prev) => {
        stopSource(prev);
        return next;
      });
    } catch (err) {
      setError(mediaErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const stop = () => {
    setSource((prev) => {
      stopSource(prev);
      return null;
    });
  };

  useEffect(() => () => stopSource(source), [source]);

  const audioTracks = source?.stream.getAudioTracks().length ?? 0;

  if (!source) {
    return (
      <main className="wrap">
        <div className="brand">
          <span className="dot" />
          PlayTogether · gameplay source
        </div>

        <h1 style={{ fontSize: 30 }}>Pick what she should see</h1>
        <ShareBox code={code} />

        <h2>Picture</h2>
        <div className="card">
          <div className="field-group">
            <label className="field">VIDEO SOURCE</label>
            <select value={videoKind} onChange={(e) => setVideoKind(e.target.value as 'display' | 'device')}>
              <option value="display">Share a screen or window (PS Remote Play / Chiaki)</option>
              <option value="device">A capture card or camera</option>
            </select>
          </div>

          {videoKind === 'device' && (
            <div className="field-group">
              <label className="field">CAPTURE DEVICE</label>
              <select value={videoDeviceId} onChange={(e) => setVideoDeviceId(e.target.value)}>
                {devices.video.length === 0 && <option value="">No video devices found</option>}
                {devices.video.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Video device ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          <h2 style={{ marginTop: 22 }}>Sound</h2>
          <div className="field-group">
            <label className="field">GAME AUDIO</label>
            <select
              value={audioKind}
              onChange={(e) => setAudioKind(e.target.value as 'with-video' | 'device' | 'none')}
            >
              <option value="device">From an audio input device</option>
              <option value="with-video" disabled={videoKind !== 'display'}>
                Whatever the share picker gives me (tab shares only)
              </option>
              <option value="none">No sound</option>
            </select>
          </div>

          {audioKind === 'device' && (
            <div className="field-group">
              <label className="field">AUDIO INPUT</label>
              <select value={audioDeviceId} onChange={(e) => setAudioDeviceId(e.target.value)}>
                {devices.audio.length === 0 && <option value="">No audio inputs found</option>}
                {devices.audio.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Audio input ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {labelsHidden && (
            <button className="small" onClick={unlockLabels} style={{ marginBottom: 12 }}>
              Show device names
            </button>
          )}

          <div className="note" style={{ marginTop: 4 }}>
            On Linux, sharing a <em>window</em> never carries its sound. Pick a{' '}
            <span className="mono">Monitor of …</span> input above — that is PulseAudio&apos;s loopback of
            what your speakers are playing — or use a capture card&apos;s audio input.
          </div>

          {error && (
            <div className="note bad" style={{ marginTop: 12 }}>
              {error}
            </div>
          )}

          <div className="row" style={{ marginTop: 16 }}>
            <button className="primary" onClick={goLive} disabled={busy}>
              {busy ? 'Opening…' : 'Go live'}
            </button>
            <a className="btn ghost" href="/">
              Back
            </a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="wrap">
      <div className="spread">
        <div className="brand">
          <span className="dot" />
          Live
        </div>
        <div className="row">
          <span className={`pill ${status === 'joined' ? 'on' : 'warn'}`}>
            <span className="led" />
            room {status}
          </span>
          <PeerPill label="Her" peer={peerByRole('guest')} />
          {iceSource && (
            <span className={`pill ${iceSource === 'stun-only' ? 'warn' : 'on'}`}>
              <span className="led" />
              {iceSource === 'stun-only' ? 'no relay' : `relay: ${iceSource}`}
            </span>
          )}
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          borderRadius: 14,
          overflow: 'hidden',
          border: '1px solid var(--line)',
          background: '#000',
          aspectRatio: '16 / 9',
        }}
      >
        {/* Muted on purpose: the host must never play the game audio back into the room. */}
        <Video stream={source.stream} muted className="" />
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <span className="pill">
          <span className="led" />
          {source.label}
        </span>
        <span className={`pill ${audioTracks ? 'on' : 'off'}`}>
          <span className="led" />
          {audioTracks ? 'game audio attached' : 'no game audio'}
        </span>
      </div>

      {roomError && (
        <div className="note bad" style={{ marginTop: 12 }}>
          {roomError}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <ShareBox code={code} />
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button className="danger" onClick={stop}>
          Stop sharing
        </button>
      </div>

      <p className="tiny dim" style={{ marginTop: 18, lineHeight: 1.6 }}>
        Leave this tab open. You can minimise the window — a screen share keeps running — but do not
        close it.
      </p>
    </main>
  );
}
