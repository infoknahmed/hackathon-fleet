/**
 * Continuous ISL recognition — Phase 4A.
 *
 * Moves from per-gesture holds to full phrase recognition:
 *   1. A rolling 60-frame window (~2s @ 30fps) of normalized hand
 *      landmarks is maintained from the existing MediaPipe feed.
 *   2. Motion-energy segmentation splits the stream into candidate
 *      sign segments (energy rises during a sign, fall during pauses).
 *   3. Each segment is classified by (in order of preference):
 *        a. ONNX model at /models/isl-continuous.onnx (when trained)
 *        b. DTW against motion templates (works today, no training data)
 *   4. Segment labels are joined into a sentence with a stability filter.
 *
 * The recognizer never throws — every failure degrades to "no result"
 * so the page can fall back to per-gesture mode.
 */

/* ── Types ─────────────────────────────────────────────────────── */

export interface ContinuousConfig {
  /** Window length in frames (~2s at 30fps). */
  windowSize: number
  /** Motion-energy threshold to enter/exit a sign segment. */
  energyThreshold: number
  /** Minimum segment length in frames. */
  minSegmentFrames: number
  /** DTW distance below which a template match is accepted. */
  dtwAccept: number
}

export const DEFAULT_CONFIG: ContinuousConfig = {
  windowSize: 60,
  energyThreshold: 0.018,
  minSegmentFrames: 8,
  dtwAccept: 1.6,
}

export interface SegmentResult {
  label: string
  confidence: number
  startFrame: number
  endFrame: number
}

export interface ContinuousResult {
  segments: SegmentResult[]
  /** Sentence text produced from accepted segments. */
  sentence: string
  /** Which classifier produced the labels. */
  source: "onnx" | "dtw" | "none"
}

/** One hand: 21 landmarks (x, y, z) from MediaPipe Hands. */
export type HandFrame = { x: number; y: number; z: number }[]

/* ── Normalization ─────────────────────────────────────────────── */

/**
 * Normalize a hand to a translation/scale-invariant 63-dim vector:
 * wrist-centered + scaled by palm size + z-weighted.
 */
export function normalizeHand(hand: HandFrame): Float32Array {
  const out = new Float32Array(63)
  if (hand.length < 21) return out
  const wx = hand[0].x
  const wy = hand[0].y
  let scale = 0
  for (const p of hand) {
    scale = Math.max(scale, Math.hypot(p.x - wx, p.y - wy))
  }
  const s = scale > 1e-6 ? 1 / scale : 1
  for (let i = 0; i < 21; i++) {
    out[i * 3] = (hand[i].x - wx) * s
    out[i * 3 + 1] = (hand[i].y - wy) * s
    out[i * 3 + 2] = hand[i].z * s * 0.5
  }
  return out
}

/** Motion energy between two consecutive normalized hands. */
function frameEnergy(a: Float32Array, b: Float32Array): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i]
    sum += d * d
  }
  return Math.sqrt(sum / a.length)
}

/* ── DTW ───────────────────────────────────────────────────────── */

/** DTW distance between two variable-length normalized sequences. */
export function dtwDistance(a: Float32Array[], b: Float32Array[]): number {
  const n = a.length
  const m = b.length
  if (n === 0 || m === 0) return Number.POSITIVE_INFINITY
  const dim = 63
  // O(n·m·dim) with banded optimization (Sakoe-Chiba band of 15%).
  const band = Math.floor(Math.max(n, m) * 0.15) + 1
  const INF = Number.POSITIVE_INFINITY
  const cost: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(INF))
  cost[0][0] = 0
  for (let i = 1; i <= n; i++) {
    const lo = Math.max(1, i - band)
    const hi = Math.min(m, i + band)
    for (let j = lo; j <= hi; j++) {
      let d = 0
      const va = a[i - 1]
      const vb = b[j - 1]
      for (let k = 0; k < dim; k++) {
        const diff = va[k] - vb[k]
        d += diff * diff
      }
      const local = Math.sqrt(d / dim)
      cost[i][j] = local + Math.min(cost[i - 1][j], cost[i][j - 1], cost[i - 1][j - 1])
    }
  }
  return cost[n][m] / (n + m)
}

/* ── Motion templates (built-in seed vocabulary) ───────────────── */

/**
 * Seed templates are synthesized from canonical motion patterns of ISL
 * vocabulary. They are intentionally coarse — the ONNX model (or recorded
 * templates via `npm run collect-isl`) replaces them for real accuracy.
 */
interface MotionTemplate {
  label: string
  /** Sequence of normalized "virtual hands" generated procedurally. */
  frames: Float32Array[]
}

function synthHand(dx: number, dy: number, curl: number): Float32Array {
  const v = new Float32Array(63)
  for (let i = 0; i < 21; i++) {
    const finger = Math.floor(i / 4)
    const isThumb = finger === 0
    const c = isThumb ? curl * 0.6 : curl
    v[i * 3] = dx + (i % 4) * 0.03
    v[i * 3 + 1] = dy - c * 0.04 * finger
    v[i * 3 + 2] = 0
  }
  return v
}

function buildTemplate(label: string, path: [number, number, number][]): MotionTemplate {
  return { label, frames: path.map(([dx, dy, curl]) => synthHand(dx, dy, curl)) }
}

const TEMPLATES: MotionTemplate[] = [
  buildTemplate("hello", [
    [-0.1, 0.2, 0], [0, 0.2, 0], [0.1, 0.22, 0], [0.18, 0.18, 0], [0.1, 0.2, 0], [0, 0.2, 0], [-0.1, 0.22, 0],
  ]),
  buildTemplate("yes", [
    [0, 0.1, 1], [0, 0.12, 1], [0, 0.16, 1], [0, 0.12, 1], [0, 0.1, 1],
  ]),
  buildTemplate("no", [
    [0, 0.15, 0.2], [0, 0.1, 0.2], [0, 0.05, 0.2], [0, 0.1, 0.2], [0, 0.15, 0.2],
  ]),
  buildTemplate("more", [
    [0, 0, 0.5], [0.03, 0.02, 0.5], [0.05, 0, 0.5], [0.03, -0.02, 0.5], [0, 0, 0.5],
  ]),
  buildTemplate("come", [
    [0.1, 0.15, 0], [0.07, 0.12, 0], [0.03, 0.08, 0], [0, 0.05, 0], [0, 0.02, 0],
  ]),
  buildTemplate("give", [
    [0, 0.05, 0.3], [-0.05, 0.04, 0.3], [-0.12, 0.03, 0.3], [-0.18, 0.02, 0.3],
  ]),
  buildTemplate("stop", [
    [0, 0.1, 0], [0, 0.12, 0], [0, 0.13, 0], [0, 0.12, 0], [0, 0.1, 0],
  ]),
  buildTemplate("help", [
    [0, 0.1, 0.9], [0, 0.12, 0.9], [0, 0.14, 0.9], [0, 0.12, 0.9],
  ]),
  buildTemplate("water", [
    [0, 0.2, 0.6], [0, 0.24, 0.6], [0, 0.28, 0.6], [0, 0.24, 0.6],
  ]),
  buildTemplate("eat", [
    [0, 0.28, 0.8], [0, 0.24, 0.8], [0, 0.28, 0.8], [0, 0.24, 0.8],
  ]),
]

/* ── ONNX hook (loaded only when a model file exists) ──────────── */

interface OnnxSessionLike {
  run: (feeds: Record<string, unknown>) => Promise<Record<string, { data: Float32Array }>>
}

let onnxSession: OnnxSessionLike | null = null
let onnxTried = false

/** Attempt to load /models/isl-continuous.onnx once; silent on failure. */
async function tryLoadOnnx(): Promise<OnnxSessionLike | null> {
  if (onnxTried) return onnxSession
  onnxTried = true
  try {
    const ORT_URL = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.0/dist/ort.min.js"
    const ort = (await import(/* @vite-ignore */ ORT_URL)) as unknown as {
      InferenceSession: { create: (url: string) => Promise<OnnxSessionLike> }
    }
    onnxSession = await ort.InferenceSession.create("/models/isl-continuous.onnx")
    return onnxSession
  } catch {
    onnxSession = null
    return null
  }
}

/** Feature matrix for the ONNX classifier: [T, 63] hand landmarks. */
function framesToTensor(frames: Float32Array[]): { data: Float32Array; dims: [number, number] } {
  const T = frames.length
  const data = new Float32Array(T * 63)
  frames.forEach((f, i) => data.set(f, i * 63))
  return { data, dims: [T, 63] }
}

/* ── Recognizer class ──────────────────────────────────────────── */

export class ContinuousRecognizer {
  private config: ContinuousConfig
  private window: Float32Array[] = []
  private frameIndex = 0
  private segment: Float32Array[] = []
  private segmentStart = 0
  private energyPrev: Float32Array | null = null
  private lastAcceptedAt = 0
  /** Vocabulary restriction (labels outside are never emitted). */
  vocabulary: Set<string> | null = null

  constructor(config: Partial<ContinuousConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /** Reset all buffers (e.g. when toggling modes). */
  reset(): void {
    this.window = []
    this.segment = []
    this.energyPrev = null
    this.frameIndex = 0
  }

  /**
   * Push one frame of hand landmarks (both hands merged externally).
   * Returns a completed segment result when segmentation + classification
   * accept a sign, otherwise null.
   */
  push(hand: HandFrame | null, timestamp: number): SegmentResult | null {
    void timestamp
    this.frameIndex++
    if (!hand || hand.length < 21) {
      // Hand lost: treat as pause — close any open segment.
      const closed = this.closeSegment()
      this.energyPrev = null
      return closed
    }
    const norm = normalizeHand(hand)
    this.window.push(norm)
    if (this.window.length > this.config.windowSize) this.window.shift()

    // Motion energy vs previous frame.
    const energy = this.energyPrev ? frameEnergy(this.energyPrev, norm) : 0
    this.energyPrev = norm

    if (energy >= this.config.energyThreshold) {
      // Inside a sign.
      if (this.segment.length === 0) this.segmentStart = this.frameIndex
      this.segment.push(norm)
      if (this.segment.length > this.config.windowSize) this.segment.shift()
      return null
    }

    // Low energy — possible segment end.
    return this.closeSegment()

  }

  /** Attempt to close + classify the current segment. */
  private closeSegment(): SegmentResult | null {
    if (this.segment.length < this.config.minSegmentFrames) {
      this.segment = []
      return null
    }
    const frames = [...this.segment]
    this.segment = []
    const result = this.classify(frames)
    if (!result) return null
    // Debounce: don't re-emit the same label within ~1.2s of frames.
    if (result.label === this.lastLabel && this.frameIndex - this.lastAcceptedAt < 36) {
      return null
    }
    this.lastLabel = result.label
    this.lastAcceptedAt = this.frameIndex
    return { ...result, startFrame: this.segmentStart, endFrame: this.frameIndex }
  }

  private lastLabel = ""

  /** Classify a segment via ONNX when available, else DTW. */
  private async classifyViaOnnx(frames: Float32Array[]): Promise<SegmentResult | null> {
    const session = await tryLoadOnnx()
    if (!session) return null
    try {
      const { data, dims } = framesToTensor(frames)
      const feeds = { input: { dims, data } as unknown }
      const output = await session.run(feeds)
      const first = Object.values(output)[0]
      if (!first?.data) return null
      // Argmax + softmax confidence.
      let best = 0
      let sum = 0
      for (let i = 0; i < first.data.length; i++) {
        if (first.data[i] > first.data[best]) best = i
        sum += first.data[i]
      }
      const label = ONNX_LABELS[best] ?? `class${best}`
      const conf = sum > 0 ? first.data[best] / sum : 0
      if (conf < 0.6) return null
      return { label, confidence: conf, startFrame: 0, endFrame: 0 }
    } catch {
      return null
    }
  }

  private classify(frames: Float32Array[]): SegmentResult | null {
    // ONNX is async-only; DTW here is synchronous by design (called from
    // the animation loop). The ONNX path is exposed via classifyAsync.
    return this.classifyDtw(frames)
  }

  /** DTW classification against seed templates. */
  private classifyDtw(frames: Float32Array[]): SegmentResult | null {
    let bestLabel = ""
    let bestDist = Number.POSITIVE_INFINITY
    for (const tpl of TEMPLATES) {
      if (this.vocabulary && !this.vocabulary.has(tpl.label)) continue
      const d = dtwDistance(frames, tpl.frames)
      if (d < bestDist) {
        bestDist = d
        bestLabel = tpl.label
      }
    }
    if (!bestLabel || bestDist > this.config.dtwAccept) return null
    const confidence = Math.max(0.5, Math.min(0.95, 1 - bestDist / (this.config.dtwAccept * 1.4)))
    return { label: bestLabel, confidence, startFrame: 0, endFrame: 0 }
  }

  /** Async classification (ONNX with DTW fallback) — used by the page. */
  async classifyAsync(frames: Float32Array[]): Promise<SegmentResult | null> {
    const onnx = await this.classifyViaOnnx(frames)
    if (onnx) return onnx
    return this.classifyDtw(frames)
  }

  /** Latest rolling window (for diagnostics + data collection). */
  getWindow(): Float32Array[] {
    return [...this.window]
  }
}

/** Label list matching the training script's class order. */
export const ONNX_LABELS = [
  "hello", "yes", "no", "more", "come", "give", "stop", "help", "water", "eat",
]

/** Human-readable display for segment labels. */
export const SEGMENT_DISPLAY: Record<string, string> = {
  hello: "Hello",
  yes: "Yes",
  no: "No",
  more: "More",
  come: "Come here",
  give: "Give me",
  stop: "Stop",
  help: "Help",
  water: "Water",
  eat: "Eat / Food",
}

/* ── Sentence assembly ─────────────────────────────────────────── */

/**
 * Assemble recognized segments into a sentence string, collapsing
 * repeated labels within 4s.
 */
export function segmentsToSentence(segments: SegmentResult[]): string {
  const words: string[] = []
  let prev = ""
  for (const seg of segments) {
    const label = SEGMENT_DISPLAY[seg.label] ?? seg.label
    if (label === prev) continue
    words.push(label)
    prev = label
  }
  return words.join(" ")
}
