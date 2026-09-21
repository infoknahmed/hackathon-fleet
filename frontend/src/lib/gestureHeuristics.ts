/**
 * Gesture heuristics — finger-position classifier used when no trained
 * model is available (fast fallback, runs every frame, zero deps).
 */

export interface HeuristicResult {
  gesture: string
  /** 0..1 heuristic strength (drives the hold-to-accept ring). */
  confidence: number
}

interface Landmark {
  x: number
  y: number
  z: number
}

/** Mirror of MediaPipe hand connections for reference. */
const FINGER_TIPS = [4, 8, 12, 16, 20]
const FINGER_MCPS = [2, 5, 9, 13, 17]

export const HEURISTIC_GESTURES = [
  "Stop",
  "Yes",
  "OK",
  "No",
  "Peace",
  "Point",
  "Hello",
  "Water",
  "Food",
  "Help",
] as const

/**
 * Finger extension via tip-vs-MCP height for the four fingers, thumb
 * judged against the wrist direction (works for upright and tilted hands).
 */
export function fingerStates(lm: Landmark[]): {
  thumb: boolean
  index: boolean
  middle: boolean
  ring: boolean
  pinky: boolean
} {
  const tip = (i: number) => lm[FINGER_TIPS[i]]
  const mcp = (i: number) => lm[FINGER_MCPS[i]]

  const thumbTip = tip(0)
  const thumbMcp = mcp(0)
  const wrist = lm[0]
  const thumbUp = Boolean(
    thumbTip && thumbMcp && wrist && Math.abs(thumbTip.y - thumbMcp.y) > 0.04,
  )

  const four = (i: number): boolean => {
    const t = tip(i)
    const m = mcp(i)
    return Boolean(t && m && t.y < m.y)
  }

  return {
    thumb: thumbUp,
    index: four(1),
    middle: four(2),
    ring: four(3),
    pinky: four(4),
  }
}

/** Horizontal wrist velocity over the recent window (wave detection). */
export interface WaveTracker {
  push(x: number, t: number): number
  reset(): void
}

export function createWaveTracker(windowMs = 900): WaveTracker {
  let samples: { t: number; x: number }[] = []
  return {
    push(x: number, t: number): number {
      samples.push({ t, x })
      while (samples.length && t - samples[0].t > windowMs) samples.shift()
      const oldest = samples[0]
      return oldest && t - oldest.t >= 250 ? Math.abs(x - oldest.x) : 0
    },
    reset() {
      samples = []
    },
  }
}

/**
 * Classify one hand's landmarks into one of the 10 heuristic gestures.
 * Confidence is a heuristic strength (0.55–0.9) proportional to how
 * cleanly the finger pattern matches, never a probability.
 */
export function classifyGesture(
  landmarks: Landmark[],
  motionDx = 0,
): HeuristicResult | null {
  if (!landmarks || landmarks.length < 21) return null
  const e = fingerStates(landmarks)
  const four = [e.index, e.middle, e.ring, e.pinky].filter(Boolean).length
  const allFive = four + (e.thumb ? 1 : 0)
  const wrist = landmarks[0]
  const thumbTip = landmarks[4]

  // Cleanly-extended count drives the confidence heuristic.
  const score = (base: number, spread: number): number =>
    Math.min(0.9, Math.max(0.55, base + spread))

  // Thumbs down / thumbs up (only thumb extended).
  if (four === 0 && e.thumb) {
    if (wrist && thumbTip) {
      const dy = wrist.y - thumbTip.y
      if (dy > 0.06) return { gesture: "OK", confidence: score(0.8, 0.05) }
      if (dy < -0.06) return { gesture: "No", confidence: score(0.8, 0.05) }
    }
    return null
  }

  if (four === 0 && !e.thumb) return { gesture: "Yes", confidence: score(0.85, 0.05) }
  if (four === 1 && e.index) return { gesture: "Point", confidence: score(0.8, 0.05) }
  if (four === 1 && e.pinky) return { gesture: "Help", confidence: score(0.75, 0.05) }
  if (four === 2 && e.index && e.middle) return { gesture: "Peace", confidence: score(0.8, 0.05) }

  if (four === 3) {
    if (e.index && e.middle && e.ring) return { gesture: "Water", confidence: score(0.78, 0.06) }
    if (e.index && e.pinky) return null // thumb+index+pinky: ambiguous
    return null
  }

  if (four === 4) {
    // Open palm with or without thumb.
    if (allFive === 5) {
      return Math.abs(motionDx) > 0.12
        ? { gesture: "Hello", confidence: score(0.75, 0.1) }
        : { gesture: "Stop", confidence: score(0.82, 0.06) }
    }
    return { gesture: "Food", confidence: score(0.78, 0.06) }
  }

  return null
}
