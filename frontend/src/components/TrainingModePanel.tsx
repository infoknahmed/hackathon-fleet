import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { motion } from "motion/react"
import { Brain, Download, Upload, Trash2, X } from "lucide-react"
import {
  GESTURES,
  trainModel,
  saveModel,
  isModelLoaded,
  estimateModelBytes,
} from "../lib/gestureClassifier"
import type { TrainingMetrics } from "../lib/gestureClassifier"
import { COLORS, FONT, RADIUS, SHADOW, TAP_MIN } from "../theme"

const SAMPLES_KEY = "vaaksetu-gesture-samples-v1"
const TARGET_PER_GESTURE = 20
const BURST_COUNT = 20
const BURST_HZ = 10

/** Emoji per gesture for the grid rows. */
export const GESTURE_EMOJI: Record<string, string> = {
  yes: "👊",
  no: "👎",
  water: "🤟",
  food: "🖐️",
  help: "🤙",
}

interface StoredSample {
  features: number[] // 63 raw features
  label: number
}

function loadSamples(): StoredSample[] {
  try {
    const raw = localStorage.getItem(SAMPLES_KEY)
    if (raw) return JSON.parse(raw) as StoredSample[]
  } catch {
    /* ignore */
  }
  return []
}

function persistSamples(samples: StoredSample[]): void {
  try {
    localStorage.setItem(SAMPLES_KEY, JSON.stringify(samples))
  } catch {
    /* quota — non-fatal */
  }
}

function playSuccessBeep(): void {
  try {
    type Ctor = new (options?: AudioContextOptions) => AudioContext
    const Ctor =
      (window.AudioContext as Ctor | undefined) ??
      (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "sine"
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    gain.gain.setValueAtTime(0.1, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.12)
    setTimeout(() => void ctx.close(), 200)
  } catch {
    /* ignore */
  }
}

interface Props {
  open: boolean
  onClose: () => void
  /** Latest raw 63-feature landmarks (from the live MediaPipe loop). */
  getLiveLandmarks: () => number[] | null
  /** Called when the trained model becomes available/unavailable. */
  onModelChanged: (loaded: boolean) => void
}

export function TrainingModePanel({ open, onClose, getLiveLandmarks, onModelChanged }: Props) {
  const [samples, setSamples] = useState<StoredSample[]>(() => loadSamples())
  const [bursting, setBursting] = useState<number | null>(null)
  const [burstCount, setBurstCount] = useState(0)
  const [training, setTraining] = useState(false)
  const [epochLine, setEpochLine] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<TrainingMetrics | null>(null)
  const [modelReady, setModelReady] = useState(() => isModelLoaded())
  const [useTrainedOn, setUseTrainedOn] = useState(() => isModelLoaded())
  const burstTimersRef = useRef<number[]>([])

  const counts = useMemo(() => {
    const c = new Array(GESTURES.length).fill(0) as number[]
    for (const s of samples) if (s.label >= 0 && s.label < GESTURES.length) c[s.label] += 1
    return c
  }, [samples])

  const total = samples.length
  const ready = counts.every((c) => c >= TARGET_PER_GESTURE)

  useEffect(() => {
    if (!open) return
    setModelReady(isModelLoaded())
  }, [open])

  const persist = useCallback((next: StoredSample[]) => {
    setSamples(next)
    persistSamples(next)
  }, [])

  /** Capture one sample for a gesture (uses the latest live landmarks). */
  const captureOne = useCallback(
    (label: number): boolean => {
      const features = getLiveLandmarks()
      if (!features) return false
      persist([...loadSamples(), { features, label }])
      return true
    },
    [getLiveLandmarks, persist],
  )

  /** Burst: 20 samples at 10 Hz with a live counter + success beep. */
  const burst = useCallback(
    (label: number) => {
      if (bursting !== null) return
      setBursting(label)
      setBurstCount(0)
      burstTimersRef.current.forEach((t) => window.clearTimeout(t))
      burstTimersRef.current = []
      let n = 0
      for (let i = 0; i < BURST_COUNT; i++) {
        burstTimersRef.current.push(
          window.setTimeout(
            () => {
              if (captureOne(label)) {
                n += 1
                setBurstCount(n)
              }
              if (i === BURST_COUNT - 1) {
                playSuccessBeep()
                setBursting(null)
              }
            },
            (i * 1000) / BURST_HZ,
          ),
        )
      }
    },
    [bursting, captureOne],
  )

  /** Keyboard: 1-5 quick capture, Shift+1-5 burst. */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return
      const idx = "12345".indexOf(e.key)
      if (idx === -1) return
      e.preventDefault()
      if (e.shiftKey) burst(idx)
      else captureOne(idx)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, burst, captureOne])

  useEffect(() => {
    return () => {
      burstTimersRef.current.forEach((t) => window.clearTimeout(t))
    }
  }, [])

  const handleTrain = useCallback(async () => {
    if (!ready || training) return
    setTraining(true)
    setResult(null)
    setEpochLine(null)
    setProgress(0)
    try {
      const metrics = await trainModel(
        samples.map((s) => ({ landmarks: s.features, label: s.label })),
        {
          onEpoch: (epoch, totalEpochs, logs) => {
            setEpochLine(
              `Epoch ${epoch}/${totalEpochs} — acc: ${(logs.acc ?? 0).toFixed(2)} val_acc: ${(logs.val_acc ?? 0).toFixed(2)}`,
            )
            setProgress(Math.round((epoch / totalEpochs) * 100))
          },
        },
      )
      await saveModel()
      setModelReady(isModelLoaded())
      setUseTrainedOn(true)
      onModelChanged(true)
      setResult(metrics)
    } catch (err) {
      console.error("[TrainingModePanel] train failed:", err)
      setEpochLine(`Training failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setTraining(false)
    }
  }, [ready, training, samples, onModelChanged])

  const handleExport = () => {
    const blob = new Blob([JSON.stringify({ version: 1, samples })], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `vaaksetu-gestures-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "application/json"
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const parsed = JSON.parse(await file.text()) as { samples?: StoredSample[] }
        if (Array.isArray(parsed.samples)) {
          const valid = parsed.samples.filter(
            (s) => Array.isArray(s.features) && s.features.length === 63 && typeof s.label === "number",
          )
          persist([...loadSamples(), ...valid])
        }
      } catch {
        /* invalid file — ignore */
      }
    }
    input.click()
  }

  const handleReset = async () => {
    persist([])
    setBursting(null)
    setResult(null)
    setEpochLine(null)
    if (modelReady) {
      await import("../lib/gestureClassifier").then((m) => m.deleteModel())
      setModelReady(false)
      setUseTrainedOn(false)
      onModelChanged(false)
    }
  }

  const handleUseTrained = () => {
    const next = !useTrainedOn
    setUseTrainedOn(next)
    onModelChanged(next && modelReady)
  }

  if (!open) return null

  const cardStyle: CSSProperties = {
    position: "absolute",
    top: 64,
    right: 14,
    zIndex: 60,
    width: "min(420px, calc(100vw - 28px))",
    maxHeight: "calc(100vh - 90px)",
    overflowY: "auto",
    background: "rgba(15, 17, 23, 0.9)",
    backdropFilter: "blur(24px) saturate(160%)",
    WebkitBackdropFilter: "blur(24px) saturate(160%)",
    border: `1px solid ${COLORS.borderGlass}`,
    borderRadius: RADIUS.lg,
    boxShadow: SHADOW.lg,
    padding: 16,
    fontFamily: FONT,
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.98 }}
      transition={{ duration: 0.2 }}
      style={cardStyle}
      role="dialog"
      aria-label="Gesture training panel"
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>🎓 Fast Train</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close training panel"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 34,
            height: 34,
            borderRadius: RADIUS.pill,
            border: `1px solid ${COLORS.borderGlass}`,
            background: "transparent",
            color: COLORS.textDim,
            cursor: "pointer",
          }}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {/* Gesture rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {GESTURES.map((g, i) => {
          const count = counts[i]
          const ok = count >= TARGET_PER_GESTURE
          return (
            <div
              key={g}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "rgba(255,255,255,0.04)",
                border: `1px solid ${COLORS.borderGlass}`,
                borderRadius: RADIUS.md,
                padding: "8px 10px",
              }}
            >
              <span style={{ fontSize: 20 }} aria-hidden="true">{GESTURE_EMOJI[g] ?? "✋"}</span>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 700, textTransform: "capitalize" }}>
                {g}
                <span style={{ marginLeft: 6, fontSize: 11, color: COLORS.textDim }}>
                  key {i + 1}
                </span>
              </span>
              <span
                style={{
                  fontSize: 12.5,
                  fontWeight: 800,
                  color: ok ? COLORS.success : COLORS.warning,
                  minWidth: 34,
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {count}/{TARGET_PER_GESTURE}
              </span>
              <div
                aria-hidden="true"
                style={{
                  width: 42,
                  height: 5,
                  borderRadius: 3,
                  background: "rgba(255,255,255,0.08)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(100, (count / TARGET_PER_GESTURE) * 100)}%`,
                    background: ok ? COLORS.success : COLORS.accent,
                    transition: "width 0.2s ease",
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => captureOne(i)}
                className="btn-ghost"
                style={{ minHeight: 34, padding: "0 10px", fontSize: 12.5 }}
              >
                Capture
              </button>
              <button
                type="button"
                onClick={() => burst(i)}
                disabled={bursting !== null}
                className="btn-gradient"
                style={{ minHeight: 34, padding: "0 10px", fontSize: 12.5 }}
              >
                {bursting === i ? `${burstCount}/${BURST_COUNT}` : "Burst ×20"}
              </button>
            </div>
          )
        })}
      </div>

      {/* Overall progress */}
      <p style={{ margin: "10px 0 0", fontSize: 12.5, color: COLORS.textDim, fontWeight: 700 }}>
        Total: {total}/{TARGET_PER_GESTURE * GESTURES.length} · hold your pose steady during bursts
      </p>

      {/* Train */}
      <button
        type="button"
        onClick={handleTrain}
        disabled={!ready || training}
        className="btn-gradient"
        style={{
          width: "100%",
          marginTop: 12,
          minHeight: TAP_MIN,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          fontSize: 16,
        }}
      >
        <Brain size={18} strokeWidth={2.4} aria-hidden="true" />
        {training ? "Training…" : "🧠 Train Model"}
      </button>

      {(epochLine || progress > 0) && (
        <div style={{ marginTop: 10 }}>
          {epochLine && (
            <p style={{ margin: "0 0 6px", fontSize: 12.5, fontWeight: 700, color: COLORS.text }}>
              {epochLine}
            </p>
          )}
          <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
            <motion.div
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.2 }}
              style={{ height: "100%", background: COLORS.accent }}
            />
          </div>
        </div>
      )}

      {result && (
        <p style={{ margin: "8px 0 0", fontSize: 13, fontWeight: 800, color: COLORS.success }}>
          Done in {(result.timeMs / 1000).toFixed(1)}s — acc: {Math.round(result.accuracy * 100)}% val_acc:{" "}
          {Math.round(result.valAccuracy * 100)}% ({result.epochsRun} epochs, ~
          {(estimateModelBytes() / 1024).toFixed(0)} KB)
        </p>
      )}

      {/* Dataset + model actions */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <button type="button" onClick={handleExport} className="btn-ghost" style={{ minHeight: 38, padding: "0 12px", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Download size={15} aria-hidden="true" /> Export Dataset
        </button>
        <button type="button" onClick={handleImport} className="btn-ghost" style={{ minHeight: 38, padding: "0 12px", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Upload size={15} aria-hidden="true" /> Import Dataset
        </button>
        {modelReady && (
          <button
            type="button"
            onClick={handleUseTrained}
            aria-pressed={useTrainedOn}
            className="btn-ghost"
            style={{
              minHeight: 38,
              padding: "0 12px",
              fontSize: 13,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              borderColor: useTrainedOn ? COLORS.success : COLORS.borderGlass,
              color: useTrainedOn ? COLORS.success : COLORS.textDim,
            }}
          >
            ✅ Use Trained: {useTrainedOn ? "ON" : "OFF"}
          </button>
        )}
        <button
          type="button"
          onClick={() => void handleReset()}
          className="btn-ghost"
          style={{ minHeight: 38, padding: "0 12px", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6, color: COLORS.danger, borderColor: "rgba(239,68,68,0.4)" }}
        >
          <Trash2 size={15} aria-hidden="true" /> Reset
        </button>
      </div>

      <p style={{ margin: "10px 0 0", fontSize: 11.5, color: COLORS.textDim }}>
        Model: IndexedDB · Dataset: localStorage · Keys: 1–5 capture, Shift+1–5 burst
      </p>
    </motion.div>
  )
}

export default TrainingModePanel
