/**
 * SigningAvatar — lifelike 2D SVG upper-body avatar (Phase 1A).
 *
 * One parametric renderer draws every pose from lib/avatar/poses.ts:
 * - Two-bone IK places elbows for each wrist target (natural arm bend)
 * - Hands render 5 jointed fingers driven by curl/spread parameters
 * - Head turns/tilts, brows + mouth render 10 facial expressions
 * - Idle life: blinking every ~3s, gentle head bob, breathing torso
 *
 * Pose changes animate via CSS transforms (GPU-accelerated, 60fps).
 */

import { useEffect, useMemo, useState } from "react"
import { motion } from "motion/react"
import type { SignPose, Expression } from "../../lib/avatar/poses"
import { NEUTRAL_POSE } from "../../lib/avatar/poses"
import { COLORS, FONT } from "../../theme"

/* ── Geometry constants (viewBox 0 0 300 340) ──────────────────── */

const L1 = 50 // upper arm length
const L2 = 46 // forearm length
const SH_L = { x: 113, y: 112 }
const SH_R = { x: 187, y: 112 }
/** Pose units → SVG units. */
const XS = 90
const YS = 88
const CY = 128

function toSvg(p: { x: number; y: number }): { x: number; y: number } {
  return { x: 150 + p.x * XS, y: CY - p.y * YS }
}

/* ── Two-bone IK ───────────────────────────────────────────────── */

interface ArmSolution {
  wrist: { x: number; y: number }
  upperDeg: number
  foreDeg: number
}

function solveArm(sh: { x: number; y: number }, target: { x: number; y: number }): ArmSolution {
  let dx = target.x - sh.x
  let dy = target.y - sh.y
  let d = Math.hypot(dx, dy)
  const maxD = L1 + L2 - 0.5
  const minD = Math.abs(L1 - L2) + 2
  if (d > maxD) {
    const s = maxD / d
    dx *= s
    dy *= s
    d = maxD
  } else if (d < minD) {
    const s = minD / (d || 0.001)
    dx *= s
    dy *= s
    d = minD
  }
  const wx = sh.x + dx
  const wy = sh.y + dy
  const ux = dx / d
  const uy = dy / d
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(L1 * L1 - a * a, 1))
  const e1 = { x: sh.x + ux * a - uy * h, y: sh.y + uy * a + ux * h }
  const e2 = { x: sh.x + ux * a + uy * h, y: sh.y + uy * a - ux * h }
  const elbow = e1.y >= e2.y ? e1 : e2 // prefer the lower (natural) elbow
  const upperDeg = (Math.atan2(elbow.y - sh.y, elbow.x - sh.x) * 180) / Math.PI - 90
  const foreWorld = (Math.atan2(wy - elbow.y, wx - elbow.x) * 180) / Math.PI - 90
  return { wrist: { x: wx, y: wy }, upperDeg, foreDeg: foreWorld - upperDeg }
}

/* ── Facial expressions ────────────────────────────────────────── */

interface FaceParams {
  browY: number
  browInner: number
  browArch: number
  mouth: "smile" | "frown" | "flat" | "open" | "grimace" | "o"
  openRy: number
  lidDroop: number
}

const EXPRESSIONS: Record<Expression, FaceParams> = {
  neutral: { browY: 0, browInner: 0, browArch: 2, mouth: "flat", openRy: 0, lidDroop: 0 },
  happy: { browY: -2, browInner: 0, browArch: 3, mouth: "smile", openRy: 0, lidDroop: 0 },
  sad: { browY: 1, browInner: -2.5, browArch: 1, mouth: "frown", openRy: 0, lidDroop: 0.5 },
  angry: { browY: 2, browInner: 3, browArch: 0.5, mouth: "frown", openRy: 0, lidDroop: 1 },
  scared: { browY: -3.5, browInner: -1, browArch: 3, mouth: "open", openRy: 3.5, lidDroop: 0 },
  surprised: { browY: -4, browInner: 0, browArch: 3.5, mouth: "o", openRy: 4.5, lidDroop: 0 },
  pain: { browY: 1.5, browInner: -2, browArch: 1, mouth: "grimace", openRy: 0, lidDroop: 0.5 },
  question: { browY: -2.5, browInner: 0, browArch: 3.5, mouth: "flat", openRy: 1, lidDroop: 0 },
  tired: { browY: 1, browInner: 0, browArch: 1.5, mouth: "flat", openRy: 0, lidDroop: 2 },
  speaking: { browY: -1, browInner: 0, browArch: 2.5, mouth: "open", openRy: 4, lidDroop: 0 },
}

/* ── Palette ───────────────────────────────────────────────────── */

const SKIN = "#E8B98F"
const SKIN_LINE = "#0A1929"
const HAIR = "#16233A"
const SHIRT = "#1B2E42"
const SHIRT_DARK = "#142338"
const EYE = "#0A1929"

/* ── Hand with 5 jointed fingers ───────────────────────────────── */

interface FingerSpec {
  x: number
  len: number
  w: number
  curl: number
}

function Finger({ x, len, w, curl, fan }: FingerSpec & { fan: number }) {
  const prox = len * 0.55
  const dist = len * 0.45
  return (
    <g transform={`translate(${x} 24) rotate(${fan})`}>
      <g transform={`rotate(${curl * 82})`}>
        <rect x={-w / 2} y={0} width={w} height={prox} rx={w / 2} fill={SKIN} stroke={SKIN_LINE} strokeWidth={1.2} />
        <g transform={`translate(0 ${prox - 2}) rotate(${curl * 72})`}>
          <rect x={-w / 2} y={0} width={w} height={dist} rx={w / 2} fill={SKIN} stroke={SKIN_LINE} strokeWidth={1.2} />
        </g>
      </g>
    </g>
  )
}

function AvatarHand({ hand, mirror }: { hand: { rot?: number; fingers: { curl: [number, number, number, number, number]; spread?: number } }; mirror: boolean }) {
  const [t, i, m, r, p] = hand.fingers.curl
  const spread = hand.fingers.spread ?? 0.35
  const fingers: FingerSpec[] = [
    { x: -9.5, len: 20, w: 6.8, curl: i },
    { x: -2.5, len: 23, w: 7.2, curl: m },
    { x: 4.5, len: 21, w: 6.8, curl: r },
    { x: 10.5, len: 16, w: 6.2, curl: p },
  ]
  return (
    <g transform={mirror ? "scale(-1 1)" : undefined}>
      {/* palm */}
      <rect x={-14} y={-3} width={28} height={29} rx={10} fill={SKIN} stroke={SKIN_LINE} strokeWidth={1.4} />
      {/* fingers */}
      {fingers.map((f, idx) => (
        <Finger key={idx} {...f} fan={(idx - 1.5) * spread * 9} />
      ))}
      {/* thumb */}
      <g transform="translate(-12 8) rotate(38)">
        <g transform={`rotate(${-46 + t * 62})`}>
          <rect x={-3.6} y={0} width={7.2} height={13} rx={3.6} fill={SKIN} stroke={SKIN_LINE} strokeWidth={1.2} />
          <g transform={`translate(0 11) rotate(${t * 40})`}>
            <rect x={-3.4} y={0} width={6.8} height={10} rx={3.4} fill={SKIN} stroke={SKIN_LINE} strokeWidth={1.2} />
          </g>
        </g>
      </g>
    </g>
  )
}

/* ── Arm (upper + forearm + hand, nested rotations) ────────────── */

const POSE_TRANSITION = "transform 0.34s cubic-bezier(0.22, 1, 0.36, 1)"

function Arm({
  sh,
  hand,
  mirrorHand,
}: {
  sh: { x: number; y: number }
  hand: { x: number; y: number; rot?: number; fingers: { curl: [number, number, number, number, number]; spread?: number } }
  mirrorHand: boolean
}) {
  const target = toSvg(hand)
  const sol = useMemo(() => solveArm(sh, target), [sh.x, sh.y, target.x, target.y])
  const elbowRestY = sh.y + L1
  const wristRestY = sh.y + L1 + L2
  const handRot = hand.rot ?? 0
  return (
    <g
      style={{
        transform: `rotate(${sol.upperDeg}deg)`,
        transformOrigin: `${sh.x}px ${sh.y}px`,
        transformBox: "view-box",
        transition: POSE_TRANSITION,
      }}
    >
      {/* sleeve (upper arm) */}
      <line x1={sh.x} y1={sh.y} x2={sh.x} y2={elbowRestY} stroke={SHIRT} strokeWidth={21} strokeLinecap="round" />
      <g
        style={{
          transform: `rotate(${sol.foreDeg}deg)`,
          transformOrigin: `${sh.x}px ${elbowRestY}px`,
          transformBox: "view-box",
          transition: POSE_TRANSITION,
        }}
      >
        {/* forearm (skin) */}
        <line x1={sh.x} y1={elbowRestY} x2={sh.x} y2={wristRestY} stroke={SKIN} strokeWidth={15} strokeLinecap="round" />
        <g
          style={{
            transform: `rotate(${handRot}deg)`,
            transformOrigin: `${sh.x}px ${wristRestY}px`,
            transformBox: "view-box",
            transition: POSE_TRANSITION,
          }}
        >
          <g transform={`translate(${sh.x} ${wristRestY})`}>
            <AvatarHand hand={hand} mirror={mirrorHand} />
          </g>
        </g>
      </g>
    </g>
  )
}

/* ── Face ──────────────────────────────────────────────────────── */

function Face({ expression, look, blink }: { expression: Expression; look: number; blink: boolean }) {
  const f = EXPRESSIONS[expression] ?? EXPRESSIONS.neutral
  const rightBrowExtra = expression === "question" ? -3 : 0
  const lidSquish = f.lidDroop * 1.4
  const eyeRy = 5.2 - lidSquish
  const mouthPath =
    f.mouth === "smile"
      ? "M141 72 Q150 80 159 72"
      : f.mouth === "frown"
        ? "M143 77 Q150 71 157 77"
        : f.mouth === "grimace"
          ? "M142 75 Q146 72 150 75 Q154 78 158 75"
          : "M144 74 Q150 76.5 156 74"
  return (
    <g>
      {/* hair cap */}
      <path d="M124 56 A26 28 0 0 1 176 56 L176 50 Q150 28 124 50 Z" fill={HAIR} />
      {/* brows */}
      <path
        d={`M134 ${51 + f.browY + f.browInner} Q140 ${48 + f.browY - f.browArch} 146 ${51 + f.browY}`}
        fill="none"
        stroke={HAIR}
        strokeWidth={2.6}
        strokeLinecap="round"
      />
      <path
        d={`M154 ${51 + f.browY + rightBrowExtra} Q160 ${48 + f.browY + rightBrowExtra - f.browArch} 166 ${51 + f.browY + f.browInner + rightBrowExtra}`}
        fill="none"
        stroke={HAIR}
        strokeWidth={2.6}
        strokeLinecap="round"
      />
      {/* eyes (blink via scaleY) */}
      <g
        style={{
          transform: blink ? "scaleY(0.12)" : "scaleY(1)",
          transformOrigin: "150px 61px",
          transformBox: "view-box",
          transition: "transform 0.09s ease",
        }}
      >
        <ellipse cx={140} cy={61} rx={4.6} ry={eyeRy} fill="#F4F7FA" stroke={SKIN_LINE} strokeWidth={1} />
        <ellipse cx={160} cy={61} rx={4.6} ry={eyeRy} fill="#F4F7FA" stroke={SKIN_LINE} strokeWidth={1} />
        <circle cx={140 + look} cy={61.6} r={2.4} fill={EYE} />
        <circle cx={160 + look} cy={61.6} r={2.4} fill={EYE} />
        <circle cx={140.9 + look} cy={60.7} r={0.8} fill="#fff" />
        <circle cx={160.9 + look} cy={60.7} r={0.8} fill="#fff" />
      </g>
      {/* nose */}
      <path d="M150 66 q2.4 3.4 0 5.6" fill="none" stroke={SKIN_LINE} strokeWidth={1.6} strokeLinecap="round" opacity={0.75} />
      {/* mouth */}
      {expression === "speaking" ? (
        <motion.ellipse
          cx={150}
          cy={75}
          rx={6}
          animate={{ rx: [5, 7.5, 4.2, 6.2, 5], ry: [2.5, 5.5, 3.5, 6, 2.5] }}
          transition={{ repeat: Infinity, duration: 0.85, ease: "easeInOut" }}
          fill="#7C2D3E"
          stroke={SKIN_LINE}
          strokeWidth={1.2}
        />
      ) : f.mouth === "open" || f.mouth === "o" ? (
        <ellipse cx={150} cy={75.5} rx={f.mouth === "o" ? 4.6 : 5.6} ry={f.openRy} fill="#7C2D3E" stroke={SKIN_LINE} strokeWidth={1.2} />
      ) : (
        <path d={mouthPath} fill="none" stroke={SKIN_LINE} strokeWidth={2.2} strokeLinecap="round" />
      )}
    </g>
  )
}

/* ── Main avatar ───────────────────────────────────────────────── */

export type AvatarMode = "idle" | "signing" | "speaking" | "listening"
/** Phase 5B state-machine alias for `mode`. */
export type AvatarState = AvatarMode

/** Facial mood (Phase 5B): positive → smile, negative → concern, neutral → relaxed. */
export type AvatarEmotion = "neutral" | "positive" | "negative"

/** Sentiment keywords parsed from conversation text (Phase 5B). */
const POSITIVE_WORDS = new Set(["love", "loved", "thanks", "thank", "good", "happy", "great", "nice", "welcome", "please"])
const NEGATIVE_WORDS = new Set(["pain", "help", "hurt", "sad", "emergency", "bad", "hurts", "ache", "scared", "no"])

/** Map a sentence to an avatar emotion via keyword sentiment. */
export function parseEmotion(text: string): AvatarEmotion {
  const words = text.toLowerCase().split(/[^a-z]+/).filter(Boolean)
  let score = 0
  for (const w of words) {
    if (POSITIVE_WORDS.has(w)) score++
    if (NEGATIVE_WORDS.has(w)) score--
  }
  if (score > 0) return "positive"
  if (score < 0) return "negative"
  return "neutral"
}

export interface SigningAvatarProps {
  /** Current pose snapshot (interpolated with CSS springs). */
  pose?: SignPose
  mode?: AvatarMode
  /** Phase 5B alias for `mode` — the avatar state machine. */
  state?: AvatarState
  /** Phase 5B facial emotion override (parsed from text by callers). */
  emotion?: AvatarEmotion
  /** Rendered width/height in px. */
  size?: number
  ariaLabel?: string
}

export function SigningAvatar({ pose, mode = "idle", state, emotion, size = 320, ariaLabel }: SigningAvatarProps) {
  const p = pose ?? NEUTRAL_POSE
  const eff: AvatarMode = state ?? mode
  const [blink, setBlink] = useState(false)

  // Blink every ~3s (with jitter) — required idle-life behavior.
  useEffect(() => {
    let t2: number
    const schedule = () => {
      const t1 = window.setTimeout(() => {
        setBlink(true)
        t2 = window.setTimeout(() => setBlink(false), 140)
        schedule()
      }, 2600 + Math.random() * 1200)
      return t1
    }
    const t1 = schedule()
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [])

  // Emotion → face: positive → smile, negative → concern. During signing the
  // pose's own expression wins unless the pose is neutral or emotion is explicit.
  const emotionExpr: Expression | null =
    emotion === "positive" ? "happy" : emotion === "negative" ? "sad" : null
  let expr: Expression = eff === "speaking" ? "speaking" : p.expression
  if (emotionExpr && (eff !== "signing" || p.expression === "neutral")) {
    expr = emotionExpr
  } else if (eff === "listening" && expr === "neutral") {
    expr = "question" // raised brows while attending to the speaker
  }
  const look = Math.max(-3, Math.min(3, p.head.rotation / 6))
  const headTransform = `translate(${p.head.rotation * 0.55}px 0) rotate(${p.head.tilt}deg)`
  // Listening → gentle nod; speaking → faster bob to speech rhythm.
  const headAnim =
    eff === "listening"
      ? "vaaksetu-nod 2.8s ease-in-out infinite"
      : eff === "speaking"
        ? "vaaksetu-bob 1.9s ease-in-out infinite"
        : "vaaksetu-bob 3.4s ease-in-out infinite"

  return (
    <svg
      viewBox="0 0 300 340"
      width={size}
      height={size * (340 / 300)}
      role="img"
      aria-label={ariaLabel ?? `Signing avatar: ${mode}`}
      style={{ fontFamily: FONT, maxWidth: "100%", display: "block", margin: "0 auto" }}
    >
      <style>{`
        @keyframes vaaksetu-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(2.4px); } }
        @keyframes vaaksetu-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.012); } }
        @keyframes vaaksetu-nod { 0%, 100% { transform: rotate(0deg) translateY(0); } 50% { transform: rotate(2.2deg) translateY(2.2px); } }
      `}</style>

      {/* floor shadow */}
      <ellipse cx={150} cy={318} rx={86} ry={12} fill="rgba(0,0,0,0.35)" />

      {/* torso (breathing) */}
      <g style={{ transformBox: "view-box", transformOrigin: "150px 250px", animation: "vaaksetu-breathe 4.2s ease-in-out infinite" }}>
        <rect x={142} y={86} width={16} height={18} rx={6} fill={SKIN} stroke={SKIN_LINE} strokeWidth={1.2} />
        <path
          d="M104 118 C118 102 182 102 196 118 L206 244 C160 260 140 260 94 244 Z"
          fill={SHIRT}
          stroke={SKIN_LINE}
          strokeWidth={2}
        />
        <path d="M104 118 C118 102 182 102 196 118 L198 138 Q150 150 102 138 Z" fill={SHIRT_DARK} opacity={0.65} />
        <path d="M136 106 L150 122 L164 106" fill="none" stroke={COLORS.accent} strokeWidth={3} strokeLinecap="round" opacity={0.9} />
      </g>

      {/* arms (drawn over torso) */}
      <Arm sh={SH_L} hand={p.leftHand} mirrorHand />
      <Arm sh={SH_R} hand={p.rightHand} mirrorHand={false} />

      {/* head (bob + turn + tilt) */}
      <g style={{ transformBox: "view-box", transformOrigin: "150px 92px", animation: headAnim }}>
        <g
          style={{
            transform: headTransform,
            transformOrigin: "150px 92px",
            transformBox: "view-box",
            transition: POSE_TRANSITION,
          }}
        >
          <ellipse cx={150} cy={62} rx={26} ry={28} fill={SKIN} stroke={SKIN_LINE} strokeWidth={1.8} />
          <Face expression={expr} look={look} blink={blink} />
          {/* ears */}
          <ellipse cx={123} cy={64} rx={4} ry={6} fill={SKIN} stroke={SKIN_LINE} strokeWidth={1.2} />
          <ellipse cx={177} cy={64} rx={4} ry={6} fill={SKIN} stroke={SKIN_LINE} strokeWidth={1.2} />
        </g>
      </g>
    </svg>
  )
}

export default SigningAvatar
