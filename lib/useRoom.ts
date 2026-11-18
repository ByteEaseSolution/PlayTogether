'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { Mesh, type PeerView, type SignalMsg } from './mesh';
import { loadIceServers, type IceSource } from './ice';
import { getSupabase } from './supabase';
import { isRole, type Role } from './roles';
import { newPeerId } from './room';

export type RoomStatus = 'idle' | 'connecting' | 'joined' | 'error';

type Args = {
  code: string;
  role: Role;
  /** Null until the device has acquired what it needs to publish. */
  stream: MediaStream | null;
  /** Gate joining until the user has actually pressed "go live". */
  enabled: boolean;
};

export function useRoom({ code, role, stream, enabled }: Args) {
  const [peers, setPeers] = useState<PeerView[]>([]);
  const [status, setStatus] = useState<RoomStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(stream);
  streamRef.current = stream;

  const meshRef = useRef<Mesh | null>(null);
  const selfIdRef = useRef<string>('');
  const [iceSource, setIceSource] = useState<IceSource | null>(null);

  useEffect(() => {
    if (!enabled || !code) {
      setStatus('idle');
      return;
    }

    let channel: RealtimeChannel | null = null;
    let mesh: Mesh | null = null;
    let disposed = false;

    const selfId = newPeerId();
    selfIdRef.current = selfId;
    setStatus('connecting');
    setError(null);

    const start = async () => {
      const supabase = getSupabase();

      // TURN credentials are minted per session, so this must resolve before any
      // RTCPeerConnection is built — a connection created with STUN-only config
      // cannot acquire relay candidates later.
      const ice = await loadIceServers();
      if (disposed) return;
      setIceSource(ice.source);

      mesh = new Mesh({
        selfId,
        role,
        iceServers: ice.iceServers,
        localStream: () => streamRef.current,
        onChange: (next) => {
          if (!disposed) setPeers(next);
        },
        send: (msg) => {
          void channel?.send({ type: 'broadcast', event: 'signal', payload: msg });
        },
      });
      meshRef.current = mesh;

      channel = supabase.channel(`playtogether:${code}`, {
        config: { presence: { key: selfId }, broadcast: { self: false, ack: false } },
      });

      channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
        void mesh?.signal(payload as SignalMsg);
      });

      const syncPresence = () => {
        if (!channel || disposed) return;
        const state = channel.presenceState<{ peerId?: string; role?: string }>();
        const list: { peerId: string; role: Role }[] = [];
        for (const entries of Object.values(state)) {
          for (const entry of entries) {
            if (entry.peerId && isRole(entry.role)) list.push({ peerId: entry.peerId, role: entry.role });
          }
        }
        mesh?.presence(list);
      };

      channel.on('presence', { event: 'sync' }, syncPresence);
      channel.on('presence', { event: 'join' }, syncPresence);
      channel.on('presence', { event: 'leave' }, syncPresence);

      channel.subscribe((channelStatus) => {
        if (disposed) return;
        if (channelStatus === 'SUBSCRIBED') {
          setStatus('joined');
          void channel?.track({ peerId: selfId, role });
        } else if (channelStatus === 'CHANNEL_ERROR' || channelStatus === 'TIMED_OUT') {
          setStatus('error');
          setError('Lost the signalling connection. Check the Supabase keys and your network.');
        }
      });
    };

    start().catch((err) => {
      if (disposed) return;
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    });

    return () => {
      disposed = true;
      mesh?.close();
      meshRef.current = null;
      if (channel) void getSupabase().removeChannel(channel);
    };
  }, [code, role, enabled]);

  // Push source changes into live connections without tearing the room down.
  useEffect(() => {
    void meshRef.current?.replaceLocal(stream);
  }, [stream]);

  const peerByRole = useCallback(
    (wanted: Role) => peers.find((p) => p.role === wanted) ?? null,
    [peers],
  );

  return { peers, peerByRole, status, error, iceSource, selfId: selfIdRef.current };
}
