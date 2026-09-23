import { useEffect, useMemo, useState } from "react"
import { motion } from "motion/react"
import { Volume2, PlayCircle } from "lucide-react"
import {
  getVoices,
  waitForVoices,
  speak,
  stopSpeaking,
  LANGUAGE_TEST_PHRASES,
  LANGUAGE_VOICE_MAP,
  hasNativeVoice,
} from "../lib/speech"
import { COLORS, FONT, RADIUS, SHADOW, TAP_MIN } from "../theme"
import TopNav from "../components/TopNav"

/**
 * /voices — system voice inventory grouped by language with play buttons.
 * Diagnostic page for verifying which TTS voices exist on this device.
 */

const APP_LANGS = ["en", "hi", "kn", "te", "ta", "mr", "bn", "ml"] as const

interface VoiceGroup {
  lang: string
  voices: SpeechSynthesisVoice[]
}

export default function VoicesPage() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => getVoices())
  const [speakingUri, setSpeakingUri] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void waitForVoices().then((v) => {
      if (!cancelled) setVoices(v)
    })
    return () => {
      cancelled = true
      stopSpeaking()
    }
  }, [])

  /** Group app languages first, then any other languages present. */
  const groups = useMemo<VoiceGroup[]>(() => {
    const byLang = new Map<string, SpeechSynthesisVoice[]>()
    for (const v of voices) {
      const key = v.lang.toLowerCase().replace("_", "-")
      const list = byLang.get(key) ?? []
      list.push(v)
      byLang.set(key, list)
    }
    const appGroups: VoiceGroup[] = APP_LANGS.map((code) => {
      const prefixes = LANGUAGE_VOICE_MAP[code] ?? [code]
      const matched: SpeechSynthesisVoice[] = []
      for (const [lang, list] of byLang) {
        if (prefixes.some((p) => lang.startsWith(p.toLowerCase().slice(0, 2)))) {
          matched.push(...list)
        }
      }
      return { lang: code, voices: matched }
    })
    const otherGroups: VoiceGroup[] = [...byLang.entries()]
      .map(([lang, list]) => ({ lang, voices: list }))
      .filter((g) => !APP_LANGS.some((c) => g.lang.startsWith(c)))
      .sort((a, b) => a.lang.localeCompare(b.lang))
    return [...appGroups, ...otherGroups]
  }, [voices])

  const preview = (voice: SpeechSynthesisVoice) => {
    stopSpeaking()
    const utter = new SpeechSynthesisUtterance("Hello, this is VaakSetu speaking.")
    utter.voice = voice
    utter.lang = voice.lang
    utter.onend = () => setSpeakingUri(null)
    setSpeakingUri(voice.voiceURI)
    window.speechSynthesis.speak(utter)
  }

  const testLang = (code: string) => {
    const phrase = LANGUAGE_TEST_PHRASES[code] ?? LANGUAGE_TEST_PHRASES.en
    speak(phrase, undefined, { langCode: code })
  }

  const cardStyle = {
    background: "rgba(30, 41, 59, 0.55)",
    backdropFilter: "blur(20px) saturate(150%)",
    WebkitBackdropFilter: "blur(20px) saturate(150%)",
    border: `1px solid ${COLORS.borderGlass}`,
    borderRadius: RADIUS.lg,
    padding: 18,
    boxShadow: SHADOW.sm,
  } as const

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: FONT, padding: "0 16px 60px", maxWidth: 860, margin: "0 auto" }}>
      <TopNav />
      <motion.main initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 12 }}>
        <header>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900 }}>System Voices</h1>
          <p style={{ margin: "4px 0 0", fontSize: 15, color: COLORS.textDim }}>
            {voices.length} voices detected on this device. VaakSetu maps the best match per app language.
          </p>
        </header>

        {/* App-language quick test */}
        <div style={cardStyle}>
          <h2 style={{ margin: "0 0 10", fontSize: 17, fontWeight: 800 }}>VaakSetu languages</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {APP_LANGS.map((code) => {
              const ok = hasNativeVoice(code)
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => testLang(code)}
                  className="btn-ghost"
                  aria-label={`Test the ${code.toUpperCase()} voice`}
                  style={{
                    minHeight: TAP_MIN,
                    padding: "0 16px",
                    fontSize: 14,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    color: ok ? COLORS.accentBright : COLORS.textDim,
                    borderColor: ok ? "rgba(0,224,255,0.5)" : COLORS.borderGlass,
                  }}
                >
                  <PlayCircle size={16} aria-hidden="true" /> {code.toUpperCase()}
                  {ok ? "" : " (fallback)"}
                </button>
              )
            })}
          </div>
        </div>

        {/* All voices grouped */}
        {groups.map((group) => (
          <section key={group.lang} aria-label={`Voices for ${group.lang}`} style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{group.lang.toUpperCase()}</h2>
              {group.voices.length === 0 && (
                <span style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.warning }}>No native voice — romanized fallback</span>
              )}
            </div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {group.voices.map((v) => (
                <li key={v.voiceURI} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => preview(v)}
                    aria-label={`Preview voice ${v.name}`}
                    className="btn-ghost"
                    style={{ width: 44, height: 44, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                  >
                    <Volume2 size={16} color={speakingUri === v.voiceURI ? COLORS.success : COLORS.accentBright} aria-hidden="true" />
                  </button>
                  <span style={{ flex: 1, fontSize: 14.5, fontWeight: 600, overflowWrap: "anywhere" }}>
                    {v.name}
                    {v.localService ? "" : "  ·  network"}
                  </span>
                  <span style={{ fontSize: 12, color: COLORS.textDim, fontFamily: "monospace" }}>{v.lang}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </motion.main>
    </div>
  )
}
