/**
 * Offline speech — Phase 2B.
 *
 * On-device models via @xenova/transformers (Transformers.js):
 *   - Whisper-tiny (WASM, quantized ~40MB) for speech→text
 *   - SpeechT5 (~1.5MB weights + speaker embeddings) for text→speech (English)
 *
 * Both models run inside a dedicated Web Worker so the UI thread stays free;
 * weights are cached by the browser after the first download. Every entry
 * point degrades gracefully:
 *   - STT: Web Speech API first (better accuracy + Indian languages),
 *     offline Whisper when the network service fails.
 *   - TTS: browser native voices first; SpeechT5 when offline or when no
 *     English voice exists.
 */

/* ── Worker bridge ─────────────────────────────────────────────── */

type WorkerRequest =
  | { kind: "stt"; audio: Float32Array; id: number }
  | { kind: "tts"; text: string; speaker_embeddings: Float32Array; id: number }

type WorkerResponse =
  | { kind: "status"; task: "stt" | "tts"; state: "loading" | "ready" | "error"; pct: number }
  | { kind: "stt-result"; id: number; text: string }
  | { kind: "tts-result"; id: number; audio: Float32Array; samplingRate: number }
  | { kind: "error"; id: number; message: string }

let worker: Worker | null = null
let reqId = 0
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
const taskState: Record<"stt" | "tts", { state: "idle" | "loading" | "ready" | "error"; pct: number }> = {
  stt: { state: "idle", pct: 0 },
  tts: { state: "idle", pct: 0 },
}

const statusListeners = new Set<(s: { stt: string; tts: string }) => void>()

function notifyStatus() {
  const snapshot = { stt: taskState.stt.state, tts: taskState.tts.state }
  statusListeners.forEach((cb) => cb(snapshot))
}

/** Subscribe to model-load status (for "Offline AI" badges). */
export function onSpeechModelStatus(cb: (s: { stt: string; tts: string }) => void): () => void {
  statusListeners.add(cb)
  cb({ stt: taskState.stt.state, tts: taskState.tts.state })
  return () => statusListeners.delete(cb)
}

function ensureWorker(): Worker | null {
  if (worker) return worker
  if (typeof Worker === "undefined") return null
  try {
    worker = new Worker(new URL("../../workers/speechWorker.ts", import.meta.url), { type: "module" })
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data
      if (msg.kind === "status") {
        taskState[msg.task] = { state: msg.state, pct: msg.pct }
        notifyStatus()
        return
      }
      if (msg.kind === "error") {
        pending.get(msg.id)?.reject(new Error(msg.message))
        pending.delete(msg.id)
        return
      }
      if (msg.kind === "stt-result" || msg.kind === "tts-result") {
        pending.get(msg.id)?.resolve(msg)
        pending.delete(msg.id)
      }
    }
    worker.onerror = () => {
      // Worker failed outright (CSP, memory) — disable offline path.
      taskState.stt.state = "error"
      taskState.tts.state = "error"
      notifyStatus()
    }
  } catch {
    worker = null
  }
  return worker
}

function postRequest(req: WorkerRequest, transfer?: Transferable[]): Promise<unknown> {
  const w = ensureWorker()
  if (!w) return Promise.reject(new Error("workers unavailable"))
  return new Promise((resolve, reject) => {
    reqId++
    pending.set(reqId, { resolve: resolve as (v: unknown) => void, reject })
    try {
      w.postMessage(req, transfer ?? [])
    } catch (err) {
      pending.delete(reqId)
      reject(err instanceof Error ? err : new Error("postMessage failed"))
    }
  })
}

/* ── Audio decode helper ───────────────────────────────────────── */

/** Decode a recorded Blob to 16 kHz mono Float32 PCM (Whisper's format). */
export async function decodeToPcm16k(blob: Blob): Promise<Float32Array> {
  const AudioCtx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new AudioCtx()
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer())
    // Mix down to mono.
    const mono = new Float32Array(buf.length)
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const data = buf.getChannelData(ch)
      for (let i = 0; i < buf.length; i++) mono[i] += data[i] / buf.numberOfChannels
    }
    // Resample to 16 kHz with an OfflineAudioContext.
    if (buf.sampleRate === 16000) return mono
    const offline = new OfflineAudioContext(1, Math.ceil((buf.duration * 16000) / 1), 16000)
    const src = offline.createBufferSource()
    // Copy into an AudioBuffer for the offline context.
    const offBuf = offline.createBuffer(1, buf.length, buf.sampleRate)
    offBuf.copyToChannel(mono, 0)
    src.buffer = offBuf
    src.connect(offline.destination)
    src.start()
    const rendered = await offline.startRendering()
    return rendered.getChannelData(0).slice()
  } finally {
    void ctx.close()
  }
}

/* ── Public: offline speech-to-text (Whisper-tiny) ─────────────── */

/** Transcribe PCM audio fully on-device. Throws when unavailable. */
export async function offlineTranscribe(audioPcm16k: Float32Array): Promise<string> {
  const res = (await postRequest({ kind: "stt", audio: audioPcm16k, id: ++reqId }, [audioPcm16k.buffer])) as
    | { kind: "stt-result"; text: string }
    | undefined
  return res?.text ?? ""
}

/* ── Public: offline text-to-speech (SpeechT5) ─────────────────── */

let speakerEmbedding: Float32Array | null = null

/** Fetch the fixed x-vocoder speaker embedding once. */
async function getSpeakerEmbedding(): Promise<Float32Array> {
  if (speakerEmbedding) return speakerEmbedding
  const res = await fetch(
    "https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin",
  )
  if (!res.ok) throw new Error("speaker embedding unavailable")
  const buf = await res.arrayBuffer()
  speakerEmbedding = new Float32Array(buf)
  return speakerEmbedding
}

/** Synthesize speech fully on-device; returns a playable object URL. */
export async function offlineSpeak(text: string): Promise<string> {
  const embedding = await getSpeakerEmbedding()
  const id = ++reqId
  // Copy (not transfer) the embedding so it stays usable for future calls.
  const res = (await postRequest(
    { kind: "tts", text, speaker_embeddings: embedding, id },
  )) as { kind: "tts-result"; audio: Float32Array; samplingRate: number } | undefined
  if (!res) throw new Error("no tts result")
  const url = URL.createObjectURL(new Blob([encodeWav(res.audio, res.samplingRate)], { type: "audio/wav" }))
  return url
}

/** Encode Float32 PCM into a WAV Blob (browser-safe, no deps). */
function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeStr(0, "RIFF")
  view.setUint32(4, 36 + samples.length * 2, true)
  writeStr(8, "WAVE")
  writeStr(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, "data")
  view.setUint32(40, samples.length * 2, true)
  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }
  return buffer
}

/* ── Graceful STT strategy ─────────────────────────────────────── */

export interface SttOutcome {
  text: string
  /** Which engine produced the text. */
  engine: "web-speech" | "whisper-offline"
}

export const sttEngines = { webSpeech: "web-speech", whisper: "whisper-offline" } as const

/**
 * Attempt offline Whisper transcription from a recorded audio Blob.
 * Returns null when the model can't run (caller keeps Web Speech result).
 */
export async function tryOfflineTranscribe(blob: Blob): Promise<string | null> {
  try {
    if (taskState.stt.state === "error") return null
    const pcm = await decodeToPcm16k(blob)
    const text = await offlineTranscribe(pcm)
    return text.trim() || null
  } catch {
    return null
  }
}
