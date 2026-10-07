import type { AttachmentKind } from '../types';

/**
 * Prepares pasted, picked, captured or recorded media for the model, in the
 * browser so the server needs no codecs:
 *
 * - images are re-encoded to JPEG (PNG when the source is a PNG), which applies
 *   the EXIF rotation of phone photos (Ollama would otherwise see them sideways)
 *   and scales very large pictures down;
 * - audio of any format the browser can decode (WebM/Opus, MP4/AAC, MP3, OGG…)
 *   becomes 16 kHz mono WAV: what Ollama accepts, and the rate speech models use.
 */

const MAX_IMAGE_SIDE = 2048;
const AUDIO_RATE = 16000;
const WAVEFORM_BARS = 48;

export interface PreparedImage {
  kind: 'image';
  blob: Blob;
  width: number;
  height: number;
}

export interface PreparedAudio {
  kind: 'audio';
  blob: Blob;
  durationMs: number;
  waveform: number[];
}

export function mediaKind(file: Blob): AttachmentKind | null {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  // Some pickers leave the type empty for less common extensions.
  const name = file instanceof File ? file.name.toLowerCase() : '';
  if (/\.(jpe?g|png|gif|webp|bmp|avif|heic|heif)$/.test(name)) return 'image';
  if (/\.(wav|mp3|m4a|aac|ogg|oga|opus|flac|webm|weba|amr|3gp)$/.test(name)) return 'audio';
  return null;
}

export async function prepareImage(file: Blob): Promise<PreparedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('This image format is not supported by your browser.');
  }
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const png = file.type === 'image/png';
  if (!png) {
    // JPEG has no alpha: flatten transparent GIF/WebP pixels onto white.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  let blob = await toBlob(canvas, png ? 'image/png' : 'image/jpeg', 0.9);
  // Large photos saved as PNG get huge: JPEG is plenty for the model.
  if (png && blob.size > 4 * 1024 * 1024) blob = await toBlob(canvas, 'image/jpeg', 0.9);
  return { kind: 'image', blob, width, height };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the image.'))), type, quality),
  );
}

export async function prepareAudio(file: Blob): Promise<PreparedAudio> {
  const samples = await decodeMono(await file.arrayBuffer());
  if (!samples.length) throw new Error('This audio clip is empty.');
  return {
    kind: 'audio',
    blob: encodeWav(samples, AUDIO_RATE),
    durationMs: Math.round((samples.length / AUDIO_RATE) * 1000),
    waveform: peaks(samples, WAVEFORM_BARS),
  };
}

/** Decodes any browser-supported audio to mono samples at AUDIO_RATE. */
async function decodeMono(data: ArrayBuffer): Promise<Float32Array> {
  let decoded: AudioBuffer;
  try {
    // decodeAudioData resamples to the context's rate.
    decoded = await new OfflineAudioContext(1, 1, AUDIO_RATE).decodeAudioData(data.slice(0));
  } catch {
    // Older engines only decode at the hardware rate: decode, then resample.
    const ctx = new AudioContext();
    try {
      decoded = await ctx.decodeAudioData(data);
    } catch {
      throw new Error('This audio format is not supported by your browser.');
    } finally {
      void ctx.close();
    }
  }
  if (decoded.sampleRate !== AUDIO_RATE || decoded.numberOfChannels !== 1) {
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * AUDIO_RATE), AUDIO_RATE);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination); // down-mixes to mono
    src.start();
    decoded = await offline.startRendering();
  }
  return decoded.getChannelData(0);
}

function encodeWav(samples: Float32Array, rate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true); // PCM chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); // byte rate
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/** RMS level per bucket, normalized so the loudest bar is 1. */
function peaks(samples: Float32Array, bars: number): number[] {
  const size = Math.max(1, Math.floor(samples.length / bars));
  const out: number[] = [];
  for (let b = 0; b < bars; b++) {
    let sum = 0;
    const end = Math.min(samples.length, (b + 1) * size);
    for (let i = b * size; i < end; i++) sum += samples[i] * samples[i];
    out.push(Math.sqrt(sum / Math.max(1, end - b * size)));
  }
  const max = Math.max(...out, 1e-4);
  return out.map((p) => Math.round(Math.sqrt(p / max) * 100) / 100);
}

export function formatDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
