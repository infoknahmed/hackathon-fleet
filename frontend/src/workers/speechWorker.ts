/**
 * Offline speech models worker — Phase 2B.
 * Runs Whisper-tiny (STT) and SpeechT5 (TTS) fully off the UI thread.
 * transformers.js is loaded from a CDN at runtime (never bundled) and then
 * cached by the service worker; model weights cache in the browser after
 * the first download.
 */

interface ProgressEvent {
  status: string
  progress?: number
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type TfModule = {
  env: { allowLocalModels: boolean }
  pipeline: (task: string, model: string, opts?: Record<string, any>) => Promise<any>
}

let tf: TfModule | null = null

const TF_URL = "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2"

async function getTf(): Promise<TfModule> {
  if (tf) return tf
  tf = (await import(/* @vite-ignore */ TF_URL)) as unknown as TfModule
  tf.env.allowLocalModels = false
  return tf
}

type Task = "stt" | "tts"

let asr: any = null
let tts: any = null

function post(msg: unknown, transfer?: Transferable[]) {
  if (transfer && transfer.length > 0) {
    ;(self as unknown as Worker).postMessage(msg, transfer)
  } else {
    ;(self as unknown as Worker).postMessage(msg)
  }
}

function reportStatus(task: Task, state: "loading" | "ready" | "error", pct = 0) {
  post({ kind: "status", task, state, pct })
}

async function getAsr() {
  if (asr) return asr
  reportStatus("stt", "loading", 0)
  const lib = await getTf()
  asr = await lib.pipeline("automatic-speech-recognition", "Xenova/whisper-tiny.en", {
    quantized: true,
    progress_callback: (p: ProgressEvent) => {
      if (p.status === "progress" && typeof p.progress === "number") {
        reportStatus("stt", "loading", Math.round(p.progress))
      }
    },
  })
  reportStatus("stt", "ready", 100)
  return asr
}

async function getTts() {
  if (tts) return tts
  reportStatus("tts", "loading", 0)
  const lib = await getTf()
  tts = await lib.pipeline("text-to-speech", "Xenova/speecht5_tts", {
    quantized: true,
    progress_callback: (p: ProgressEvent) => {
      if (p.status === "progress" && typeof p.progress === "number") {
        reportStatus("tts", "loading", Math.round(p.progress))
      }
    },
  })
  reportStatus("tts", "ready", 100)
  return tts
}

type SttMessage = { kind: "stt"; audio: Float32Array; id: number }
type TtsMessage = { kind: "tts"; text: string; speaker_embeddings: Float32Array; id: number }

self.addEventListener("message", async (e: MessageEvent<SttMessage | TtsMessage>) => {
  const msg = e.data
  try {
    if (msg.kind === "stt") {
      const pipe = await getAsr()
      const out = await pipe(msg.audio, { chunk_length_s: 30, stride_length_s: 5 })
      post({ kind: "stt-result", id: msg.id, text: out?.text ?? "" })
    } else if (msg.kind === "tts") {
      const pipe = await getTts()
      const out = await pipe(msg.text, { speaker_embeddings: msg.speaker_embeddings })
      post(
        { kind: "tts-result", id: msg.id, audio: out.audio, samplingRate: out.sampling_rate },
        [out.audio.buffer as ArrayBuffer],
      )
    }
  } catch (err) {
    post({ kind: "error", id: msg.id, message: err instanceof Error ? err.message : "model error" })
  }
})
