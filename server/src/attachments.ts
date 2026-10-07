import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Attachment, AttachmentKind } from './types.js';

/**
 * Images and audio clips attached to messages, stored next to the conversations
 * (`<conversations>/attachments/<sha256>.<ext>`) so the Markdown files can link
 * to them with a relative path.
 *
 * Files are content-addressed: uploading the same file twice stores it once,
 * and a file never changes once written. The client normalizes media before
 * uploading (JPEG/PNG images, 16 kHz WAV audio); the server only accepts
 * formats Ollama can decode, checked from the file's magic bytes.
 */

const ID_RE = /^[a-f0-9]{32}\.(jpg|png|wav|mp3|flac)$/;

const FORMATS: { ext: string; mime: string; kind: AttachmentKind; test: (b: Buffer) => boolean }[] = [
  { ext: 'jpg', mime: 'image/jpeg', kind: 'image', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', mime: 'image/png', kind: 'image', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'wav', mime: 'audio/wav', kind: 'audio', test: (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WAVE' },
  { ext: 'flac', mime: 'audio/flac', kind: 'audio', test: (b) => b.toString('latin1', 0, 4) === 'fLaC' },
  { ext: 'mp3', mime: 'audio/mpeg', kind: 'audio', test: (b) => b.toString('latin1', 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
];

/** Unreferenced files younger than this are kept: they may belong to a message being composed. */
const GC_GRACE_MS = 24 * 3600 * 1000;

export class AttachmentStore {
  constructor(readonly dir: string) {}

  async init() {
    await mkdir(this.dir, { recursive: true });
  }

  isValidId(id: string) {
    return ID_RE.test(id);
  }

  file(id: string) {
    if (!this.isValidId(id)) throw new Error(`Invalid attachment id: ${id}`);
    return path.join(this.dir, id);
  }

  /** Stores `data` and returns its id, or null when the format isn't supported. */
  async put(data: Buffer): Promise<Pick<Attachment, 'id' | 'kind' | 'mime' | 'size'> | null> {
    const format = FORMATS.find((f) => data.length >= 12 && f.test(data));
    if (!format) return null;
    const id = `${createHash('sha256').update(data).digest('hex').slice(0, 32)}.${format.ext}`;
    const file = this.file(id);
    if (!(await this.info(id))) {
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, data);
      await rename(tmp, file);
    }
    return { id, kind: format.kind, mime: format.mime, size: data.length };
  }

  /** The stored file's details, or null when it doesn't exist. */
  async info(id: string): Promise<Pick<Attachment, 'id' | 'kind' | 'mime' | 'size'> | null> {
    if (!this.isValidId(id)) return null;
    const size = await stat(this.file(id)).then(
      (s) => s.size,
      () => null,
    );
    if (size === null) return null;
    const format = FORMATS.find((f) => id.endsWith(`.${f.ext}`))!;
    return { id, kind: format.kind, mime: format.mime, size };
  }

  async base64(id: string) {
    return (await readFile(this.file(id))).toString('base64');
  }

  /** Deletes files no conversation references anymore. */
  async gc(referenced: Set<string>) {
    const now = Date.now();
    for (const name of await readdir(this.dir).catch(() => [] as string[])) {
      if (!this.isValidId(name) || referenced.has(name)) continue;
      const file = this.file(name);
      const { mtimeMs } = await stat(file).catch(() => ({ mtimeMs: now }));
      if (now - mtimeMs > GC_GRACE_MS) await unlink(file).catch(() => {});
    }
  }
}

/** Keeps the client-provided display metadata, sanitized. */
export function sanitizeAttachment(raw: unknown, stored: Pick<Attachment, 'id' | 'kind' | 'mime' | 'size'>): Attachment {
  const r = (raw ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined);
  const out: Attachment = { ...stored };
  if (typeof r.name === 'string' && r.name.trim()) out.name = r.name.trim().slice(0, 200);
  if (stored.kind === 'image') {
    out.width = num(r.width);
    out.height = num(r.height);
  } else {
    out.durationMs = num(r.durationMs);
    if (Array.isArray(r.waveform)) {
      out.waveform = r.waveform
        .slice(0, 64)
        .map((v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(1, Math.max(0, v)) * 100) / 100 : 0));
    }
  }
  for (const k of Object.keys(out) as (keyof Attachment)[]) if (out[k] === undefined) delete out[k];
  return out;
}
