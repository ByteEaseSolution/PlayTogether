import { planFor, type PairPlan, type Role } from './roles';

export type SignalMsg =
  | { kind: 'offer'; from: string; fromRole: Role; to: string; sdp: RTCSessionDescriptionInit }
  | { kind: 'answer'; from: string; fromRole: Role; to: string; sdp: RTCSessionDescriptionInit }
  | { kind: 'ice'; from: string; fromRole: Role; to: string; candidate: RTCIceCandidateInit };

export type PeerView = {
  peerId: string;
  role: Role;
  stream: MediaStream | null;
  state: RTCPeerConnectionState;
};

type Peer = PeerView & {
  pc: RTCPeerConnection;
  plan: PairPlan;
  pendingIce: RTCIceCandidateInit[];
  negotiating: boolean;
};

type Options = {
  selfId: string;
  role: Role;
  iceServers: RTCIceServer[];
  send: (msg: SignalMsg) => void;
  onChange: (peers: PeerView[]) => void;
  /** Read at connect time, so the mesh never holds a stale stream. */
  localStream: () => MediaStream | null;
};

/**
 * Owns one RTCPeerConnection per compatible remote peer.
 *
 * Negotiation is single-sided on purpose: `planFor` names one initiator per pair,
 * so there is no offer/answer glare and no need for perfect-negotiation rollback.
 */
export class Mesh {
  private peers = new Map<string, Peer>();
  private closed = false;

  constructor(private o: Options) {}

  private emit() {
    if (this.closed) return;
    this.o.onChange(
      [...this.peers.values()].map(({ peerId, role, stream, state }) => ({ peerId, role, stream, state })),
    );
  }

  /** Reconcile against the room's presence list. */
  presence(list: { peerId: string; role: Role }[]) {
    if (this.closed) return;
    const keep = new Set<string>();

    for (const entry of list) {
      if (entry.peerId === this.o.selfId) continue;
      if (!planFor(this.o.role, entry.role)) continue;
      keep.add(entry.peerId);
      const existing = this.peers.get(entry.peerId);
      if (!existing) {
        const peer = this.create(entry.peerId, entry.role);
        if (peer?.plan.iInitiate) void this.offer(peer);
      }
    }

    for (const peerId of [...this.peers.keys()]) {
      if (!keep.has(peerId)) this.drop(peerId);
    }
    this.emit();
  }

  private create(peerId: string, role: Role): Peer | null {
    const plan = planFor(this.o.role, role);
    if (!plan) return null;

    const pc = new RTCPeerConnection({ iceServers: this.o.iceServers, bundlePolicy: 'max-bundle' });
    const peer: Peer = {
      peerId,
      role,
      pc,
      plan,
      stream: null,
      state: pc.connectionState,
      pendingIce: [],
      negotiating: false,
    };
    this.peers.set(peerId, peer);

    if (plan.iSend) {
      const local = this.o.localStream();
      if (local) for (const track of local.getTracks()) pc.addTrack(track, local);
    }

    pc.ontrack = (ev) => {
      peer.stream = ev.streams[0] ?? new MediaStream([ev.track]);
      this.emit();
    };

    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      this.o.send({
        kind: 'ice',
        from: this.o.selfId,
        fromRole: this.o.role,
        to: peerId,
        candidate: ev.candidate.toJSON(),
      });
    };

    pc.onconnectionstatechange = () => {
      peer.state = pc.connectionState;
      this.emit();
      // Mobile networks drop ICE routes constantly; the initiator re-gathers.
      if (peer.plan.iInitiate && (pc.connectionState === 'failed' || pc.connectionState === 'disconnected')) {
        setTimeout(() => {
          if (!this.closed && this.peers.get(peerId) === peer && pc.connectionState !== 'connected') {
            void this.offer(peer, true);
          }
        }, 1500);
      }
    };

    return peer;
  }

  private async offer(peer: Peer, iceRestart = false) {
    if (this.closed || peer.negotiating) return;
    peer.negotiating = true;
    try {
      const offer = await peer.pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
      if (peer.pc.signalingState !== 'stable' && !iceRestart) return;
      await peer.pc.setLocalDescription(offer);
      this.o.send({
        kind: 'offer',
        from: this.o.selfId,
        fromRole: this.o.role,
        to: peer.peerId,
        sdp: peer.pc.localDescription!.toJSON(),
      });
    } catch (err) {
      console.warn('[mesh] offer failed', err);
    } finally {
      peer.negotiating = false;
    }
  }

  async signal(msg: SignalMsg) {
    if (this.closed || msg.to !== this.o.selfId || msg.from === this.o.selfId) return;

    // An offer can land before presence sync, so peers are created on demand.
    let peer = this.peers.get(msg.from);
    if (!peer) {
      if (msg.kind !== 'offer') return;
      peer = this.create(msg.from, msg.fromRole) ?? undefined;
      if (!peer) return;
      this.emit();
    }

    try {
      if (msg.kind === 'offer') {
        if (peer.plan.iInitiate) return; // we are the offerer for this pair; ignore
        await peer.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        await this.flushIce(peer);
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        this.o.send({
          kind: 'answer',
          from: this.o.selfId,
          fromRole: this.o.role,
          to: msg.from,
          sdp: peer.pc.localDescription!.toJSON(),
        });
      } else if (msg.kind === 'answer') {
        if (peer.pc.signalingState !== 'have-local-offer') return;
        await peer.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        await this.flushIce(peer);
      } else {
        if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(msg.candidate);
        else peer.pendingIce.push(msg.candidate);
      }
    } catch (err) {
      console.warn('[mesh] signal failed', msg.kind, err);
    }
  }

  private async flushIce(peer: Peer) {
    const queued = peer.pendingIce.splice(0);
    for (const candidate of queued) {
      try {
        await peer.pc.addIceCandidate(candidate);
      } catch (err) {
        console.warn('[mesh] stale candidate', err);
      }
    }
  }

  /**
   * Swap in a new local stream (host changed capture source, phone flipped camera).
   * Reuses senders via replaceTrack so no renegotiation is needed in the common case.
   */
  async replaceLocal(stream: MediaStream | null) {
    for (const peer of this.peers.values()) {
      if (!peer.plan.iSend) continue;
      let needsRenegotiation = false;

      for (const kind of ['audio', 'video'] as const) {
        const next = stream?.getTracks().find((t) => t.kind === kind) ?? null;
        const sender = peer.pc.getSenders().find((s) => s.track?.kind === kind);

        if (sender) {
          await sender.replaceTrack(next).catch((err) => console.warn('[mesh] replaceTrack', err));
          if (!next) {
            peer.pc.removeTrack(sender);
            needsRenegotiation = true;
          }
        } else if (next && stream) {
          peer.pc.addTrack(next, stream);
          needsRenegotiation = true; // a brand new m-line
        }
      }

      if (needsRenegotiation && peer.plan.iInitiate) await this.offer(peer);
    }
  }

  private drop(peerId: string) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.onconnectionstatechange = null;
    try {
      peer.pc.close();
    } catch {
      /* already closed */
    }
    this.peers.delete(peerId);
  }

  close() {
    this.closed = true;
    for (const peerId of [...this.peers.keys()]) this.drop(peerId);
  }
}
