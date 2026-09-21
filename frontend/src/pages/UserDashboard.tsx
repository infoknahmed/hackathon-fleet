import { useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  Volume2,
  RotateCcw,
  Trash2,
  History,
  SlidersHorizontal,
  Mic,
  Languages,
  Info,
  Check,
  X,
} from "lucide-react"
import { PictogramGrid, SelectionChips } from "../components/PictogramGrid"
import type { Pictogram } from "../components/PictogramGrid"
import { predictSentence } from "../lib/predict"
import {
  sendMessage,
  subscribeToMessages,
  getUserId,
  deleteUserMessages,
} from "../lib/messageBus"
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
  hasNativeVoice,
  unsupportedLanguages,
  selectVoice,
  LANGUAGE_TEST_PHRASES,
} from "../lib/speech"
import type { VoiceSettings } from "../lib/speech"
import { COLORS, FONT, RADIUS, SHADOW, TAP_MIN } from "../theme"
import TopNav from "../components/TopNav"

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
  const [voiceTestLang, setVoiceTestLang] = useState<string>("en")
  const [voiceTestResult, setVoiceTestResult] = useState<string | null>(null)
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

  // Receive guardian replies over the BroadcastChannel.
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

  /** Settings → voice tester: speaks the language's test phrase and reports the outcome. */
  const handleTestVoice = () => {
    const phrase = LANGUAGE_TEST_PHRASES[voiceTestLang] ?? LANGUAGE_TEST_PHRASES.en
    const voice = selectVoice(voiceTestLang)
    if (voice) {
      setVoiceTestResult(`✅ ${voice.name} (${voice.lang})`)
    } else {
      setVoiceTestResult(
        `⚠️ No ${voiceTestLang.toUpperCase()} voice on this device — speaking romanized fallback`,
      )
    }
    speak(phrase, loadVoiceSettings(), { langCode: voiceTestLang })
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

  /** History tab → refresh from SQLite + clear via DELETE /api/messages. */
  const handleClearHistory = async () => {
    const userId = getUserId()
    const ok = await deleteUserMessages(userId)
    if (ok) {
      localStorage.removeItem(HISTORY_KEY)
      setHistory([])
      showToast("History cleared ✓")
    } else {
      showToast("Could not clear history")
    }
  }

  const tabButton = (id: Tab): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    flex: 1,
    minHeight: TAP_MIN,
    background: tab === id ? COLORS.accentSoft : "transparent",
    color: tab === id ? COLORS.accentBright : COLORS.textDim,
    border: "none",
    borderBottom:
      tab === id ? `3px solid ${COLORS.accent}` : "3px solid transparent",
    borderRadius: `${RADIUS.md} ${RADIUS.md} 0 0`,
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: FONT,
  })

  const selectStyle: CSSProperties = {
    width: "100%",
    minHeight: TAP_MIN,
    background: "rgba(10, 25, 41, 0.6)",
    color: COLORS.text,
    border: `1px solid ${COLORS.borderGlass}`,
    borderRadius: RADIUS.md,
    padding: "10px 12px",
    fontSize: 16,
    fontFamily: FONT,
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: FONT,
        display: "flex",
        flexDirection: "column",
        maxWidth: 820,
        width: "100%",
        margin: "0 auto",
        padding: "0 16px 130px",
        boxSizing: "border-box",
      }}
    >
      <TopNav
        right={
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: COLORS.textDim,
              background: "rgba(148, 163, 184, 0.1)",
              border: `1px solid ${COLORS.borderGlass}`,
              borderRadius: RADIUS.pill,
              padding: "6px 12px",
              whiteSpace: "nowrap",
            }}
          >
            User · {getUserId()}
          </span>
        }
      />

      <motion.nav
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        style={{ display: "flex", gap: 4, padding: "14px 0 10px" }}
        aria-label="User dashboard tabs"
      >
        <button type="button" style={tabButton("communicate")} onClick={() => setTab("communicate")}>
          <Mic size={17} strokeWidth={2.4} aria-hidden="true" /> Communicate
        </button>
        <button type="button" style={tabButton("history")} onClick={() => setTab("history")}>
          <History size={17} strokeWidth={2.4} aria-hidden="true" /> History
        </button>
        <button type="button" style={tabButton("settings")} onClick={() => setTab("settings")}>
          <SlidersHorizontal size={17} strokeWidth={2.4} aria-hidden="true" /> Settings
        </button>
      </motion.nav>

      <main style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {tab === "communicate" && (
          <>
            {/* Guardian reply banner */}
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
                    background: "rgba(6, 78, 59, 0.72)",
                    backdropFilter: "blur(20px) saturate(150%)",
                    WebkitBackdropFilter: "blur(20px) saturate(150%)",
                    border: "none",
                    borderLeft: "4px solid #34D399",
                    borderRadius: RADIUS.lg,
                    padding: "16px 18px",
                    cursor: "pointer",
                    color: "#ECFDF5",
                    fontFamily: FONT,
                    boxShadow: SHADOW.md,
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
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 15,
                        fontWeight: 800,
                        color: "#6EE7B7",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Check size={16} strokeWidth={3} aria-hidden="true" /> Read
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
                background: "rgba(30, 41, 59, 0.55)",
                backdropFilter: "blur(20px) saturate(150%)",
                WebkitBackdropFilter: "blur(20px) saturate(150%)",
                border: `1px solid ${COLORS.borderGlass}`,
                borderRadius: RADIUS.lg,
                padding: "10px 12px",
                minHeight: 64,
                flexWrap: "wrap",
                boxShadow: SHADOW.sm,
              }}
            >
              <SelectionChips selected={selected} />
              <button
                type="button"
                onClick={handleClear}
                disabled={selected.length === 0}
                aria-label="Clear selected pictograms"
                className="btn-ghost"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "10px 18px",
                  fontSize: 16,
                  minHeight: TAP_MIN,
                  fontFamily: FONT,
                }}
              >
                <Trash2 size={17} strokeWidth={2.4} aria-hidden="true" /> Clear
              </button>
            </div>

            <PictogramGrid selected={selected} onSelect={handleSelect} />

            {/* Sentence + Speak */}
            <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div
                aria-live="polite"
                style={{
                  background: "rgba(30, 41, 59, 0.55)",
                  backdropFilter: "blur(20px) saturate(150%)",
                  WebkitBackdropFilter: "blur(20px) saturate(150%)",
                  border: `1px solid ${COLORS.borderGlass}`,
                  borderLeft: `5px solid ${COLORS.accent}`,
                  borderRadius: RADIUS.lg,
                  padding: "18px 20px",
                  minHeight: 84,
                  display: "flex",
                  alignItems: "center",
                  boxShadow: SHADOW.sm,
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
                  whileTap={{ scale: 0.96 }}
                  whileHover={{ y: -2 }}
                  aria-label="Speak the sentence out loud and send it to the guardian"
                  className="btn-gradient"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    padding: "18px 24px",
                    fontSize: 24,
                    minHeight: 68,
                    fontFamily: FONT,
                  }}
                >
                  <Volume2 size={26} strokeWidth={2.6} aria-hidden="true" /> Speak
                </motion.button>
              )}

              {sentence && (
                <button
                  type="button"
                  onClick={() => setTranslatedText(speakSentence(sentence) ?? "")}
                  aria-label="Speak the sentence again"
                  className="btn-ghost"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 9,
                    padding: "14px 24px",
                    fontSize: 19,
                    minHeight: 60,
                    color: COLORS.accentBright,
                    borderColor: "rgba(0, 180, 216, 0.5)",
                    fontFamily: FONT,
                  }}
                >
                  <RotateCcw size={19} strokeWidth={2.5} aria-hidden="true" /> Speak Again
                </button>
              )}
            </section>
          </>
        )}

        {tab === "history" && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            aria-label="Message history"
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>
                Last {last20.length} messages
              </h2>
              <button
                type="button"
                onClick={handleClearHistory}
                disabled={history.length === 0}
                className="btn-ghost"
                aria-label="Clear message history"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  minHeight: TAP_MIN,
                  padding: "8px 16px",
                  fontSize: 14,
                  color: COLORS.danger,
                  borderColor: "rgba(239, 68, 68, 0.5)",
                  fontFamily: FONT,
                }}
              >
                <Trash2 size={15} strokeWidth={2.4} aria-hidden="true" /> Clear history
              </button>
            </div>
            {last20.length === 0 ? (
              <p style={{ color: COLORS.textDim, fontSize: 16 }}>
                No messages yet — tap pictograms and press Speak.
              </p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                {last20.map((m, i) => (
                  <motion.li
                    key={m.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03, duration: 0.25 }}
                    style={{
                      background: "rgba(30, 41, 59, 0.55)",
                      backdropFilter: "blur(20px) saturate(150%)",
                      WebkitBackdropFilter: "blur(20px) saturate(150%)",
                      border: `1px solid ${COLORS.borderGlass}`,
                      borderRadius: RADIUS.md,
                      padding: "12px 16px",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      boxShadow: SHADOW.sm,
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
                  </motion.li>
                ))}
              </ul>
            )}
          </motion.section>
        )}

        {tab === "settings" && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            aria-label="Voice settings"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 20,
              background: "rgba(30, 41, 59, 0.55)",
              backdropFilter: "blur(20px) saturate(150%)",
              WebkitBackdropFilter: "blur(20px) saturate(150%)",
              border: `1px solid ${COLORS.borderGlass}`,
              borderRadius: RADIUS.lg,
              padding: 22,
              boxShadow: SHADOW.md,
            }}
          >
            {/* Language selection (unsupported languages disabled) */}
            <div>
              <label htmlFor="language-select" style={{ fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                <Languages size={17} aria-hidden="true" /> Language
              </label>
              <select
                id="language-select"
                value={language}
                onChange={(e) => handleLanguageChange(e.target.value)}
                style={selectStyle}
              >
                {LANGUAGES.map((l) => {
                  const supported = hasNativeVoice(l.code)
                  return (
                    <option
                      key={l.code}
                      value={l.code}
                      disabled={!supported && l.code !== "en"}
                      title={supported ? undefined : "Not supported on this device"}
                    >
                      {l.label}{supported || l.code === "en" ? "" : " — not supported on this device"}
                    </option>
                  )
                })}
              </select>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: COLORS.textDim }}>
                Speak will say sentences in this language when a translation exists.
              </p>
              {unsupportedLanguages(LANGUAGES.map((l) => l.code)).length > 0 && (
                <p
                  style={{
                    margin: "6px 0 0",
                    fontSize: 12.5,
                    color: COLORS.warning,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Info size={14} aria-hidden="true" />
                  No installed voice for: {unsupportedLanguages(LANGUAGES.map((l) => l.code)).join(", ").toUpperCase()} — romanized audio will be used
                </p>
              )}
            </div>

            {/* Voice tester */}
            <div>
              <label htmlFor="voice-test-lang" style={{ fontSize: 16, fontWeight: 700, display: "block", marginBottom: 8 }}>
                Voice tester
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select
                  id="voice-test-lang"
                  value={voiceTestLang}
                  onChange={(e) => {
                    setVoiceTestLang(e.target.value)
                    setVoiceTestResult(null)
                  }}
                  style={{ ...selectStyle, flex: 1, minWidth: 150, width: "auto" }}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleTestVoice}
                  className="btn-ghost"
                  style={{
                    minHeight: TAP_MIN,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "0 18px",
                    fontSize: 15,
                    color: COLORS.accentBright,
                    borderColor: "rgba(0, 180, 216, 0.5)",
                    fontFamily: FONT,
                  }}
                >
                  <Volume2 size={17} aria-hidden="true" /> Test Voice
                </button>
              </div>
              {voiceTestResult && (
                <p style={{ margin: "8px 0 0", fontSize: 13, fontWeight: 700, color: COLORS.textDim }}>
                  {voiceTestResult}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="voice-select" style={{ fontSize: 16, fontWeight: 700, display: "block", marginBottom: 8 }}>
                Voice
              </label>
              <select
                id="voice-select"
                value={voiceSettings.voiceURI ?? ""}
                onChange={(e) => updateSettings({ voiceURI: e.target.value || null })}
                style={selectStyle}
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
                style={{ width: "100%", accentColor: COLORS.accent, minHeight: TAP_MIN }}
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
                style={{ width: "100%", accentColor: COLORS.accent, minHeight: TAP_MIN }}
              />
            </div>

            <button
              type="button"
              onClick={() =>
                setTranslatedText(speakSentence("I need water") ?? "")
              }
              className="btn-ghost"
              style={{
                minHeight: TAP_MIN,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                fontSize: 17,
                color: COLORS.accentBright,
                borderColor: "rgba(0, 180, 216, 0.5)",
                fontFamily: FONT,
              }}
            >
              <Volume2 size={18} aria-hidden="true" /> Test voice
            </button>
          </motion.section>
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
          background: `radial-gradient(circle at 30% 30%, #F87171, ${COLORS.danger})`,
          color: "#fff",
          border: "3px solid rgba(255,255,255,0.25)",
          fontSize: 15,
          fontWeight: 800,
          letterSpacing: 0.5,
          cursor: "pointer",
          boxShadow: SHADOW.dangerGlow,
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
              background: "rgba(16, 185, 129, 0.92)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              color: "#04291B",
              borderRadius: RADIUS.pill,
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

      {/* Screen-reader-only stop control parity */}
      <button
        type="button"
        onClick={stopSpeaking}
        aria-label="Stop speaking"
        className="sr-only"
      >
        <X size={1} aria-hidden="true" />
      </button>
    </div>
  )
}
