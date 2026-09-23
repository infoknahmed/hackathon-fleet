/** Web Speech API wrapper: TTS + beep sounds, with persisted voice settings. */

export interface VoiceSettings {
  voiceURI: string | null
  rate: number
  pitch: number
}

const SETTINGS_KEY = "vaaksetu-voice-settings"

export function loadVoiceSettings(): VoiceSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return JSON.parse(raw) as VoiceSettings
  } catch {
    /* ignore */
  }
  return { voiceURI: null, rate: 0.95, pitch: 1 }
}

export function saveVoiceSettings(settings: VoiceSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

/* ── Voice inventory (cached once the browser loads it) ─────────── */

let cachedVoices: SpeechSynthesisVoice[] = []

function refreshVoiceCache(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return
  cachedVoices = window.speechSynthesis.getVoices()
}

export function getVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return []
  if (cachedVoices.length === 0) refreshVoiceCache()
  return cachedVoices
}

/** Some browsers load voices async — resolves once the list is non-empty. */
export function waitForVoices(maxMs = 2000): Promise<SpeechSynthesisVoice[]> {
  const voices = getVoices()
  if (voices.length > 0) return Promise.resolve(voices)
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      window.speechSynthesis.onvoiceschanged = null
      resolve(getVoices())
    }, maxMs)
    window.speechSynthesis.onvoiceschanged = () => {
      clearTimeout(timer)
      window.speechSynthesis.onvoiceschanged = null
      resolve(getVoices())
    }
  })
}

/* ── Language → voice selection with graceful degradation ──────── */

/** Priority-ordered BCP-47 codes per app language (8 Indian languages). */
export const LANGUAGE_VOICE_MAP: Record<string, string[]> = {
  en: ["en-IN", "en-US", "en-GB"],
  hi: ["hi-IN"],
  kn: ["kn-IN"],
  te: ["te-IN"],
  ta: ["ta-IN"],
  mr: ["mr-IN"],
  bn: ["bn-IN"],
  ml: ["ml-IN"],
}

/** Whether each recognition/synthesis language has any voice present. */
export function isLanguageSupported(lang: string): boolean {
  return hasNativeVoice(lang) || lang === "en"
}

/**
 * Picks the best available voice for a language code.
 * Priority: exact BCP-47 match → prefix match → null.
 */
export function selectVoice(lang: string): SpeechSynthesisVoice | null {
  const voices = getVoices()
  if (voices.length === 0) return null
  const preferred = LANGUAGE_VOICE_MAP[lang] ?? [lang]
  for (const code of preferred) {
    const lower = code.toLowerCase()
    const match =
      voices.find((v) => v.lang.toLowerCase().replace("_", "-") === lower) ??
      voices.find((v) => v.lang.toLowerCase().replace("_", "-").startsWith(lower))
    if (match) return match
  }
  return null
}

/** True when a native voice exists for the language on this device. */
export function hasNativeVoice(lang: string): boolean {
  return selectVoice(lang) !== null
}

/** Languages that currently have no native voice (for UI disablement). */
export function unsupportedLanguages(codes: readonly string[]): string[] {
  return codes.filter((c) => !hasNativeVoice(c))
}

/* ── Spoken language preference ─────────────────────────────────── */

/** Spoken language for TTS; persisted as "vaaksetu-lang". */
const LANG_KEY = "vaaksetu-lang"
const DEFAULT_LANGUAGE = "en"

export function getCurrentLanguage(): string {
  try {
    const stored = localStorage.getItem(LANG_KEY)
    if (stored) return stored
  } catch {
    /* ignore */
  }
  return DEFAULT_LANGUAGE
}

export function setCurrentLanguage(code: string): void {
  try {
    localStorage.setItem(LANG_KEY, code)
  } catch {
    /* ignore */
  }
}

/* ── Speaking ───────────────────────────────────────────────────── */

export interface SpeakOptions {
  langCode?: string
  /** Force the romanized fallback even if a native voice exists. */
  forceRomanFallback?: boolean
}

/**
 * Speaks `text` with the best available voice for the language.
 * Chain: saved voice → native language voice → any voice (with romanized
 * text when the script can't be pronounced) → silent no-op.
 */
export function speak(
  text: string,
  settings: VoiceSettings = loadVoiceSettings(),
  options: SpeakOptions = {},
): void {
  if (!text.trim() || typeof window === "undefined" || !("speechSynthesis" in window)) {
    return
  }
  window.speechSynthesis.cancel()

  const langCode = options.langCode?.trim() || getCurrentLanguage()
  const voices = getVoices()

  // 1) User's explicitly saved voice (when it fits the language).
  const savedVoice = settings.voiceURI
    ? voices.find((v) => v.voiceURI === settings.voiceURI)
    : undefined

  // 2) Native voice for the requested language.
  const nativeVoice = selectVoice(langCode)

  const voice = savedVoice ?? nativeVoice ?? null
  const usingNativeScript = voice !== null && (nativeVoice !== null || langCode === "en")

  // 3) No native voice → romanized text with a base-English voice so the
  //    word is still audible instead of failing silently.
  const finalText =
    usingNativeScript || langCode === "en" ? text : romanizeForSpeech(text, langCode)

  if (!voice) {
    console.warn(
      `[speech] no voice available for "${langCode}" — speaking romanized fallback`,
    )
  } else {
    console.info(`[speech] voice="${voice.name}" lang=${voice.lang} text="${finalText}"`)
  }

  const utterance = new SpeechSynthesisUtterance(finalText)
  if (voice) {
    utterance.voice = voice
    utterance.lang = voice.lang
  } else {
    utterance.lang = langCode === "en" ? "en-US" : "en-US"
  }
  utterance.rate = settings.rate
  utterance.pitch = settings.pitch
  window.speechSynthesis.speak(utterance)
}

/** Speaks text using the voice matching the given language code. */
export function speakWithLanguage(text: string, langCode: string): void {
  speak(text, loadVoiceSettings(), { langCode })
}

export function stopSpeaking(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel()
  }
}

/* ── Romanization fallback ──────────────────────────────────────── */

/**
 * Minimal transliteration for sentences whose script the device cannot
 * pronounce (no native voice installed). Maps each supported sentence to a
 * readable Latin approximation spoken by any English voice.
 */
const ROMAN_MAP: Record<string, Record<string, string>> = {
  hi: {
    "मुझे पानी चाहिए": "mujhe paani chahiye",
    "मुझे खाना चाहिए": "mujhe khaana chahiye",
    "मुझे शौचालय जाना है": "mujhe shauchalay jaana hai",
    "मुझे सिरदर्द है": "mujhe sir dard hai",
    "मेरे सीने में दर्द है": "mere seene mein dard hai",
    "कृपया मेरी मदद करें": "kripya meri madad karen",
    "मैं तुमसे प्यार करता हूँ": "main tumse pyaar karta hoon",
    "अम्मा को बुलाओ": "amma ko bulao",
    "मुझे भूख लगी है": "mujhe bhookh lagi hai",
    "मैं थक गया हूँ": "main thak gaya hoon",
    "मुझे सोना है": "mujhe sona hai",
    "बहुत गर्मी है": "bahut garmi hai",
    "बहुत ठंड है": "bahut thand hai",
    "मैं खुश हूँ": "main khush hoon",
    "मुझे डर लग रहा है": "mujhe dar lag raha hai",
  },
}

/** Per-language test phrase for the Settings voice tester. */
export const LANGUAGE_TEST_PHRASES: Record<string, string> = {
  en: "Hello, this is VaakSetu",
  hi: "नमस्ते, यह वाकसेतु है",
  kn: "ನಮಸ್ಕಾರ, ಇದು ವಾಕ್ಸೆಟು",
  te: "నమస్కారం, ఇది వాక్సెటు",
  ta: "வணக்கம், இது வாக்செட்டு",
}

/**
 * Romanized fallback: exact sentence match where available, otherwise a
 * per-character approximation (covers the test phrases and short words).
 */
export function romanizeForSpeech(text: string, langCode: string): string {
  if (langCode === "en") return text
  const exact = ROMAN_MAP[langCode]?.[text] as string | undefined
  if (exact) return exact

  // Character-level approximation for Indic scripts.
  const charMap: Record<string, string> = {
    // Kannada (approximate)
    "ಅ": "a", "ಆ": "aa", "ಇ": "i", "ಈ": "ee", "ಉ": "u", "ಊ": "oo", "ಎ": "e", "ಏ": "ay",
    "ಐ": "ai", "ಒ": "o", "ಓ": "o", "ಔ": "ow", "ಕ": "ka", "ಖ": "kha", "ಗ": "ga", "ಘ": "gha",
    "ಚ": "cha", "ಜ": "ja", "ಟ": "ta", "ಠ": "tha", "ಣ": "na", "ತ": "ta", "ದ": "da", "ನ": "na",
    "ಪ": "pa", "ಫ": "pha", "ಬ": "ba", "ಭ": "bha", "ಮ": "ma", "ಯ": "ya", "ರ": "ra", "ಲ": "la",
    "ವ": "va", "ಶ": "sha", "ಷ": "sha", "ಸ": "sa", "ಹ": "ha", "ಳ": "la", "್ಯ": "ya",
    "ಿ": "i", "ೀ": "ee", "ು": "u", "ೂ": "oo", "ೆ": "e", "ೇ": "ay", "ೈ": "ai", "ೊ": "o", "ೋ": "o",
    "ಂ": "m", "ಃ": "h", "ಾ": "aa",
    // Tamil (approximate)
    "அ": "a", "ஆ": "aa", "இ": "i", "ஈ": "ee", "உ": "u", "ஊ": "oo", "எ": "e", "ஏ": "ay",
    "ஐ": "ai", "ஒ": "o", "ஓ": "o", "ஔ": "ow", "க": "ka", "ங": "nga", "ச": "cha", "ஞ": "nya",
    "ட": "ta", "ண": "na", "த": "tha", "ந": "na", "ப": "pa", "ம": "ma", "ய": "ya", "ர": "ra",
    "ல": "la", "வ": "va", "ழ": "zha", "ள": "la", "ற": "ra", "ன": "na", "ஜ": "ja", "ஷ": "sha",
    "ஸ": "sa", "ஹ": "ha", "ி": "i", "ீ": "ee", "ு": "u", "ூ": "oo", "ெ": "e", "ே": "ay",
    "ை": "ai", "ொ": "o", "ோ": "o", "ௌ": "ow", "ா": "aa", "ஂ": "m", "ஃ": "h",
    // Telugu (approximate)
    "అ": "a", "ఆ": "aa", "ఇ": "i", "ఈ": "ee", "ఉ": "u", "ఊ": "oo", "ఎ": "e", "ఏ": "ay",
    "ఐ": "ai", "ఒ": "o", "ఓ": "o", "ఔ": "ow", "క": "ka", "ఖ": "kha", "గ": "ga", "ఘ": "gha",
    "చ": "cha", "ఛ": "chha", "జ": "ja", "ఝ": "jha", "ట": "ta", "ఠ": "tha", "డ": "da", "ఢ": "dha",
    "ణ": "na", "త": "ta", "థ": "tha", "ద": "da", "ధ": "dha", "న": "na", "ప": "pa", "ఫ": "pha",
    "బ": "ba", "భ": "bha", "మ": "ma", "య": "ya", "ర": "ra", "ఱ": "ra", "ల": "la", "వ": "va",
    "శ": "sha", "ష": "sha", "స": "sa", "హ": "ha", "ళ": "la", "క్ష": "ksha", "ఴ": "zha",
    "ి": "i", "ీ": "ee", "ు": "u", "ూ": "oo", "ె": "e", "ే": "ay", "ై": "ai", "ొ": "o", "ో": "o",
    "ౌ": "ow", "ా": "aa", "ం": "m", "ః": "h", "్": "",
    // Devanagari extras (words not in the exact map)
    "न": "na", "म": "ma", "स": "sa", "व": "va", "य": "ya", "र": "ra", "ल": "la", "त": "ta",
    "द": "da", "क": "ka", "प": "pa", "ब": "ba", "ग": "ga", "ज": "ja", "ह": "ha", "श": "sha",
    "अ": "a", "इ": "i", "उ": "u", "ए": "ay", "ओ": "o", "ौ": "au", "ै": "ai", "े": "e", "ि": "i",
    "ो": "o", "ु": "u", "ा": "aa", "्": "", "०": "0", "़": "",
  }
  return text
    .split("")
    .map((ch) => charMap[ch] ?? (/[a-zA-Z0-9\s,.!?]/.test(ch) ? ch : ""))
    .join("")
    .replace(/\s+/g, " ")
    .trim()
}

/* ── Emergency beep ─────────────────────────────────────────────── */

/** Short double beep for emergency alerts (audio context lazily created). */
export function playEmergencyBeep(): void {
  try {
    type AudioCtxCtor = new (options?: AudioContextOptions) => AudioContext
    const Ctor =
      (window.AudioContext as AudioCtxCtor | undefined) ??
      (window as unknown as { webkitAudioContext?: AudioCtxCtor }).webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    const beep = (startAt: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "square"
      osc.frequency.setValueAtTime(880, startAt)
      gain.gain.setValueAtTime(0.18, startAt)
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.22)
      osc.connect(gain).connect(ctx.destination)
      osc.start(startAt)
      osc.stop(startAt + 0.22)
    }
    const now = ctx.currentTime
    beep(now)
    beep(now + 0.3)
    setTimeout(() => ctx.close(), 800)
  } catch {
    /* audio not available — ignore */
  }
}
