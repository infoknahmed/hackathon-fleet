/**
 * Full-body signing pose library for the SigningAvatar.
 *
 * A pose is a declarative JSON snapshot of the avatar: hand placement +
 * finger curls, forearm rotation, head rotation/tilt and a facial
 * expression. One parametric renderer (SigningAvatar.tsx) draws every
 * pose, so the library scales without new artwork.
 *
 * Coordinate space (avatar units, roughly [-1, 1]):
 *   x: -1 = avatar's right (viewer's left) … +1 = avatar's left
 *   y: -1 = down … +1 = up (0 = shoulder line)
 *   Wrist positions are absolute; elbows are auto-placed by the renderer's
 *   two-bone IK solver.
 *
 * Fingers: order is always [thumb, index, middle, ring, pinky].
 *   curl 0 = straight, 1 = fully folded into the palm.
 * spread: 0 = fingers together, 1 = naturally spread wide.
 */

export type Expression = "neutral" | "happy" | "sad" | "angry" | "scared" | "surprised" | "pain" | "question" | "tired" | "speaking"

export interface FingerPose {
  /** Per-finger curl 0–1, order [thumb, index, middle, ring, pinky]. */
  curl: [number, number, number, number, number]
  /** Finger spread 0–1 (default 0.35). */
  spread?: number
}

export interface HandPose {
  /** Wrist position in avatar units. */
  x: number
  y: number
  /** Whole-hand rotation in degrees (clockwise positive). */
  rot?: number
  fingers: FingerPose
}

export interface SignPose {
  leftHand: HandPose
  rightHand: HandPose
  head: {
    /** Turn toward the avatar's left/right, degrees. */
    rotation: number
    /** Tilt (ear toward shoulder), degrees. */
    tilt: number
  }
  /** Face expression id rendered by the avatar. */
  expression: Expression
  /** Mouth open amount 0–1 (used while "speaking"). */
  mouthOpen?: number
  /** Milliseconds to hold this pose (after the ~320ms transition). */
  duration: number
}

/** Mirror a hand pose horizontally (right hand → left hand). */
export function mirrorHand(h: HandPose): HandPose {
  return { x: -h.x, y: h.y, rot: h.rot == null ? undefined : -h.rot, fingers: h.fingers }
}

/* ── Finger shape helpers ─────────────────────────────────────── */

const CURLED: [number, number, number, number, number] = [0.85, 1, 1, 1, 1]
const STRAIGHT: [number, number, number, number, number] = [0, 0, 0, 0, 0]
const FLAT: [number, number, number, number, number] = [0.15, 0.1, 0.1, 0.1, 0.1]
const FLAT_SPREAD: [number, number, number, number, number] = [0.2, 0.08, 0.08, 0.08, 0.08]

/* ── Neutral / rest pose ───────────────────────────────────────── */

export const NEUTRAL_POSE: SignPose = {
  leftHand: { x: -0.66, y: -0.6, rot: 8, fingers: { curl: FLAT } },
  rightHand: { x: 0.66, y: -0.6, rot: -8, fingers: { curl: FLAT } },
  head: { rotation: 0, tilt: 0 },
  expression: "neutral",
  duration: 260,
}

export function restPose(duration = 260): SignPose {
  return { ...NEUTRAL_POSE, duration }
}

/** Gentle idle pose — hands relaxed, head turned slightly toward a speaker. */
export function listeningPose(toward: "left" | "right" = "right"): SignPose {
  return {
    ...NEUTRAL_POSE,
    head: { rotation: toward === "right" ? 18 : -18, tilt: 4 },
    expression: "neutral",
  }
}

/* ── ISL one-handed alphabet (fingerspelling) ──────────────────── *
 * Dominant (right) hand at chest height; left hand rests.          */

export const ALPHABET: Record<string, SignPose> = {
  A: p(0.62, 0.05, [0.25, 1, 1, 1, 1]),
  B: p(0.58, 0.12, [0.9, 0, 0, 0, 0], { spread: 0.05 }),
  C: p(0.6, 0.1, [0.45, 0.45, 0.45, 0.45, 0.45], { rot: -15 }),
  D: p(0.6, 0.12, [0.55, 0, 1, 1, 1]),
  E: p(0.62, 0.05, [0.65, 0.9, 0.9, 0.9, 0.9]),
  F: p(0.6, 0.1, [0.15, 0.8, 0.05, 0.05, 0.05]),
  G: p(0.66, -0.05, [0.5, 0.3, 1, 1, 1], { rot: -70 }),
  H: p(0.66, -0.02, [1, 0, 0, 1, 1], { rot: -75 }),
  I: p(0.6, 0.08, [1, 1, 1, 1, 0]),
  J: p(0.6, 0.08, [1, 1, 1, 1, 0], { rot: -30, motion: true }),
  K: p(0.62, 0.16, [0.35, 0, 0.4, 1, 1], { rot: 18 }),
  L: p(0.58, 0.1, [0, 0, 1, 1, 1], { rot: -40 }),
  M: p(0.64, 0.02, [1, 0.85, 0.85, 0.85, 1], { rot: -70 }),
  N: p(0.64, 0.02, [1, 0.85, 0.85, 1, 1], { rot: -70 }),
  O: p(0.6, 0.1, [0.5, 0.5, 0.55, 0.55, 0.55], { rot: -10 }),
  P: p(0.6, -0.1, [0.4, 0.3, 0.5, 1, 1], { rot: -160 }),
  Q: p(0.6, -0.15, [0.5, 0.4, 1, 1, 1], { rot: -165 }),
  R: p(0.6, 0.1, [1, 0.12, 0.12, 1, 1]),
  S: p(0.6, 0.05, [0.4, 1, 1, 1, 1]),
  T: p(0.62, 0.04, [0.35, 0.9, 1, 1, 1]),
  U: p(0.6, 0.12, [1, 0, 0, 1, 1], { spread: 0 }),
  V: p(0.6, 0.12, [1, 0.12, 0.12, 1, 1], { spread: 0.6 }),
  W: p(0.6, 0.12, [0.2, 0, 0, 0, 1], { spread: 0.7 }),
  X: p(0.6, 0.1, [1, 0.55, 1, 1, 1]),
  Y: p(0.6, 0.1, [0, 1, 1, 1, 0], { spread: 0.7 }),
  Z: p(0.6, 0.1, [1, 0.5, 1, 1, 0], { motion: true }),
}

/* ── Numbers 0–9 ───────────────────────────────────────────────── */

export const NUMBERS: Record<string, SignPose> = {
  "0": p(0.6, 0.1, [0.5, 0.5, 0.5, 0.5, 0.5]),
  "1": p(0.6, 0.12, [1, 0, 1, 1, 1]),
  "2": p(0.6, 0.12, [1, 0, 0, 1, 1], { spread: 0.4 }),
  "3": p(0.6, 0.12, [0, 0, 0, 1, 1], { spread: 0.5 }),
  "4": p(0.6, 0.12, [1, 0, 0, 0, 0], { spread: 0.5 }),
  "5": p(0.6, 0.14, STRAIGHT, { spread: 1 }),
  "6": p(0.6, 0.1, [0.35, 1, 0, 0, 0], { spread: 0.5 }),
  "7": p(0.6, 0.1, [0.35, 1, 1, 0, 0], { spread: 0.5 }),
  "8": p(0.6, 0.1, [0.35, 1, 1, 1, 0], { spread: 0.5 }),
  "9": p(0.6, 0.1, [0.4, 0.5, 1, 1, 1]),
}

/* ── Common word signs ─────────────────────────────────────────── *
 * Two-handed where the sign calls for it; face markers expressed     *
 * via expression + head pose.                                        */

export const WORD_SIGNS: Record<string, SignPose> = {
  // Greetings & politeness
  hello: two(p(0.82, 0.55, FLAT_SPREAD, { rot: -35, spread: 1 }), restHand(), "happy", 520, true),
  hi: two(p(0.8, 0.5, FLAT_SPREAD, { rot: -30, spread: 1 }), restHand(), "happy", 420, true),
  goodbye: two(p(0.82, 0.55, FLAT_SPREAD, { rot: -35, spread: 1 }), restHand(), "happy", 520, true),
  "thank you": two(p(0.5, 0.35, FLAT), restHand(), "happy", 560, true),
  please: two({ x: 0.45, y: 0.05, rot: -12, fingers: { curl: FLAT } }, { x: -0.45, y: 0.05, rot: 12, fingers: { curl: FLAT } }, "neutral", 560),
  sorry: two(p(0.35, 0.12, CURLED), restHand(), "sad", 520),

  // Needs
  water: two(p(0.28, 0.55, [0.4, 0.75, 0.05, 0.05, 0.05], { rot: 20 }), restHand(), "neutral", 540),
  drink: two(p(0.28, 0.55, [0.4, 0.75, 0.05, 0.05, 0.05], { rot: 20 }), restHand(), "neutral", 540),
  thirsty: two(p(0.28, 0.5, [0.4, 0.75, 0.05, 0.05, 0.05], { rot: 20 }), restHand(), "tired", 540),
  food: two(p(0.3, 0.58, [0.5, 0.85, 0.85, 0.85, 0.85]), restHand(), "neutral", 560),
  eat: two(p(0.3, 0.58, [0.5, 0.85, 0.85, 0.85, 0.85]), restHand(), "neutral", 560),
  hungry: two(p(0.3, 0.55, [0.5, 0.85, 0.85, 0.85, 0.85]), restHand(), "tired", 560),
  sleep: two(p(0.35, 0.2, [0.35, 1, 1, 1, 1]), restHand(), "tired", 560),
  tired: two(p(0.3, 0.05, [0.4, 0.6, 0.6, 0.6, 0.6]), { x: -0.3, y: 0.05, fingers: { curl: [0.4, 0.6, 0.6, 0.6, 0.6] } }, "tired", 600),
  help: two(p(0.5, 0.0, [0, 1, 1, 1, 1]), { x: -0.42, y: 0.0, rot: 90, fingers: { curl: FLAT } }, "surprised", 600),
  want: two({ x: 0.55, y: -0.05, rot: 20, fingers: { curl: [0.45, 0.55, 0.55, 0.55, 0.55] } }, { x: -0.55, y: -0.05, rot: -20, fingers: { curl: [0.45, 0.55, 0.55, 0.55, 0.55] } }, "neutral", 560),
  need: two({ x: 0.55, y: -0.05, rot: 20, fingers: { curl: [0.45, 0.55, 0.55, 0.55, 0.55] } }, { x: -0.55, y: -0.05, rot: -20, fingers: { curl: [0.45, 0.55, 0.55, 0.55, 0.55] } }, "neutral", 560),
  go: two(p(0.7, -0.1, [0.2, 0, 0, 1, 1], { rot: -45 }), restHand(), "neutral", 480),
  come: two(p(0.5, 0.1, FLAT_SPREAD, { spread: 1 }), restHand(), "neutral", 520),
  give: two(p(0.4, -0.05, [0.4, 0.6, 0.6, 0.6, 0.6]), restHand(), "neutral", 520),
  take: two(p(0.4, -0.05, [0.4, 0.6, 0.6, 0.6, 0.6]), restHand(), "neutral", 520),
  finish: two({ x: 0.5, y: 0.05, rot: 35, fingers: { curl: FLAT_SPREAD, spread: 0.8 } }, { x: -0.5, y: 0.05, rot: -35, fingers: { curl: FLAT_SPREAD, spread: 0.8 } }, "neutral", 520),
  wait: two(p(0.35, 0.0, [0.2, 0.2, 0.2, 0.2, 0.2]), restHand(), "neutral", 560),

  // Responses
  yes: two(p(0.35, 0.5, [0.35, 1, 1, 1, 1]), restHand(), "happy", 460, true),
  no: two(p(0.35, 0.3, [0.2, 0.2, 0.2, 0.2, 0.2], { rot: -20 }), restHand(), "sad", 460, true),
  more: two({ x: 0.28, y: 0.25, fingers: { curl: [0.4, 0.5, 0.5, 0.5, 0.5] } }, { x: -0.28, y: 0.25, fingers: { curl: [0.4, 0.5, 0.5, 0.5, 0.5] } }, "neutral", 560),
  good: two(p(0.35, 0.3, [0.35, 1, 1, 1, 1]), restHand(), "happy", 520, true),
  bad: two(p(0.35, -0.2, [0.35, 1, 1, 1, 1], { rot: 180 }), restHand(), "sad", 520),
  stop: two(p(0.55, 0.1, FLAT_SPREAD, { spread: 1 }), restHand(), "surprised", 480),
  like: two(p(0.35, 0.35, [0.35, 1, 1, 1, 1]), restHand(), "happy", 520, true),

  // Emotions
  happy: two(p(0.5, 0.4, [0.4, 0.85, 0.85, 0.85, 0.85]), restHand(), "happy", 560, true),
  sad: two(p(0.3, 0.15, [0.4, 0.85, 0.85, 0.85, 0.85]), restHand(), "sad", 560),
  angry: two({ x: 0.35, y: 0.35, rot: -25, fingers: { curl: [0.45, 0.9, 0.9, 0.9, 0.9] } }, restHand(), "angry", 560),
  scared: two({ x: 0.45, y: 0.45, fingers: { curl: [0.4, 0.5, 0.5, 0.5, 0.5] } }, { x: -0.45, y: 0.45, fingers: { curl: [0.4, 0.5, 0.5, 0.5, 0.5] } }, "scared", 560),
  love: two({ x: 0.4, y: 0.2, fingers: { curl: [0.2, 0, 1, 1, 0] } }, restHand(), "happy", 560),
  "i love you": two(p(0.6, 0.35, [0, 0, 1, 1, 0], { spread: 0.8 }), restHand(), "happy", 620),

  // Family & people
  mother: two(p(0.28, 0.45, [0.5, 0.85, 0.85, 0.85, 0.85]), restHand(), "happy", 560),
  father: two(p(0.28, 0.72, [0.5, 0.85, 0.85, 0.85, 0.85]), restHand(), "happy", 560),
  sister: two(p(0.28, 0.45, [0.4, 0.85, 0.85, 0.85, 0.85]), restHand(), "happy", 560),
  brother: two(p(0.28, 0.45, [0.4, 0.85, 0.85, 0.85, 0.85]), restHand(), "happy", 560),
  friend: two({ x: 0.35, y: -0.05, fingers: { curl: [0.5, 0.5, 1, 1, 0.5] } }, { x: -0.35, y: -0.05, fingers: { curl: [0.5, 0.5, 1, 1, 0.5] } }, "happy", 560),
  family: two({ x: 0.35, y: -0.05, fingers: { curl: FLAT_SPREAD, spread: 0.9 } }, { x: -0.35, y: -0.05, rot: 10, fingers: { curl: FLAT_SPREAD, spread: 0.9 } }, "happy", 600),

  // Places
  school: two({ x: 0.45, y: 0.15, rot: -20, fingers: { curl: [1, 0.5, 0.5, 1, 1] } }, { x: -0.45, y: 0.15, rot: 20, fingers: { curl: [1, 0.5, 0.5, 1, 1] } }, "neutral", 560),
  home: two(p(0.28, 0.5, [0.4, 0.5, 0.5, 0.5, 0.5]), restHand(), "happy", 560),
  doctor: two(p(0.45, 0.25, [0.35, 0.85, 0.85, 0.85, 0.85]), { x: -0.45, y: 0.25, rot: 15, fingers: { curl: FLAT } }, "neutral", 560),
  hospital: two({ x: 0.35, y: 0.15, rot: -15, fingers: { curl: [1, 0.5, 0.5, 1, 1] } }, { x: -0.35, y: 0.15, rot: 15, fingers: { curl: [1, 0.5, 0.5, 1, 1] } }, "neutral", 560),
  bathroom: two({ x: 0.35, y: 0.3, rot: -15, fingers: { curl: [0.4, 0.85, 0.85, 0.85, 0.85] } }, { x: -0.35, y: 0.3, rot: 15, fingers: { curl: [0.4, 0.85, 0.85, 0.85, 0.85] } }, "neutral", 560),
  toilet: two({ x: 0.35, y: 0.3, rot: -15, fingers: { curl: [0.4, 0.85, 0.85, 0.85, 0.85] } }, { x: -0.35, y: 0.3, rot: 15, fingers: { curl: [0.4, 0.85, 0.85, 0.85, 0.85] } }, "neutral", 560),
  work: two({ x: 0.42, y: 0.0, fingers: { curl: [0.5, 0.85, 0.85, 0.85, 0.85] } }, { x: -0.42, y: 0.0, rot: 90, fingers: { curl: FLAT } }, "neutral", 560),

  // Communication
  speak: two(p(0.3, 0.45, [0.2, 0.2, 0.2, 0.2, 0.2]), restHand(), "speaking", 520),
  listen: two(p(0.45, 0.4, [0.2, 0.2, 0.2, 0.2, 0.2]), restHand(), "neutral", 520),
  look: two(p(0.45, 0.6, [0.2, 0.2, 0.2, 0.2, 0.2]), restHand(), "neutral", 520),
  quiet: two(p(0.25, 0.45, [0.35, 0.85, 1, 1, 1]), restHand(), "neutral", 520),
  learn: two(p(0.3, 0.5, [0.4, 0.85, 0.85, 0.85, 0.85]), restHand(), "neutral", 560),

  // Pain / body
  pain: two({ x: 0.3, y: 0.55, rot: 8, fingers: { curl: [0.5, 0.85, 0.85, 0.85, 0.85] } }, { x: -0.3, y: 0.55, rot: -8, fingers: { curl: [0.5, 0.85, 0.85, 0.85, 0.85] } }, "pain", 600),
  headache: two({ x: 0.3, y: 0.75, rot: 8, fingers: { curl: [0.5, 0.85, 0.85, 0.85, 0.85] } }, { x: -0.3, y: 0.75, rot: -8, fingers: { curl: [0.5, 0.85, 0.85, 0.85, 0.85] } }, "pain", 620),
  chest: two({ x: 0.3, y: 0.05, rot: 8, fingers: { curl: [0.5, 0.85, 0.85, 0.85, 0.85] } }, { x: -0.3, y: 0.05, rot: -8, fingers: { curl: [0.5, 0.85, 0.85, 0.85, 0.85] } }, "pain", 560),
  hot: two(p(0.28, 0.5, [0.5, 0.85, 0.85, 0.85, 0.85]), restHand(), "surprised", 520),
  cold: two({ x: 0.4, y: 0.25, rot: -20, fingers: { curl: [0.45, 0.9, 0.9, 0.9, 0.9] } }, restHand(), "tired", 520),
  head: two(p(0.35, 0.75, FLAT), restHand(), "neutral", 480),
  stomach: two(p(0.3, -0.2, [0.5, 0.85, 0.85, 0.85, 0.85]), restHand(), "pain", 520),

  // Pronouns & misc
  i: two(p(0.5, 0.05, [1, 0, 1, 1, 1]), restHand(), "neutral", 440),
  me: two(p(0.45, 0.05, [1, 0, 1, 1, 1]), restHand(), "neutral", 440),
  you: two(p(0.55, 0.05, [1, 0, 1, 1, 1], { rot: -30 }), restHand(), "neutral", 440),
  my: two(p(0.45, 0.05, FLAT), restHand(), "neutral", 440),
  name: two({ x: 0.4, y: 0.15, rot: -15, fingers: { curl: [1, 0.12, 0.12, 1, 1] } }, { x: -0.4, y: 0.15, rot: 15, fingers: { curl: [1, 0.12, 0.12, 1, 1] } }, "neutral", 560),
  again: two({ x: 0.4, y: 0.0, rot: -15, fingers: { curl: [0.4, 0.6, 0.6, 0.6, 0.6] } }, restHand(), "neutral", 520, true),
  play: two({ x: 0.5, y: 0.0, rot: -20, fingers: { curl: [0.3, 0.5, 0.5, 0.5, 0.5] } }, { x: -0.5, y: 0.0, rot: 20, fingers: { curl: [0.3, 0.5, 0.5, 0.5, 0.5] } }, "happy", 560),
}

/** Extra one-off word signs used by phrases (merged into lookup). */
export const EXTRA_WORD_SIGNS: Record<string, SignPose> = {
  how: two({ x: 0.45, y: 0.1, rot: 8, fingers: { curl: [0.45, 0.5, 0.5, 0.5, 0.5] } }, { x: -0.45, y: 0.1, rot: -8, fingers: { curl: [0.45, 0.5, 0.5, 0.5, 0.5] } }, "question", 560),
  are: two(p(0.35, 0.05, FLAT), restHand(), "neutral", 380),
  am: two(p(0.35, 0.05, FLAT), restHand(), "neutral", 380),
  is: two(p(0.35, 0.05, FLAT), restHand(), "neutral", 380),
  in: two({ x: 0.35, y: 0.05, fingers: { curl: [0.5, 0.5, 0.5, 0.5, 0.5] } }, restHand(), "neutral", 420),
  to: two(p(0.45, 0.0, [1, 0.6, 1, 1, 1]), restHand(), "neutral", 380),
  the: two(p(0.35, 0.0, FLAT), restHand(), "neutral", 360),
  a: p(0.62, 0.05, [0.25, 1, 1, 1, 1]),
  have: two({ x: 0.45, y: 0.05, rot: -10, fingers: { curl: CURLED } }, restHand(), "neutral", 460),
  call: two({ x: 0.5, y: 0.25, rot: -10, fingers: { curl: [1, 0, 1, 1, 1] } }, restHand(), "neutral", 500),
  where: two({ x: 0.4, y: 0.25, rot: -15, fingers: { curl: [1, 0.12, 0.12, 1, 1] } }, restHand(), "question", 520),
  not: two({ x: 0.4, y: 0.1, rot: -12, fingers: { curl: [1, 0.3, 0.3, 0.3, 0.3] } }, restHand(), "sad", 460),
  do: two(p(0.4, -0.05, [1, 0.6, 1, 1, 1]), restHand(), "neutral", 420),
  understand: two(p(0.5, 0.6, [1, 0, 1, 1, 1]), restHand(), "question", 520),
  morning: two({ x: 0.4, y: 0.15, rot: 25, fingers: { curl: FLAT } }, { x: -0.4, y: 0.15, rot: -25, fingers: { curl: FLAT } }, "happy", 520),
  very: two(p(0.3, 0.05, FLAT_SPREAD, { spread: 0.9 }), restHand(), "neutral", 420),
  much: two({ x: 0.5, y: -0.1, fingers: { curl: [0.4, 0.5, 0.5, 0.5, 0.5] } }, restHand(), "neutral", 460),
  thank: two(p(0.5, 0.35, FLAT), restHand(), "happy", 520),
}


/* ── Phrases — each is a full avatar sequence ──────────────────── */

export interface PhraseSequence {
  id: string
  label: string
  poses: SignPose[]
  /** Token per pose (aligned 1:1 with poses). */
  tokens: string[]
}

/** Build a phrase sequence from word tokens (word-signs or spelled letters). */
function phrase(id: string, tokens: string[], expr: Expression = "neutral", emotionEvery = false): PhraseSequence {
  const poses: SignPose[] = []
  const aligned: string[] = []
  for (const t of tokens) {
    const pose = lookupPose(t)
    if (!pose) continue
    poses.push({ ...pose, expression: emotionEvery ? expr : pose.expression, duration: pose.duration })
    aligned.push(t)
  }
  return { id, label: tokens.join(" "), poses, tokens: aligned }
}

export const PHRASES: Record<string, PhraseSequence> = {
  "hello how are you": phrase("hello-how-are-you", ["hello", "you", "how", "are", "you"], "happy", true),
  "i need water": phrase("i-need-water", ["i", "need", "water"], "neutral", true),
  "i need food": phrase("i-need-food", ["i", "need", "food"], "neutral", true),
  "i am hungry": phrase("i-am-hungry", ["i", "am", "hungry"], "tired", true),
  "i am tired": phrase("i-am-tired", ["i", "am", "tired"], "tired", true),
  "i am happy": phrase("i-am-happy", ["i", "am", "happy"], "happy", true),
  "i am scared": phrase("i-am-scared", ["i", "am", "scared"], "scared", true),
  "i am in pain": phrase("i-am-in-pain", ["i", "am", "in", "pain"], "pain", true),
  "i have a headache": phrase("i-have-headache", ["i", "have", "headache"], "pain", true),
  "please help me": phrase("please-help-me", ["please", "help", "me"], "surprised", true),
  "please call my mother": phrase("please-call-mother", ["please", "call", "my", "mother"], "surprised", true),
  "i love you": phrase("i-love-you", ["i", "love", "you"], "happy", true),
  "where is the bathroom": phrase("where-bathroom", ["where", "is", "the", "bathroom"], "neutral", true),
  "i want to go home": phrase("i-want-home", ["i", "want", "to", "go", "home"], "sad", true),
  "i need a doctor": phrase("i-need-doctor", ["i", "need", "doctor"], "pain", true),
  "good morning": phrase("good-morning", ["good", "morning"], "happy", true),
  "thank you very much": phrase("thank-you-much", ["thank", "you", "very", "much"], "happy", true),
  "my name is": phrase("my-name-is", ["my", "name", "is"], "happy", true),
  "how are you": phrase("how-are-you", ["how", "are", "you"], "question", true),
  "i do not understand": phrase("i-not-understand", ["i", "do", "not", "understand"], "question", true),
}

/* ── Emotion overlays (for sentiment-driven expression) ────────── */

export const EMOTION_POSES: Record<string, Partial<SignPose>> = {
  happy: { expression: "happy" },
  sad: { expression: "sad" },
  angry: { expression: "angry" },
  scared: { expression: "scared" },
  surprised: { expression: "surprised" },
  question: { expression: "question" },
  pain: { expression: "pain" },
  tired: { expression: "tired" },
  speaking: { expression: "speaking", mouthOpen: 0.6 },
  listening: { expression: "neutral", head: { rotation: 18, tilt: 4 } },
}

/* ── Public lookup API ─────────────────────────────────────────── */

export function lookupPose(token: string): SignPose | null {
  const t = token.toLowerCase().replace(/[^a-z0-9]/g, "")
  if (!t) return null
  if (EXTRA_WORD_SIGNS[t]) return EXTRA_WORD_SIGNS[t]
  if (WORD_SIGNS[t]) return WORD_SIGNS[t]
  if (NUMBERS[t]) return NUMBERS[t]
  if (t.length === 1 && ALPHABET[t.toUpperCase()]) return ALPHABET[t.toUpperCase()]
  return null
}

export function hasWordSign(word: string): boolean {
  const t = word.toLowerCase().replace(/[^a-z]/g, "")
  return Boolean(WORD_SIGNS[t] || EXTRA_WORD_SIGNS[t])
}

export const POSE_LIBRARY_SIZE =
  Object.keys(ALPHABET).length +
  Object.keys(NUMBERS).length +
  Object.keys(WORD_SIGNS).length +
  Object.keys(EXTRA_WORD_SIGNS).length +
  Object.keys(PHRASES).length

/* ── Internal builders ─────────────────────────────────────────── */

/** Single-hand pose: dominant right hand, left hand at rest. */
function p(
  x: number,
  y: number,
  curl: [number, number, number, number, number],
  extra: { rot?: number; spread?: number; motion?: boolean } = {},
): SignPose {
  return {
    leftHand: restHand(),
    rightHand: { x, y, rot: extra.rot, fingers: { curl, spread: extra.spread ?? 0.35 } },
    head: { rotation: 0, tilt: 0 },
    expression: "neutral",
    duration: 480,
  }
}

/** Two explicit hands. Accepts a bare hand or a single-hand pose for the right side. */
function two(
  right: SignPose | HandPose,
  left: HandPose,
  expression: Expression,
  duration = 520,
  motion = false,
): SignPose {
  void motion // location/motion cues are rendered via springs + hold timing
  const rightHand: HandPose =
    "x" in right && "fingers" in right ? (right as HandPose) : (right as SignPose).rightHand
  return {
    leftHand: left,
    rightHand,
    head: { rotation: 0, tilt: 0 },
    expression,
    duration,
  }
}

/** Relaxed resting left hand. */
export function restHand(): HandPose {
  return { x: -0.66, y: -0.6, rot: 8, fingers: { curl: FLAT } }
}
