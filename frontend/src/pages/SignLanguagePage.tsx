import { useCallback, useEffect, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { Link } from "react-router-dom"
import { AnimatePresence, motion } from "motion/react"
import {
  X,
  SwitchCamera,
  Volume2,
  Send,
  Camera,
  CameraOff,
  Plus,
  Eye,
  EyeOff,
  FlipHorizontal2,
  Waves,
} from "lucide-react"
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision"
import { sendMessage } from "../lib/messageBus"
import { speak } from "../lib/speech"
import { classifyGesture as heuristicClassify } from "../lib/gestureHeuristics"
import { DynamicTracker } from "../lib/dynamicGestures"
import { playSuccess, playTap } from "../lib/soundEffects"
import { announce } from "../lib/a11y"
import {
  loadModel,
  predict as modelPredict,
  flattenLandmarks,
} from "../lib/gestureClassifier"
import { TrainingModePanel } from "../components/TrainingModePanel"
import { AvatarPlayer } from "../components/Avatar/AvatarPlayer"
import { ContinuousRecognizer, SEGMENT_DISPLAY } from "../lib/sign/continuousRecognizer"
import { COLORS, FONT, RADIUS, SHADOW, TAP_MIN } from "../theme"

/* ─────────────────────────── Gesture model ─────────────────────────── */

type GestureName = string

/** Model class ids → display names (matches heuristic naming). */
const MODEL_DISPLAY: Record<string, string> = {
  yes: "Yes",
  no: "No / Bad",
  water: "Three",
  food: "Eat / Food",
  help: "Help / Emergency",
}

interface GestureDef {
  name: GestureName
  hint: string
  dynamic?: boolean
}

const GESTURES: GestureDef[] = [
  { name: "Stop / Wait", hint: "Open palm — all 5 fingers extended" },
  { name: "Yes", hint: "Fist — all fingers closed" },
  { name: "OK / Good", hint: "Thumb up, others folded" },
  { name: "No / Bad", hint: "Thumb pointing down" },
  { name: "Point / Attention", hint: "Index only, pointing up" },
  { name: "Me / I", hint: "Index pointing at your chest" },
  { name: "You", hint: "Index pointing forward" },
  { name: "Peace / Two", hint: "Index + middle extended" },
  { name: "Three", hint: "Three fingers extended" },
  { name: "Four", hint: "Four fingers, thumb tucked" },
  { name: "Help / Emergency", hint: "Pinky only extended" },
  { name: "Perfect", hint: "Thumb + index circle" },
  { name: "I love you", hint: "Thumb + index + pinky" },
  { name: "Hope", hint: "Index + middle crossed" },
  { name: "Eat / Food", hint: "Closed hand near mouth" },
  { name: "Hello", hint: "Open palm waving side to side", dynamic: true },
  { name: "Come here", hint: "Palm nodding downward", dynamic: true },
  { name: "More", hint: "Palm rotating at chest", dynamic: true },
  { name: "Give me", hint: "Hand moving toward camera", dynamic: true },
  { name: "Please", hint: "Both palms together", dynamic: true },
]

/** Mirror the selfie view: landmarks come in camera space, we draw mirrored. */
const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]

const HOLD_MS = 800
const DYNAMIC_HOLD_MS = 1200

interface Landmark {
  x: number
  y: number
  z: number
}

/* ─────────────────────────── Sub components ─────────────────────────── */

function ConfidenceRing({ value, accepted }: { value: number; accepted: boolean }) {
  const radius = 34
  const circumference = 2 * Math.PI * radius
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" role="img" aria-label={`Hold confidence ${clamped}%`}>
      <circle cx="42" cy="42" r={radius} fill="none" stroke="rgba(148,163,184,0.25)" strokeWidth="7" />
      <circle
        cx="42"
        cy="42"
        r={radius}
        fill="none"
        stroke={accepted ? COLORS.success : clamped < 50 ? COLORS.danger : COLORS.accentBright}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped / 100)}
        transform="rotate(-90 42 42)"
        style={{ transition: "stroke-dashoffset 0.1s linear, stroke 0.2s ease" }}
      />
      <text x="42" y="47" textAnchor="middle" fontSize="17" fontWeight="800" fill={COLORS.text} fontFamily={FONT}>
        {Math.round(clamped)}%
      </text>
    </svg>
  )
}

/** Demo-mode gallery: all 20 gestures + hints when detection is offline. */
function DemoGallery() {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", padding: "8px 4px" }}>
      {GESTURES.map((g) => (
        <div
          key={g.name}
          title={g.hint}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
            background: "rgba(30,41,59,0.55)",
            border: `1px solid ${COLORS.borderGlass}`,
            borderRadius: RADIUS.md,
            padding: "10px 14px",
            minWidth: 96,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 800, color: g.dynamic ? COLORS.violet : COLORS.text }}>{g.name}</span>
          <span style={{ fontSize: 10.5, color: COLORS.textDim, textAlign: "center" }}>{g.hint}</span>
        </div>
      ))}
    </div>
  )
}

/* ─────────────────────────── Page ─────────────────────────── */

type LoadState = "loading" | "ready" | "denied" | "failed"

export default function SignLanguagePage() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef(0)
  const runningRef = useRef(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const fpsLastRef = useRef<number | null>(null)

  // Gesture stability tracking (refs so the rAF loop stays mutation-free).
  const candidateRef = useRef<GestureName | null>(null)
  const candidateSinceRef = useRef(0)
  const acceptedRef = useRef<GestureName | null>(null)
  const acceptedAtRef = useRef(0)
  const holdRef = useRef(0)

  // Dynamic gesture tracker (per-frame motion analysis).
  const dynamicTrackerRef = useRef<DynamicTracker>(new DynamicTracker())

  // Sentence builder.
  const [sentence, setSentence] = useState<string[]>([])

  // ── Continuous mode (Phase 4) ──
  const [continuousMode, setContinuousMode] = useState(false)
  const [continuousSentence, setContinuousSentence] = useState<string[]>([])
  const recognizerRef = useRef<ContinuousRecognizer | null>(null)
  const contPushBusyRef = useRef(false)

  // Wide viewport flag (avatar echo panel is desktop-only).
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1024)
  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= 1024)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  const [loadState, setLoadState] = useState<LoadState>("loading")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [fps, setFps] = useState(0)
  const [gesture, setGesture] = useState<GestureName | null>(null)
  const [holdPct, setHoldPct] = useState(0)
  const [accepted, setAccepted] = useState<GestureName | null>(null)
  const [handsVisible, setHandsVisible] = useState(false)
  const [facing, setFacing] = useState<"user" | "environment">("user")
  const [showOverlay, setShowOverlay] = useState(true)
  const [mirror, setMirror] = useState(true)
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false)
  const [sentToast, setSentToast] = useState<string | null>(null)
  const [retryNonce, setRetryNonce] = useState(0)

  // Trained-model state (TF.js is lazy — never imported on page open).
  const [hasModel, setHasModel] = useState(false)
  const [useTrained, setUseTrained] = useState(false)
  const [trainPanelOpen, setTrainPanelOpen] = useState(false)
  const liveLandmarksRef = useRef<number[] | null>(null)
  const lastPredictAtRef = useRef(0)
  const predictBusyRef = useRef(false)

  /* ── Web Audio beep on gesture accept ── */
  const playAcceptBeep = useCallback(() => {
    try {
      type AudioCtxCtor = new (options?: AudioContextOptions) => AudioContext
      const Ctor: AudioCtxCtor | undefined =
        audioCtxRef.current
          ? undefined
          : (window.AudioContext as AudioCtxCtor | undefined) ??
            (window as unknown as { webkitAudioContext?: AudioCtxCtor }).webkitAudioContext
      if (!audioCtxRef.current) {
        if (!Ctor) return
        audioCtxRef.current = new Ctor()
      }
      const ctx: AudioContext = audioCtxRef.current
      if (ctx.state === "suspended") void ctx.resume()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "sine"
      osc.frequency.setValueAtTime(1040, ctx.currentTime)
      gain.gain.setValueAtTime(0.12, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16)
      osc.connect(gain).connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.16)
    } catch {
      /* audio unavailable — non-fatal */
    }
  }, [])

  /* ── Canvas overlay drawing ── */
  const drawOverlay = useCallback(
    (hands: Landmark[][] | null) => {
      const canvas = canvasRef.current
      const video = videoRef.current
      if (!canvas || !video) return
      const w = video.videoWidth || 640
      const h = video.videoHeight || 480
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      ctx.clearRect(0, 0, w, h)
      if (!showOverlay) return
      if (!hands || hands.length === 0) return

      const vw = w
      const vh = h
      const cw = canvas.clientWidth || vw
      const ch = canvas.clientHeight || vh
      const scale = Math.max(cw / vw, ch / vh)
      const dw = vw * scale
      const dh = vh * scale
      const ox = (cw - dw) / 2
      const oy = (ch - dh) / 2
      const flip = facing === "user" ? mirror : mirror

      const map = (p: Landmark) => {
        const x = ox + p.x * dw
        const y = oy + p.y * dh
        return flip ? { x: cw - x, y } : { x, y }
      }

      for (const lm of hands) {
        ctx.save()
        ctx.shadowColor = "rgba(0, 224, 255, 0.8)"
        ctx.shadowBlur = 18
        ctx.strokeStyle = "rgba(0, 224, 255, 0.55)"
        ctx.lineWidth = 3
        for (const [a, b] of HAND_CONNECTIONS) {
          const pa = map(lm[a])
          const pb = map(lm[b])
          ctx.beginPath()
          ctx.moveTo(pa.x, pa.y)
          ctx.lineTo(pb.x, pb.y)
          ctx.stroke()
        }
        ctx.restore()
        ctx.fillStyle = "#00E0FF"
        for (const p of lm) {
          const pt = map(p)
          ctx.beginPath()
          ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    },
    [facing, showOverlay, mirror],
  )

  /* ── Lazy model load on mount ── */
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const ok = await loadModel()
      if (!cancelled && ok) {
        setHasModel(true)
        setUseTrained(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /* ── Detection loop ── */
  const tick = useCallback(() => {
    if (!runningRef.current) return
    const video = videoRef.current
    const landmarker = landmarkerRef.current
    if (video && landmarker && video.readyState >= 2 && video.videoWidth > 0) {
      try {
        const now = performance.now()
        const result = landmarker.detectForVideo(video, now)
        const hands = (result?.landmarks ?? []) as unknown as Landmark[][]

        const last = fpsLastRef.current
        if (last) {
          const inst = 1000 / Math.max(1, now - last)
          setFps((prev) => (prev === 0 ? inst : prev * 0.9 + inst * 0.1))
        }
        fpsLastRef.current = now

        setHandsVisible(hands.length > 0)

        if (hands.length > 0) {
          liveLandmarksRef.current = flattenLandmarks(hands[0])
        } else {
          liveLandmarksRef.current = null
        }

        // Two hands close together → dynamic "Please" candidate.
        let twoHands = false
        if (hands.length >= 2) {
          const a = hands[0][0]
          const b = hands[1][0]
          if (a && b) {
            const dx = a.x - b.x
            const dy = a.y - b.y
            twoHands = Math.sqrt(dx * dx + dy * dy) < 0.25
          }
        }

        // Continuous recognition (Phase 4): segment + classify the stream.
        if (continuousMode) {
          if (!recognizerRef.current) recognizerRef.current = new ContinuousRecognizer()
          if (!contPushBusyRef.current) {
            contPushBusyRef.current = true
            const seg = recognizerRef.current.push(hands[0] ?? null, now)
            contPushBusyRef.current = false
            if (seg) {
              const label = SEGMENT_DISPLAY[seg.label] ?? seg.label
              setContinuousSentence((prev) => [...prev, label].slice(-8))
              playAcceptBeep()
              announce(`Sign recognized: ${label}`)
            }
          }
        } else if (recognizerRef.current) {
          recognizerRef.current.reset()
        }

        // Dynamic gestures from motion history.
        let detected: GestureName | null = null
        if (hands.length > 0) {
          const dyn = dynamicTrackerRef.current.push(now, hands[0], twoHands, facing === "user")
          if (dyn) {
            detected = dyn.gesture
            holdRef.current = dyn.confidence
          }
        } else {
          dynamicTrackerRef.current.reset()
        }

        // Static classification (model when enabled, else heuristics).
        // Paused while continuous mode owns recognition.
        if (hands.length > 0 && !detected && !continuousMode) {
          const wantModel = useTrained && hasModel && !predictBusyRef.current
          const canPredict = now - lastPredictAtRef.current >= 100
          if (wantModel && canPredict) {
            predictBusyRef.current = true
            lastPredictAtRef.current = now
            const features = liveLandmarksRef.current
            if (features) {
              void modelPredict(features)
                .then((pred) => {
                  if (pred.confidence >= 0.6 && !acceptedRef.current) {
                    candidateRef.current = MODEL_DISPLAY[pred.gesture] ?? pred.gesture
                    candidateSinceRef.current = performance.now()
                  }
                })
                .catch(() => setUseTrained(false))
                .finally(() => {
                  predictBusyRef.current = false
                })
            } else {
              predictBusyRef.current = false
            }
          }
          if (!wantModel) {
            const h = heuristicClassify(hands[0])
            detected = h ? (h.gesture as GestureName) : null
            if (h) holdRef.current = h.confidence
          }
        }

        // Confidence gating: hold-to-accept (800ms static / 1.2s dynamic).
        const isDynamic = detected != null && ["Hello", "Come here", "More", "Give me", "Please"].includes(detected)
        const requiredHold = isDynamic ? DYNAMIC_HOLD_MS : HOLD_MS
        const prevAccepted = acceptedRef.current
        if (detected && detected === candidateRef.current) {
          const heldFor = now - candidateSinceRef.current
          holdRef.current = Math.max(holdRef.current, Math.min(1, heldFor / requiredHold))
          if (heldFor >= requiredHold && detected !== prevAccepted) {
            acceptedRef.current = detected
            acceptedAtRef.current = now
            playAcceptBeep()
            playSuccess()
            announce(`Detected: ${detected}`)
          }
        } else if (detected) {
          candidateRef.current = detected
          candidateSinceRef.current = now
          holdRef.current = Math.min(holdRef.current, 0.2)
          if (!detected && now - acceptedAtRef.current > 1400) {
            acceptedRef.current = null
          }
        } else {
          holdRef.current = Math.max(0, holdRef.current - 0.06)
          if (now - acceptedAtRef.current > 1400) {
            acceptedRef.current = null
          }
        }

        setGesture(detected)
        setHoldPct(holdRef.current * 100)
        setAccepted(acceptedRef.current)

        drawOverlay(hands)
      } catch {
        /* per-frame errors are non-fatal */
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [drawOverlay, playAcceptBeep, useTrained, hasModel, facing, continuousMode])

  /* ── Camera + MediaPipe lifecycle ── */
  useEffect(() => {
    let cancelled = false

    async function start() {
      setLoadState("loading")
      setErrorMsg(null)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play().catch(() => undefined)
        }

        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
        )
        if (cancelled) return
        landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
        })
        if (cancelled) return

        setLoadState("ready")
        runningRef.current = true
        rafRef.current = requestAnimationFrame(tick)
      } catch (err) {
        if (cancelled) return
        const name = (err as { name?: string })?.name ?? ""
        if (name === "NotAllowedError" || name === "SecurityError") {
          setLoadState("denied")
        } else {
          setLoadState("failed")
          setErrorMsg(err instanceof Error ? err.message : String(err))
        }
      }
    }

    void start()

    return () => {
      cancelled = true
      runningRef.current = false
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      try {
        landmarkerRef.current?.close()
      } catch {
        /* ignore */
      }
      landmarkerRef.current = null
      void audioCtxRef.current?.close().catch(() => undefined)
      audioCtxRef.current = null
      fpsLastRef.current = null
    }
  }, [facing, tick, retryNonce])

  // Re-render the overlay when toggles change.
  useEffect(() => {
    if (loadState === "ready") drawOverlay(null)
  }, [facing, loadState, drawOverlay])

  // Probe how many video inputs exist (for the switch-camera button).
  useEffect(() => {
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((devices) => {
        setHasMultipleCameras(devices.filter((d) => d.kind === "videoinput").length > 1)
      })
      .catch(() => undefined)
  }, [])

  /* ── Actions ── */
  const handleSpeak = () => {
    if (!accepted) return
    playTap()
    speak(accepted)
  }

  const handleSend = () => {
    if (!accepted) return
    sendMessage({
      id: `sign-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: "sign",
      text: accepted,
      confidence: Math.round(holdPct) || 90,
      timestamp: Date.now(),
    })
    setSentToast(`${accepted} sent to guardian ✓`)
    window.setTimeout(() => setSentToast(null), 2400)
  }

  const handleAddToSentence = () => {
    if (!accepted) return
    playTap()
    setSentence((prev) => [...prev, accepted].slice(-8))
    acceptedRef.current = null
    setAccepted(null)
  }

  const speakSentence = () => {
    if (sentence.length === 0) return
    speak(sentence.join(" "))
  }

  const statusLabel =
    loadState === "loading"
      ? "Starting camera & detection…"
      : loadState === "denied"
        ? "Camera access required"
        : loadState === "failed"
          ? "Gesture detection unavailable — showing demo mode"
          : !handsVisible
            ? "Show your hand to the camera"
            : accepted
              ? `✓ Detected: ${accepted}`
              : gesture
                ? holdPct < 50
                  ? "Not sure — hold steady…"
                  : "Hold steady…"
                : "Ready"

  /* ── Global shortcut: Ctrl+Shift+T toggles the training panel ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "T" || e.key === "t")) {
        e.preventDefault()
        setTrainPanelOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const glassPanel: CSSProperties = {
    background: "rgba(30, 41, 59, 0.62)",
    backdropFilter: "blur(20px) saturate(160%)",
    WebkitBackdropFilter: "blur(20px) saturate(160%)",
    border: `1px solid ${COLORS.borderGlass}`,
    borderRadius: RADIUS.xl,
    boxShadow: SHADOW.lg,
  }

  const iconBtn: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 48,
    height: 48,
    borderRadius: RADIUS.pill,
    background: "rgba(10, 25, 41, 0.62)",
    backdropFilter: "blur(20px) saturate(160%)",
    WebkitBackdropFilter: "blur(20px) saturate(160%)",
    border: `1px solid ${COLORS.borderGlass}`,
    color: COLORS.text,
    cursor: "pointer",
    boxShadow: SHADOW.sm,
  }

  const actionBtn = (disabled: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: TAP_MIN,
    padding: "10px 18px",
    fontSize: 15,
    fontWeight: 800,
    borderRadius: RADIUS.md,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    fontFamily: FONT,
  })

  const demoMode = loadState === "failed"

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      style={{
        position: "relative",
        minHeight: "100vh",
        width: "100%",
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: FONT,
        overflow: "hidden",
      }}
    >
      {/* Full-screen camera preview */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: facing === "user" && mirror ? "scaleX(-1)" : "none",
          background: COLORS.bg,
        }}
      />
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      />

      {/* Training mode panel (Ctrl+Shift+T) */}
      <AnimatePresence>
        {trainPanelOpen && (
          <TrainingModePanel
            open={trainPanelOpen}
            onClose={() => setTrainPanelOpen(false)}
            getLiveLandmarks={() => liveLandmarksRef.current}
            onModelChanged={(loaded) => {
              setHasModel(loaded)
              setUseTrained(loaded)
            }}
          />
        )}
      </AnimatePresence>

      {/* Top-left: close */}
      <Link to="/" aria-label="Close sign language page" style={{ position: "absolute", top: 16, left: 16, zIndex: 20, ...iconBtn }}>
        <X size={22} strokeWidth={2.6} aria-hidden="true" />
      </Link>

      {/* Top-left stack: mirror + overlay toggles */}
      <div style={{ position: "absolute", top: 76, left: 16, zIndex: 20, display: "flex", flexDirection: "column", gap: 8 }}>
        <button type="button" onClick={() => setMirror((m) => !m)} aria-pressed={mirror} aria-label="Toggle mirror view" style={iconBtn}>
          <FlipHorizontal2 size={20} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => setShowOverlay((o) => !o)} aria-pressed={showOverlay} aria-label="Toggle landmark overlay" style={iconBtn}>
          {showOverlay ? <Eye size={20} aria-hidden="true" /> : <EyeOff size={20} aria-hidden="true" />}
        </button>
        <button
          type="button"
          onClick={() => {
            setContinuousMode((c) => !c)
            setContinuousSentence([])
            recognizerRef.current?.reset()
          }}
          aria-pressed={continuousMode}
          aria-label="Toggle continuous sign language mode"
          style={{ ...iconBtn, width: "auto", padding: "0 14px", gap: 7, fontSize: 13, fontWeight: 800, color: continuousMode ? COLORS.accentBright : COLORS.text, borderColor: continuousMode ? "rgba(0,224,255,0.5)" : COLORS.borderGlass }}
        >
          <Waves size={18} aria-hidden="true" /> Continuous {continuousMode ? "ON" : "OFF"}
        </button>
      </div>

      {/* Top-right: switch camera */}
      {hasMultipleCameras && loadState === "ready" && (
        <button
          type="button"
          onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
          aria-label="Switch camera"
          style={{ position: "absolute", top: 16, right: 16, zIndex: 20, ...iconBtn, width: "auto", padding: "0 16px", gap: 8, fontSize: 14, fontWeight: 700 }}
        >
          <SwitchCamera size={19} strokeWidth={2.4} aria-hidden="true" /> Switch
        </button>
      )}

      {/* FPS counter */}
      {loadState === "ready" && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: hasMultipleCameras ? 76 : 16,
            right: 16,
            zIndex: 20,
            display: "inline-flex",
            alignItems: "center",
            padding: "6px 12px",
            borderRadius: RADIUS.pill,
            background: "rgba(10, 25, 41, 0.62)",
            border: `1px solid ${COLORS.borderGlass}`,
            fontSize: 12.5,
            fontWeight: 800,
            color: COLORS.accentBright,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {Math.round(fps)} FPS
        </div>
      )}

      {/* Avatar echo — signs back the accepted gesture (desktop) */}
      {wide && (accepted || sentence.length > 0) && (
        <div
          aria-label="Avatar signing your gesture back"
          style={{
            position: "absolute",
            left: 16,
            bottom: 210,
            zIndex: 20,
            width: 168,
            padding: "8px 8px 6px",
            borderRadius: RADIUS.lg,
            background: "rgba(10, 25, 41, 0.78)",
            backdropFilter: "blur(20px) saturate(160%)",
            WebkitBackdropFilter: "blur(20px) saturate(160%)",
            border: `1px solid ${COLORS.borderGlass}`,
            boxShadow: SHADOW.md,
            textAlign: "center",
          }}
        >
          <AvatarPlayer text={accepted ?? sentence.join(" ")} size={136} compact />
          <p style={{ margin: "2px 0 0", fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", color: COLORS.textDim }}>
            Avatar echo
          </p>
        </div>
      )}

      {/* Status strip */}
      <div
        role="status"
        aria-live="polite"
        style={{
          position: "absolute",
          top: 16,
          left: hasMultipleCameras ? 180 : 130,
          right: hasMultipleCameras ? 110 : 96,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "8px 16px",
          borderRadius: RADIUS.pill,
          background: "rgba(10, 25, 41, 0.55)",
          border: `1px solid ${COLORS.borderGlass}`,
          fontSize: 13,
          fontWeight: 700,
          color: accepted ? COLORS.success : COLORS.textDim,
          pointerEvents: "none",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {statusLabel}
        {loadState === "ready" && handsVisible && !accepted && (
          <span style={{ marginLeft: 8, color: COLORS.success }}>● live</span>
        )}
      </div>

      {/* Bottom glass panel */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 20, display: "flex", justifyContent: "center", padding: "0 14px max(14px, env(safe-area-inset-bottom))" }}>
        <div
          style={{
            ...glassPanel,
            width: "min(860px, 100%)",
            padding: "14px 20px",
            display: "flex",
            alignItems: "center",
            gap: 18,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 220 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: 1.6, color: COLORS.textDim, textTransform: "uppercase" }}>
              Detected gesture
            </p>
            <div
              aria-live="polite"
              style={{
                fontSize: "clamp(40px, 8vw, 72px)",
                fontWeight: 900,
                lineHeight: 1.05,
                letterSpacing: 1,
                color: accepted ? COLORS.success : COLORS.accentBright,
                textShadow: `0 0 28px ${accepted ? "rgba(34, 197, 94, 0.45)" : "rgba(0, 224, 255, 0.45)"}`,
                minHeight: 68,
              }}
            >
              {accepted ? `✓ ${accepted}` : (gesture ?? "—")}
            </div>
            {/* Sentence builder strip */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap", minHeight: 30 }}>
              {sentence.map((w, i) => (
                <span key={`${w}-${i}`} style={{ background: "rgba(0,224,255,0.09)", border: "1px solid rgba(0,224,255,0.4)", borderRadius: RADIUS.pill, padding: "2px 10px", fontSize: 13, fontWeight: 800 }}>
                  {w}
                </span>
              ))}
              {sentence.length > 0 && (
                <button type="button" onClick={() => setSentence([])} aria-label="Clear the sentence" style={{ background: "transparent", border: "none", color: COLORS.textDim, fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
                  clear
                </button>
              )}
            </div>
            {/* Continuous-mode recognized sentence (Phase 4) */}
            {continuousMode && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap", minHeight: 30 }} role="status" aria-live="polite">
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", color: COLORS.accentBright }}>
                  Continuous:
                </span>
                {continuousSentence.length === 0 ? (
                  <span style={{ fontSize: 12.5, color: COLORS.textDim }}>sign a phrase — recognized words appear here</span>
                ) : (
                  <>
                    {continuousSentence.map((w, i) => (
                      <span key={`${w}-${i}`} style={{ background: "rgba(124,58,237,0.14)", border: "1px solid rgba(124,58,237,0.5)", borderRadius: RADIUS.pill, padding: "2px 10px", fontSize: 13, fontWeight: 800 }}>
                        {w}
                      </span>
                    ))}
                    <button type="button" onClick={() => speak(continuousSentence.join(" "))} className="btn-ghost" aria-label="Speak the recognized sentence" style={{ minHeight: 34, padding: "0 10px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <Volume2 size={14} aria-hidden="true" /> Speak
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        sendMessage({
                          id: `cont-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                          type: "sign",
                          text: continuousSentence.join(" "),
                          confidence: 80,
                          timestamp: Date.now(),
                        })
                        setSentToast("Continuous sentence sent ✓")
                        window.setTimeout(() => setSentToast(null), 2400)
                      }}
                      className="btn-ghost"
                      aria-label="Send the recognized sentence to the guardian"
                      style={{ minHeight: 34, padding: "0 10px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 }}
                    >
                      <Send size={13} aria-hidden="true" /> Send
                    </button>
                    <button type="button" onClick={() => setContinuousSentence([])} aria-label="Clear the continuous sentence" style={{ background: "transparent", border: "none", color: COLORS.textDim, fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
                      clear
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <ConfidenceRing value={holdPct} accepted={Boolean(accepted)} />
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <button type="button" onClick={handleSpeak} disabled={!accepted} className="btn-gradient" style={actionBtn(!accepted)}>
                <Volume2 size={17} strokeWidth={2.5} aria-hidden="true" /> 🔊 Speak
              </button>
              <button type="button" onClick={handleAddToSentence} disabled={!accepted} className="btn-ghost" style={actionBtn(!accepted)}>
                <Plus size={16} strokeWidth={2.5} aria-hidden="true" /> Add to sentence
              </button>
              <button
                type="button"
                onClick={sentence.length > 0 ? speakSentence : handleSend}
                disabled={accepted ? false : sentence.length === 0}
                className="btn-ghost"
                style={actionBtn(!accepted && sentence.length === 0)}
              >
                <Send size={16} strokeWidth={2.5} aria-hidden="true" /> {sentence.length > 0 ? "Speak sentence + Send" : "Send to Guardian"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Fallback: camera denied ── */}
      {loadState === "denied" && (
        <div style={{ position: "absolute", inset: 0, zIndex: 30, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, background: "rgba(10, 25, 41, 0.9)", textAlign: "center", padding: 24 }}>
          <CameraOff size={56} color={COLORS.danger} aria-hidden="true" />
          <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0 }}>Camera access required</h1>
          <p style={{ margin: 0, fontSize: 16, color: COLORS.textDim, maxWidth: 460 }}>
            VaakSetu needs the camera to read your hand gestures. Nothing is recorded or uploaded — detection runs entirely on this device.
          </p>
          <button type="button" onClick={() => setRetryNonce((n) => n + 1)} className="btn-gradient" style={{ ...actionBtn(false), padding: "12px 28px", fontSize: 17 }}>
            <Camera size={18} strokeWidth={2.5} aria-hidden="true" /> Retry camera
          </button>
          <details style={{ maxWidth: 560, color: COLORS.textDim, fontSize: 14 }}>
            <summary style={{ cursor: "pointer", fontWeight: 700, marginBottom: 6 }}>Camera unavailable? Preview the gesture set (demo mode)</summary>
            <DemoGallery />
          </details>
        </div>
      )}

      {/* ── Fallback: MediaPipe failed → demo mode ── */}
      {demoMode && (
        <div style={{ position: "absolute", inset: 0, zIndex: 30, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, background: "rgba(10, 25, 41, 0.9)", padding: 24, overflowY: "auto" }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, textAlign: "center" }}>
            Gesture detection unavailable — showing demo mode
          </h1>
          <p style={{ margin: 0, fontSize: 14.5, color: COLORS.textDim, textAlign: "center", maxWidth: 520 }}>
            {errorMsg ? `Model/WASM could not load (${errorMsg}). ` : ""}
            These are the 20 gestures the camera normally recognizes:
          </p>
          <DemoGallery />
          <Link to="/" className="btn-ghost" style={{ ...actionBtn(false), textDecoration: "none" }}>
            Back home
          </Link>
        </div>
      )}

      {/* Accepted-gesture toast */}
      {sentToast && (
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          role="status"
          style={{
            position: "absolute",
            left: "50%",
            bottom: 190,
            transform: "translateX(-50%)",
            zIndex: 40,
            background: "rgba(16, 185, 129, 0.92)",
            color: "#04291B",
            borderRadius: RADIUS.pill,
            padding: "10px 20px",
            fontSize: 15,
            fontWeight: 800,
            boxShadow: "0 8px 30px rgba(16, 185, 129, 0.4)",
          }}
        >
          {sentToast}
        </motion.div>
      )}
    </motion.div>
  )
}
