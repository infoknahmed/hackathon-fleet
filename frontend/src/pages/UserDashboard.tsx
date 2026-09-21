import { useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { AnimatePresence, motion } from "motion/react"
import { PictogramGrid, SelectionChips } from "../components/PictogramGrid"
import type { Pictogram } from "../components/PictogramGrid"
import { predictSentence } from "../lib/predict"
import { sendMessage, subscribeToMessages, getUserId } from "../lib/messageBus"
import type { VaakSetuMessage, ReplyMessage } from "../lib/messageBus"
import { LANGUAGES, lookupTranslation } from "../lib/translations"
import type { LanguageCode } from "../lib/translations"
import {
  speak,
  speakWithLanguage,
  stopSpeaking,
  loadVoiceSettings,
  saveVoiceSettings,
  getCurrentLanguage,
  setCurrentLanguage,
  getVoices,
  waitForVoices,
} from "../lib/speech"
import type { VoiceSettings } from "../lib/speech"
import { COLORS, FONT } from "../theme"

const MAX_SELECTION = 3
const HISTORY_KEY = "vaaksetu-history"
const REPLY_VISIBLE_MS = 8000

type Tab = "communicate" | "history" | "settings"

function loadHistory(): VaakSetuMessage[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (raw) return JSON.parse(raw) as VaakSetuMessage[]
  } catch {
    /* ignore */
  }
  return []
}

function appendHistory(msg: VaakSetuMessage) {
  const history = [msg, ...loadHistory()].slice(0, 50)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
}

/** Simple keyword-based mood tag for the admin pie chart. */
function detectMood(text: string): string {
  const t = text.toLowerCase()
  if (t.includes("pain")) return "Distressed"
  if (t.includes("help") || t.includes("emergency")) return "Urgent"
  if (t.includes("yes") || t.includes("more")) return "Positive"
  return "Neutral"
}

export default function UserDashboard() {
  const [tab, setTab] = useState<Tab>("communicate")
  const [selected, setSelected] = useState<Pictogram[]>([])
  const [sentence, setSentence] = useState("")
  const [translatedText, setTranslatedText] = useState("")
  const [toast, setToast] = useState<string | null>(null)
  const [history, setHistory] = useState<VaakSetuMessage[]>(() => loadHistory())
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(() =>
    loadVoiceSettings(),
  )
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => getVoices())
  const [language, setLanguage] = useState<string>(() => getCurrentLanguage())
  const [lastReply, setLastReply] = useState<(ReplyMessage & { read: boolean }) | null>(
    null,
  )
  const replyTimerRef = useRef<number | null>(null)

  const isFull = selected.length >= MAX_SELECTION

  // Reload the voice list on mount and whenever the language changes, so a
  // matching voice for the new language is picked up if one exists.
  useEffect(() => {
    let cancelled = false
    waitForVoices().then((v) => {
      if (!cancelled) setVoices(v)
    })
    return () => {
      cancelled = true
    }
  }, [language])

  // Feature 2: receive guardian replies over the BroadcastChannel.
  useEffect(() => {
    const unsubscribe = subscribeToMessages((msg) => {
      if (msg.type !== "reply") return
      if (replyTimerRef.current !== null) window.clearTimeout(replyTimerRef.current)
      setLastReply({ ...msg, read: false })
      replyTimerRef.current = window.setTimeout(() => {
        setLastReply(null)
        replyTimerRef.current = null
      }, REPLY_VISIBLE_MS)
    })
    return () => {
      unsubscribe()
      if (replyTimerRef.current !== null) window.clearTimeout(replyTimerRef.current)
    }
  }, [])

  const handleSelect = (p: Pictogram) => {
    setSelected((prev) => {
      if (prev.some((s) => s.id === p.id)) return prev
      if (prev.length >= MAX_SELECTION) return prev
      return [...prev, p]
    })
    setSentence("")
    setTranslatedText("")
  }

  const handleClear = () => {
    setSelected([])
    setSentence("")
    setTranslatedText("")
    stopSpeaking()
  }

  const showToast = (text: string) => {
    setToast(text)
    window.setTimeout(() => setToast(null), 2000)
  }

  const publish = (msg: VaakSetuMessage) => {
    sendMessage(msg)
    appendHistory(msg)
    setHistory(loadHistory())
  }

  /** Speaks in the selected language; returns the translated text or null. */
  const speakSentence = (englishText: string): string | null => {
    if (language !== "en") {
      const entry = lookupTranslation(englishText)
      const translated = entry ? entry[language as LanguageCode] : null
      if (translated) {
        speakWithLanguage(translated, language)
        return translated
      }
    }
    speak(englishText)
    return null
  }

  const handleSpeak = () => {
    const result = predictSentence(selected.map((s) => s.label))
    setSentence(result.text)
    setTranslatedText(speakSentence(result.text) ?? "")

    publish({
      type: "message",
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text: result.text,
      pictograms: selected.map((p) => ({ id: p.id, label: p.label, emoji: p.emoji })),
      confidence: result.isFallback ? 62 : 96,
      timestamp: Date.now(),
      mood: detectMood(result.text),
    })
    showToast("Sent to guardian ✓")
  }

  const handleSOS = () => {
    const text = "🚨 EMERGENCY: I need help right now!"
    speak(text)
    publish({
      type: "message",
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text,
      pictograms: [],
      confidence: 100,
      timestamp: Date.now(),
      mood: "Urgent",
      emergency: true,
    })
    showToast("SOS sent to guardian 🚨")
  }

  const handleLanguageChange = (code: string) => {
    setLanguage(code)
    setCurrentLanguage(code)
  }

  const updateSettings = (patch: Partial<VoiceSettings>) => {
    const next = { ...voiceSettings, ...patch }
    setVoiceSettings(next)
    saveVoiceSettings(next)
  }

  const last20 = useMemo(() => history.slice(0, 20), [history])

  const tabButton = (id: Tab): CSSProperties => ({
    flex: 1,
    minHeight: 48,
    background: tab === id ? COLORS.accentSoft : "transparent",
    color: tab === id ? COLORS.accent : COLORS.textDim,
    border: "none",
    borderBottom:
      tab === id ? `3px solid ${COLORS.accent}` : "3px solid transparent",
    borderRadius: "10px 10px 0 0",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: FONT,
  })

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: FONT,
        display: "flex",
        flexDirection: "column",
        maxWidth: 760,
        width: "100%",
        margin: "0 auto",
        padding: "0 16px 120px",
        boxSizing: "border-box",
      }}
    >
      {/* Top bar */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "14px 0 10px",
          position: "sticky",
          top: 0,
          background: COLORS.bg,
          zIndex: 10,
        }}
      >
        <span style={{ fontSize: 28 }} aria-hidden="true">
          🗣️
        </span>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>VaakSetu</h1>
          <p style={{ margin: 0, fontSize: 12, color: COLORS.accent, fontWeight: 600 }}>
            User · {getUserId()}
          </p>
        </div>
        <nav
          style={{ display: "flex", gap: 4, flex: 2, maxWidth: 420 }}
          aria-label="User dashboard tabs"
        >
          <button type="button" style={tabButton("communicate")} onClick={() => setTab("communicate")}>
            Communicate
          </button>
          <button type="button" style={tabButton("history")} onClick={() => setTab("history")}>
            History
          </button>
          <button type="button" style={tabButton("settings")} onClick={() => setTab("settings")}>
            Settings
          </button>
        </nav>
      </header>

      <main style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {tab === "communicate" && (
          <>
            {/* Feature 2: guardian reply banner (above the pictogram grid) */}
            <AnimatePresence>
              {lastReply && (
                <motion.button
                  key={`reply-${lastReply.timestamp}`}
                  type="button"
                  onClick={() =>
                    setLastReply((r) => (r ? { ...r, read: true } : r))
                  }
                  initial={{ opacity: 0, y: -48 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -24 }}
                  transition={{ type: "spring", stiffness: 300, damping: 26 }}
                  aria-label={`Guardian replied: ${lastReply.text}. Tap to mark as read.`}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 14,
                    width: "100%",
                    textAlign: "left",
                    background: "#064E3B",
                    border: "none",
                    borderLeft: "4px solid #34D399",
                    borderRadius: 14,
                    padding: "16px 18px",
                    cursor: "pointer",
                    color: "#ECFDF5",
                    fontFamily: FONT,
                  }}
                >
                  <span style={{ fontSize: 32, lineHeight: 1 }} aria-hidden="true">
                    👨‍👩‍👧
                  </span>
                  <span style={{ flex: 1 }}>
                    <span
                      style={{
                        display: "block",
                        fontSize: 12,
                        fontWeight: 800,
                        letterSpacing: 1.5,
                        color: "#6EE7B7",
                        marginBottom: 4,
                      }}
                    >
                      GUARDIAN REPLY
                    </span>
                    <span
                      style={{
                        display: "block",
                        fontSize: 20,
                        fontWeight: 800,
                        lineHeight: 1.3,
                      }}
                    >
                      {lastReply.text}
                    </span>
                  </span>
                  {lastReply.read && (
                    <span
                      style={{
                        fontSize: 15,
                        fontWeight: 800,
                        color: "#6EE7B7",
                        whiteSpace: "nowrap",
                      }}
                    >
                      ✓ Read
                    </span>
                  )}
                </motion.button>
              )}
            </AnimatePresence>

            {/* Selection bar */}
            <div
              role="status"
              aria-label={`Selected ${selected.length} of ${MAX_SELECTION}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: COLORS.card,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 16,
                padding: "10px 12px",
                minHeight: 64,
                flexWrap: "wrap",
              }}
            >
              <SelectionChips selected={selected} />
              <button
                type="button"
                onClick={handleClear}
                disabled={selected.length === 0}
                aria-label="Clear selected pictograms"
                style={{
                  background: "transparent",
                  color: COLORS.textDim,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 12,
                  padding: "10px 18px",
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: "pointer",
                  minHeight: 48,
                  fontFamily: FONT,
                }}
              >
                Clear
              </button>
            </div>

            <PictogramGrid selected={selected} onSelect={handleSelect} />

            {/* Sentence + Speak */}
            <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div
                aria-live="polite"
                style={{
                  background: COLORS.card,
                  border: `1px solid ${COLORS.border}`,
                  borderLeft: `5px solid ${COLORS.accent}`,
                  borderRadius: 16,
                  padding: "18px 20px",
                  minHeight: 84,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {sentence ? (
                  <div>
                    <p style={{ margin: 0, fontSize: 26, fontWeight: 700, lineHeight: 1.35 }}>
                      {sentence}
                    </p>
                    {translatedText && (
                      <p
                        style={{
                          margin: "6px 0 0",
                          fontSize: 17,
                          fontWeight: 600,
                          color: COLORS.accent,
                          lineHeight: 1.4,
                        }}
                      >
                        {translatedText}
                      </p>
                    )}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: 18, color: COLORS.textDim, fontWeight: 500 }}>
                    {isFull
                      ? "Ready! Press Speak to say it out loud."
                      : "Your sentence will appear here."}
                  </p>
                )}
              </div>

              {isFull && (
                <motion.button
                  type="button"
                  onClick={handleSpeak}
                  whileTap={{ scale: 0.95 }}
                  aria-label="Speak the sentence out loud and send it to the guardian"
                  style={{
                    background: COLORS.accent,
                    color: "#04121F",
                    border: "none",
                    borderRadius: 16,
                    padding: "18px 24px",
                    fontSize: 24,
                    fontWeight: 800,
                    cursor: "pointer",
                    minHeight: 68,
                    boxShadow: `0 6px 24px ${COLORS.accentSoft}`,
                    fontFamily: FONT,
                  }}
                >
                  🔊 Speak
                </motion.button>
              )}

              {sentence && (
                <button
                  type="button"
                  onClick={() => setTranslatedText(speakSentence(sentence) ?? "")}
                  aria-label="Speak the sentence again"
                  style={{
                    background: "transparent",
                    color: COLORS.accent,
                    border: `2px solid ${COLORS.accent}`,
                    borderRadius: 16,
                    padding: "14px 24px",
                    fontSize: 19,
                    fontWeight: 700,
                    cursor: "pointer",
                    minHeight: 60,
                    fontFamily: FONT,
                  }}
                >
                  🔁 Speak Again
                </button>
              )}
            </section>
          </>
        )}

        {tab === "history" && (
          <section aria-label="Message history">
            <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>
              Last {last20.length} messages
            </h2>
            {last20.length === 0 ? (
              <p style={{ color: COLORS.textDim, fontSize: 16 }}>
                No messages yet — tap pictograms and press Speak.
              </p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                {last20.map((m) => (
                  <li
                    key={m.id}
                    style={{
                      background: COLORS.card,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 12,
                      padding: "12px 16px",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <span style={{ fontSize: 22 }} aria-hidden="true">
                      {m.type === "message"
                        ? m.emergency
                          ? "🚨"
                          : m.pictograms[0]?.emoji ?? "💬"
                        : "💬"}
                    </span>
                    <span style={{ flex: 1, fontSize: 17, fontWeight: 600 }}>
                      {m.type === "mood" ? `Mood update: ${m.mood}` : m.text}
                    </span>
                    <span style={{ fontSize: 13, color: COLORS.textDim, fontVariantNumeric: "tabular-nums" }}>
                      {new Date(m.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: false,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === "settings" && (
          <section aria-label="Voice settings" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Feature 1: language selection */}
            <div>
              <label htmlFor="language-select" style={{ fontSize: 16, fontWeight: 700, display: "block", marginBottom: 8 }}>
                Language
              </label>
              <select
                id="language-select"
                value={language}
                onChange={(e) => handleLanguageChange(e.target.value)}
                style={{
                  width: "100%",
                  minHeight: 48,
                  background: COLORS.card,
                  color: COLORS.text,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 12,
                  padding: "10px 12px",
                  fontSize: 16,
                  fontFamily: FONT,
                }}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: COLORS.textDim }}>
                Speak will say sentences in this language when a translation exists.
              </p>
            </div>

            <div>
              <label htmlFor="voice-select" style={{ fontSize: 16, fontWeight: 700, display: "block", marginBottom: 8 }}>
                Voice
              </label>
              <select
                id="voice-select"
                value={voiceSettings.voiceURI ?? ""}
                onChange={(e) => updateSettings({ voiceURI: e.target.value || null })}
                style={{
                  width: "100%",
                  minHeight: 48,
                  background: COLORS.card,
                  color: COLORS.text,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 12,
                  padding: "10px 12px",
                  fontSize: 16,
                  fontFamily: FONT,
                }}
              >
                <option value="">System default</option>
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="rate-slider" style={{ fontSize: 16, fontWeight: 700, display: "block", marginBottom: 8 }}>
                Rate: {voiceSettings.rate.toFixed(2)}×
              </label>
              <input
                id="rate-slider"
                type="range"
                min={0.5}
                max={2}
                step={0.05}
                value={voiceSettings.rate}
                onChange={(e) => updateSettings({ rate: Number(e.target.value) })}
                style={{ width: "100%", accentColor: COLORS.accent, minHeight: 48 }}
              />
            </div>

            <div>
              <label htmlFor="pitch-slider" style={{ fontSize: 16, fontWeight: 700, display: "block", marginBottom: 8 }}>
                Pitch: {voiceSettings.pitch.toFixed(2)}
              </label>
              <input
                id="pitch-slider"
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={voiceSettings.pitch}
                onChange={(e) => updateSettings({ pitch: Number(e.target.value) })}
                style={{ width: "100%", accentColor: COLORS.accent, minHeight: 48 }}
              />
            </div>

            <button
              type="button"
              onClick={() =>
                setTranslatedText(speakSentence("I need water") ?? "")
              }
              style={{
                minHeight: 48,
                background: COLORS.accentSoft,
                color: COLORS.accent,
                border: `2px solid ${COLORS.accent}`,
                borderRadius: 12,
                fontSize: 17,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: FONT,
              }}
            >
              🔊 Test voice
            </button>
          </section>
        )}
      </main>

      {/* Emergency SOS floating button */}
      <motion.button
        type="button"
        onClick={handleSOS}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        aria-label="Emergency SOS — send an urgent alert to your guardian"
        style={{
          position: "fixed",
          right: 20,
          bottom: "max(20px, env(safe-area-inset-bottom))",
          width: 76,
          height: 76,
          borderRadius: "50%",
          background: COLORS.danger,
          color: "#fff",
          border: "3px solid rgba(255,255,255,0.25)",
          fontSize: 15,
          fontWeight: 800,
          letterSpacing: 0.5,
          cursor: "pointer",
          boxShadow: "0 8px 30px rgba(239, 68, 68, 0.45)",
          zIndex: 50,
          fontFamily: FONT,
        }}
      >
        SOS
      </motion.button>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.22 }}
            style={{
              position: "fixed",
              left: "50%",
              bottom: 110,
              transform: "translateX(-50%)",
              background: COLORS.success,
              color: "#04291B",
              borderRadius: 999,
              padding: "12px 22px",
              fontSize: 17,
              fontWeight: 800,
              boxShadow: "0 8px 30px rgba(16, 185, 129, 0.4)",
              zIndex: 60,
              fontFamily: FONT,
            }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
