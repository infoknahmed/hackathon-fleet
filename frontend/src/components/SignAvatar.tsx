import { useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { motion, AnimatePresence } from "motion/react"
import { COLORS, FONT } from "../theme"

/* ───────────────────── Pose SVGs (200×200, flat) ───────────────────── */

const OUTLINE = "#0A1929"
const FILL = "#00E0FF"
const PALM = { fill: FILL, stroke: OUTLINE, strokeWidth: 6 }

/** Open hand — 5 fingers up. */
function PalmSvg() {
  return (
    <svg viewBox="0 0 200 200" width="200" height="200" aria-hidden="true">
      <rect x="70" y="92" width="60" height="76" rx="26" {...PALM} />
      <rect x="62" y="30" width="17" height="74" rx="8.5" {...PALM} />
      <rect x="84" y="18" width="17" height="86" rx="8.5" {...PALM} />
      <rect x="106" y="24" width="17" height="80" rx="8.5" {...PALM} />
      <rect x="128" y="40" width="16" height="64" rx="8" {...PALM} />
      <rect x="30" y="100" width="46" height="17" rx="8.5" {...PALM} transform="rotate(40 53 108)" />
    </svg>
  )
}

/** Closed fist. */
function FistSvg() {
  return (
    <svg viewBox="0 0 200 200" width="200" height="200" aria-hidden="true">
      <rect x="52" y="64" width="96" height="104" rx="34" {...PALM} />
      <rect x="60" y="72" width="80" height="20" rx="10" fill={OUTLINE} opacity={0.28} />
      <rect x="60" y="98" width="80" height="18" rx="9" fill={OUTLINE} opacity={0.28} />
      <rect x="60" y="122" width="80" height="18" rx="9" fill={OUTLINE} opacity={0.28} />
    </svg>
  )
}

/** Thumb up. */
function ThumbUpSvg() {
  return (
    <svg viewBox="0 0 200 200" width="200" height="200" aria-hidden="true">
      <rect x="58" y="96" width="84" height="72" rx="26" {...PALM} />
      <rect x="76" y="18" width="22" height="86" rx="11" {...PALM} />
      <rect x="66" y="110" width="68" height="18" rx="9" fill={OUTLINE} opacity={0.28} />
    </svg>
  )
}

/** Thumb down. */
function ThumbDownSvg() {
  return (
    <svg viewBox="0 0 200 200" width="200" height="200" aria-hidden="true">
      <rect x="58" y="32" width="84" height="72" rx="26" {...PALM} />
      <rect x="76" y="96" width="22" height="86" rx="11" {...PALM} />
      <rect x="66" y="48" width="68" height="18" rx="9" fill={OUTLINE} opacity={0.28} />
    </svg>
  )
}

/** Index + middle up. */
function PeaceSvg() {
  return (
    <svg viewBox="0 0 200 200" width="200" height="200" aria-hidden="true">
      <rect x="68" y="92" width="64" height="76" rx="26" {...PALM} />
      <rect x="70" y="22" width="17" height="82" rx="8.5" {...PALM} transform="rotate(-10 78 63)" />
      <rect x="100" y="18" width="17" height="86" rx="8.5" {...PALM} transform="rotate(9 108 61)" />
      <rect x="72" y="104" width="56" height="18" rx="9" fill={OUTLINE} opacity={0.28} />
    </svg>
  )
}

/** Index only up. */
function PointSvg() {
  return (
    <svg viewBox="0 0 200 200" width="200" height="200" aria-hidden="true">
      <rect x="66" y="90" width="68" height="78" rx="26" {...PALM} />
      <rect x="84" y="16" width="17" height="84" rx="8.5" {...PALM} />
      <rect x="74" y="104" width="52" height="18" rx="9" fill={OUTLINE} opacity={0.28} />
    </svg>
  )
}

/** Open palm tilted — wave. */
function WaveSvg() {
  return (
    <svg viewBox="0 0 200 200" width="200" height="200" aria-hidden="true">
      <g transform="rotate(-18 100 100)">
        <rect x="70" y="92" width="60" height="76" rx="26" {...PALM} />
        <rect x="62" y="30" width="17" height="74" rx="8.5" {...PALM} />
        <rect x="84" y="18" width="17" height="86" rx="8.5" {...PALM} />
        <rect x="106" y="24" width="17" height="80" rx="8.5" {...PALM} />
        <rect x="128" y="40" width="16" height="64" rx="8" {...PALM} />
        <rect x="30" y="100" width="46" height="17" rx="8.5" {...PALM} transform="rotate(40 53 108)" />
      </g>
      <path
        d="M156 66c8 8 8 20 0 28M170 52c14 14 14 36 0 50"
        fill="none"
        stroke={OUTLINE}
        strokeWidth="8"
        strokeLinecap="round"
        opacity={0.55}
      />
    </svg>
  )
}

/** Index + middle + ring up. */
function ThreeFingersSvg() {
  return (
    <svg viewBox="0 0 200 200" width="200" height="200" aria-hidden="true">
      <rect x="66" y="92" width="64" height="76" rx="26" {...PALM} />
      <rect x="68" y="24" width="17" height="80" rx="8.5" {...PALM} />
      <rect x="90" y="16" width="17" height="88" rx="8.5" {...PALM} />
      <rect x="112" y="26" width="17" height="78" rx="8.5" {...PALM} />
      <rect x="74" y="106" width="52" height="18" rx="9" fill={OUTLINE} opacity={0.28} />
    </svg>
  )
}

/** Index + middle + ring + pinky up (no thumb). */
function FourFingersSvg() {
  return (
    <svg viewBox="0 0 200 200" width="200" height="200" aria-hidden="true">
      <rect x="60" y="92" width="72" height="76" rx="26" {...PALM} />
      <rect x="60" y="28" width="16" height="76" rx="8" {...PALM} />
      <rect x="81" y="18" width="16" height="86" rx="8" {...PALM} />
      <rect x="102" y="18" width="16" height="86" rx="8" {...PALM} />
      <rect x="123" y="30" width="16" height="74" rx="8" {...PALM} />
      <rect x="68" y="106" width="56" height="18" rx="9" fill={OUTLINE} opacity={0.28} />
    </svg>
  )
}

/** Pinky only up. */
function PinkySvg() {
  return (
    <svg viewBox="0 0 200 200" width="200" height="200" aria-hidden="true">
      <rect x="62" y="90" width="70" height="78" rx="26" {...PALM} />
      <rect x="118" y="26" width="16" height="78" rx="8" {...PALM} />
      <rect x="72" y="104" width="54" height="18" rx="9" fill={OUTLINE} opacity={0.28} />
    </svg>
  )
}

export type SignPose =
  | "Palm"
  | "Fist"
  | "ThumbUp"
  | "ThumbDown"
  | "Peace"
  | "Point"
  | "Wave"
  | "ThreeFingers"
  | "FourFingers"
  | "Pinky"

const POSE_SVG: Record<SignPose, () => JSX.Element> = {
  Palm: PalmSvg,
  Fist: FistSvg,
  ThumbUp: ThumbUpSvg,
  ThumbDown: ThumbDownSvg,
  Peace: PeaceSvg,
  Point: PointSvg,
  Wave: WaveSvg,
  ThreeFingers: ThreeFingersSvg,
  FourFingers: FourFingersSvg,
  Pinky: PinkySvg,
}

/* ───────────────────── Keyword → pose mapping ───────────────────── */

/** Longer keys first so "thank you" wins over "you". */
const KEYWORD_TO_POSE: Array<[string, SignPose]> = [
  ["thank you", "Wave"],
  ["water", "ThreeFingers"],
  ["food", "FourFingers"],
  ["hungry", "FourFingers"],
  ["pain", "Fist"],
  ["help", "Pinky"],
  ["yes", "Fist"],
  ["no", "ThumbDown"],
  ["more", "Peace"],
  ["please", "Palm"],
  ["love", "Palm"],
  ["mother", "Wave"],
  ["father", "Point"],
  ["hello", "Wave"],
  ["stop", "Palm"],
  ["toilet", "Point"],
  ["happy", "Palm"],
  ["sad", "Fist"],
  ["tired", "Fist"],
  ["scared", "Fist"],
]

/** Parse free text into an ordered, de-duplicated pose sequence (max 4). */
export function posesForText(text: string): SignPose[] {
  const lower = text.toLowerCase()
  const poses: SignPose[] = []
  const seen = new Set<SignPose>()
  for (const [keyword, pose] of KEYWORD_TO_POSE) {
    if (lower.includes(keyword) && !seen.has(pose)) {
      seen.add(pose)
      poses.push(pose)
      if (poses.length >= 4) break
    }
  }
  return poses
}

/* ───────────────────── Component ───────────────────── */

const ENTER_MS = 300
const HOLD_MS = 800
const EXIT_MS = 200
const MAX_LOOPS = 3

interface Props {
  text: string
  onComplete?: () => void
  /** SVG render size (default 200). */
  size?: number
}

export function SignAvatar({ text, onComplete, size = 200 }: Props) {
  const poses = useMemo(() => posesForText(text), [text])
  const [index, setIndex] = useState(0)
  const [loop, setLoop] = useState(0)
  const completedRef = useRef(false)

  // Restart when the text changes.
  useEffect(() => {
    setIndex(0)
    setLoop(0)
    completedRef.current = false
  }, [text])

  const hasPoses = poses.length > 0

  useEffect(() => {
    if (!hasPoses) {
      if (!completedRef.current) {
        completedRef.current = true
        onComplete?.()
      }
      return
    }
    const isLast = index === poses.length - 1
    const finalLoop = loop >= MAX_LOOPS - 1
    const advance = window.setTimeout(
      () => {
        if (!isLast) {
          setIndex((i) => i + 1)
        } else if (!finalLoop) {
          setLoop((l) => l + 1)
          setIndex(0)
        } else if (!completedRef.current) {
          completedRef.current = true
          onComplete?.()
        }
      },
      ENTER_MS + HOLD_MS + EXIT_MS,
    )
    return () => window.clearTimeout(advance)
  }, [index, loop, poses.length, hasPoses, onComplete])

  const current = hasPoses ? poses[index] : null
  const Svg = current ? POSE_SVG[current] : null
  const total = hasPoses ? poses.length : 1

  const dotsStyle: CSSProperties = {
    display: "flex",
    gap: 7,
    justifyContent: "center",
    marginTop: 12,
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
          {Svg ? (
            <motion.div
              key={`${loop}-${index}`}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1, transition: { duration: ENTER_MS / 1000, ease: "easeOut" } }}
              exit={{
                opacity: 0,
                scale: 1.15,
                transition: { duration: EXIT_MS / 1000, ease: "easeIn" },
              }}
              style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <div style={{ transform: "scale(var(--avatar-scale, 1))", width: "100%", height: "100%" }}>
                <div style={{ width: "100%", height: "100%", transformOrigin: "center" }}>
                  <Svg />
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.span
              key="none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 64,
              }}
              aria-hidden="true"
            >
              🤟
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div style={{ height: 40, display: "flex", alignItems: "center" }}>
        <AnimatePresence mode="wait">
          {current && (
            <motion.span
              key={`${loop}-${index}-label`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.2 } }}
              exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
              style={{
                fontSize: 32,
                fontWeight: 900,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: COLORS.accentBright,
                textShadow: "0 0 22px rgba(0, 224, 255, 0.4)",
              }}
            >
              {current}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div style={dotsStyle} aria-hidden="true">
        {Array.from({ length: Math.max(3, Math.min(5, total)) }).map((_, i) => (
          <span
            key={i}
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background:
                hasPoses && i === index
                  ? COLORS.accentBright
                  : hasPoses && i < index
                    ? "rgba(0, 224, 255, 0.45)"
                    : "rgba(148, 163, 184, 0.3)",
              boxShadow: hasPoses && i === index ? "0 0 10px rgba(0, 224, 255, 0.7)" : "none",
              transition: "background 0.2s ease, box-shadow 0.2s ease",
            }}
          />
        ))}
      </div>
    </div>
  )
}

export default SignAvatar
