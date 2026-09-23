/**
 * Parametric SVG hand-pose library for Text → Sign.
 *
 * Instead of 50 hand-drawn SVGs, each pose is defined by finger curl
 * amounts + hand rotation, rendered by one parametric component in
 * SignAvatar. This covers the ISL one-handed alphabet (fingerspelling),
 * numbers, and 40+ common word signs — 70+ poses total.
 */

export interface HandPoseDef {
  id: string
  /** Labels the pose shows under the animation. */
  label: string
  /** Per-finger curl: 0 = straight, 1 = fully folded. Order: thumb,index,middle,ring,pinky. */
  curl: [number, number, number, number, number]
  /** Whole-hand rotation in degrees. */
  rotate?: number
  /** Hand offset x (-1 left … 1 right), used for location cues. */
  offsetX?: number
  /** Hand offset y (-1 up … 1 down), used for location cues. */
  offsetY?: number
  /** Draw motion arcs next to the hand (wave, come-here…). */
  motion?: boolean
  /** Draw a second hand (for two-handed signs). */
  secondHand?: "mirror" | "flat"
  /** A face marker: chin (eat), ear (listen), lips (speak). */
  face?: "chin" | "ear" | "lips" | "eye"
}

const P = (
  id: string,
  label: string,
  curl: [number, number, number, number, number],
  extra: Partial<HandPoseDef> = {},
): HandPoseDef => ({ id, label, curl, ...extra })

/* ── ISL one-handed alphabet (fingerspelling poses) ─────────────── */

export const ALPHABET: Record<string, HandPoseDef> = {
  A: P("A", "A", [0.2, 1, 1, 1, 1]),
  B: P("B", "B", [1, 0, 0, 0, 0]),
  C: P("C", "C", [0.45, 0.45, 0.45, 0.45, 0.45]),
  D: P("D", "D", [0.5, 0, 1, 1, 1]),
  E: P("E", "E", [0.6, 0.9, 0.9, 0.9, 0.9]),
  F: P("F", "F", [0.1, 0.75, 0, 0, 0]),
  G: P("G", "G", [0.5, 0.3, 1, 1, 1], { rotate: 90 }),
  H: P("H", "H", [1, 0, 0, 1, 1], { rotate: 90 }),
  I: P("I", "I", [1, 1, 1, 1, 0]),
  J: P("J", "J", [1, 1, 1, 1, 0], { motion: true }),
  K: P("K", "K", [0.3, 0, 0.35, 1, 1], { rotate: 20 }),
  L: P("L", "L", [0, 0, 1, 1, 1], { rotate: 45 }),
  M: P("M", "M", [1, 0.85, 0.85, 0.85, 1], { rotate: 90 }),
  N: P("N", "N", [1, 0.85, 0.85, 1, 1], { rotate: 90 }),
  O: P("O", "O", [0.5, 0.5, 0.55, 0.55, 0.55]),
  P: P("P", "P", [0.4, 0.3, 0.5, 1, 1], { rotate: 160 }),
  Q: P("Q", "Q", [0.5, 0.4, 1, 1, 1], { rotate: 160 }),
  R: P("R", "R", [1, 0.12, 0.12, 1, 1]),
  S: P("S", "S", [0.4, 1, 1, 1, 1]),
  T: P("T", "T", [0.35, 0.9, 1, 1, 1]),
  U: P("U", "U", [1, 0, 0, 1, 1]),
  V: P("V", "V", [1, 0.15, 0.15, 1, 1]),
  W: P("W", "W", [0.2, 0, 0, 0, 1]),
  X: P("X", "X", [1, 0.55, 1, 1, 1]),
  Y: P("Y", "Y", [0, 1, 1, 1, 0]),
  Z: P("Z", "Z", [1, 0.5, 1, 1, 0], { motion: true }),
}

/* ── Numbers ────────────────────────────────────────────────────── */

export const NUMBERS: Record<string, HandPoseDef> = {
  "1": P("1", "1", [1, 0, 1, 1, 1]),
  "2": P("2", "2", [1, 0, 0, 1, 1]),
  "3": P("3", "3", [0, 0, 0, 1, 1]),
  "4": P("4", "4", [1, 0, 0, 0, 0]),
  "5": P("5", "5", [0, 0, 0, 0, 0]),
  "6": P("6", "6", [0.35, 1, 0, 0, 0]),
  "7": P("7", "7", [0.35, 1, 1, 0, 0]),
  "8": P("8", "8", [0.35, 1, 1, 1, 0]),
  "9": P("9", "9", [0.4, 0.5, 1, 1, 1]),
  "0": P("0", "0", [0.5, 0.5, 0.5, 0.5, 0.5]),
}

/* ── Common word signs ──────────────────────────────────────────── */

export const WORD_SIGNS: Record<string, HandPoseDef> = {
  hello: P("hello", "Hello", [0, 0, 0, 0, 0], { motion: true, rotate: -15 }),
  hi: P("hi", "Hello", [0, 0, 0, 0, 0], { motion: true }),
  water: P("water", "Water", [0.4, 0.75, 0, 0, 0], { face: "chin" }),
  drink: P("drink", "Drink", [0.4, 0.75, 0, 0, 0], { face: "chin" }),
  food: P("food", "Food", [0.5, 0.85, 0.85, 0.85, 0.85], { face: "chin" }),
  eat: P("eat", "Eat", [0.5, 0.85, 0.85, 0.85, 0.85], { face: "chin" }),
  hungry: P("hungry", "Hungry", [0.5, 0.85, 0.85, 0.85, 0.85], { face: "chin" }),
  pain: P("pain", "Pain", [0.5, 0.85, 0.85, 0.85, 0.85], { face: "chin" }),
  hurt: P("hurt", "Pain", [0.5, 0.85, 0.85, 0.85, 0.85], { face: "chin" }),
  help: P("help", "Help", [0, 1, 1, 1, 1], { secondHand: "flat" }),
  yes: P("yes", "Yes", [0.35, 1, 1, 1, 1], { motion: true }),
  no: P("no", "No", [0.2, 0.2, 0.2, 0.2, 0.2], { motion: true }),
  more: P("more", "More", [0.4, 0.5, 0.5, 0.5, 0.5], { secondHand: "mirror" }),
  please: P("please", "Please", [0.5, 0.8, 0.8, 0.8, 0.8], { secondHand: "flat" }),
  "thank you": P("thankyou", "Thank you", [0.5, 0.85, 0.85, 0.85, 0.85], { offsetX: 0.5, motion: true }),
  love: P("love", "Love", [0.2, 0, 1, 1, 0], { motion: true }),
  mother: P("mother", "Mother", [0.5, 0.85, 0.85, 0.85, 0.85], { face: "chin" }),
  father: P("father", "Father", [0.5, 0.85, 0.85, 0.85, 0.85], { face: "forehead" as never }),
  sister: P("sister", "Sister", [0.4, 0.85, 0.85, 0.85, 0.85], { face: "chin" }),
  brother: P("brother", "Brother", [0.4, 0.85, 0.85, 0.85, 0.85], { face: "chin" }),
  friend: P("friend", "Friend", [0.5, 0.5, 1, 1, 0.5], { secondHand: "mirror" }),
  school: P("school", "School", [1, 0.5, 0.5, 1, 1], { motion: true }),
  home: P("home", "Home", [0.4, 0.5, 0.5, 0.5, 0.5], { face: "lips" }),
  doctor: P("doctor", "Doctor", [0.35, 0.85, 0.85, 0.85, 0.85], { motion: true }),
  hospital: P("hospital", "Hospital", [1, 0.5, 0.5, 1, 1], { offsetX: 0.3 }),
  bathroom: P("bathroom", "Bathroom", [0.4, 0.85, 0.85, 0.85, 0.85], { motion: true }),
  toilet: P("toilet", "Toilet", [0.4, 0.85, 0.85, 0.85, 0.85], { motion: true }),
  sleep: P("sleep", "Sleep", [0.35, 1, 1, 1, 1], { offsetY: 0.4 }),
  tired: P("tired", "Tired", [0.4, 0.6, 0.6, 0.6, 0.6], { offsetY: 0.25 }),
  happy: P("happy", "Happy", [0.4, 0.85, 0.85, 0.85, 0.85], { offsetY: 0.3, motion: true }),
  sad: P("sad", "Sad", [0.4, 0.85, 0.85, 0.85, 0.85], { offsetY: 0.5 }),
  angry: P("angry", "Angry", [0.45, 0.9, 0.9, 0.9, 0.9], { face: "chin" }),
  scared: P("scared", "Scared", [0.4, 0.5, 0.5, 0.5, 0.5], { offsetY: -0.3 }),
  hot: P("hot", "Hot", [0.5, 0.85, 0.85, 0.85, 0.85], { face: "lips" }),
  cold: P("cold", "Cold", [0.45, 0.9, 0.9, 0.9, 0.9], { motion: true }),
  good: P("good", "Good", [0.35, 1, 1, 1, 1], { motion: true }),
  bad: P("bad", "Bad", [0.35, 1, 1, 1, 1], { offsetY: 0.4 }),
  stop: P("stop", "Stop", [0, 0, 0, 0, 0], { offsetX: 0.4 }),
  go: P("go", "Go", [0.2, 0, 0, 1, 1], { motion: true }),
  come: P("come", "Come", [0, 0, 0, 0, 0], { motion: true, offsetX: 0.3 }),
  give: P("give", "Give", [0.4, 0.6, 0.6, 0.6, 0.6], { offsetX: 0.35 }),
  take: P("take", "Take", [0.4, 0.6, 0.6, 0.6, 0.6], { offsetX: -0.3 }),
  want: P("want", "Want", [0.45, 0.55, 0.55, 0.55, 0.55], { motion: true }),
  need: P("need", "Need", [0.45, 0.55, 0.55, 0.55, 0.55], { motion: true }),
  like: P("like", "Like", [0.35, 1, 1, 1, 1], { motion: true }),
  finish: P("finish", "Finish", [0, 0, 0, 0, 0], { rotate: 180 }),
  again: P("again", "Again", [0.4, 0.6, 0.6, 0.6, 0.6], { motion: true }),
  wait: P("wait", "Wait", [0.2, 0.2, 0.2, 0.2, 0.2], { motion: true }),
  look: P("look", "Look", [0.2, 0.2, 0.2, 0.2, 0.2], { face: "eye" }),
  listen: P("listen", "Listen", [0.2, 0.2, 0.2, 0.2, 0.2], { face: "ear" }),
  speak: P("speak", "Speak", [0.2, 0.2, 0.2, 0.2, 0.2], { face: "lips" }),
  quiet: P("quiet", "Quiet", [0.35, 0.85, 1, 1, 1], { face: "lips" }),
  loud: P("loud", "Loud", [0, 0, 0, 0, 0], { motion: true }),
  play: P("play", "Play", [0.3, 0.5, 0.5, 0.5, 0.5], { motion: true }),
  learn: P("learn", "Learn", [0.4, 0.85, 0.85, 0.85, 0.85], { face: "chin" }),
  work: P("work", "Work", [0.5, 0.85, 0.85, 0.85, 0.85], { secondHand: "flat" }),
}

/** Combined lookup: words → numbers → single letters (fingerspelling). */
export function poseForToken(token: string): HandPoseDef | null {
  const t = token.toLowerCase().replace(/[^a-z0-9]/g, "")
  if (!t) return null
  if (WORD_SIGNS[t]) return WORD_SIGNS[t]
  if (NUMBERS[t]) return NUMBERS[t]
  if (t.length === 1 && ALPHABET[t.toUpperCase()]) return ALPHABET[t.toUpperCase()]
  return null
}

/** True when the word has a direct word-sign (vs fingerspelling). */
export function hasWordSign(word: string): boolean {
  return Boolean(WORD_SIGNS[word.toLowerCase().replace(/[^a-z]/g, "")])
}

export const POSE_LIBRARY_SIZE =
  Object.keys(WORD_SIGNS).length + Object.keys(NUMBERS).length + Object.keys(ALPHABET).length
