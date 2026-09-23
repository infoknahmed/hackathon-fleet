/**
 * SignAvatar — parametric SVG hand that plays pose sequences for text.
 *
 * - Renders any HandPoseDef from lib/signPoses.ts (finger curl + rotation
 *   + location cues), so 92 poses come from one parametric component.
 * - Unknown words fall back to fingerspelling (letter by letter).
 * - Timeline: enter (scale 0.6→1 + fade 200ms) → hold 600ms → exit 200ms.
 * - Progress dots, speed control, auto-repeat, and full-text caption below.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { motion, AnimatePresence } from "motion/react"
import { Repeat } from "lucide-react"
import { poseForToken } from "../lib/signPoses"
import type { HandPoseDef } from "../lib/signPoses"
import { COLORS, FONT } from "../theme"

/* ── Sequence building ──────────────────────────────────────────── */

export interface PoseStep {
  pose: HandPoseDef
  /** The word/letter this step represents. */
  token: string
  fingerspelled: boolean
}

/** Parse text into pose steps; unknown words → fingerspelled letters. */
export function stepsForText(text: string): PoseStep[] {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean)
  const steps: PoseStep[] = []
  for (const word of words) {
    const clean = word.replace(/[^a-z0-9]/g, "")
    if (!clean) continue
    const pose = poseForToken(clean)
    if (pose) {
      steps.push({ pose, token: clean, fingerspelled: false })
    } else if (clean.length <= 8) {
      // Fingerspell up to 8 letters per unknown word.
      for (const ch of clean) {
        const letter = poseForToken(ch)
        if (letter) steps.push({ pose: letter, token: ch.toUpperCase(), fingerspelled: true })
      }
    }
  }
  return steps.slice(0, 24)
}

/* ── Parametric SVG hand ────────────────────────────────────────── */

const OUTLINE = "#0A1929"
const FILL = "#00E0FF"
const PALM = { fill: FILL, stroke: OUTLINE, strokeWidth: 5 } as const

interface FingerParams {
  baseX: number
  baseY: number
  length: number
  width: number
  /** 0 = straight up, 1 = fully curled into the palm. */
  curl: number
}

/** One finger: proximal phalanx rotates by curl, distal rotates further. */
function Finger({ baseX, baseY, length, width, curl }: FingerParams) {
  const proximalLen = length * 0.55
  const distalLen = length * 0.45
  const angle = curl * 85 // degrees of curl at the MCP joint
  const distalAngle = curl * 80 // extra curl at the PIP joint
  return (
    <g transform={`translate(${baseX} ${baseY}) rotate(${-angle})`}>
      <rect x={-width / 2} y={-proximalLen} width={width} height={proximalLen + 6} rx={width / 2} {...PALM} />
      <g transform={`translate(0 ${-proximalLen + 4}) rotate(${-distalAngle})`}>
        <rect x={-width / 2} y={-distalLen} width={width} height={distalLen} rx={width / 2} {...PALM} />
      </g>
    </g>
  )
}

/** Curled thumb resting against the palm side. */
function Thumb({ curl, palmLeft }: { curl: number; palmLeft: boolean }) {
  const angle = curl * 70
  return (
    <g transform={`translate(${palmLeft ? 150 : 50} 118) rotate(${(palmLeft ? 1 : -1) * (35 - angle)})`}>
      <rect x={-8} y={-46} width={16} height={48} rx={8} {...PALM} />
    </g>
  )
}

interface HandSvgProps {
  pose: HandPoseDef
  size: number
}

/** Renders the parametric hand for a pose definition. */
export function HandSvg({ pose, size }: HandSvgProps) {
  const [t, i, m, r, p] = pose.curl
  const fingers: { x: number; len: number; w: number; curl: number }[] = [
    { x: 66, len: 62, w: 15, curl: i },
    { x: 90, len: 72, w: 15, curl: m },
    { x: 114, len: 66, w: 15, curl: r },
    { x: 137, len: 52, w: 14, curl: p },
  ]
  const offsetX = (pose.offsetX ?? 0) * 26
  const offsetY = (pose.offsetY ?? 0) * 30

  return (
    <svg viewBox="0 0 200 200" width={size} height={size} aria-hidden="true">
      <g transform={`translate(${offsetX} ${offsetY}) rotate(${pose.rotate ?? 0} 100 130)`}>
        {/* palm */}
        <rect x={52} y={104} width={96} height={68} rx={24} {...PALM} />
        {/* fingers (index→pinky) */}
        {fingers.map((f, idx) => (
          <Finger key={idx} baseX={f.x} baseY={110} length={f.len} width={f.w} curl={f.curl} />
        ))}
        {/* thumb */}
        <Thumb curl={t} palmLeft={false} />
        {/* motion arcs (wave / yes / again…) */}
        {pose.motion && (
          <path
            d="M158 70c9 9 9 22 0 31M172 56c15 15 15 39 0 54"
            fill="none"
            stroke={OUTLINE}
            strokeWidth={7}
            strokeLinecap="round"
            opacity={0.5}
          />
        )}
        {/* face location markers */}
        {pose.face === "chin" && <circle cx={100} cy={22} r={12} fill={OUTLINE} opacity={0.25} />}
        {pose.face === "lips" && <ellipse cx={100} cy={20} rx={13} ry={8} fill={OUTLINE} opacity={0.25} />}
        {pose.face === "ear" && <path d="M168 30a10 10 0 1 0 1 16" fill="none" stroke={OUTLINE} strokeWidth={6} opacity={0.3} />}
        {pose.face === "eye" && <circle cx={155} cy={26} r={7} fill={OUTLINE} opacity={0.25} />}
      </g>
      {/* second hand for two-handed signs */}
      {pose.secondHand && (
        <g transform={`translate(0 ${pose.secondHand === "mirror" ? 0 : 8})`} opacity={0.85}>
          <rect x={44} y={150} width={112} height={34} rx={17} {...PALM} />
        </g>
      )}
    </svg>
  )
}

/* ── Player component ───────────────────────────────────────────── */

const ENTER_MS = 200
const HOLD_MS = 600
const EXIT_MS = 200

interface Props {
  text: string
  onComplete?: () => void
  /** SVG render size (default 200). */
  size?: number
  /** Playback speed multiplier (0.5 | 1 | 1.5). */
  speed?: number
  /** Loop forever until stopped. */
  repeat?: boolean
  /** Show playback controls (speed slider + repeat toggle). */
  controls?: boolean
}

export function SignAvatar({ text, onComplete, size = 200, speed = 1, repeat = false, controls = false }: Props) {
  const steps = useMemo(() => stepsForText(text), [text])
  const [index, setIndex] = useState(0)
  const [loopCount, setLoopCount] = useState(0)
  const [isRepeating, setIsRepeating] = useState(repeat)
  const [speedMultiplier, setSpeedMultiplier] = useState(speed)
  const completedRef = useRef(false)

  // Restart when the text changes.
  useEffect(() => {
    setIndex(0)
    setLoopCount(0)
    completedRef.current = false
  }, [text])

  const hasSteps = steps.length > 0
  const stepDuration = (ENTER_MS + HOLD_MS + EXIT_MS) / speedMultiplier

  useEffect(() => {
    if (!hasSteps) {
      if (!completedRef.current) {
        completedRef.current = true
        onComplete?.()
      }
      return
    }
    if (index >= steps.length) {
      // Sequence finished.
      if (isRepeating) {
        setLoopCount((l) => l + 1)
        setIndex(0)
      } else if (!completedRef.current) {
        completedRef.current = true
        onComplete?.()
      }
      return
    }
    const timer = window.setTimeout(() => setIndex((i) => i + 1), stepDuration)
    return () => window.clearTimeout(timer)
  }, [index, hasSteps, stepDuration, isRepeating, steps.length, onComplete])

  const current = index < steps.length ? steps[index] : null
  const total = Math.max(steps.length, 1)

  const dotsStyle: CSSProperties = {
    display: "flex",
    gap: 7,
    justifyContent: "center",
    marginTop: 12,
    flexWrap: "wrap",
    maxWidth: size + 40,
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        width: "100%",
        fontFamily: FONT,
      }}
    >
      <div style={{ width: size, height: size, position: "relative" }}>
        <AnimatePresence mode="wait">
          {current ? (
            <motion.div
              key={`${loopCount}-${index}-${current.pose.id}`}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1, transition: { duration: ENTER_MS / 1000 / speedMultiplier, ease: "easeOut" } }}
              exit={{ opacity: 0, scale: 1.08, transition: { duration: EXIT_MS / 1000 / speedMultiplier, ease: "easeIn" } }}
              style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <HandSvg pose={current.pose} size={size} />
            </motion.div>
          ) : (
            <motion.span
              key="none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 56,
              }}
              aria-hidden="true"
            >
              🤟
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Sign label + fingerspelling indicator */}
      <div style={{ height: 44, display: "flex", alignItems: "center", gap: 8 }}>
        <AnimatePresence mode="wait">
          {current && (
            <motion.span
              key={`${loopCount}-${index}-label`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.2 } }}
              exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
              style={{
                fontSize: 30,
                fontWeight: 900,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: COLORS.accentBright,
                textShadow: "0 0 22px rgba(0, 224, 255, 0.4)",
              }}
            >
              {current.fingerspelled ? `Letter ${current.token}` : current.pose.label}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Progress dots */}
      <div style={dotsStyle} aria-hidden="true">
        {Array.from({ length: Math.min(total, 12) }).map((_, i) => (
          <span
            key={i}
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background:
                hasSteps && i === Math.min(index, 11)
                  ? COLORS.accentBright
                  : hasSteps && i < index
                    ? "rgba(0, 224, 255, 0.45)"
                    : "rgba(148, 163, 184, 0.3)",
              boxShadow: hasSteps && i === index ? "0 0 10px rgba(0, 224, 255, 0.7)" : "none",
              transition: "background 0.2s ease",
            }}
          />
        ))}
      </div>

      {/* Controls */}
      {controls && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 8, flexWrap: "wrap", justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => setIsRepeating((r) => !r)}
            aria-pressed={isRepeating}
            aria-label="Auto-repeat the sign sequence"
            className="btn-ghost"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              minHeight: 44,
              padding: "0 14px",
              fontSize: 14,
              color: isRepeating ? COLORS.accentBright : COLORS.textDim,
              borderColor: isRepeating ? "rgba(0,224,255,0.5)" : COLORS.borderGlass,
            }}
          >
            <Repeat size={15} aria-hidden="true" /> Auto-repeat {isRepeating ? "ON" : "OFF"}
          </button>
          <label htmlFor="sign-speed" style={{ fontSize: 14, fontWeight: 700, color: COLORS.textDim }}>
            Speed
          </label>
          <input
            id="sign-speed"
            type="range"
            min={0.5}
            max={1.5}
            step={0.5}
            value={speedMultiplier}
            onChange={(e) => setSpeedMultiplier(Number(e.target.value))}
            style={{ width: 110, accentColor: COLORS.accent, minHeight: 44 }}
          />
          <span style={{ fontSize: 14, fontWeight: 800, color: COLORS.textDim }}>{speedMultiplier}×</span>
        </div>
      )}
    </div>
  )
}

export default SignAvatar
