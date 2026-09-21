/**
 * Placeholder sentence predictor for VaakSetu.
 * Will be replaced by an AI-backed predictor later; keep the signature stable.
 */

export interface PredictedSentence {
  text: string
  isFallback: boolean
}

type TemplateFn = (words: string[]) => string

interface Template {
  /** Words (lowercase) that must appear in the selection, in order. */
  match: string[]
  /** Receives the selected words lowercased, in tap order. */
  template: TemplateFn
}

/**
 * Simple lookup: ordered list of rules; the first rule whose keywords all
 * appear in the selection wins. Match arrays include partial combinations,
 * so selections like ["Pain"] or ["Pain", "Strong"] still produce a
 * natural sentence.
 */
const RULES: Template[] = [
  { match: ["pain", "head", "strong"], template: (w) => `I have ${w[2]} pain in my ${w[1]}.` },
  { match: ["pain", "head"], template: (w) => `I have pain in my ${w[1]}.` },
  { match: ["head", "strong"], template: (w) => `My head is ${w[1]}.` },
  { match: ["pain", "strong"], template: (w) => `I have ${w[1]} pain.` },
  { match: ["strong", "pain"], template: (w) => `I have ${w[0]} pain.` },
  { match: ["pain"], template: () => `I have pain.` },
  { match: ["water"], template: () => `I need water, please.` },
  { match: ["food"], template: () => `I am hungry. I need food.` },
  { match: ["toilet"], template: () => `I need to go to the toilet.` },
  { match: ["help"], template: () => `I need help, please.` },
  { match: ["family"], template: () => `I want my family.` },
  { match: ["more"], template: () => `I want more, please.` },
  { match: ["yes"], template: () => `Yes, that is right.` },
  { match: ["no"], template: () => `No, that is not right.` },
]

/**
 * Builds a natural-language sentence from up to 3 selected pictogram words.
 * Uses lookup rules first; falls back to a simple joined sentence.
 */
export function predictSentence(words: string[]): PredictedSentence {
  const clean = words.filter((w) => typeof w === "string" && w.trim().length > 0)
  if (clean.length === 0) return { text: "Nothing selected yet.", isFallback: true }

  const lower = clean.map((w) => w.toLowerCase())

  for (const rule of RULES) {
    if (rule.match.every((k) => lower.includes(k))) {
      return { text: rule.template(lower), isFallback: false }
    }
  }

  return {
    text: `I want ${lower.join(", ")}.`,
    isFallback: true,
  }
}
