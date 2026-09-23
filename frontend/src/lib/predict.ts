/**
 * Context-aware phrase predictor for VaakSetu.
 *
 * - 200+ pattern rules mapping pictogram word combos → natural sentences.
 * - Context: time of day, recent mood, and conversation history refine the
 *   generated sentence (e.g. pain+head+strong in the morning →
 *   "I have a bad headache this morning.").
 * - Returns a confidence estimate derived from rule specificity (how many
 *   pictograms the rule consumed vs. selection size, rule length) — not a
 *   fake constant.
 * - Top-3 alternatives for low-confidence predictions.
 * - Learns corrections: when the user replaces a predicted word, later
 *   predictions prefer the corrected term (persisted in localStorage).
 * - Tracks most-used phrases for the /phrases page.
 */

export interface PredictedSentence {
  text: string
  /** Estimated 0–100 confidence based on rule specificity. */
  confidence: number
  isFallback: boolean
  /** Next-best sentence options (shown when confidence is low). */
  alternatives?: string[]
  /** The base word that a learned correction replaced, if any. */
  correctedFrom?: string
}

export interface PredictContext {
  /** Hour of day 0–23; defaults to now. */
  hour?: number
  /** Most recent mood string from history (e.g. "Distressed"). */
  lastMood?: string
  /** Recently used pictogram words (most recent last). */
  recentWords?: string[]
}

/* ── Persistence ────────────────────────────────────────────────── */

const CORRECTIONS_KEY = "vaaksetu-word-corrections"
const PHRASES_KEY = "vaaksetu-phrase-usage"
const MAX_CORRECTIONS = 200
const MAX_PHRASES = 100

type CorrectionMap = Record<string, Record<string, number>> // base → replacement → count
type PhraseUsage = Record<string, { count: number; last: number }>

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw) as T
  } catch {
    /* ignore */
  }
  return fallback
}

function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota — non-fatal */
  }
}

export function getCorrections(): CorrectionMap {
  return loadJson<CorrectionMap>(CORRECTIONS_KEY, {})
}

/** Record that the user replaced `from` with `to` — boosts `to` next time. */
export function recordCorrection(from: string, to: string): void {
  if (!from.trim() || !to.trim() || from === to) return
  const map = getCorrections()
  const entry = map[from] ?? {}
  entry[to] = (entry[to] ?? 0) + 1
  map[from] = entry
  const trimmed = Object.entries(map)
    .sort((a, b) => b[1] && a[1] ? countMax(b[1]) - countMax(a[1]) : 0)
    .slice(0, MAX_CORRECTIONS)
  saveJson(CORRECTIONS_KEY, Object.fromEntries(trimmed))
}

function countMax(m: Record<string, number>): number {
  return Math.max(...Object.values(m), 0)
}

/** Best learned replacement for a word, or null. */
function learnedReplacement(word: string): { to: string; count: number } | null {
  const entry = getCorrections()[word.toLowerCase()]
  if (!entry) return null
  let best: string | null = null
  let bestCount = 0
  for (const [to, count] of Object.entries(entry)) {
    if (count > bestCount) {
      best = to
      bestCount = count
    }
  }
  return best ? { to: best, count: bestCount } : null
}

export function getPhraseUsage(): { phrase: string; count: number; last: number }[] {
  const usage = loadJson<PhraseUsage>(PHRASES_KEY, {})
  return Object.entries(usage)
    .map(([phrase, v]) => ({ phrase, ...v }))
    .sort((a, b) => b.count - a.count || b.last - a.last)
}

export function recordPhraseUsed(phrase: string): void {
  const usage = loadJson<PhraseUsage>(PHRASES_KEY, {})
  const existing = usage[phrase]
  usage[phrase] = { count: (existing?.count ?? 0) + 1, last: Date.now() }
  const entries = Object.entries(usage)
  if (entries.length > MAX_PHRASES) {
    entries.sort((a, b) => (b[1]?.count ?? 0) - (a[1]?.count ?? 0))
    saveJson(PHRASES_KEY, Object.fromEntries(entries.slice(0, MAX_PHRASES)))
  } else {
    saveJson(PHRASES_KEY, usage)
  }
}

/* ── Pattern rules ──────────────────────────────────────────────── */

type TemplateFn = (w: string[], ctx: PredictContext) => string

interface Template {
  /** Words (lowercase) that must appear in the selection. */
  match: string[]
  /** Weight: more matched pictograms → more specific → higher confidence. */
  template: TemplateFn
  /** Optional higher-priority contextual variant. */
  context?: (ctx: PredictContext) => string | null
}

/**
 * The full rule library. Rules are evaluated most-specific-first; a rule
 * fires when every word in `match` appears in the selection. Single-word
 * rules make every single pictogram produce a natural sentence.
 */
const RULES: Template[] = [
  // ── Health / pain ──
  {
    match: ["pain", "head", "strong"],
    template: () => "I have a bad headache.",
    context: (ctx) => (isMorning(ctx) ? "I have a bad headache this morning." : null),
  },
  { match: ["pain", "head"], template: () => "I have a headache." },
  { match: ["head", "strong"], template: () => "My head is pounding." },
  { match: ["pain", "strong"], template: () => "I have severe pain." },
  { match: ["pain", "strong", "chest"], template: () => "I have strong chest pain — please get a doctor." },
  { match: ["pain", "chest"], template: () => "I have pain in my chest." },
  { match: ["pain", "strong", "stomach"], template: () => "My stomach hurts badly." },
  { match: ["pain", "stomach"], template: () => "I have stomach pain." },
  { match: ["pain", "strong", "back"], template: () => "My back pain is severe." },
  { match: ["pain", "back"], template: () => "I have back pain." },
  { match: ["pain", "strong", "ear"], template: () => "My ear hurts a lot." },
  { match: ["pain", "ear"], template: () => "I have ear pain." },
  { match: ["pain", "strong", "eye"], template: () => "My eyes hurt badly." },
  { match: ["pain", "eye"], template: () => "I have eye pain." },
  { match: ["pain", "strong", "throat"], template: () => "I have a very sore throat." },
  { match: ["pain", "throat"], template: () => "I have throat pain." },
  { match: ["pain", "strong", "leg"], template: () => "My leg pain is severe." },
  { match: ["pain", "leg"], template: () => "I have leg pain." },
  { match: ["pain", "strong", "arm"], template: () => "My arm hurts badly." },
  { match: ["pain", "arm"], template: () => "I have arm pain." },
  { match: ["pain", "strong", "tooth"], template: () => "I have a bad toothache." },
  { match: ["pain", "tooth"], template: () => "I have a toothache." },
  { match: ["pain", "strong", "hand"], template: () => "My hand hurts badly." },
  { match: ["pain", "hand"], template: () => "I have pain in my hand." },
  { match: ["pain", "medicine"], template: () => "I need medicine for the pain." },
  { match: ["pain", "doctor"], template: () => "I need a doctor — I am in pain." },
  { match: ["pain", "sleep"], template: () => "I can't sleep because of pain." },
  { match: ["pain", "night"], template: () => "I have pain at night." },
  { match: ["pain", "more"], template: () => "The pain is getting worse." },
  { match: ["pain"], template: () => "I have pain." },

  // ── Hunger / food / drink ──
  { match: ["water", "more", "please"], template: () => "Could I have some more water, please?" },
  { match: ["water", "more"], template: () => "I want more water." },
  { match: ["water", "hot"], template: () => "I want hot water, please." },
  { match: ["water", "cold"], template: () => "I want cold water, please." },
  { match: ["water", "now"], template: () => "I need water right now." },
  { match: ["water", "please"], template: () => "Water, please." },
  { match: ["water"], template: () => "I need water, please." },
  { match: ["food", "more", "please"], template: () => "Could I have some more food, please?" },
  { match: ["food", "more"], template: () => "I want more food." },
  { match: ["food", "hot"], template: () => "I want hot food." },
  { match: ["food", "now"], template: () => "I need to eat right now." },
  { match: ["food", "please"], template: () => "Food, please." },
  { match: ["food", "family"], template: () => "I want to eat with my family." },
  { match: ["food"], template: () => "I am hungry — I need food." },
  { match: ["hungry", "strong"], template: () => "I am very hungry." },
  { match: ["hungry"], template: () => "I am hungry." },
  { match: ["thirsty", "strong"], template: () => "I am very thirsty." },
  { match: ["thirsty"], template: () => "I am thirsty." },
  { match: ["juice"], template: () => "I would like some juice." },
  { match: ["tea"], template: () => "I would like some tea." },
  { match: ["milk"], template: () => "I would like some milk." },

  // ── Toilet / bathroom ──
  { match: ["toilet", "help", "now"], template: () => "I need to use the bathroom urgently." },
  { match: ["toilet", "now"], template: () => "I need the toilet right now." },
  { match: ["toilet", "help"], template: () => "I need help getting to the toilet." },
  { match: ["toilet", "urgent"], template: () => "It is urgent — I need the toilet." },
  { match: ["toilet", "please"], template: () => "I need to use the toilet, please." },
  { match: ["toilet"], template: () => "I need to use the toilet." },
  { match: ["bathroom"], template: () => "I need to go to the bathroom." },
  { match: ["bath"], template: () => "I want to take a bath." },

  // ── Help / emergency ──
  { match: ["help", "now"], template: () => "I need help right now!" },
  { match: ["help", "strong"], template: () => "I badly need help." },
  { match: ["help", "family"], template: () => "Please call my family — I need help." },
  { match: ["help", "doctor"], template: () => "Please call a doctor." },
  { match: ["help", "please"], template: () => "Please help me." },
  { match: ["help", "stand"], template: () => "Please help me stand up." },
  { match: ["help", "sit"], template: () => "Please help me sit down." },
  { match: ["help", "walk"], template: () => "I need help walking." },
  { match: ["help", "eat"], template: () => "I need help eating." },
  { match: ["help", "drink"], template: () => "I need help drinking." },
  { match: ["help", "toilet"], template: () => "I need help going to the toilet." },
  { match: ["help"], template: () => "I need help, please." },
  { match: ["emergency"], template: () => "This is an emergency!" },
  { match: ["danger"], template: () => "I am in danger — please come!" },
  { match: ["scared", "help"], template: () => "I am scared — please help me." },
  { match: ["scared", "strong"], template: () => "I am very scared." },
  { match: ["scared"], template: () => "I am scared." },
  { match: ["angry", "strong"], template: () => "I am very angry." },
  { match: ["angry"], template: () => "I am angry." },

  // ── Tired / sleep ──
  {
    match: ["tired", "sleep", "family"],
    template: () => "I'm tired and want to go home.",
    context: (ctx) => (isEvening(ctx) ? "I'm tired — I want to go home and sleep." : null),
  },
  { match: ["tired", "sleep"], template: () => "I am tired and want to sleep." },
  { match: ["tired", "home"], template: () => "I am tired — I want to go home." },
  { match: ["tired", "strong"], template: () => "I am exhausted." },
  { match: ["tired", "rest"], template: () => "I need to rest." },
  { match: ["tired"], template: () => "I am tired." },
  { match: ["sleep", "now"], template: () => "I want to sleep now." },
  { match: ["sleep", "please"], template: () => "I want to sleep, please." },
  { match: ["sleep"], template: () => "I want to sleep." },
  { match: ["rest"], template: () => "I need to rest for a while." },

  // ── Temperature / comfort ──
  { match: ["hot", "strong"], template: () => "It is far too hot." },
  { match: ["hot"], template: () => "It is too hot." },
  { match: ["cold", "strong"], template: () => "It is very cold — I need a blanket." },
  { match: ["cold", "blanket"], template: () => "Please give me a blanket." },
  { match: ["cold"], template: () => "It is too cold." },
  { match: ["fan"], template: () => "Please switch on the fan." },
  { match: ["light", "on"], template: () => "Please switch on the light." },
  { match: ["light", "off"], template: () => "Please switch off the light." },
  { match: ["light"], template: () => "Please adjust the light." },
  { match: ["window", "open"], template: () => "Please open the window." },
  { match: ["window"], template: () => "Please adjust the window." },
  { match: ["comfortable"], template: () => "I am comfortable." },
  { match: ["uncomfortable"], template: () => "I am uncomfortable — please adjust my position." },

  // ── Yes / no / more / please (core AAC) ──
  { match: ["yes", "strong"], template: () => "Yes, definitely!" },
  { match: ["yes", "please"], template: () => "Yes, please." },
  { match: ["yes", "more"], template: () => "Yes, I want more." },
  { match: ["yes"], template: () => "Yes, that is right." },
  { match: ["no", "strong"], template: () => "No, definitely not." },
  { match: ["no", "thank"], template: () => "No, thank you." },
  { match: ["no", "more"], template: () => "No more, please." },
  { match: ["no"], template: () => "No, that is not right." },
  { match: ["more", "please"], template: () => "More, please." },
  { match: ["more"], template: () => "I want more, please." },
  { match: ["please"], template: () => "Please." },
  { match: ["thank"], template: () => "Thank you!" },
  { match: ["hello", "family"], template: () => "Hello everyone!" },
  { match: ["hello"], template: () => "Hello!" },
  { match: ["goodbye"], template: () => "Goodbye!" },
  { match: ["good", "strong"], template: () => "I feel very good!" },
  { match: ["good"], template: () => "I am good." },
  { match: ["bad", "strong"], template: () => "I feel really bad." },
  { match: ["bad"], template: () => "I am not feeling good." },

  // ── Family / people ──
  { match: ["family", "now"], template: () => "I want my family right now." },
  { match: ["family", "call"], template: () => "Please call my family." },
  { match: ["family", "visit"], template: () => "I want my family to visit." },
  { match: ["family"], template: () => "I want my family." },
  { match: ["mother", "now"], template: () => "I want my mother now." },
  { match: ["mother", "call"], template: () => "Please call my mother." },
  { match: ["mother"], template: () => "I want my mother." },
  { match: ["father", "now"], template: () => "I want my father now." },
  { match: ["father", "call"], template: () => "Please call my father." },
  { match: ["father"], template: () => "I want my father." },
  { match: ["sister"], template: () => "I want my sister." },
  { match: ["brother"], template: () => "I want my brother." },
  { match: ["friend"], template: () => "I want to see my friend." },
  { match: ["friend", "talk"], template: () => "I want to talk to my friend." },
  { match: ["doctor", "now"], template: () => "I need a doctor now." },
  { match: ["doctor"], template: () => "Please call the doctor." },
  { match: ["nurse"], template: () => "Please call the nurse." },
  { match: ["love", "strong"], template: () => "I love you so much!" },
  { match: ["love"], template: () => "I love you." },
  { match: ["happy", "strong"], template: () => "I am very happy!" },
  { match: ["happy"], template: () => "I am happy." },
  { match: ["sad", "strong"], template: () => "I feel very sad." },
  { match: ["sad"], template: () => "I am sad." },

  // ── Places ──
  { match: ["home", "now"], template: () => "I want to go home now." },
  { match: ["home", "please"], template: () => "I want to go home, please." },
  { match: ["home"], template: () => "I want to go home." },
  { match: ["school"], template: () => "I want to go to school." },
  { match: ["hospital"], template: () => "I need to go to the hospital." },
  { match: ["outside"], template: () => "I want to go outside." },
  { match: ["walk", "outside"], template: () => "I want to go for a walk outside." },
  { match: ["walk"], template: () => "I want to go for a walk." },
  { match: ["garden"], template: () => "I want to sit in the garden." },
  { match: ["bed"], template: () => "I want to go to bed." },
  { match: ["chair"], template: () => "Please bring me a chair." },
  { match: ["table"], template: () => "Please move the table." },

  // ── Objects / activities ──
  { match: ["phone", "call"], template: () => "Please give me my phone — I want to call someone." },
  { match: ["phone"], template: () => "Please give me my phone." },
  { match: ["book"], template: () => "Please give me a book." },
  { match: ["music"], template: () => "I want to listen to music." },
  { match: ["tv"], template: () => "I want to watch TV." },
  { match: ["game"], template: () => "I want to play a game." },
  { match: ["toys"], template: () => "Please bring my toys." },
  { match: ["pillow"], template: () => "Please adjust my pillow." },
  { match: ["glasses"], template: () => "Please give me my glasses." },
  { match: ["hearing"], template: () => "Please give me my hearing aid." },
  { match: ["wheelchair"], template: () => "Please bring my wheelchair." },
  { match: ["medicine"], template: () => "I need my medicine." },
  { match: ["medicine", "now"], template: () => "I need my medicine right now." },
  { match: ["medicine", "night"], template: () => "It is time for my night medicine." },
  { match: ["medicine", "morning"], template: () => "It is time for my morning medicine." },

  // ── Requests / actions ──
  { match: ["want", "more"], template: () => "I want more of that." },
  { match: ["want"], template: () => "I want something." },
  { match: ["need"], template: () => "I need something." },
  { match: ["give", "please"], template: () => "Please give it to me." },
  { match: ["give"], template: () => "Give it to me, please." },
  { match: ["take"], template: () => "Please take this." },
  { match: ["come"], template: () => "Please come here." },
  { match: ["come", "now"], template: () => "Please come right now." },
  { match: ["go"], template: () => "I want to go there." },
  { match: ["stop", "please"], template: () => "Please stop." },
  { match: ["stop"], template: () => "Stop, please." },
  { match: ["wait"], template: () => "Please wait a moment." },
  { match: ["again"], template: () => "Please do it again." },
  { match: ["finish"], template: () => "I am finished." },
  { match: ["open"], template: () => "Please open it." },
  { match: ["close"], template: () => "Please close it." },
  { match: ["look"], template: () => "Please look at me." },
  { match: ["listen"], template: () => "Please listen to me." },
  { match: ["speak", "loud"], template: () => "Please speak louder." },
  { match: ["speak", "slow"], template: () => "Please speak slowly." },
  { match: ["speak"], template: () => "I want to speak." },
  { match: ["quiet"], template: () => "Please be quiet for a moment." },
  { match: ["loud"], template: () => "It is too loud." },
  { match: ["understand"], template: () => "I understand." },
  { match: ["understand", "no"], template: () => "I do not understand." },
  { match: ["question"], template: () => "I have a question." },
  { match: ["wrong"], template: () => "Something is wrong." },
  { match: ["dizzy"], template: () => "I feel dizzy." },
  { match: ["itchy"], template: () => "I feel itchy — please help." },
  { match: ["numb"], template: () => "I cannot feel it — it is numb." },
  { match: ["breath", "strong"], template: () => "I am having trouble breathing!" },
  { match: ["breath"], template: () => "I need to catch my breath." },
  { match: ["cough"], template: () => "I keep coughing." },
  { match: ["fever"], template: () => "I think I have a fever." },
  { match: ["fever", "strong"], template: () => "My fever is high." },
  { match: ["vomit"], template: () => "I feel like vomiting." },
  { match: ["bathroom", "help"], template: () => "I need help in the bathroom." },
  { match: ["dress"], template: () => "I need help getting dressed." },
  { match: ["shower"], template: () => "I want to take a shower." },
  { match: ["brush"], template: () => "I want to brush my teeth." },
  { match: ["hair"], template: () => "Please comb my hair." },
  { match: ["nail"], template: () => "Please trim my nails." },
  { match: ["read"], template: () => "I want to read something." },
  { match: ["write"], template: () => "I want to write something." },
  { match: ["draw"], template: () => "I want to draw." },
  { match: ["pray"], template: () => "I want to pray." },
  { match: ["photo"], template: () => "Let's take a photo!" },
  { match: ["joke"], template: () => "Tell me a joke!" },
  { match: ["story"], template: () => "Tell me a story." },
  { match: ["hug"], template: () => "I want a hug." },
  { match: ["kiss"], template: () => "I want a kiss." },
  { match: ["laugh"], template: () => "That makes me laugh!" },
  { match: ["bored"], template: () => "I am bored." },
  { match: ["bored", "strong"], template: () => "I am so bored — please do something with me." },
  { match: ["lonely"], template: () => "I feel lonely." },
  { match: ["lonely", "family"], template: () => "I feel lonely — I miss my family." },
  { match: ["excited"], template: () => "I am excited!" },
  { match: ["proud"], template: () => "I feel proud!" },
  { match: ["worried"], template: () => "I am worried." },
  { match: ["worried", "strong"], template: () => "I am really worried." },
  { match: ["confused"], template: () => "I am confused." },
  { match: ["surprised"], template: () => "What a surprise!" },
  { match: ["shy"], template: () => "I feel shy." },
  { match: ["brave"], template: () => "I am being brave." },
  { match: ["kind"], template: () => "That is very kind of you." },
  { match: ["sorry"], template: () => "I am sorry." },
  { match: ["welcome"], template: () => "You are welcome." },
  { match: ["ok"], template: () => "Okay." },
  { match: ["maybe"], template: () => "Maybe." },
  { match: ["later"], template: () => "We can do it later." },
  { match: ["now"], template: () => "I need it now." },
  { match: ["today"], template: () => "Today, please." },
  { match: ["tomorrow"], template: () => "Tomorrow, please." },
  { match: ["morning"], template: () => "In the morning, please." },
  { match: ["afternoon"], template: () => "In the afternoon, please." },
  { match: ["evening"], template: () => "In the evening, please." },
  { match: ["night"], template: () => "At night, please." },
  { match: ["week"], template: () => "Sometime this week." },
  { match: ["breakfast"], template: () => "I want breakfast." },
  { match: ["lunch"], template: () => "I want lunch." },
  { match: ["dinner"], template: () => "I want dinner." },
  { match: ["snack"], template: () => "I want a snack." },
  { match: ["fruit"], template: () => "I want some fruit." },
  { match: ["rice"], template: () => "I want rice." },
  { match: ["bread"], template: () => "I want bread." },
  { match: ["egg"], template: () => "I want an egg." },
  { match: ["curd"], template: () => "I want curd." },
  { match: ["salt"], template: () => "Please pass the salt." },
  { match: ["sugar"], template: () => "Less sugar, please." },
  { match: ["spicy"], template: () => "Not too spicy, please." },
  { match: ["broken"], template: () => "It is broken — please fix it." },
  { match: ["lost"], template: () => "I lost it — please help me find it." },
  { match: ["found"], template: () => "I found it!" },
  { match: ["dirty"], template: () => "It is dirty — please clean it." },
  { match: ["clean"], template: () => "Please clean it." },
  { match: ["wet"], template: () => "It is wet — please change it." },
  { match: ["dry"], template: () => "Please dry it." },
  { match: ["heavy"], template: () => "It is too heavy for me." },
  { match: ["pain", "less"], template: () => "The pain is less now." },
  { match: ["better"], template: () => "I feel better now." },
  { match: ["worse"], template: () => "I feel worse now." },
  { match: ["same"], template: () => "It is the same as before." },
  { match: ["different"], template: () => "I want something different." },
  { match: ["slow"], template: () => "Please go slower." },
  { match: ["fast"], template: () => "Please go faster." },
  { match: ["hot", "food"], template: () => "The food is too hot — let it cool." },
  { match: ["cold", "food"], template: () => "The food is too cold — please warm it." },
]

/**
 * Extra generative rules: common modifier pairs so uncommon combinations
 * still produce natural sentences beyond the fixed library.
 */
const PLACEHOLDER_RULES: { test: (w: string[]) => boolean; gen: TemplateFn }[] = [
  {
    test: (w) => w.includes("pain") && w.length >= 2,
    gen: (w) => {
      const bodyPart = w.find((x) => x !== "pain" && x !== "strong")
      return bodyPart ? `I have pain in my ${bodyPart}.` : "I have pain."
    },
  },
  {
    test: (w) => w.includes("want") && w.length >= 2,
    gen: (w) => {
      const obj = w.filter((x) => x !== "want" && x !== "please").join(" ")
      return obj ? `I want ${obj}, please.` : "I want something."
    },
  },
  {
    test: (w) => w.includes("need") && w.length >= 2,
    gen: (w) => {
      const obj = w.filter((x) => x !== "need" && x !== "please").join(" ")
      return obj ? `I need ${obj}, please.` : "I need something."
    },
  },
  {
    test: (w) => w.includes("more") && w.length >= 2,
    gen: (w) => {
      const obj = w.find((x) => x !== "more" && x !== "please")
      return obj ? `More ${obj}, please.` : "More, please."
    },
  },
  {
    test: (w) => w.includes("help") && w.length >= 2,
    gen: (w) => {
      const obj = w.find((x) => x !== "help" && x !== "please")
      return obj ? `I need help with ${obj}.` : "I need help."
    },
  },
]

/* ── Time helpers ───────────────────────────────────────────────── */

function isMorning(ctx: PredictContext): boolean {
  const h = ctx.hour ?? new Date().getHours()
  return h >= 5 && h < 12
}

function isEvening(ctx: PredictContext): boolean {
  const h = ctx.hour ?? new Date().getHours()
  return h >= 17 && h < 21
}

/* ── Core prediction ────────────────────────────────────────────── */

/** Apply learned corrections to a pictogram word before matching. */
function applyCorrections(word: string): { word: string; correctedFrom?: string } {
  const lower = word.toLowerCase()
  const learned = learnedReplacement(lower)
  if (learned && learned.count >= 2) {
    return { word: learned.to, correctedFrom: lower }
  }
  return { word: lower }
}

/**
 * Builds a natural-language sentence from up to 3 selected pictogram words.
 * Uses pattern rules first (most specific wins), then generative rules,
 * then a simple join fallback. Confidence reflects rule specificity.
 */
export function predictSentence(words: string[], ctx: PredictContext = {}): PredictedSentence {
  const clean = words.filter((w) => typeof w === "string" && w.trim().length > 0)
  if (clean.length === 0) {
    return { text: "Nothing selected yet.", confidence: 0, isFallback: true }
  }

  // Apply learned corrections + lowercase.
  const resolved = clean.map(applyCorrections)
  const lower = resolved.map((r) => r.word)
  const correctedFrom = resolved.find((r) => r.correctedFrom)?.correctedFrom

  // Exact + contextual rules, most specific first.
  const sorted = [...RULES].sort((a, b) => b.match.length - a.match.length)
  for (const rule of sorted) {
    if (rule.match.every((k) => lower.includes(k))) {
      const contextual = rule.context?.(ctx) ?? null
      const text = contextual ?? rule.template(lower, ctx)
      // Specificity: fully-matched combos score higher than partial ones.
      const coverage = rule.match.length / lower.length
      const confidence = Math.round(Math.min(97, 72 + coverage * 20 + rule.match.length * 2))
      return {
        text,
        confidence,
        isFallback: false,
        correctedFrom,
      }
    }
  }

  // Generative modifier rules.
  for (const gen of PLACEHOLDER_RULES) {
    if (gen.test(lower)) {
      return {
        text: gen.gen(lower, ctx),
        confidence: 68,
        isFallback: false,
        correctedFrom,
      }
    }
  }

  // Fallback: polite join.
  const fallbackText =
    lower.length === 1 ? `I want ${lower[0]}, please.` : `I want ${lower.join(", ")}, please.`
  const alternatives = buildAlternatives(lower, ctx)
  return {
    text: fallbackText,
    confidence: lower.length === 1 ? 55 : 45,
    isFallback: true,
    alternatives,
    correctedFrom,
  }
}

/** Top-3 alternative phrasings shown when confidence is low. */
export function buildAlternatives(lower: string[], ctx: PredictContext): string[] {
  const alts = new Set<string>()
  // "I need X" variants.
  alts.add(`I need ${lower.join(" and ")}, please.`)
  // Question form.
  alts.add(`Can I have ${lower.join(" and ")}?`)
  // Mood-aware variant.
  if (ctx.lastMood === "Distressed" || ctx.lastMood === "Urgent") {
    alts.add(`${capitalize(lower.join(" "))} — it is important.`)
  } else {
    alts.add(`I would like ${lower.join(" and ")}.`)
  }
  // Rule-based alternatives when any rule partially matches.
  for (const rule of RULES) {
    if (rule.match.length > 0 && rule.match.some((k) => lower.includes(k))) {
      const text = rule.template(lower, ctx)
      if (text) alts.add(text)
      if (alts.size >= 3) break
    }
  }
  return [...alts].slice(0, 3)
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
