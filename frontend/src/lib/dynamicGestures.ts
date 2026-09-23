/**
 * Dynamic gesture detection — frame-sequence analysis for gestures that
 * need motion over time (wave, come-here, rotate, give-me, two-hands).
 *
 * The page feeds per-frame hand data into a DynamicTracker; when a pattern
 * completes within its window, the tracker fires the gesture.
 */

interface Landmark {
  x: number
  y: number
  z: number
}

export interface DynamicResult {
  gesture: "Hello" | "Come here" | "More" | "Give me" | "Please"
  confidence: number
}

const WINDOW_MS = 1600

/** Oscillation / motion history over a rolling window. */
export class DynamicTracker {
  private samples: { t: number; wristX: number; wristY: number; z: number; palm: number }[] = []
  private lastFired: { gesture: string; at: number } | null = null

  reset(): void {
    this.samples = []
  }

  /**
   * Feed one frame. `twoHands` = both palms detected close together.
   * Returns a dynamic gesture when a pattern completes.
   */
  push(
    t: number,
    landmarks: Landmark[],
    twoHands: boolean,
    facingMirror: boolean,
  ): DynamicResult | null {
    const wrist = landmarks[0]
    const middleMcp = landmarks[9]
    if (!wrist || !middleMcp) return null

    this.samples.push({
      t,
      wristX: facingMirror ? -wrist.x : wrist.x,
      wristY: wrist.y,
      z: wrist.z ?? 0,
      palm: 1,
    })
    while (this.samples.length && t - this.samples[0].t > WINDOW_MS) this.samples.shift()

    // Cooldown so a completed gesture doesn't re-fire instantly.
    if (this.lastFired && t - this.lastFired.at < 2200) {
      if (this.lastFired.gesture !== "Please" || !twoHands) return null
    }

    // Two hands together → Please (hold both palms touching).
    if (twoHands) {
      const span = this.samples.filter((s) => s.t > t - 700)
      if (span.length >= 8) {
        this.lastFired = { gesture: "Please", at: t }
        return { gesture: "Please", confidence: 0.82 }
      }
      return null
    }

    if (this.samples.length < 8) return null

    const xs = this.samples.map((s) => s.wristX)
    const ys = this.samples.map((s) => s.wristY)
    const zs = this.samples.map((s) => s.z)
    const spanX = Math.max(...xs) - Math.min(...xs)
    const spanY = Math.max(...ys) - Math.min(...ys)
    const spanZ = Math.max(...zs) - Math.min(...zs)
    const duration = t - this.samples[0].t

    // Wave: ≥2 full side-to-side oscillations of the open palm.
    const zeroCrossings = countZeroCrossings(xs)
    if (spanX > 0.16 && zeroCrossings >= 3 && duration >= 700) {
      this.lastFired = { gesture: "Hello", at: t }
      this.samples = []
      return { gesture: "Hello", confidence: 0.85 }
    }

    // Come here: palm nodding downward (fingers tilt) — approximated by
    // quick downward wrist bounces without lateral travel.
    const downBounces = countZeroCrossings(ys)
    if (spanY > 0.09 && downBounces >= 2 && spanX < 0.12 && duration >= 500) {
      this.lastFired = { gesture: "Come here", at: t }
      this.samples = []
      return { gesture: "Come here", confidence: 0.75 }
    }

    // Palm rotating (More): alternating x AND y drift with moderate spans.
    if (spanX > 0.06 && spanY > 0.06 && zeroCrossings >= 2 && downBounces >= 2) {
      this.lastFired = { gesture: "More", at: t }
      this.samples = []
      return { gesture: "More", confidence: 0.7 }
    }

    // Give me: hand moves strongly toward the camera (z increases).
    if (spanZ > 0.05 && zs[zs.length - 1] < zs[0] - 0.03) {
      this.lastFired = { gesture: "Give me", at: t }
      this.samples = []
      return { gesture: "Give me", confidence: 0.72 }
    }

    return null
  }
}

/** Count direction changes (sign changes of the derivative) in a series. */
function countZeroCrossings(values: number[]): number {
  if (values.length < 3) return 0
  let crossings = 0
  let prevDelta = values[1] - values[0]
  for (let i = 2; i < values.length; i++) {
    const delta = values[i] - values[i - 1]
    if (Math.abs(delta) > 0.008 && Math.sign(delta) !== Math.sign(prevDelta) && Math.abs(prevDelta) > 0.008) {
      crossings += 1
    }
    if (Math.abs(delta) > 0.008) prevDelta = delta
  }
  return crossings
}
