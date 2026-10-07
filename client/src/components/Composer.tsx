import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ChangeEvent, type Ref } from 'react';
import { api } from '../api';
import { canRecord, MAX_RECORDING_MS, useRecorder } from '../hooks/useRecorder';
import { formatDuration, mediaKind, prepareAudio, prepareImage } from '../lib/media';
import type { Attachment, AttachmentKind } from '../types';
import { AudioPlayer, LiveWaveform } from './Attachments';
import { BrainIcon, CameraIcon, CheckIcon, CloseIcon, ImageIcon, MicIcon, PaperclipIcon, PlusIcon, SendIcon, StopIcon, TrashIcon } from './Icons';

export interface ComposerHandle {
  addFiles: (files: File[]) => void;
}

/** What the selected model accepts; null when its capabilities are unknown. */
export interface MediaSupport {
  vision: boolean | null;
  audio: boolean | null;
  model: string | null;
}

interface Props {
  ref?: Ref<ComposerHandle>;
  onSend: (text: string, attachments: Attachment[]) => Promise<boolean>;
  onStop: () => void;
  onError: (message: string) => void;
  generating: boolean;
  think: boolean;
  onThinkChange: (v: boolean) => void;
  /** null when the selected model's capabilities are unknown. */
  thinkSupported: boolean | null;
  media: MediaSupport;
  disabledReason: string | null;
  autoFocusKey: string;
}

interface Pending {
  key: string;
  kind: AttachmentKind;
  name?: string;
  /** Object URL of the prepared file, for the preview. */
  url?: string;
  status: 'processing' | 'uploading' | 'ready';
  attachment?: Attachment;
  durationMs?: number;
  waveform?: number[];
}

const MAX_ATTACHMENTS = 10;
const isTouch = () => window.matchMedia('(pointer: coarse)').matches;
let nextKey = 0;

export function Composer({ ref, onSend, onStop, onError, generating, think, onThinkChange, thinkSupported, media, disabledReason, autoFocusKey }: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sendWhenReady, setSendWhenReady] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const mediaRef = useRef(media);
  mediaRef.current = media;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Grow with the content up to a max height, then scroll.
  useLayoutEffect(() => {
    const ta = textRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, window.innerHeight * 0.4)}px`;
  }, [text]);

  useEffect(() => {
    if (!isTouch()) textRef.current?.focus();
  }, [autoFocusKey]);

  const update = (key: string, patch: Partial<Pending>) => setPending((list) => list.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  const remove = useCallback((key: string) => {
    setPending((list) => {
      const item = list.find((p) => p.key === key);
      if (item?.url) URL.revokeObjectURL(item.url);
      return list.filter((p) => p.key !== key);
    });
  }, []);

  const addFiles = useCallback(
    (files: (File | Blob)[]) => {
      const { vision, audio, model } = mediaRef.current;
      let room = MAX_ATTACHMENTS - pendingRef.current.length;
      for (const file of files) {
        const kind = mediaKind(file);
        const name = file instanceof File && file.name && !/^(image|blob)\.\w+$/.test(file.name) ? file.name : undefined;
        if (!kind) {
          onErrorRef.current(`${name ?? 'This file'}: only images and audio can be attached.`);
          continue;
        }
        if (kind === 'image' && vision === false) {
          onErrorRef.current(`${model} can't read images. Choose a model with vision.`);
          continue;
        }
        if (kind === 'audio' && audio === false) {
          onErrorRef.current(`${model} can't listen to audio. Choose a model with audio support.`);
          continue;
        }
        if (room-- <= 0) {
          onErrorRef.current(`You can attach up to ${MAX_ATTACHMENTS} files per message.`);
          break;
        }
        const key = `att${nextKey++}`;
        setPending((list) => [...list, { key, kind, name, status: 'processing' }]);
        void (async () => {
          try {
            const prepared = kind === 'image' ? await prepareImage(file) : await prepareAudio(file);
            const url = URL.createObjectURL(prepared.blob);
            const extra =
              prepared.kind === 'image'
                ? { width: prepared.width, height: prepared.height }
                : { durationMs: prepared.durationMs, waveform: prepared.waveform };
            if (!pendingRef.current.some((p) => p.key === key)) return URL.revokeObjectURL(url); // removed meanwhile
            update(key, { status: 'uploading', url, ...extra });
            const stored = await api.upload(prepared.blob);
            update(key, { status: 'ready', attachment: { ...stored, ...(name ? { name } : {}), ...extra } });
          } catch (e) {
            remove(key);
            setSendWhenReady(false);
            onErrorRef.current(`${name ? `${name}: ` : ''}${e instanceof Error ? e.message : String(e)}`);
          }
        })();
      }
    },
    [remove],
  );

  useImperativeHandle(ref, () => ({ addFiles }), [addFiles]);

  const recorder = useRecorder((blob) => addFiles([blob]));
  const recording = recorder.state !== 'idle';

  const startRecording = async () => {
    if (!canRecord()) {
      // Browsers only give microphone access on https:// or localhost. The
      // file picker still lets phones record with their voice recorder app.
      onError('Live recording needs HTTPS (see `npm run dev:lan`). Pick or record an audio file instead.');
      audioInput.current?.click();
      return;
    }
    try {
      await recorder.start();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const busy = pending.some((p) => p.status !== 'ready');
  const hasContent = !!text.trim() || pending.length > 0;
  const canSend = hasContent && !busy && !generating && !sending && !disabledReason;

  const submit = async () => {
    if (!canSend) return;
    const value = text;
    const items = pending;
    setSending(true);
    setText('');
    setPending([]);
    const ok = await onSend(
      value,
      items.map((p) => p.attachment!),
    ).finally(() => setSending(false));
    if (ok) items.forEach((p) => p.url && URL.revokeObjectURL(p.url));
    else {
      setText(value);
      setPending(items);
    }
  };
  const submitRef = useRef(submit);
  submitRef.current = submit;

  // "Send" pressed while recording or processing: send as soon as everything is uploaded.
  useEffect(() => {
    if (!sendWhenReady || recording || busy) return;
    setSendWhenReady(false);
    void submitRef.current();
  }, [sendWhenReady, recording, busy]);

  // Paste files anywhere on the page, not only in the text box.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => mediaKind(f));
      // Office apps put a picture of the copied text next to the text itself: prefer the text.
      if (!files.length || e.clipboardData?.getData('text/plain').trim()) return;
      e.preventDefault();
      addFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addFiles]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: PointerEvent) => !menuRef.current?.contains(e.target as Node) && setMenuOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  useEffect(() => () => pendingRef.current.forEach((p) => p.url && URL.revokeObjectURL(p.url)), []);

  const pick = (input: HTMLInputElement | null) => {
    setMenuOpen(false);
    input?.click();
  };
  const onPicked = (e: ChangeEvent<HTMLInputElement>) => {
    addFiles([...(e.target.files ?? [])]);
    e.target.value = '';
    if (!isTouch()) textRef.current?.focus();
  };

  const touch = isTouch();
  const imagesOff = media.vision === false;
  const audioOff = media.audio === false;
  const accept = [!imagesOff && 'image/*', !audioOff && 'audio/*'].filter(Boolean).join(',');
  const attachTitle = imagesOff && audioOff ? `${media.model} only reads text` : 'Add images or audio';
  const micTitle = audioOff ? `${media.model} can't listen to audio` : 'Record audio';
  const thinkDisabled = thinkSupported === false;

  return (
    <form
      className={`composer${generating ? ' busy' : ''}${recording ? ' recording' : ''}`}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <input ref={fileInput} type="file" accept={accept} multiple hidden onChange={onPicked} />
      <input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={onPicked} />
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={onPicked} />
      <input ref={audioInput} type="file" accept="audio/*" capture hidden onChange={onPicked} />

      {pending.length > 0 && (
        <div className="tray" aria-label="Attachments">
          {pending.map((p) => (
            <div key={p.key} className={`tray-item ${p.kind}${p.status !== 'ready' ? ' loading' : ''}`}>
              {p.kind === 'image' ? (
                p.url ? <img src={p.url} alt={p.name ?? 'Image'} /> : <ImageIcon size={22} />
              ) : p.url ? (
                <AudioPlayer src={p.url} durationMs={p.durationMs} waveform={p.waveform} compact />
              ) : (
                <span className="tray-audio-placeholder">
                  <MicIcon size={16} /> Processing…
                </span>
              )}
              {p.status !== 'ready' && <span className="tray-spinner" aria-label="Uploading" />}
              <button type="button" className="tray-remove" onClick={() => remove(p.key)} aria-label={`Remove ${p.name ?? p.kind}`}>
                <CloseIcon size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {recording ? (
        <div className="rec-strip" aria-live="polite">
          <span className="rec-dot" aria-hidden />
          <span className="rec-time">{formatDuration(recorder.elapsedMs)}</span>
          <LiveWaveform levels={recorder.levels} />
          {recorder.elapsedMs > MAX_RECORDING_MS - 30000 && <span className="rec-limit">max {formatDuration(MAX_RECORDING_MS)}</span>}
        </div>
      ) : (
        <textarea
          ref={textRef}
          value={text}
          rows={1}
          placeholder={disabledReason ?? (pending.length ? 'Add a message (optional)' : 'Ask anything…')}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !isTouch()) {
              e.preventDefault();
              void submit();
            }
          }}
          aria-label="Message"
        />
      )}

      <div className="composer-bar">
        {recording ? (
          <button type="button" className="pill" onClick={recorder.cancel} title="Discard recording">
            <TrashIcon size={16} />
            <span>Discard</span>
          </button>
        ) : (
          <>
            <div className="attach" ref={menuRef}>
              <button
                type="button"
                className={`icon-btn attach-btn${menuOpen ? ' open' : ''}`}
                aria-label={attachTitle}
                title={attachTitle}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                disabled={imagesOff && audioOff}
                onClick={() => (touch ? setMenuOpen((o) => !o) : pick(fileInput.current))}
              >
                <PlusIcon size={20} />
              </button>
              {menuOpen && (
                <div className="attach-menu" role="menu">
                  <button type="button" role="menuitem" disabled={imagesOff} onClick={() => pick(cameraInput.current)}>
                    <CameraIcon size={18} /> Camera
                  </button>
                  <button type="button" role="menuitem" disabled={imagesOff} onClick={() => pick(photoInput.current)}>
                    <ImageIcon size={18} /> Photos
                  </button>
                  <button type="button" role="menuitem" onClick={() => pick(fileInput.current)}>
                    <PaperclipIcon size={18} /> Files
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              className={`pill toggle${think && !thinkDisabled ? ' on' : ''}`}
              onClick={() => onThinkChange(!think)}
              disabled={thinkDisabled}
              aria-pressed={think && !thinkDisabled}
              title={thinkDisabled ? 'This model does not support thinking' : 'Let the model reason before answering'}
            >
              <BrainIcon size={16} />
              <span>Think</span>
              <span className="switch" aria-hidden />
            </button>
          </>
        )}
        <div className="spacer" />
        <span className="hint">{touch || recording ? '' : 'Shift + Enter for a new line · paste or drop images and audio'}</span>
        {recording ? (
          <button type="button" className="icon-btn rec-done" onClick={recorder.finish} disabled={recorder.state !== 'recording'} aria-label="Finish recording" title="Finish recording">
            <CheckIcon size={20} />
          </button>
        ) : (
          <button
            type="button"
            className="icon-btn mic"
            onClick={startRecording}
            disabled={audioOff || recorder.state === 'starting'}
            aria-label={micTitle}
            title={micTitle}
          >
            <MicIcon size={20} />
          </button>
        )}
        {generating ? (
          <button type="button" className="send stop" onClick={onStop} aria-label="Stop generating" title="Stop">
            <StopIcon size={18} />
          </button>
        ) : recording ? (
          <button
            type="button"
            className="send"
            disabled={!!disabledReason}
            onClick={() => {
              setSendWhenReady(true);
              recorder.finish();
            }}
            aria-label="Send recording"
            title="Send"
          >
            <SendIcon size={18} />
          </button>
        ) : (
          <button
            type={busy ? 'button' : 'submit'}
            className={`send${busy && sendWhenReady ? ' waiting' : ''}`}
            disabled={!(canSend || (busy && hasContent && !disabledReason && !sending))}
            onClick={busy ? () => setSendWhenReady(true) : undefined}
            aria-label="Send"
            title={busy ? 'Send when the upload finishes' : 'Send'}
          >
            <SendIcon size={18} />
          </button>
        )}
      </div>
    </form>
  );
}
