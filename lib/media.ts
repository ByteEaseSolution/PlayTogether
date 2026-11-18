'use client';

export type DeviceList = { video: MediaDeviceInfo[]; audio: MediaDeviceInfo[] };

export async function listDevices(): Promise<DeviceList> {
  const all = await navigator.mediaDevices.enumerateDevices();
  return {
    video: all.filter((d) => d.kind === 'videoinput'),
    audio: all.filter((d) => d.kind === 'audioinput'),
  };
}

/**
 * A chosen capture source. `raw` holds the underlying streams so stopping is complete
 * even when video and audio came from two different places (very common on Linux:
 * picture from a window share, sound from a PulseAudio monitor input).
 */
export type Source = { stream: MediaStream; raw: MediaStream[]; label: string };

export function stopSource(source: Source | null) {
  if (!source) return;
  for (const s of [source.stream, ...source.raw]) for (const t of s.getTracks()) t.stop();
}

function merge(label: string, parts: { stream: MediaStream; use: 'video' | 'audio' | 'both' }[]): Source {
  const out = new MediaStream();
  for (const part of parts) {
    if (part.use !== 'audio') for (const t of part.stream.getVideoTracks()) out.addTrack(t);
    if (part.use !== 'video') for (const t of part.stream.getAudioTracks()) out.addTrack(t);
  }
  return { stream: out, raw: parts.map((p) => p.stream), label };
}

/** Screen / window / tab share. Must be called straight from a click. */
export async function captureDisplay(): Promise<MediaStream> {
  return navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: 60, max: 60 } },
    // Chrome only honours this for tab (and sometimes whole-screen) shares.
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } as MediaTrackConstraints,
  });
}

/** A capture card, webcam, or any other video input device. */
export async function captureVideoDevice(deviceId: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: {
      deviceId: { exact: deviceId },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 60, max: 60 },
    },
  });
}

/**
 * Game audio: a capture card's audio-in, or a "Monitor of ..." loopback device.
 * All the voice-oriented processing is disabled — it mangles music and explosions.
 */
export async function captureAudioDevice(deviceId: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: { exact: deviceId },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 2,
    } as MediaTrackConstraints,
  });
}

export type HostChoice = {
  video: { kind: 'display' } | { kind: 'device'; deviceId: string };
  /** 'none' means the picture carries no sound (common for window shares on Linux). */
  audio: { kind: 'with-video' } | { kind: 'device'; deviceId: string } | { kind: 'none' };
};

export async function openHostSource(choice: HostChoice): Promise<Source> {
  const parts: { stream: MediaStream; use: 'video' | 'audio' | 'both' }[] = [];
  let label: string;

  if (choice.video.kind === 'display') {
    const display = await captureDisplay();
    const keepItsAudio = choice.audio.kind === 'with-video' && display.getAudioTracks().length > 0;
    if (!keepItsAudio) for (const t of display.getAudioTracks()) t.stop();
    parts.push({ stream: display, use: keepItsAudio ? 'both' : 'video' });
    label = display.getVideoTracks()[0]?.label || 'Screen share';
  } else {
    const video = await captureVideoDevice(choice.video.deviceId);
    const keepItsAudio = false; // getUserMedia video-only never carries audio
    parts.push({ stream: video, use: 'video' });
    void keepItsAudio;
    label = video.getVideoTracks()[0]?.label || 'Capture device';
  }

  if (choice.audio.kind === 'device') {
    parts.push({ stream: await captureAudioDevice(choice.audio.deviceId), use: 'audio' });
  }

  return merge(label, parts);
}

/** Phone camera + mic. Voice processing stays ON here — it is what stops the echo. */
export async function openCamera(facing: 'user' | 'environment'): Promise<Source> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  return { stream, raw: [], label: stream.getVideoTracks()[0]?.label || 'Camera' };
}

export function mediaErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
      return 'Permission denied. Allow camera/microphone/screen access for this site and try again.';
    case 'NotFoundError':
      return 'No matching device found. Plug it in, or pick a different source.';
    case 'NotReadableError':
      return 'That device is busy — another app (OBS, Chiaki, a video call) is probably holding it.';
    case 'OverconstrainedError':
      return 'That device cannot do the requested resolution. Try another source.';
    default:
      return err instanceof Error ? err.message : 'Could not open that source.';
  }
}
