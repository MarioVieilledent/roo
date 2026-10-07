import { useCallback, useEffect, useRef, useState } from 'react';

/** Long clips are slow to process on local hardware (~25 prompt tokens per second of audio). */
export const MAX_RECORDING_MS = 5 * 60 * 1000;

export type RecorderState = 'idle' | 'starting' | 'recording' | 'stopping';

/** Microphone access requires a secure context (https:// or localhost). */
export const canRecord = () => typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

/**
 * Records from the microphone. `levels` is a live, mutable buffer of recent
 * input levels (0–1) for drawing a waveform without re-rendering React.
 */
export function useRecorder(onRecorded: (blob: Blob) => void) {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const levels = useRef<number[]>([]);
  const session = useRef<{ stop: (keep: boolean) => void } | null>(null);
  const onRecordedRef = useRef(onRecorded);
  onRecordedRef.current = onRecorded;

  const start = useCallback(async () => {
    if (session.current) return;
    setState('starting');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      setState('idle');
      const name = e instanceof DOMException ? e.name : '';
      throw new Error(
        name === 'NotAllowedError'
          ? 'Microphone access was denied. Allow it in your browser’s site settings.'
          : name === 'NotFoundError'
            ? 'No microphone found.'
            : `Could not start recording: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    let keep = true;
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const frame = new Float32Array(analyser.fftSize);
    levels.current = [];
    const startedAt = performance.now();
    let raf = 0;
    const tick = () => {
      analyser.getFloatTimeDomainData(frame);
      let sum = 0;
      for (const s of frame) sum += s * s;
      // RMS on a perceptual-ish scale, so normal speech fills the bars.
      levels.current.push(Math.min(1, Math.sqrt(Math.sqrt(sum / frame.length)) * 1.6));
      if (levels.current.length > 400) levels.current.splice(0, levels.current.length - 400);
      const ms = performance.now() - startedAt;
      // The timer shows seconds: don't re-render on every frame.
      setElapsedMs((prev) => (Math.floor(prev / 250) === Math.floor(ms / 250) ? prev : ms));
      if (ms >= MAX_RECORDING_MS) stop(true);
      else raf = requestAnimationFrame(tick);
    };

    const stop = (k: boolean) => {
      if (session.current !== current) return;
      session.current = null;
      keep = k;
      cancelAnimationFrame(raf);
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
      if (recorder.state !== 'inactive') {
        setState('stopping');
        recorder.stop();
      } else done();
    };
    // Stay in "stopping" until the clip is handed over, so a caller waiting
    // for the recording to end also sees the resulting attachment.
    const done = () => {
      if (keep && chunks.length) onRecordedRef.current(new Blob(chunks, { type: recorder.mimeType || chunks[0].type }));
      setState('idle');
      setElapsedMs(0);
    };
    recorder.onstop = done;

    const current = { stop };
    session.current = current;
    recorder.start(250);
    raf = requestAnimationFrame(tick);
    setState('recording');
  }, []);

  /** Stops and delivers the clip to `onRecorded`. */
  const finish = useCallback(() => session.current?.stop(true), []);
  /** Stops and discards the clip. */
  const cancel = useCallback(() => session.current?.stop(false), []);

  useEffect(() => () => session.current?.stop(false), []);

  return { state, elapsedMs, levels, start, finish, cancel };
}
