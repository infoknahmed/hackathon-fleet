import { useCallback, useEffect, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { Link } from "react-router-dom"
import { motion, AnimatePresence } from "motion/react"
import { Dumbbell, ArrowLeft, RefreshCw, Trophy, Check } from "lucide-react"
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision"
import { classifyGesture } from "../lib/gestureHeuristics"
import { playSuccess, playError } from "../lib/soundEffects"
import { announce } from "../lib/a11y"
import { COLORS, FONT, RADIUS, SHADOW, TAP_MIN } from "../theme"
import TopNav from "../components/TopNav"

/**
 * /sign-practice — drill page for gesture accuracy.
 * Shows a target gesture; the camera watches; a correct 800ms hold scores
 * a point with confetti. 20 correct awards the "Gesture Master" badge.
 */

interface Landmark {
  x: number
  y: number
  z: number
}

/** Target list uses the heuristic classifier's static labels. */
const TARGETS = [
  "Stop / Wait",
  "Yes",
  "OK / Good",
  "No / Bad",
  "Point / Attention",
  "Peace / Two",
  "Three",
  "Four",
  "Help / Emergency",
  "I love you",
  "Perfect",
]

const HINTS: Record<string, string> = {
  "Stop / Wait": "Open palm — all five fingers up",
  Yes: "Closed fist",
  "OK / Good": "Thumb up, other fingers folded",
  "No / Bad": "Thumb pointing down",
  "Point / Attention": "Index finger only, pointing up",
  "Peace / Two": "Index + middle fingers spread",
  Three: "Three fingers up",
  Four: "Four fingers up, thumb tucked",
  "Help / Emergency": "Pinky finger only",
  "I love you": "Thumb + index + pinky up",
  Perfect: "Thumb and index make a circle",
}

const HOLD_MS = 800
const BADGE_AT = 20

function pickNewTarget(current: string | null): string {
  const pool = TARGETS.filter((t) => t !== current)
  return pool[Math.floor(Math.random() * pool.length)]
}

/** Lightweight CSS confetti burst on success. */
function Confetti() {
  const pieces = Array.from({ length: 24 })
  return (
    <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {pieces.map((_, i) => (
        <motion.span
          key={i}
          initial={{ x: "50%", y: "40%", scale: 0, opacity: 1 }}
          animate={{
            x: `${50 + (Math.random() - 0.5) * 90}%`,
            y: `${20 + Math.random() * 70}%`,
            rotate: Math.random() * 360,
            scale: [0, 1, 0.8],
            opacity: [1, 1, 0],
          }}
          transition={{ duration: 1.1 + Math.random() * 0.5, ease: "easeOut" }}
          style={{
            position: "absolute",
            width: 9,
            height: 14,
            borderRadius: 2,
            background: [COLORS.accentBright, COLORS.violet, COLORS.success, COLORS.warning][i % 4],
          }}
        />
      ))}
    </div>
  )
}

type LoadState = "loading" | "ready" | "denied" | "failed"

export default function SignPracticePage() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef(0)
  const runningRef = useRef(false)

  const [loadState, setLoadState] = useState<LoadState>("loading")
  const [target, setTarget] = useState<string>(() => pickNewTarget(null))
  const [holdPct, setHoldPct] = useState(0)
  const [correct, setCorrect] = useState(() => {
    const v = Number(localStorage.getItem("vaaksetu-practice-correct") ?? 0)
    return Number.isFinite(v) ? v : 0
  })
  const [attempts, setAttempts] = useState(() => {
    const v = Number(localStorage.getItem("vaaksetu-practice-attempts") ?? 0)
    return Number.isFinite(v) ? v : 0
  })
  const [showConfetti, setShowConfetti] = useState(false)
  const [lastResult, setLastResult] = useState<"success" | "wrong" | null>(null)
  const [retryNonce, setRetryNonce] = useState(0)

  const candidateRef = useRef<string | null>(null)
  const candidateSinceRef = useRef(0)
  const scoringRef = useRef(false)

  const badgeEarned = correct >= BADGE_AT

  // Persist practice stats.
  useEffect(() => {
    localStorage.setItem("vaaksetu-practice-correct", String(correct))
  }, [correct])
  useEffect(() => {
    localStorage.setItem("vaaksetu-practice-attempts", String(attempts))
  }, [attempts])

  /** Score one completed hold. */
  const scoreAttempt = useCallback(
    (detected: string) => {
      if (scoringRef.current) return
      scoringRef.current = true
      const success = detected === target
      setAttempts((a) => a + 1)
      if (success) {
        setCorrect((c) => c + 1)
        setShowConfetti(true)
        playSuccess()
        announce(`Correct! ${detected}`)
        window.setTimeout(() => setShowConfetti(false), 1400)
        window.setTimeout(() => {
          setTarget((cur) => pickNewTarget(cur))
          scoringRef.current = false
        }, 900)
      } else {
        playError()
        announce(`That was ${detected}. Try again.`)
        window.setTimeout(() => {
          scoringRef.current = false
        }, 700)
      }
      setLastResult(success ? "success" : "wrong")
      window.setTimeout(() => setLastResult(null), 1200)
    },
    [target],
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

        let detected: string | null = null
        if (hands.length > 0) {
          const h = classifyGesture(hands[0])
          detected = h ? h.gesture : null
        }

        // Hold-to-score: same gesture for HOLD_MS.
        if (detected) {
          if (detected === candidateRef.current) {
            const held = now - candidateSinceRef.current
            setHoldPct(Math.min(100, (held / HOLD_MS) * 100))
            if (held >= HOLD_MS) {
              scoreAttempt(detected)
              candidateSinceRef.current = now // require re-hold
              setHoldPct(0)
            }
          } else {
            candidateRef.current = detected
            candidateSinceRef.current = now
            setHoldPct(0)
          }
        } else {
          setHoldPct(0)
        }

        drawOverlay(hands)
      } catch {
        /* per-frame errors are non-fatal */
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [scoreAttempt])

  const drawOverlay = useCallback((hands: Landmark[][] | null) => {
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
    if (!hands?.length) return
    const cw = canvas.clientWidth || w
    const ch = canvas.clientHeight || h
    const scale = Math.max(cw / w, ch / h)
    const dw = w * scale
    const dh = h * scale
    const ox = (cw - dw) / 2
    const oy = (ch - dh) / 2
    ctx.strokeStyle = "rgba(0, 224, 255, 0.5)"
    ctx.lineWidth = 2.5
    ctx.fillStyle = "#00E0FF"
    for (const lm of hands) {
      for (const p of lm) {
        const x = ox + p.x * dw
        const y = oy + p.y * dh
        ctx.beginPath()
        ctx.arc(cw - x, y, 4, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }, [])

  /* ── Camera + MediaPipe lifecycle ── */
  useEffect(() => {
    let cancelled = false
    async function start() {
      setLoadState("loading")
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
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
        setLoadState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "failed")
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
    }
  }, [tick, retryNonce])

  const resetProgress = () => {
    setCorrect(0)
    setAttempts(0)
  }

  const cardStyle: CSSProperties = {
    background: "rgba(30, 41, 59, 0.55)",
    backdropFilter: "blur(20px) saturate(150%)",
    WebkitBackdropFilter: "blur(20px) saturate(150%)",
    border: `1px solid ${COLORS.borderGlass}`,
    borderRadius: RADIUS.lg,
    padding: 18,
    boxShadow: SHADOW.sm,
  }

  const accuracy = attempts > 0 ? Math.round((correct / attempts) * 100) : 0

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: FONT, padding: "0 16px 60px", maxWidth: 860, margin: "0 auto" }}>
      <TopNav />
      <motion.main initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 12 }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, display: "flex", alignItems: "center", gap: 10 }}>
              <Dumbbell size={26} aria-hidden="true" /> Sign Practice
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 15, color: COLORS.textDim }}>
              Hold the target gesture for 0.8s to score. {BADGE_AT} correct = Gesture Master.
            </p>
          </div>
          <Link to="/sign" className="btn-ghost" aria-label="Back to sign recognition" style={{ minHeight: TAP_MIN, display: "inline-flex", alignItems: "center", gap: 7, padding: "0 16px", fontSize: 14, textDecoration: "none" }}>
            <ArrowLeft size={16} aria-hidden="true" /> Recognition
          </Link>
        </header>

        {/* Progress + badge */}
        <div style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 800 }}>
                {correct}/{BADGE_AT} correct
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.textDim }}>
                {attempts > 0 ? `${accuracy}% accuracy` : "no attempts yet"}
              </span>
            </div>
            <div style={{ height: 10, borderRadius: 5, background: "rgba(255,255,255,0.08)", overflow: "hidden" }} role="progressbar" aria-valuenow={correct} aria-valuemin={0} aria-valuemax={BADGE_AT} aria-label="Progress to Gesture Master badge">
              <motion.div animate={{ width: `${Math.min(100, (correct / BADGE_AT) * 100)}%` }} style={{ height: "100%", background: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.violet})` }} />
            </div>
          </div>
          {badgeEarned ? (
            <motion.span
              initial={{ scale: 0.6, rotate: -8 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 15 }}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(250, 204, 21, 0.14)", border: `2px solid ${COLORS.warning}`, borderRadius: RADIUS.pill, padding: "8px 18px", fontSize: 15, fontWeight: 900, color: COLORS.warning }}
            >
              <Trophy size={18} aria-hidden="true" /> Gesture Master 🏆
            </motion.span>
          ) : (
            <button type="button" onClick={resetProgress} className="btn-ghost" style={{ minHeight: 44, padding: "0 14px", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <RefreshCw size={14} aria-hidden="true" /> Reset
            </button>
          )}
        </div>

        {/* Camera + target */}
        <div style={{ position: "relative", ...cardStyle, padding: 0, overflow: "hidden", minHeight: 320, display: "flex", flexDirection: "column" }}>
          <video ref={videoRef} autoPlay playsInline muted style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)", background: COLORS.bg }} />
          <canvas ref={canvasRef} aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />

          {/* Target overlay */}
          <div style={{ position: "absolute", top: 14, left: 14, right: 14, zIndex: 10, display: "flex", justifyContent: "center" }}>
            <div style={{ background: "rgba(10, 25, 41, 0.75)", backdropFilter: "blur(12px)", border: `1px solid ${COLORS.borderGlass}`, borderRadius: RADIUS.lg, padding: "10px 20px", textAlign: "center" }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: 1.6, textTransform: "uppercase", color: COLORS.textDim }}>Make this sign</p>
              <p style={{ margin: "2px 0 0", fontSize: 26, fontWeight: 900, color: COLORS.accentBright }}>{target}</p>
              <p style={{ margin: "2px 0 0", fontSize: 12.5, color: COLORS.textDim }}>{HINTS[target]}</p>
            </div>
          </div>

          {/* Hold ring */}
          {loadState === "ready" && (
            <div style={{ position: "absolute", bottom: 14, left: 14, zIndex: 10, display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label={`Hold progress ${Math.round(holdPct)}%`}>
                <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(148,163,184,0.25)" strokeWidth="6" />
                <circle
                  cx="32"
                  cy="32"
                  r="26"
                  fill="none"
                  stroke={holdPct >= 100 ? COLORS.success : COLORS.accentBright}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 26}
                  strokeDashoffset={2 * Math.PI * 26 * (1 - holdPct / 100)}
                  transform="rotate(-90 32 32)"
                />
              </svg>
              <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.textDim }}>hold steady…</span>
            </div>
          )}

          {/* Result feedback */}
          <AnimatePresence>
            {lastResult === "success" && (
              <motion.div key="ok" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} role="status" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 20, pointerEvents: "none" }}>
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 320, damping: 16 }} style={{ width: 96, height: 96, borderRadius: "50%", background: COLORS.success, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 60px rgba(34,197,94,0.6)" }}>
                  <Check size={54} color="#04291B" strokeWidth={3.4} aria-hidden="true" />
                </motion.span>
              </motion.div>
            )}
            {lastResult === "wrong" && (
              <motion.div key="no" initial={{ x: 0 }} animate={{ x: [0, -10, 10, -6, 6, 0] }} transition={{ duration: 0.45 }} role="alert" style={{ position: "absolute", bottom: 84, left: 0, right: 0, textAlign: "center", zIndex: 20, pointerEvents: "none" }}>
                <span style={{ display: "inline-block", background: "rgba(239, 68, 68, 0.92)", color: "#fff", borderRadius: RADIUS.pill, padding: "8px 20px", fontSize: 15, fontWeight: 800 }}>
                  Not quite — check the hint and try again
                </span>
              </motion.div>
            )}
            {showConfetti && <Confetti />}
          </AnimatePresence>

          {/* Fallbacks */}
          {loadState === "loading" && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(10,25,41,0.7)", fontSize: 15, fontWeight: 700 }}>
              Starting camera & detection…
            </div>
          )}
          {loadState === "denied" && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: "rgba(10,25,41,0.9)", textAlign: "center", padding: 24 }}>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Camera access required</p>
              <button type="button" onClick={() => setRetryNonce((n) => n + 1)} className="btn-gradient" style={{ minHeight: TAP_MIN, padding: "0 20px", fontSize: 15 }}>
                Retry camera
              </button>
            </div>
          )}
          {loadState === "failed" && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: "rgba(10,25,41,0.9)", textAlign: "center", padding: 24 }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Detection unavailable in this browser.</p>
              <button type="button" onClick={() => setRetryNonce((n) => n + 1)} className="btn-ghost" style={{ minHeight: TAP_MIN, padding: "0 20px", fontSize: 14 }}>
                Retry
              </button>
            </div>
          )}
        </div>
      </motion.main>
    </div>
  )
}
