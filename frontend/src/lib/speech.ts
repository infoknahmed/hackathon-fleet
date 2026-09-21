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

export function getVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return []
  return window.speechSynthesis.getVoices()
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

/** Map bare language codes to a sensible default BCP-47 tag. */
const BCP47_FALLBACK: Record<string, string> = {
  en: "en-US",
}

function toBcp47(langCode: string): string {
  return BCP47_FALLBACK[langCode.toLowerCase()] ?? langCode
}

function langMatches(voice: SpeechSynthesisVoice, langCode: string): boolean {
  const voiceLang = voice.lang.toLowerCase().replace("_", "-")
  const code = langCode.toLowerCase()
  return voiceLang === code || voiceLang.startsWith(`${code}-`)
}

export interface SpeakOptions {
  /** ISO/BCP-47 language code (e.g. "hi", "kn", "en-US"). Defaults to the saved language. */
  langCode?: string
}

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
  const bcp47 = toBcp47(langCode)

  // Keep the user's saved voice when it fits the requested language;
  // otherwise pick the first installed voice that matches it.
  const savedVoice = settings.voiceURI
    ? getVoices().find((v) => v.voiceURI === settings.voiceURI)
    : undefined
  const voice =
    savedVoice && (langCode === DEFAULT_LANGUAGE || langMatches(savedVoice, langCode))
      ? savedVoice
      : getVoices().find((v) => langMatches(v, langCode))

  const utterance = new SpeechSynthesisUtterance(text)
  if (voice) {
    utterance.voice = voice
    utterance.lang = voice.lang
  } else {
    utterance.lang = bcp47
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

/** Short double beep for emergency alerts (audio context lazily created). */
export function playEmergencyBeep(): void {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
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
