/**
 * On-device intent predictor — Phase 2A.
 *
 * Two layers:
 *   1. Local rule lookup (predict.ts) — instant, works everywhere.
 *   2. On-device LLM (WebLLM + WebGPU, Qwen2.5-0.5B-Instruct) — refines
 *      pictogram taps into one natural sentence. Weights are cached in
 *      IndexedDB by web-llm after the first download, so it works offline
 *      and downloads only once.
 *
 * When WebGPU is unavailable, layer 2 silently disables and callers just
 * use layer 1 — no errors, no broken UI.
 */



export interface IntentResult {
  text: string
  /** 0–100 confidence. */
  confidence: number
  isFallback: boolean
  /** Which layer produced this result. */
  layer: "rules" | "llm"
  alternatives?: string[]
}

/** Status of the on-device LLM for UI badges. */
export type LlmStatus =
  | "unsupported" // no WebGPU
  | "idle" // available but not loaded
  | "loading" // downloading/initializing (pct 0–100)
  | "ready" // ready to infer
  | "error"

let statusListener: ((s: LlmStatus, pct: number) => void) | null = null
let currentStatus: LlmStatus = "idle"
let currentPct = 0

/** Subscribe to LLM status changes (for the 🧠 badge). Returns unsubscriber. */
export function onLlmStatus(cb: (s: LlmStatus, pct: number) => void): () => void {
  statusListener = cb
  cb(currentStatus, currentPct)
  return () => {
    if (statusListener === cb) statusListener = null
  }
}

function setStatus(s: LlmStatus, pct = currentPct) {
  currentStatus = s
  currentPct = pct
  statusListener?.(s, pct)
}

export function getLlmStatus(): { status: LlmStatus; pct: number } {
  return { status: currentStatus, pct: currentPct }
}

/** True when this browser exposes WebGPU. */
export function hasWebGPU(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator
}

/* ── WebLLM engine (CDN-loaded, worker-hosted) ─────────────────── */

const MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC"
// CDN URL kept in a variable so neither tsc nor Vite tries to resolve it at build time.
const WEBLLM_URL = "https://esm.sh/@mlc-ai/web-llm@0.2.79"

interface EngineLike {
  chat: {
    completions: {
      create: (req: Record<string, unknown>) => Promise<
        { choices: { message?: { content?: string } }[] }
      >
    }
  }
  unload?: () => Promise<void>
}

let enginePromise: Promise<EngineLike> | null = null

async function getEngine(): Promise<EngineLike> {
  if (enginePromise) return enginePromise
  enginePromise = (async () => {
    if (!hasWebGPU()) throw new Error("WebGPU unavailable")
    setStatus("loading", 0)
    const webllm = (await import(/* @vite-ignore */ WEBLLM_URL)) as unknown as {
      CreateWebWorkerMLCEngine: (
        worker: Worker,
        model: string,
        opts?: Record<string, unknown>,
      ) => Promise<EngineLike>
      CreateMLCEngine: (model: string, opts?: Record<string, unknown>) => Promise<EngineLike>
    }
    let engine: EngineLike
    try {
      // Prefer the dedicated worker so inference never blocks the UI thread.
      engine = await webllm.CreateWebWorkerMLCEngine(
        new Worker(new URL("../../workers/llmWorker.ts", import.meta.url), { type: "module" }),
        MODEL_ID,
        {
          initProgressCallback: (r: { progress: number }) =>
            setStatus(r.progress >= 1 ? "ready" : "loading", Math.round(r.progress * 100)),
        },
      )
    } catch {
      // Worker path unavailable (e.g. CSP) — fall back to an in-page engine.
      engine = await webllm.CreateMLCEngine(MODEL_ID, {
        initProgressCallback: (r: { progress: number }) =>
          setStatus(r.progress >= 1 ? "ready" : "loading", Math.round(r.progress * 100)),
      })
    }
    setStatus("ready", 100)
    return engine
  })().catch((err) => {
    enginePromise = null
    setStatus("error")
    throw err
  })
  return enginePromise
}

/** Kick off model loading in the background (call from a user-gesture handler). */
export function preloadLlm(): void {
  void getEngine().catch(() => undefined)
}

/** Unload the model to free GPU memory. */
export async function unloadLlm(): Promise<void> {
  if (!enginePromise) return
  try {
    const engine = await enginePromise
    if (engine.unload) await engine.unload()
  } catch {
    /* ignore */
  }
  enginePromise = null
  setStatus("idle")
}

/* ── Prompt ────────────────────────────────────────────────────── */

const SYSTEM_PROMPT =
  "You are an AAC assistant. A non-verbal user tapped pictograms. " +
  "Generate ONE natural English sentence they want to say. " +
  "Output only the sentence, nothing else."

function buildPrompt(words: string[], ctx: { mood?: string; timeOfDay?: string }): string {
  const bits = [`Words tapped: [${words.join(", ")}]`]
  if (ctx.mood) bits.push(`User mood: ${ctx.mood}`)
  if (ctx.timeOfDay) bits.push(`Time of day: ${ctx.timeOfDay}`)
  return bits.join(". ") + "."
}

/** Extract the first clean sentence from model output. */
function sanitize(raw: string): string {
  const line = raw.split("\n").map((l) => l.trim()).filter(Boolean)[0] ?? ""
  const cleaned = line
    .replace(/^["'`\s]+|["'`\s]+$/g, "")
    .replace(/^(sentence|output|assistant)\s*:\s*/i, "")
    .trim()
  if (!cleaned) return ""
  // Cap at a reasonable single sentence.
  const m = cleaned.match(/^(.{3,140}?[.!?])(\s|$)/)
  return (m ? m[1] : cleaned).trim()
}

/* ── Public API ────────────────────────────────────────────────── */

export interface PredictOptions {
  mood?: string
  hour?: number
  /** Skip the LLM even if ready. */
  rulesOnly?: boolean
}

/**
 * Two-layer prediction. Layer 1 always runs (synchronous rules);
 * layer 2 refines it when the on-device LLM is ready.
 */
export async function predictIntent(
  words: string[],
  opts: PredictOptions = {},
): Promise<IntentResult> {
  const { predictSentence } = await import("../predict")
  const hour = opts.hour ?? new Date().getHours()
  const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "night"
  const mood = opts.mood ?? undefined

  const base = predictSentence(words, { lastMood: mood, hour })
  const baseResult: IntentResult = {
    text: base.text,
    confidence: base.confidence,
    isFallback: base.isFallback,
    layer: "rules",
    alternatives: base.alternatives,
  }

  if (opts.rulesOnly || currentStatus === "unsupported") return baseResult

  // Layer 2 — on-device LLM refinement.
  try {
    const engine = await getEngine()
    const completion = await engine.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildPrompt(words, { mood, timeOfDay }) },
      ],
      max_tokens: 40,
      temperature: 0.3,
    })
    const text = sanitize(completion.choices[0]?.message?.content ?? "")
    if (!text) return baseResult
    return {
      text,
      confidence: 88, // heuristic: LLM fluency beats rule templates
      isFallback: false,
      layer: "llm",
    }
  } catch {
    // Model failed to load/infer — silently fall back to rules.
    return baseResult
  }
}
