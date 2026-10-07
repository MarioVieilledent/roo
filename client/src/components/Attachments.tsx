import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import { formatDuration } from '../lib/media';
import type { Attachment } from '../types';
import { CloseIcon, PauseIcon, PlayIcon } from './Icons';

/** Only one clip plays at a time across the page. */
let playing: HTMLAudioElement | null = null;

const FLAT_WAVEFORM = Array.from({ length: 48 }, () => 0.3);

export function AudioPlayer({ src, durationMs, waveform, compact = false }: { src: string; durationMs?: number; waveform?: number[]; compact?: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [isPlaying, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState((durationMs ?? 0) / 1000);
  const bars = waveform?.length ? waveform : FLAT_WAVEFORM;
  const shown = compact ? bars.filter((_, i) => i % 2 === 0) : bars;

  useEffect(() => {
    const el = audio.current!;
    const sync = () => setProgress(el.duration ? el.currentTime / el.duration : 0);
    const onPlay = () => {
      if (playing && playing !== el) playing.pause();
      playing = el;
      setPlaying(true);
    };
    const onPause = () => setPlaying(false);
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };
    const onMeta = () => Number.isFinite(el.duration) && setDuration(el.duration);
    el.addEventListener('timeupdate', sync);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnd);
    el.addEventListener('loadedmetadata', onMeta);
    return () => {
      el.removeEventListener('timeupdate', sync);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnd);
      el.removeEventListener('loadedmetadata', onMeta);
      if (playing === el) playing = null;
    };
  }, []);

  // Smooth progress while playing (timeupdate only fires ~4 times a second).
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    const loop = () => {
      const el = audio.current;
      if (el?.duration) setProgress(el.currentTime / el.duration);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  const toggle = () => {
    const el = audio.current!;
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
  };

  const seek = (clientX: number, target: HTMLElement) => {
    const el = audio.current!;
    const rect = target.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    if (el.duration) el.currentTime = f * el.duration;
    else if (duration) el.currentTime = f * duration;
    setProgress(f);
  };

  return (
    <div className={`audio-player${compact ? ' compact' : ''}${isPlaying ? ' playing' : ''}`}>
      <audio ref={audio} src={src} preload="metadata" />
      <button type="button" className="audio-play" onClick={toggle} aria-label={isPlaying ? 'Pause' : 'Play'}>
        {isPlaying ? <PauseIcon size={compact ? 14 : 16} /> : <PlayIcon size={compact ? 14 : 16} />}
      </button>
      <div
        className="audio-wave"
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        tabIndex={0}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seek(e.clientX, e.currentTarget);
        }}
        onPointerMove={(e) => e.buttons === 1 && seek(e.clientX, e.currentTarget)}
        onKeyDown={(e) => {
          const el = audio.current!;
          if (e.key === 'ArrowRight') el.currentTime = Math.min(el.duration || 0, el.currentTime + 2);
          else if (e.key === 'ArrowLeft') el.currentTime = Math.max(0, el.currentTime - 2);
          else if (e.key === ' ' || e.key === 'Enter') toggle();
          else return;
          e.preventDefault();
        }}
      >
        {shown.map((v, i) => (
          <span key={i} className={i / shown.length < progress ? 'on' : ''} style={{ height: `${Math.max(12, v * 100)}%` }} />
        ))}
      </div>
      <span className="audio-time">{formatDuration((isPlaying || progress > 0 ? progress * duration : duration) * 1000)}</span>
    </div>
  );
}

export function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="lightbox" role="dialog" aria-label={alt} onClick={onClose}>
      <button type="button" className="icon-btn lightbox-close" aria-label="Close" onClick={onClose}>
        <CloseIcon />
      </button>
      <img src={src} alt={alt} onClick={(e) => e.stopPropagation()} />
    </div>,
    document.body,
  );
}

function ImageThumb({ a, single }: { a: Attachment; single: boolean }) {
  const [open, setOpen] = useState(false);
  const src = api.attachmentUrl(a.id);
  const alt = a.name ?? 'Image';
  return (
    <>
      <button type="button" className={`att-image${single ? ' single' : ''}`} onClick={() => setOpen(true)} aria-label={`Open ${alt}`}>
        <img
          src={src}
          alt={alt}
          loading="lazy"
          width={a.width}
          height={a.height}
          style={a.width && a.height ? { aspectRatio: `${a.width} / ${a.height}` } : undefined}
        />
      </button>
      {open && <Lightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Attachments of a sent message. */
export function MessageAttachments({ attachments }: { attachments: Attachment[] }) {
  const images = attachments.filter((a) => a.kind === 'image');
  const audio = attachments.filter((a) => a.kind === 'audio');
  return (
    <div className="msg-attachments">
      {images.length > 0 && (
        <div className={`att-images n${Math.min(images.length, 4)}`}>
          {images.map((a) => (
            <ImageThumb key={a.id} a={a} single={images.length === 1} />
          ))}
        </div>
      )}
      {audio.map((a, i) => (
        <AudioPlayer key={`${a.id}-${i}`} src={api.attachmentUrl(a.id)} durationMs={a.durationMs} waveform={a.waveform} />
      ))}
    </div>
  );
}

/** Scrolling bars of the microphone level while recording. */
export function LiveWaveform({ levels }: { levels: MutableRefObject<number[]> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext('2d')!;
    let raf = 0;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
        el.width = Math.round(w * dpr);
        el.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const step = 5;
      const barW = 3;
      const count = Math.floor(w / step);
      const data = levels.current;
      // Average frames in pairs so the bars scroll at a calm pace.
      const sampled: number[] = [];
      for (let i = data.length - 2; i >= 0 && sampled.length < count; i -= 2) sampled.unshift((data[i] + data[i + 1]) / 2);
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, '#4285f4');
      grad.addColorStop(0.5, '#9b72cb');
      grad.addColorStop(1, '#d96570');
      ctx.fillStyle = grad;
      const offset = w - sampled.length * step;
      for (let i = 0; i < count; i++) {
        const v = i * step >= offset ? sampled[Math.floor((i * step - offset) / step)] ?? 0 : 0;
        const bh = Math.max(3, v * h * 0.9);
        ctx.globalAlpha = i * step >= offset ? 1 : 0.25;
        ctx.beginPath();
        ctx.roundRect(i * step, (h - bh) / 2, barW, bh, 1.5);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [levels]);
  return <canvas ref={canvas} className="live-wave" aria-hidden />;
}
