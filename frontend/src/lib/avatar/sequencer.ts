/**
 * Sign sequencer — converts a sentence into a playable SignPose[].
 *
 * Pipeline:
 *   1. Tokenize the input text
 *   2. Longest-match against the phrase library (multi-word signs)
 *   3. Word-sign lookup for each remaining token
 *   4. Unknown words → fingerspell letter-by-letter (word header included)
 *   5. Insert short rest connectives so transitions look natural
 */

import type { SignPose } from "./poses"
import { ALPHABET, NEUTRAL_POSE, PHRASES, lookupPose } from "./poses"

export type SignLanguage = "en" | "hi" | "kn" | "te" | "ta"

export interface SignSequenceStep {
  pose: SignPose
  /** The word or letter this step represents (for the caption). */
  token: string
  /** True when the word had no sign and is being fingerspelled. */
  fingerspelled: boolean
  /** For fingerspelled words: the full word being spelled. */
  word?: string
}

export interface SignSequence {
  steps: SignSequenceStep[]
  /** Words that had direct word signs. */
  signedWords: string[]
  /** Words that fell back to fingerspelling. */
  fingerspelledWords: string[]
}

const MAX_STEPS = 120
const MAX_SPELL_LEN = 12

/** Normalize a token: lowercase, strip punctuation except digits. */
function cleanToken(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]/g, "")
}

/** Tokenize into words (multilingual letters + digits). */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,.;:!?—–"()]+/)
    .map((w) => w.trim())
    .filter(Boolean)
}

/** Longest-first phrase keys for multi-word matching. */
const PHRASE_KEYS = Object.keys(PHRASES).sort((a, b) => b.split(" ").length - a.split(" ").length)

/** Non-signing punctuation holds: comma / full stop → brief pause. */
const PAUSE_POSE: SignPose = { ...NEUTRAL_POSE, duration: 220 }

/**
 * Convert a sentence into a sequence of sign steps.
 * Unknown words are fingerspelled; connective rests keep motion natural.
 */
export function sentenceToSignSequence(text: string, _lang: SignLanguage = "en"): SignSequence {
  void _lang // pose vocabulary is language-agnostic for now; Hindi/Kannada romanizations hit the same lookup
  const words = tokenize(text)
  const steps: SignSequenceStep[] = []
  const signedWords: string[] = []
  const fingerspelledWords: string[] = []

  const push = (step: SignSequenceStep) => {
    if (steps.length < MAX_STEPS) steps.push(step)
  }

  let i = 0
  while (i < words.length) {
    // 1. Multi-word phrase match (longest first).
    let matchedPhrase = false
    for (const key of PHRASE_KEYS) {
      const parts = key.split(" ")
      if (parts.length < 2 || i + parts.length > words.length) continue
      const slice = words.slice(i, i + parts.length).map(cleanToken).join(" ")
      if (slice === key) {
        const seq = PHRASES[key]
        seq.poses.forEach((pose, idx) => {
          push({ pose, token: seq.tokens[idx] ?? key, fingerspelled: false, word: seq.label })
        })
        signedWords.push(seq.label)
        i += parts.length
        matchedPhrase = true
        break
      }
    }
    if (matchedPhrase) {
      push({ pose: PAUSE_POSE, token: "", fingerspelled: false })
      continue
    }

    // 2. Single word.
    const raw = words[i]
    const token = cleanToken(raw)

    if (!token) {
      i++
      continue
    }

    // Punctuation-only tail triggers a pause pose.
    const pauseAfter = /[.!?]$/.test(raw)
    const commaAfter = /,$/.test(raw)

    const pose = lookupPose(token)
    if (pose) {
      push({ pose, token, fingerspelled: false })
      signedWords.push(token)
    } else if (/^\d+$/.test(token)) {
      // Spell multi-digit numbers digit by digit.
      for (const d of token) {
        const dp = lookupPose(d)
        if (dp) push({ pose: dp, token: d, fingerspelled: true, word: token })
      }
      fingerspelledWords.push(token)
    } else if (token.length === 1) {
      // Single stray letter → fingerspell it once.
      const lp = lookupPose(token)
      if (lp) push({ pose: lp, token: token.toUpperCase(), fingerspelled: true, word: token })
    } else if (token.length <= MAX_SPELL_LEN) {
      // 3. Fingerspelling fallback with a small "word start" cue:
      //    hand briefly to neutral before spelling.
      push({ pose: PAUSE_POSE, token: "", fingerspelled: false })
      let spelled = false
      for (const ch of token) {
        const letterPose = ALPHABET[ch.toUpperCase()]
        if (letterPose) {
          push({ pose: letterPose, token: ch.toUpperCase(), fingerspelled: true, word: token })
          spelled = true
        }
      }
      if (spelled) fingerspelledWords.push(token)
    } else {
      // Too long to spell meaningfully — skip.
      fingerspelledWords.push(token)
    }

    if (pauseAfter || commaAfter) {
      push({ pose: PAUSE_POSE, token: "", fingerspelled: false })
    }

    i++
  }

  // 4. Connective: end with a gentle rest.
  if (steps.length > 0 && steps[steps.length - 1].pose !== PAUSE_POSE) {
    push({ pose: restEnd(), token: "", fingerspelled: false })
  }

  return { steps, signedWords, fingerspelledWords }
}

function restEnd(): SignPose {
  return { ...NEUTRAL_POSE, duration: 300 }
}

/** Total playback duration in ms (excluding transition overlap). */
export function sequenceDuration(seq: SignSequence): number {
  return seq.steps.reduce((sum, s) => sum + s.pose.duration, 0)
}
