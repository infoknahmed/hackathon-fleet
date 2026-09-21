import { useCallback, useEffect, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { Link } from "react-router-dom"
import { motion } from "motion/react"
import {
  X,
  SwitchCamera,
  Volume2,
  Send,
  Camera,
  CameraOff,
  Hand,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision"
import { sendMessage, getUserId } from "../lib/messageBus"
import { speak } from "../lib/speech"
import { COLORS, FONT, RADIUS, SHADOW, TAP_MIN } from "../theme"

/* ─────────────────────────── Gesture model ─────────────────────────── */

type GestureName =
  | "Stop"
  | "Yes"
  | "OK"
  | "No"
  | "Peace"
  | "Point"
  | "Hello"
  | "Water"
  | "Food"
  | "Help"

interface GestureDef {
  name: GestureName
  icon: LucideIcon
  /** Shown in demo mode when MediaPipe cannot load. */
  hint: string
}

const GESTURES: GestureDef[] = [
  { name: "Stop", icon: Hand, hint: "Open palm — all 5 fingers extended" },
  { name: "Yes", icon: Hand, hint: "Fist — all fingers closed" },
  { name: "OK", icon: Hand, hint: "Thumbs up — only thumb, pointing up" },
  { name: "No", icon: Hand, hint: "Thumbs down — only thumb, pointing down" },
  { name: "Peace", icon: Hand, hint: "Index + middle extended" },
  { name: "Point", icon: Hand, hint: "Index only extended" },
  { name: "Hello", icon: Hand, hint: "Open palm moved side to side" },
  { name: "Water", icon: Hand, hint: "Three fingers extended" },
  { name: "Food", icon: Hand, hint: "Four fingers extended" },
  { name: "Help", icon: Hand, hint: "Pinky only extended" },
]

/** Mirror the selfie view: landmarks come in camera space, we draw mirrored. */
const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],       // index
  [5, 9], [9, 10], [10, 11], [11, 12],  // middle
  [9, 13], [13, 14], [14, 15], [15, 16],// ring
  [13, 17], [17, 18], [18, 19], [19, 20],// pinky
  [0, 17],                              // palm base
]

const HOLD_MS = 1000
const WAVE_WINDOW_MS = 900

interface Landmark {
  x: number
  y: number
  z: number
}

/**
 * Finger extension heuristics.
 * For an upright hand: a finger is extended when its tip sits above its MCP
 * (smaller y). For the thumb, "up" vs "down" is judged against the wrist.
 * (Signs reference the spec's tip-vs-MCP rule.)
 */
function countExtended(landmarks: Landmark[]): {
  thumb: boolean
  index: boolean
  middle: boolean
  ring: boolean
  pinky: boolean
} {
  const [, thumbMcp, , , thumbTip, indexMcp, , , indexTip, middleMcp, , , middleTip, ringMcp, , , ringTip, pinkyMcp, , , pinkyTip] =
    landmarks
  return {
    thumb: Boolean(thumbTip && thumbMcp && thumbTip.y < thumbMcp.y),
    index: Boolean(indexTip && indexMcp && indexTip.y < indexMcp.y),
    middle: Boolean(middleTip && middleMcp && middleTip.y < middleMcp.y),
    ring: Boolean(ringTip && ringMcp && ringTip.y < ringMcp.y),
    pinky: Boolean(pinkyTip && pinkyMcp && pinkyTip.y < pinkyMcp.y),
  }
}

function countFingers(e: ReturnType<typeof countExtended>): number {
  return [e.index, e.middle, e.ring, e.pinky].filter(Boolean).length
}

/** Classify one hand's landmarks into a gesture, or null when ambiguous. */
function classifyGesture(landmarks: Landmark[], motionDx: number): GestureName | null {
  const e = countExtended(landmarks)
  const fingers = countFingers(e)
  const thumbTip = landmarks[4]
  const wrist = landmarks[0]

  if (fingers === 4) return "Food" // four fingers (thumb may or may not join)

  if (fingers === 0 && e.thumb) {
    if (thumbTip && wrist) {
      const dy = wrist.y - thumbTip.y
      if (dy > 0.06) return "OK" // thumb tip clearly above wrist → up
      if (dy < -0.06) return "No" // thumb tip clearly below wrist → down
    }
    return null
  }

  if (fingers === 0 && !e.thumb) return "Yes" // fist
  if (fingers === 1 && e.index) return "Point"
  if (fingers === 1 && e.pinky) return "Help"
  if (fingers === 2 && e.index && e.middle) return "Peace"

  if (fingers === 3) {
    if (e.index && e.middle && e.ring) return "Water"
    if (e.index && e.pinky) return null // thumb+index+pinky: ambiguous
    return null
  }

  if (fingers === 5) {
    return Math.abs(motionDx) > 0.12 ? "Hello" : "Stop" // palm in motion = wave
  }
  return null
}

/* ─────────────────────────── Sub components ─────────────────────────── */

function ConfidenceRing({ value, accepted }: { value: number; accepted: boolean }) {
  const radius = 34
  const circumference = 2 * Math.PI * radius
  const clamped = Math.min(100, Math.max(0, value))
  // value is the ring fill; (spec ratio kept inline)
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" role="img" aria-label={`Hold confidence ${clamped}%`}>
      <circle cx="42" cy="42" r={radius} fill="none" stroke="rgba(148,163,184,0.25)" strokeWidth="7" />
      <circle
        cx="42"
        cy="42"
        r={radius}
        fill="none"
        stroke={accepted ? COLORS.success : COLORS.accentBright}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped / 100)}
        transform="rotate(-90 42 42)"
        style={{ transition: "stroke-dashoffset 0.1s linear, stroke 0.2s ease" }}
      />
      <text
        x="42"
        y="47"
        textAnchor="middle"
        fontSize="17"
        fontWeight="800"
        fill={COLORS.text}
        fontFamily={FONT}
      >
        {Math.round(clamped)}%
      </text>
    </svg>
  )
}

/** Small demo-mode gallery: static hands + hints when detection is offline. */
function DemoGallery() {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        flexWrap: "wrap",
        justifyContent: "center",
        padding: "8px 4px",
      }}
    >
      {GESTURES.map((g) => {
        const Icon = g.icon
        return (
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
            <Icon size={22} color={COLORS.accentBright} aria-hidden="true" />
            <span style={{ fontSize: 14, fontWeight: 800, color: COLORS.text }}>{g.name}</span>
            <span style={{ fontSize: 10.5, color: COLORS.textDim, textAlign: "center" }}>{g.hint}</span>
          </div>
        )
      })}
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
  const rafRef = useRef<number>(0)
  const runningRef = useRef(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const fpsLastRef = useRef<number | null>(null)

  // Gesture stability tracking (refs so the rAF loop stays mutation-free).
  const candidateRef = useRef<GestureName | null>(null)
  const candidateSinceRef = useRef(0)
  const acceptedRef = useRef<GestureName | null>(null)
  const acceptedAtRef = useRef(0)
  const waveSampleRef = useRef<{ t: number; x: number }[]>([])
  const holdRef = useRef(0)

  const [loadState, setLoadState] = useState<LoadState>("loading")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [fps, setFps] = useState(0)
  const [gesture, setGesture] = useState<GestureName | null>(null)
  const [holdPct, setHoldPct] = useState(0)
  const [accepted, setAccepted] = useState<GestureName | null>(null)
  const [handsVisible, setHandsVisible] = useState(false)
  const [facing, setFacing] = useState<"user" | "environment">("user")
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false)
  const [sentToast, setSentToast] = useState<string | null>(null)
  const [retryNonce, setRetryNonce] = useState(0)

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
      if (!hands || hands.length === 0) return

      // Cover-fit transform: video uses object-fit:cover, so the overlay must
      // crop/scale identically to keep landmarks glued to the hand.
      const vw = w
      const vh = h
      const cw = canvas.clientWidth || vw
      const ch = canvas.clientHeight || vh
      const scale = Math.max(cw / vw, ch / vh)
      const dw = vw * scale
      const dh = vh * scale
      const ox = (cw - dw) / 2
      const oy = (ch - dh) / 2
      const mirror = facing === "user"

      const map = (p: Landmark) => {
        const x = ox + p.x * dw
        const y = oy + p.y * dh
        return mirror ? { x: cw - x, y } : { x, y }
      }

      for (const lm of hands) {
        // Soft glow first, then crisp strokes and dots on top.
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
    [facing],
  )

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

        // FPS (EMA smoothed).
        const last = fpsLastRef.current
        if (last) {
          const inst = 1000 / Math.max(1, now - last)
          setFps((prev) => (prev === 0 ? inst : prev * 0.9 + inst * 0.1))
        }
        fpsLastRef.current = now

        setHandsVisible(hands.length > 0)

        // Wave detection: horizontal palm motion across recent frames.
        let motionDx = 0
        if (hands.length > 0) {
          const wristX = hands[0][0]?.x ?? 0
          const samples = waveSampleRef.current
          samples.push({ t: now, x: wristX })
          while (samples.length > 0 && now - samples[0].t > WAVE_WINDOW_MS) samples.shift()
          const oldest = samples[0]
          if (oldest && now - oldest.t >= 250) motionDx = wristX - oldest.x
        } else {
          waveSampleRef.current = []
        }

        const detected = hands.length > 0 ? classifyGesture(hands[0], motionDx) : null

        // Confidence gating: same gesture held ~1s → accept (beep).
        const prevAccepted = acceptedRef.current
        if (detected && detected === candidateRef.current) {
          const heldFor = now - candidateSinceRef.current
          holdRef.current = Math.min(1, heldFor / HOLD_MS)
          if (heldFor >= HOLD_MS && detected !== prevAccepted) {
            acceptedRef.current = detected
            acceptedAtRef.current = now
            playAcceptBeep()
          }
        } else {
          candidateRef.current = detected
          candidateSinceRef.current = now
          holdRef.current = detected ? 0 : holdRef.current
          if (!detected && now - acceptedAtRef.current > 1400) {
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
  }, [drawOverlay, playAcceptBeep])

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
          numHands: 1,
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

  // Re-render the overlay when facing flips (mirror transform depends on it).
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
    speak(accepted)
  }

  const handleSend = () => {
    if (!accepted) return
    const text = accepted
    sendMessage({
      id: `sign-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: "sign",
      text,
      confidence: 99,
      timestamp: Date.now(),
    })
    setSentToast(`${text} sent to guardian ✓`)
    window.setTimeout(() => setSentToast(null), 2400)
  }

  const statusLabel =
    loadState === "loading"
      ? "Starting camera & detection…"
      : loadState === "denied"
        ? "Camera access required"
        : loadState === "failed"
          ? "Gesture detection unavailable — showing demo mode"
          : handsVisible
            ? "Hand detected"
            : "Show your hand to the camera"

  const glassPanel: CSSProperties = {
    background: "rgba(30, 41, 59, 0.62)",
    backdropFilter: "blur(20px) saturate(160%)",
    WebkitBackdropFilter: "blur(20px) saturate(160%)",
    border: `1px solid ${COLORS.borderGlass}`,
    borderRadius: RADIUS.xl,
    boxShadow: SHADOW.lg,
  }

  const actionBtn = (disabled: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: TAP_MIN,
    padding: "10px 20px",
    fontSize: 16,
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
          transform: facing === "user" ? "scaleX(-1)" : "none",
          background: COLORS.bg,
        }}
      />
      {/* Landmark overlay — same box as the video so cover-fit math matches */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      />

      {/* Top-left: close */}
      <Link
        to="/"
        aria-label="Close sign language page"
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 20,
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
          boxShadow: SHADOW.sm,
        }}
      >
        <X size={22} strokeWidth={2.6} aria-hidden="true" />
      </Link>

      {/* Top-right: switch camera (only when >1 device) */}
      {hasMultipleCameras && loadState === "ready" && (
        <button
          type="button"
          onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
          aria-label="Switch camera"
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 20,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            minHeight: TAP_MIN,
            padding: "0 16px",
            borderRadius: RADIUS.pill,
            background: "rgba(10, 25, 41, 0.62)",
            backdropFilter: "blur(20px) saturate(160%)",
            WebkitBackdropFilter: "blur(20px) saturate(160%)",
            border: `1px solid ${COLORS.borderGlass}`,
            color: COLORS.text,
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            boxShadow: SHADOW.sm,
            fontFamily: FONT,
          }}
        >
          <SwitchCamera size={19} strokeWidth={2.4} aria-hidden="true" /> Switch
        </button>
      )}

      {/* Top-right (below switch): FPS counter */}
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

      {/* Status strip */}
      <div
        role="status"
        aria-live="polite"
        style={{
          position: "absolute",
          top: 16,
          left: 76,
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
          color: COLORS.textDim,
          pointerEvents: "none",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {statusLabel}
        {loadState === "ready" && handsVisible && (
          <span style={{ marginLeft: 8, color: COLORS.success }}>● live</span>
        )}
      </div>

      {/* Bottom glass panel */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 20,
          display: "flex",
          justifyContent: "center",
          padding: "0 14px max(14px, env(safe-area-inset-bottom))",
        }}
      >
        <div
          style={{
            ...glassPanel,
            width: "min(860px, 100%)",
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            gap: 18,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 220 }}>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: 1.6,
                color: COLORS.textDim,
                textTransform: "uppercase",
              }}
            >
              Detected gesture
            </p>
            <div
              aria-live="polite"
              style={{
                fontSize: "clamp(44px, 9vw, 72px)",
                fontWeight: 900,
                lineHeight: 1.05,
                letterSpacing: 1,
                color: COLORS.accentBright,
                textShadow: "0 0 28px rgba(0, 224, 255, 0.45)",
                minHeight: 74,
              }}
            >
              {gesture ?? "—"}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <ConfidenceRing value={holdPct} accepted={Boolean(accepted)} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                type="button"
                onClick={handleSpeak}
                disabled={!accepted}
                className="btn-gradient"
                style={actionBtn(!accepted)}
              >
                <Volume2 size={18} strokeWidth={2.5} aria-hidden="true" /> 🔊 Speak
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={!accepted}
                className="btn-ghost"
                style={actionBtn(!accepted)}
              >
                <Send size={17} strokeWidth={2.5} aria-hidden="true" /> 📤 Send to Guardian
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Fallback: camera denied ── */}
      {loadState === "denied" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 30,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            background: "rgba(10, 25, 41, 0.9)",
            textAlign: "center",
            padding: 24,
          }}
        >
          <CameraOff size={56} color={COLORS.danger} aria-hidden="true" />
          <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0 }}>Camera access required</h1>
          <p style={{ margin: 0, fontSize: 16, color: COLORS.textDim, maxWidth: 460 }}>
            VaakSetu needs the camera to read your hand gestures. Nothing is recorded or uploaded —
            detection runs entirely on this device.
          </p>
          <button
            type="button"
            onClick={() => setRetryNonce((n) => n + 1)}
            className="btn-gradient"
            style={{ ...actionBtn(false), padding: "12px 28px", fontSize: 17 }}
          >
            <Camera size={18} strokeWidth={2.5} aria-hidden="true" /> Retry camera
          </button>
        </div>
      )}

      {/* ── Fallback: MediaPipe failed → demo mode ── */}
      {demoMode && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 30,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            background: "rgba(10, 25, 41, 0.9)",
            padding: 24,
            overflowY: "auto",
          }}
        >
          <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0, textAlign: "center" }}>
            Gesture detection unavailable — showing demo mode
          </h1>
          <p style={{ margin: 0, fontSize: 14.5, color: COLORS.textDim, textAlign: "center", maxWidth: 520 }}>
            {errorMsg
              ? `Model/WASM could not load (${errorMsg}). `
              : ""}
            These are the 10 gestures the camera normally recognizes:
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
          <span className="sr-only"> — guardian id {getUserId()}</span>
        </motion.div>
      )}
    </motion.div>
  )
}
