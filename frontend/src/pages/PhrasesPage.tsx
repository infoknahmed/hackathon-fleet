import { useEffect, useMemo, useState } from "react"
import { motion } from "motion/react"
import { MessageSquareQuote, Volume2, Send, Brain } from "lucide-react"
import { getPhraseUsage, getCorrections } from "../lib/predict"
import { speak, stopSpeaking, getCurrentLanguage } from "../lib/speech"
import { lookupTranslation } from "../lib/translations"
import type { LanguageCode } from "../lib/translations"
import { sendMessage } from "../lib/messageBus"
import { playTap, playSuccess } from "../lib/soundEffects"
import { COLORS, FONT, RADIUS, SHADOW } from "../theme"
import TopNav from "../components/TopNav"

/**
 * /phrases — the user's most-used phrases as quick-access tiles.
 * Tap = speak + send to guardian. Also shows learned word corrections so
 * users can see what the predictor has picked up.
 */
export default function PhrasesPage() {
  const [phrases, setPhrases] = useState<{ phrase: string; count: number }[]>([])
  const [corrections, setCorrections] = useState<[string, string][]>([])

  useEffect(() => {
    setPhrases(getPhraseUsage().slice(0, 24))
    const corr = Object.entries(getCorrections())
      .map(([from, toMap]) => {
        const best = Object.entries(toMap).sort((a, b) => b[1] - a[1])[0]
        return best ? [from, `${best[0]} (${best[1]}×)`] as [string, string] : null
      })
      .filter((x): x is [string, string] => x !== null)
    setCorrections(corr.slice(0, 10))
  }, [])

  const usePhrase = (phrase: string) => {
    playTap()
    const lang = getCurrentLanguage()
    stopSpeaking()
    if (lang !== "en") {
      const entry = lookupTranslation(phrase)
      const translated = entry ? entry[lang as LanguageCode] : null
      if (translated) {
        speak(translated, undefined, { langCode: lang })
      } else {
        speak(phrase)
      }
    } else {
      speak(phrase)
    }
    sendMessage({
      id: `phrase-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: "message",
      text: phrase,
      pictograms: [],
      confidence: 95,
      timestamp: Date.now(),
      mood: "Neutral",
    })
    playSuccess()
  }

  const maxCount = useMemo(() => Math.max(1, ...phrases.map((p) => p.count)), [phrases])

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
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, display: "flex", alignItems: "center", gap: 10 }}>
            <MessageSquareQuote size={26} aria-hidden="true" /> My Phrases
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 15, color: COLORS.textDim }}>
            Your most-used sentences as one-tap tiles. Tap to speak and send to your guardian.
          </p>
        </header>

        {phrases.length === 0 ? (
          <p style={{ margin: "24px 0", fontSize: 15, color: COLORS.textDim, textAlign: "center" }}>
            No phrases yet — use the Communicate tab and your top sentences will appear here.
          </p>
        ) : (
          <div role="list" aria-label="Most used phrases" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
            {phrases.map((p, i) => (
              <motion.div
                key={p.phrase}
                role="listitem"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03, duration: 0.25 }}
                style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 8 }}
              >
                <p style={{ margin: 0, fontSize: 16.5, fontWeight: 700, lineHeight: 1.35 }}>{p.phrase}</p>
                <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }} aria-hidden="true">
                  <div style={{ height: "100%", width: `${(p.count / maxCount) * 100}%`, background: COLORS.accent, transition: "width 0.3s ease" }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: COLORS.textDim, flex: 1 }}>
                    used {p.count}×
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      stopSpeaking()
                      speak(p.phrase)
                    }}
                    className="btn-ghost"
                    aria-label={`Speak: ${p.phrase}`}
                    style={{ width: 44, height: 44, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                  >
                    <Volume2 size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => usePhrase(p.phrase)}
                    className="btn-gradient"
                    aria-label={`Send: ${p.phrase}`}
                    style={{ width: 44, height: 44, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                  >
                    <Send size={16} aria-hidden="true" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Learned corrections */}
        <section style={cardStyle} aria-label="Learned corrections">
          <h2 style={{ margin: "0 0 8", fontSize: 17, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
            <Brain size={18} aria-hidden="true" /> What the predictor learned
          </h2>
          {corrections.length === 0 ? (
            <p style={{ margin: 0, fontSize: 14, color: COLORS.textDim }}>
              When you correct a predicted word, the app remembers your preference here.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {corrections.map(([from, to]) => (
                <li key={from} style={{ fontSize: 14.5, fontWeight: 600 }}>
                  “{from}” → <span style={{ color: COLORS.accentBright }}>“{to}”</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </motion.main>
    </div>
  )
}
