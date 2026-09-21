/**
 * Trained gesture classifier — compact MLP over MediaPipe landmarks.
 *
 * LAZY LOADED: @tensorflow/tfjs is imported dynamically on first use, so
 * users who never train/predict with the model pay zero bundle cost.
 * Architecture (≈26 KB of weights): 63 → Dense(64) → Dropout(0.15) →
 * Dense(32) → Dense(N_CLASSES, softmax).
 */

export interface TrainingSample {
  landmarks: number[] // 63 features (21 × [x, y, z])
  label: number // class index
}

export interface TrainingMetrics {
  accuracy: number
  valAccuracy: number
  loss: number
  epochsRun: number
  timeMs: number
}

export interface Prediction {
  gesture: string
  confidence: number
  allProbs: number[]
}

/** Core gesture classes (expandable — bump CLASS_COUNT when adding more). */
export const GESTURES = ["yes", "no", "water", "food", "help"] as const
/** Future classes: 'open_palm', 'peace', 'point', 'wave', 'thumbs_up' */

const MODEL_URL = "indexeddb://vaaksetu-gesture-model-v1"
const INPUT_FEATURES = 63
const DROPOUT_RATE = 0.15

// ── Lazy TF module cache ─────────────────────────────────────────
type TFModule = typeof import("@tensorflow/tfjs")
let tfCache: TFModule | null = null

async function getTF(): Promise<TFModule> {
  if (!tfCache) {
    tfCache = await import("@tensorflow/tfjs")
  }
  return tfCache
}

// ── Model state ──────────────────────────────────────────────────
let model: import("@tensorflow/tfjs").LayersModel | null = null

export function isModelLoaded(): boolean {
  return model !== null
}

/** Internal: read-only access to the live model (export tooling). */
export function __getModel(): import("@tensorflow/tfjs").LayersModel | null {
  return model
}

/** Internal: TF module access for export tooling. */
export async function __getTF(): Promise<TFModule> {
  return getTF()
}

export function getClassCount(): number {
  return GESTURES.length
}

/** Class index → gesture name (guarded). */
export function gestureName(index: number): string {
  return GESTURES[index] ?? "unknown"
}

/** Gesture name → class index, or -1 when the model wasn't trained on it. */
export function gestureIndex(name: string): number {
  return (GESTURES as readonly string[]).indexOf(name)
}

// ── Feature engineering ──────────────────────────────────────────

/**
 * Flatten 21 [x, y, z] landmarks → 63 features, translated to wrist-origin
 * and scaled by the max wrist distance (translation + scale invariant).
 */
export function normalizeLandmarks(landmarks: number[]): number[] {
  if (landmarks.length < INPUT_FEATURES) {
    throw new Error(`expected ${INPUT_FEATURES} features, got ${landmarks.length}`)
  }
  const wx = landmarks[0]
  const wy = landmarks[1]
  const wz = landmarks[2]

  let maxDist = 1e-6
  const out = new Array<number>(INPUT_FEATURES)
  for (let i = 0; i < 21; i++) {
    const dx = landmarks[i * 3] - wx
    const dy = landmarks[i * 3 + 1] - wy
    const dz = landmarks[i * 3 + 2] - wz
    out[i * 3] = dx
    out[i * 3 + 1] = dy
    out[i * 3 + 2] = dz
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (d > maxDist) maxDist = d
  }
  for (let i = 0; i < INPUT_FEATURES; i++) out[i] /= maxDist
  return out
}

/** Flatten MediaPipe-style {x,y,z} landmark objects into raw 63 features. */
export function flattenLandmarks(lm: { x: number; y: number; z: number }[]): number[] {
  const out: number[] = []
  for (const p of lm) out.push(p.x, p.y, p.z)
  return out
}

// ── Model lifecycle ──────────────────────────────────────────────

function buildModel(tf: TFModule, classCount: number): import("@tensorflow/tfjs").LayersModel {
  const m = tf.sequential()
  m.add(tf.layers.dense({ inputShape: [INPUT_FEATURES], units: 64, activation: "relu" }))
  m.add(tf.layers.dropout({ rate: DROPOUT_RATE }))
  m.add(tf.layers.dense({ units: 32, activation: "relu" }))
  m.add(tf.layers.dense({ units: classCount, activation: "softmax" }))
  m.compile({
    optimizer: tf.train.adam(0.002),
    loss: "categoricalCrossentropy",
    metrics: ["accuracy"],
  })
  return m
}

/**
 * Cheap IndexedDB probe — resolves true when a stored model exists.
 * Does NOT import TF (real load is deferred until loadModel()).
 */
export function hasStoredModel(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open("vaaksetu-gesture-model-v1")
      req.onupgradeneeded = () => {
        // DB didn't exist — opening created it, so close and report absent.
        req.result.close()
        indexedDB.deleteDatabase("vaaksetu-gesture-model-v1")
        resolve(false)
      }
      req.onsuccess = () => {
        const db = req.result
        const has = db.objectStoreNames.contains("models_store")
        db.close()
        resolve(has)
      }
      req.onerror = () => resolve(false)
    } catch {
      resolve(false)
    }
  })
}

/**
 * Try to load a previously trained model from IndexedDB.
 * Returns true when a usable model is now in memory.
 */
export async function loadModel(): Promise<boolean> {
  try {
    const tf = await getTF()
    try {
      const loaded = await tf.loadLayersModel(MODEL_URL)
      loaded.compile({
        optimizer: tf.train.adam(0.002),
        loss: "categoricalCrossentropy",
        metrics: ["accuracy"],
      })
      model = loaded
      console.info("[gestureClassifier] model loaded from IndexedDB")
      return true
    } catch {
      // Fallback: pre-trained model deployed to public/gesture-model.
      const deployed = await tf.loadLayersModel("/gesture-model/model.json")
      deployed.compile({
        optimizer: tf.train.adam(0.002),
        loss: "categoricalCrossentropy",
        metrics: ["accuracy"],
      })
      model = deployed
      console.info("[gestureClassifier] deployed model loaded from /gesture-model")
      return true
    }
  } catch {
    console.info("[gestureClassifier] no model available — heuristics stay active")
    return false
  }
}

/** Persist the current model to IndexedDB. */
export async function saveModel(): Promise<void> {
  if (!model) throw new Error("no model to save")
  await model.save(MODEL_URL)
  const bytes = estimateModelBytes()
  console.info(`[gestureClassifier] model saved (~${(bytes / 1024).toFixed(1)} KB)`)
}

/** Remove the stored model (IndexedDB + memory). */
export async function deleteModel(): Promise<void> {
  model = null
  try {
    const tf = await getTF()
    const req = indexedDB.deleteDatabase("vaaksetu-gesture-model-v1")
    await new Promise<void>((resolve) => {
      req.onsuccess = () => resolve()
      req.onerror = () => resolve()
      req.onblocked = () => resolve()
    })
    void tf
  } catch {
    /* best-effort */
  }
}

/** Rough on-disk size (float32 weights + bias) for the size report. */
export function estimateModelBytes(): number {
  if (!model) return 0
  let params = 0
  // 63→64, 64→32, 32→N
  const n = getClassCount()
  params += INPUT_FEATURES * 64 + 64
  params += 64 * 32 + 32
  params += 32 * n + n
  return params * 4
}

/** Optional per-epoch hook for live UI progress. */
export interface TrainOptions {
  onEpoch?: (epoch: number, totalEpochs: number, logs: { acc?: number; val_acc?: number; loss?: number }) => void
}

/**
 * Train on collected samples with early stopping (patience 5).
 * Returns final metrics including wall-clock training time.
 */
export async function trainModel(
  samples: TrainingSample[],
  options: TrainOptions = {},
): Promise<TrainingMetrics> {
  const tf = await getTF()
  const classCount = getClassCount()
  if (samples.length < 10) throw new Error("need at least 10 samples to train")

  const t0 = performance.now()

  // Tensors live for the whole fit; disposed in finally (tf.tidy can't
  // span an async fit, so manual dispose is the leak-safe equivalent).
  const xs = tf.tensor2d(
    samples.map((s) => normalizeLandmarks(s.landmarks)),
    [samples.length, INPUT_FEATURES],
  )
  const ys = tf.tensor2d(
    samples.map((s) => Array.from(tf.oneHot(tf.scalar(s.label, "int32"), classCount).dataSync())),
    [samples.length, classCount],
  )

  const net = buildModel(tf, classCount)
  model = net

  const PATIENCE = 5
  let bestValLoss = Infinity
  let epochsSinceBest = 0
  let epochsRun = 0
  let lastLogs: { acc?: number; val_acc?: number; loss?: number } = {}

  try {
    await net.fit(xs, ys, {
      epochs: 30,
      batchSize: 16,
      validationSplit: 0.2,
      shuffle: true,
      callbacks: {
        onEpochEnd: async (epoch, logs) => {
          epochsRun = epoch + 1
          lastLogs = {
            acc: logs?.acc ?? logs?.accuracy,
            val_acc: logs?.val_acc ?? logs?.val_accuracy,
            loss: logs?.loss,
          }
          options.onEpoch?.(epoch + 1, 30, lastLogs)
          const vl = logs?.val_loss ?? Infinity
          if (vl < bestValLoss - 1e-4) {
            bestValLoss = vl
            epochsSinceBest = 0
          } else {
            epochsSinceBest += 1
          }
          if (epochsSinceBest >= PATIENCE) {
            net.stopTraining = true
            console.info(`[gestureClassifier] early stop at epoch ${epoch + 1}`)
          }
        },
      },
    })
  } finally {
    xs.dispose()
    ys.dispose()
  }

  const timeMs = Math.round(performance.now() - t0)
  const metrics: TrainingMetrics = {
    accuracy: lastLogs.acc ?? 0,
    valAccuracy: lastLogs.val_acc ?? 0,
    loss: lastLogs.loss ?? 0,
    epochsRun,
    timeMs,
  }
  console.info("[gestureClassifier] trained:", metrics)
  return metrics
}

// ── Inference ────────────────────────────────────────────────────

/**
 * Predict from raw 63-feature landmarks (normalization applied here).
 * Throws when no model is loaded — callers check isModelLoaded() first.
 */
export async function predict(landmarks: number[]): Promise<Prediction> {
  if (!model) throw new Error("model not loaded")
  const tf = await getTF()
  const input = normalizeLandmarks(landmarks)

  const probs = tf.tidy(() => {
    const tensor = tf.tensor2d([input], [1, INPUT_FEATURES])
    const out = model!.predict(tensor) as import("@tensorflow/tfjs").Tensor
    return Array.from(out.dataSync())
  })

  let bestIdx = 0
  for (let i = 1; i < probs.length; i++) {
    if (probs[i] > probs[bestIdx]) bestIdx = i
  }
  return {
    gesture: gestureName(bestIdx),
    confidence: probs[bestIdx],
    allProbs: probs,
  }
}
