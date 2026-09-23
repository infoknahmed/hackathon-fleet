/**
 * Gesture heuristics — rotation-tolerant finger classifier used when no
 * trained model is available (fast fallback, runs every frame, zero deps).
 *
 * Extension is measured per-finger along the finger's own bone chain
 * (tip-to-MCP distance vs PIP-to-MCP length), which keeps working when the
 * hand is tilted sideways or upside-down — unlike naive tip-vs-MCP height.
 *
 * Detects 15 static gestures (the 5 dynamic ones need motion history and
 * are detected by the page's frame sequencer in SignLanguagePage).
 */

export interface HeuristicResult {
  gesture: string
  /** 0..1 heuristic strength (drives the hold-to-accept ring). */
  confidence: number
  /** True for thumbs-up / thumbs-down verdicts. */
  thumbVertical?: "up" | "down"
}

interface Landmark {
  x: number
  y: number
  z: number
}

const TIPS = [4, 8, 12, 16, 20]
const PIPS = [3, 6, 10, 14, 18]
const MCPS = [2, 5, 9, 13, 17]

/** Static gestures this classifier can recognise. */
export const HEURISTIC_GESTURES = [
  "Stop / Wait",     // open palm, 5 extended
  "Yes",             // fist
  "OK / Good",       // thumbs up
  "No / Bad",        // thumbs down
  "Point / Attention", // index only
  "Peace / Two",     // index + middle
  "Three",           // three fingers
  "Four",            // four fingers (no thumb)
  "Help / Emergency", // pinky only
  "Perfect",         // OK sign (thumb+index ring, 3 folded)
  "I love you",      // thumb + index + pinky
  "Hope",            // crossed index+middle (tips crossed, rest folded)
  "Eat / Food",      // closed hand near face
  "Me / I",          // index pointing at self
  "You",             // index pointing forward
] as const

function dist(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = (a.z ?? 0) - (b.z ?? 0)
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function dist2d(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Per-finger extension along its own bone direction — tilt-proof.
 * A finger is "extended" when the tip is farther from the MCP than the
 * straightened PIP→MCP distance (folded fingers curl the tip closer).
 */
export function fingerStates(lm: Landmark[]): {
  thumb: boolean
  index: boolean
  middle: boolean
  ring: boolean
  pinky: boolean
} {
  const extended = (fingerIdx: number): boolean => {
    const tip = lm[TIPS[fingerIdx]]
    const pip = lm[PIPS[fingerIdx]]
    const mcp = lm[MCPS[fingerIdx]]
    if (!tip || !pip || !mcp) return false
    const tipToMcp = dist(tip, mcp)
    const pipToMcp = dist(pip, mcp)
    return tipToMcp > pipToMcp * 1.08
  }
  return {
    thumb: extended(0),
    index: extended(1),
    middle: extended(2),
    ring: extended(3),
    pinky: extended(4),
  }
}

/** Thumb pointing up, down, or sideways relative to wrist→middle-MCP axis. */
function thumbDirection(lm: Landmark[]): "up" | "down" | "side" {
  const wrist = lm[0]
  const thumbTip = lm[4]
  const middleMcp = lm[9]
  if (!wrist || !thumbTip || !middleMcp) return "side"
  const handUp = wrist.y - middleMcp.y // positive when fingers point up
  const thumbDy = wrist.y - thumbTip.y
  if (thumbDy > handUp * 0.55 + 0.05) return "up"
  if (thumbDy < -0.05 && Math.abs(thumbDy) > Math.abs(handUp) * 0.4) return "down"
  return "side"
}

/** Wrist-to-hand size, used to normalize proximity checks. */
function handScale(lm: Landmark[]): number {
  const wrist = lm[0]
  const middleMcp = lm[9]
  return wrist && middleMcp ? dist2d(wrist, middleMcp) || 0.2 : 0.2
}

/**
 * Classify one hand's landmarks into one of the 15 static gestures.
 * Confidence is a heuristic strength (0.55–0.95) reflecting how cleanly
 * the finger pattern matches — it is a strength score, not a probability.
 */
export function classifyGesture(
  landmarks: Landmark[],
  motionDx = 0,
  context: { nearFace?: boolean; pointingAtSelf?: boolean } = {},
): HeuristicResult | null {
  if (!landmarks || landmarks.length < 21) return null
  const e = fingerStates(landmarks)
  const four = [e.index, e.middle, e.ring, e.pinky].filter(Boolean).length
  const allFive = four + (e.thumb ? 1 : 0)
  const score = (base: number, spread = 0.05): number =>
    Math.min(0.95, Math.max(0.55, base + spread))

  const thumbDir = thumbDirection(landmarks)

  // Only-thumb gestures: thumbs up / down (OK / Good vs No / Bad).
  if (four === 0 && e.thumb) {
    if (thumbDir === "up") return { gesture: "OK / Good", confidence: score(0.85), thumbVertical: "up" }
    if (thumbDir === "down") return { gesture: "No / Bad", confidence: score(0.85), thumbVertical: "down" }
    return null
  }

  // Fist: nothing extended.
  if (allFive === 0) {
    // Closed hand near face → "Eat / Food".
    if (context.nearFace) return { gesture: "Eat / Food", confidence: score(0.78) }
    return { gesture: "Yes", confidence: score(0.85) }
  }

  // OK sign: thumb+index form a ring (tips touching), 3 fingers folded.
  if (!e.middle && !e.ring && !e.pinky && e.index) {
    const thumbTip = landmarks[4]
    const indexTip = landmarks[8]
    if (thumbTip && indexTip && dist2d(thumbTip, indexTip) < handScale(landmarks) * 0.42) {
      return { gesture: "Perfect", confidence: score(0.82) }
    }
  }

  // Pointing: index only (attention / me / you).
  if (four === 1 && e.index && !e.thumb) {
    if (context.pointingAtSelf) return { gesture: "Me / I", confidence: score(0.8) }
    return { gesture: "Point / Attention", confidence: score(0.82) }
  }

  // Pinky only → Help / Emergency.
  if (four === 1 && e.pinky && !e.thumb) {
    return { gesture: "Help / Emergency", confidence: score(0.78) }
  }

  // Peace: index + middle.
  if (four === 2 && e.index && e.middle && !e.ring && !e.pinky) {
    const indexTip = landmarks[8]
    const middleTip = landmarks[12]
    // Crossed fingers: tips converge/cross while both extended.
    if (indexTip && middleTip) {
      const tipsDist = dist2d(indexTip, middleTip)
      const mcpDist = dist2d(landmarks[5], landmarks[9])
      if (tipsDist < mcpDist * 0.7) return { gesture: "Hope", confidence: score(0.72) }
    }
    return { gesture: "Peace / Two", confidence: score(0.82) }
  }

  // Three fingers.
  if (four === 3) {
    return { gesture: "Three", confidence: score(0.8) }
  }

  // Four fingers (no thumb) → Four.
  if (four === 4 && !e.thumb) {
    return { gesture: "Four", confidence: score(0.8) }
  }

  // I-love-you: thumb + index + pinky extended.
  if (e.thumb && e.index && e.pinky && !e.middle && !e.ring) {
    return { gesture: "I love you", confidence: score(0.8) }
  }

  // Open palm (5 extended) — static meaning depends on motion (wave = Hello).
  if (allFive === 5) {
    if (Math.abs(motionDx) > 0.12) {
      return { gesture: "Hello", confidence: score(0.78, 0.1) }
    }
    return { gesture: "Stop / Wait", confidence: score(0.85) }
  }

  // Thumb + four folded handled above; thumb + index (gun/point-forward).
  if (e.thumb && e.index && !e.middle && !e.ring && !e.pinky) {
    return { gesture: "You", confidence: score(0.7) }
  }

  return null
}
