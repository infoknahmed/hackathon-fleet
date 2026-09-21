import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  Mic,
  MicOff,
  Send,
  Languages,
  Trash2,
  Hand,
  Ear,
} from "lucide-react"
import { PictogramGrid } from "../components/PictogramGrid"
import type { Pictogram } from "../components/PictogramGrid"
import { MessageCard } from "../components/MessageCard"
import type { ChatMessage } from "../components/MessageCard"
import { SignAvatar } from "../components/SignAvatar"
import { predictSentence } from "../lib/predict"
import {
  speak,
  speakWithLanguage,
  stopSpeaking,
  loadVoiceSettings,
} from "../lib/speech"
import { LANGUAGES, lookupTranslation } from "../lib/translations"
import type { LanguageCode } from "../lib/translations"
import { COLORS, FONT, RADIUS, SHADOW, TAP_MIN } from "../theme"
import TopNav from "../components/TopNav"

const STORAGE_KEY = "vaaksetu-conversation"

/** BCP-47 tags for speech recognition + synthesis. */
const BCP47: Record<LanguageCode, string> = {
  en: "en-US",
  hi: "hi-IN",
  kn: "kn-IN",
  te: "te-IN",
  ta: "ta-IN",
}

/** Simple ISL-style sign vocabulary mapped from pictograms. */
const SIGNS: Record<string, string> = {
  yes: "👍",
  no: "👎",
  water: "💧",
  food: "🍛",
  toilet: "🚽",
  pain: "🤕",
  help: "🆘",
  family: "👨‍👩‍👧",
  more: "➕",
}

/** Mic-meter tuning (noise handling). */
const NOISE_LEVEL = 0.5
const NOISE_TRIGGER_MS = 2000
const NOISE_FADE_MS = 3000
/** Activation thresholds for the 5 level bars. */
const BAR_STEPS = [0.06, 0.22, 0.4, 0.58, 0.78]

/** ASR confidence badge color (>0.8 green, 0.5–0.8 yellow, <0.5 red). */
function asrConfColor(confidence: number): string {
  if (confidence > 0.8) return COLORS.success
  if (confidence >= 0.5) return COLORS.warning
  return COLORS.danger
}

type RecognitionEvent = {
  resultIndex: number
  results: ArrayLike<ArrayLike<{ transcript: string; confidence?: number }> & { isFinal: boolean }>
}

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: RecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
}

type RecognitionCtor = new () => SpeechRecognitionLike

function getRecognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor
    webkitSpeechRecognition?: RecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

function loadConversation(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as ChatMessage[]
  } catch {
    /* ignore */
  }
  return []
}

function persist(msgs: ChatMessage[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-100)))
  } catch {
    /* ignore */
  }
}

export default function ConversationPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadConversation())
  const [selected, setSelected] = useState<Pictogram[]>([])
  const [lang, setLang] = useState<LanguageCode>("en")
  const [typed, setTyped] = useState("")
  const [listening, setListening] = useState(false)
  const [speechSupported] = useState(() => getRecognitionCtor() !== null)
  const [error, setError] = useState<string | null>(null)
  const [signPopup, setSignPopup] = useState<{ text: string } | null>(null)
  const [speechConfidence, setSpeechConfidence] = useState<number | null>(null)
  // Mic metering (noise handling)
  const [micLevel, setMicLevel] = useState(0)
  const [noisy, setNoisy] = useState(false)
  // ASR confidence + low-confidence correction
  const [suggestion, setSuggestion] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const shouldListenRef = useRef(false)
  const meterStreamRef = useRef<MediaStream | null>(null)
  const meterCtxRef = useRef<AudioContext | null>(null)
  const meterRafRef = useRef(0)
  const loudSinceRef = useRef<number | null>(null)
  const quietSinceRef = useRef<number | null>(null)
  const noisyShownAtRef = useRef<number | null>(null)
  const chatEndRefLeft = useRef<HTMLDivElement | null>(null)
  const chatEndRefRight = useRef<HTMLDivElement | null>(null)

  // Persist to sessionStorage on every change.
  useEffect(() => {
    persist(messages)
  }, [messages])

  // Autoscroll chat to the newest message.
  useEffect(() => {
    chatEndRefLeft.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages, signPopup])

  // Right panel autoscroll.
  useEffect(() => {
    chatEndRefRight.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages])

  // Cleanup recognition + mic meter on unmount.
  useEffect(() => {
    return () => {
      shouldListenRef.current = false
      recognitionRef.current?.abort()
      stopMicMeter()
    }
  }, [])

  const pushMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg])
  }, [])

  /* ── Mic level meter: AudioContext + AnalyserNode → 5 bars + noise alert ── */
  const stopMicMeter = useCallback(() => {
    cancelAnimationFrame(meterRafRef.current)
    meterRafRef.current = 0
    setMicLevel(0)
    loudSinceRef.current = null
    quietSinceRef.current = null
    noisyShownAtRef.current = null
    setNoisy(false)
    meterStreamRef.current?.getTracks().forEach((t) => t.stop())
    meterStreamRef.current = null
    void meterCtxRef.current?.close().catch(() => undefined)
    meterCtxRef.current = null
  }, [])

  const startMicMeter = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      meterStreamRef.current = stream
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      const ctx = new Ctor()
      meterCtxRef.current = ctx
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 1024
      ctx.createMediaStreamSource(stream).connect(analyser)
      const buf = new Uint8Array(analyser.fftSize)

      const loop = () => {
        analyser.getByteTimeDomainData(buf)
        let peak = 0
        for (let i = 0; i < buf.length; i++) {
          const dev = Math.abs(buf[i] - 128)
          if (dev > peak) peak = dev
        }
        const level = Math.min(1, peak / 128)
        setMicLevel(level)

        // Noise gating: very loud for >2s → warn; fade 3s after it quietens.
        const now = performance.now()
        if (level > NOISE_LEVEL) {
          quietSinceRef.current = null
          if (loudSinceRef.current === null) {
            loudSinceRef.current = now
          } else if (
            now - loudSinceRef.current > NOISE_TRIGGER_MS &&
            noisyShownAtRef.current === null
          ) {
            noisyShownAtRef.current = now
            setNoisy(true)
          }
        } else {
          loudSinceRef.current = null
          if (quietSinceRef.current === null) quietSinceRef.current = now
          if (
            noisyShownAtRef.current !== null &&
            now - quietSinceRef.current > NOISE_FADE_MS
          ) {
            noisyShownAtRef.current = null
            quietSinceRef.current = null
            setNoisy(false)
          }
        }
        meterRafRef.current = requestAnimationFrame(loop)
      }
      loop()
    } catch {
      /* metering is best-effort */
    }
  }, [])

  /** Show the sign avatar popup on the LEFT panel (incoming voice messages). */
  const showSigns = useCallback((text: string) => {
    setSignPopup({ text })
    // Safety close — the avatar normally closes it via onComplete.
    window.setTimeout(() => {
      setSignPopup((cur) => (cur?.text === text ? null : cur))
    }, 15000)
  }, [])

  const closeSignPopup = useCallback(() => setSignPopup(null), [])

  /** LEFT → TTS on the RIGHT side (spoken in the selected language). */
  const speakForRight = useCallback(
    (englishText: string) => {
      if (lang !== "en") {
        const entry = lookupTranslation(englishText)
        const translated = entry ? entry[lang] : null
        if (translated) {
          speakWithLanguage(translated, lang)
          return translated
        }
      }
      speak(englishText)
      return null
    },
    [lang],
  )

  /** RIGHT → sign avatar on the LEFT side. */
  const deliverToLeft = useCallback(
    (englishText: string, displayText: string) => {
      showSigns(englishText)
      pushMessage({
        id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        side: "right",
        text: englishText,
        displayText: displayText !== englishText ? displayText : undefined,
        timestamp: Date.now(),
        avatar: "👂",
      })
    },
    [pushMessage, showSigns],
  )

  const clearSelection = () => setSelected([])

  /** LEFT: tap pictograms → sentence → send + TTS. */
  const handleSendPictos = () => {
    if (selected.length === 0) return
    const result = predictSentence(selected.map((s) => s.label))
    const translated = speakForRight(result.text)
    pushMessage({
      id: `l-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      side: "left",
      text: result.text,
      displayText: translated ?? undefined,
      confidence: result.isFallback ? 62 : 96,
      timestamp: Date.now(),
      avatar: "🧑",
      picto: selected.map((p) => SIGNS[p.id] ?? p.emoji).join(" "),
    })
    setSelected([])
  }

  /** LEFT: single-tap quick send (tap-to-send). */
  const handleQuickTap = (p: Pictogram) => {
    const result = predictSentence([p.label])
    const translated = speakForRight(result.text)
    pushMessage({
      id: `l-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      side: "left",
      text: result.text,
      displayText: translated ?? undefined,
      confidence: result.isFallback ? 62 : 96,
      timestamp: Date.now(),
      avatar: "🧑",
      picto: SIGNS[p.id] ?? p.emoji,
    })
  }

  /** RIGHT: hold-to-record with webkitSpeechRecognition. */
  const startListening = () => {
    const Ctor = getRecognitionCtor()
    if (!Ctor || listening) return
    setError(null)
    setSuggestion(null)
    setSpeechConfidence(null)
    stopSpeaking()

    const recognition = new Ctor()
    recognition.lang = BCP47[lang]
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    let finalTranscript = ""
    let finalConfidence: number | undefined = undefined
    recognition.onresult = (e) => {
      let interim = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        const alt = res[0] as { transcript?: string; confidence?: number } | undefined
        const transcript = alt?.transcript ?? ""
        if (res.isFinal) {
          finalTranscript += transcript
          if (typeof alt?.confidence === "number" && alt.confidence > 0) {
            finalConfidence = alt.confidence
            setSpeechConfidence(alt.confidence)
          }
        } else {
          interim += transcript
        }
      }
      setTyped((prevLive) => (interim || finalTranscript ? interim || finalTranscript : prevLive))
    }
    recognition.onend = () => {
      setListening(false)
      shouldListenRef.current = false
      stopMicMeter()
      const text = finalTranscript.trim()
      if (text) {
        deliverToLeft(text, text)
        // Low ASR confidence → offer a correction ("Did you mean?").
        setSuggestion(finalConfidence !== undefined && finalConfidence < 0.5 ? text : null)
      }
    }
    recognition.onerror = (e) => {
      setListening(false)
      shouldListenRef.current = false
      stopMicMeter()
      if (e.error !== "aborted" && e.error !== "no-speech") {
        setError(`Mic error: ${e.error}`)
      }
    }

    recognitionRef.current = recognition
    shouldListenRef.current = true
    try {
      recognition.start()
      setListening(true)
      void startMicMeter()
    } catch {
      setError("Could not start the microphone.")
      setListening(false)
      stopMicMeter()
    }
  }

  /** Send the corrected transcript from the "Did you mean?" input. */
  const handleSendSuggestion = () => {
    const text = (suggestion ?? "").trim()
    if (!text) return
    deliverToLeft(text, text)
    setSuggestion(null)
  }

  const stopListening = () => {
    shouldListenRef.current = false
    recognitionRef.current?.stop()
  }

  /** RIGHT: typed text input. */
  const handleSendTyped = () => {
    const text = typed.trim()
    if (!text) return
    deliverToLeft(text, text)
    setTyped("")
  }

  const handleSpeakMessage = useCallback((text: string) => {
    speak(text, loadVoiceSettings())
  }, [])

  const handleClearChat = () => {
    setMessages([])
    sessionStorage.removeItem(STORAGE_KEY)
  }

  const rightMessages = useMemo(() => messages, [messages])

  const panelTitle = (icon: React.ReactNode, title: string, sub: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 40,
          height: 40,
          borderRadius: RADIUS.md,
          background: "rgba(0, 180, 216, 0.12)",
          border: `1px solid rgba(0, 180, 216, 0.35)`,
          color: COLORS.accentBright,
        }}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{title}</h2>
        <p style={{ margin: 0, fontSize: 12.5, color: COLORS.textDim }}>{sub}</p>
      </div>
    </div>
  )

  const panelStyle: CSSProperties = {
    flex: 1,
    minWidth: 320,
    display: "flex",
    flexDirection: "column",
    background: "rgba(30, 41, 59, 0.55)",
    backdropFilter: "blur(20px) saturate(150%)",
    WebkitBackdropFilter: "blur(20px) saturate(150%)",
    border: `1px solid ${COLORS.borderGlass}`,
    borderRadius: RADIUS.xl,
    boxShadow: SHADOW.md,
    overflow: "hidden",
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
      }}
    >
      <TopNav
        right={
          <>
            <button
              type="button"
              onClick={handleClearChat}
              className="btn-ghost"
              aria-label="Clear the conversation"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                minHeight: TAP_MIN,
                padding: "8px 16px",
                fontSize: 14,
                fontFamily: FONT,
              }}
            >
              <Trash2 size={15} strokeWidth={2.4} aria-hidden="true" /> Clear
            </button>
          </>
        }
      />

      <main
        style={{
          flex: 1,
          display: "flex",
          gap: 18,
          padding: "18px 20px 26px",
          alignItems: "stretch",
          flexWrap: "wrap",
        }}
      >
        {/* ============ LEFT: non-verbal user ============ */}
        <motion.section
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          style={panelStyle}
          aria-label="Non-verbal user panel"
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
              padding: "14px 18px",
              borderBottom: `1px solid ${COLORS.borderGlass}`,
            }}
          >
            {panelTitle(<Hand size={20} />, "Non-verbal User", "Tap pictograms to speak")}
            <span
              style={{
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: 1,
                color: COLORS.accentBright,
                background: COLORS.accentSoft,
                border: `1px solid rgba(0, 180, 216, 0.4)`,
                borderRadius: RADIUS.pill,
                padding: "4px 10px",
              }}
            >
              LEFT
            </span>
          </div>

          {/* Sign avatar popup (incoming from RIGHT) */}
          <div style={{ position: "relative", minHeight: 96, borderBottom: `1px solid ${COLORS.borderGlass}` }}>
            <AnimatePresence>
              {signPopup && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 300, damping: 24 }}
                  role="status"
                  aria-label={`Sign avatar: ${signPopup.text}`}
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    padding: 12,
                    background:
                      "radial-gradient(circle at 50% 30%, rgba(124, 58, 237, 0.16), rgba(10, 25, 41, 0.4))",
                    overflow: "hidden",
                  }}
                >
                  <SignAvatar
                    text={signPopup.text}
                    onComplete={closeSignPopup}
                    size={110}
                  />
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 700, textAlign: "center" }}>
                    “{signPopup.text}”
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
            {!signPopup && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  color: COLORS.textDim,
                  fontSize: 13.5,
                  fontWeight: 600,
                }}
              >
                <Ear size={16} aria-hidden="true" /> Sign avatar appears here for spoken replies
              </div>
            )}
          </div>

          {/* Chat stream */}
          <div
            role="list"
            aria-label="Conversation messages"
            style={{
              flex: 1,
              minHeight: 180,
              maxHeight: 320,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              padding: "14px 16px",
            }}
          >
            {rightMessages.length === 0 ? (
              <p style={{ margin: "auto", color: COLORS.textDim, fontSize: 14 }}>
                Sent messages will appear here — tap a pictogram to start.
              </p>
            ) : (
              rightMessages.map((m) => (
                <MessageCard key={m.id} msg={m} onSpeak={handleSpeakMessage} />
              ))
            )}
            <div ref={chatEndRefLeft} />
          </div>

          {/* Pictogram grid (2x3 compact) + send */}
          <div
            style={{
              padding: "12px 16px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              borderTop: `1px solid ${COLORS.borderGlass}`,
            }}
          >
            <PictogramGrid
              selected={selected}
              onSelect={handleQuickTap}
              columns={3}
              compact
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={handleSendPictos}
                disabled={selected.length === 0}
                className="btn-gradient"
                style={{
                  flex: 1,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  minHeight: TAP_MIN,
                  fontSize: 16,
                  fontFamily: FONT,
                }}
              >
                <Send size={17} strokeWidth={2.5} aria-hidden="true" />
                Send{selected.length > 0 ? ` (${selected.length})` : ""}
              </button>
              <button
                type="button"
                onClick={clearSelection}
                disabled={selected.length === 0}
                className="btn-ghost"
                aria-label="Clear selected pictograms"
                style={{
                  minHeight: TAP_MIN,
                  padding: "0 16px",
                  display: "inline-flex",
                  alignItems: "center",
                  fontFamily: FONT,
                }}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
              <span
                aria-hidden="true"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  fontSize: 12.5,
                  color: COLORS.textDim,
                  fontWeight: 600,
                  padding: "0 4px",
                }}
              >
                tap = instant send
              </span>
            </div>
          </div>
        </motion.section>

        {/* ============ RIGHT: hearing person ============ */}
        <motion.section
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          style={panelStyle}
          aria-label="Hearing person panel"
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
              padding: "14px 18px",
              borderBottom: `1px solid ${COLORS.borderGlass}`,
            }}
          >
            {panelTitle(<Ear size={20} />, "Hearing Person", "Hold the mic and speak")}
            <span
              style={{
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: 1,
                color: "#C4B5FD",
                background: "rgba(124, 58, 237, 0.14)",
                border: `1px solid rgba(124, 58, 237, 0.4)`,
                borderRadius: RADIUS.pill,
                padding: "4px 10px",
              }}
            >
              RIGHT
            </span>
          </div>

          {/* Chat stream */}
          <div
            role="list"
            aria-label="Conversation messages"
            style={{
              flex: 1,
              minHeight: 200,
              maxHeight: 420,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              padding: "14px 16px",
            }}
          >
            {messages.length === 0 ? (
              <p style={{ margin: "auto", color: COLORS.textDim, fontSize: 14 }}>
                Hold the mic and speak, or type below.
              </p>
            ) : (
              messages.map((m) => (
                <MessageCard key={m.id} msg={m} onSpeak={handleSpeakMessage} />
              ))
            )}
            <div ref={chatEndRefRight} />
          </div>

          {/* Composer: language + mic + input */}
          <div
            style={{
              padding: "14px 16px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              borderTop: `1px solid ${COLORS.borderGlass}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Languages size={16} color={COLORS.accentBright} aria-hidden="true" />
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as LanguageCode)}
                aria-label="Speech language"
                style={{
                  flex: 1,
                  minWidth: 150,
                  minHeight: TAP_MIN,
                  background: "rgba(10, 25, 41, 0.6)",
                  color: COLORS.text,
                  border: `1px solid ${COLORS.borderGlass}`,
                  borderRadius: RADIUS.md,
                  padding: "8px 12px",
                  fontSize: 15,
                  fontFamily: FONT,
                }}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                {/* Hold-to-record mic */}
                <motion.button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault()
                  startListening()
                }}
                onPointerUp={(e) => {
                  e.preventDefault()
                  stopListening()
                }}
                onPointerLeave={() => listening && stopListening()}
                disabled={!speechSupported}
                whileTap={{ scale: 0.94 }}
                animate={
                  listening
                    ? { scale: [1, 1.05, 1], boxShadow: [
                        "0 0 0 0 rgba(239, 68, 68, 0.5)",
                        "0 0 0 18px rgba(239, 68, 68, 0)",
                      ] }
                    : { scale: 1, boxShadow: "0 8px 24px rgba(0, 180, 216, 0.35)" }
                }
                transition={
                  listening
                    ? { scale: { repeat: Infinity, duration: 1.2 }, boxShadow: { repeat: Infinity, duration: 1.2 } }
                    : { duration: 0.2 }
                }
                aria-label={listening ? "Release to stop recording" : "Hold to record speech"}
                aria-pressed={listening}
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: "50%",
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: listening
                    ? `radial-gradient(circle at 30% 30%, #F87171, ${COLORS.danger})`
                    : `linear-gradient(135deg, ${COLORS.accentBright}, ${COLORS.accentDeep})`,
                  color: "#04121F",
                  border: "none",
                  cursor: speechSupported ? "pointer" : "not-allowed",
                  opacity: speechSupported ? 1 : 0.5,
                  touchAction: "none",
                  fontFamily: FONT,
                }}
              >
                {listening ? (
                  <MicOff size={30} strokeWidth={2.6} aria-hidden="true" />
                ) : (
                  <Mic size={30} strokeWidth={2.6} aria-hidden="true" />
                )}
              </motion.button>

                {/* Mic level bars (5) — live input amplitude */}
                <div
                  aria-hidden="true"
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: 3,
                    height: 40,
                    flexShrink: 0,
                  }}
                >
                  {BAR_STEPS.map((step, i) => {
                    const active = listening && micLevel >= step
                    return (
                      <motion.span
                        key={i}
                        animate={{
                          height: active ? 12 + i * 6 : 8,
                          backgroundColor: active ? COLORS.accentBright : "rgba(148, 163, 184, 0.3)",
                        }}
                        transition={{ duration: 0.12 }}
                        style={{
                          width: 6,
                          borderRadius: 3,
                          display: "inline-block",
                        }}
                      />
                    )
                  })}
                </div>
              </div>

              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                <div
                  role="status"
                  aria-live="polite"
                  style={{
                    minHeight: 22,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                    fontSize: 13.5,
                    fontWeight: 700,
                    color: listening ? COLORS.danger : COLORS.textDim,
                  }}
                >
                  {listening
                    ? "● Recording… release to send"
                    : speechSupported
                      ? "Hold the mic to record"
                      : "Speech recognition not supported in this browser — use text input"}
                  {speechConfidence != null && !listening && (
                    <span
                      aria-label={`Speech confidence ${Math.round(speechConfidence * 100)} percent`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        fontSize: 11,
                        fontWeight: 800,
                        color: asrConfColor(speechConfidence),
                        background:
                          speechConfidence > 0.8
                            ? COLORS.successSoft
                            : speechConfidence >= 0.5
                              ? "rgba(250, 204, 21, 0.14)"
                              : COLORS.dangerSoft,
                        border: `1px solid ${asrConfColor(speechConfidence)}`,
                        borderRadius: RADIUS.pill,
                        padding: "1px 8px",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {Math.round(speechConfidence * 100)}% confidence
                    </span>
                  )}
                </div>

                {/* Noise warning (auto-fades) */}
                <AnimatePresence>
                  {noisy && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      role="alert"
                      style={{
                        margin: 0,
                        fontSize: 13,
                        fontWeight: 800,
                        color: COLORS.warning,
                      }}
                    >
                      🔊 Too noisy — try a quieter place
                    </motion.p>
                  )}
                </AnimatePresence>

                {/* Low-confidence correction */}
                <AnimatePresence>
                  {suggestion !== null && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.warning }}>
                        Did you mean?
                      </span>
                      <input
                        type="text"
                        value={suggestion}
                        onChange={(e) => setSuggestion(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSendSuggestion()
                        }}
                        aria-label="Corrected transcript"
                        style={{
                          flex: 1,
                          minWidth: 140,
                          minHeight: 40,
                          background: "rgba(10, 25, 41, 0.6)",
                          color: COLORS.text,
                          border: `1px solid rgba(250, 204, 21, 0.5)`,
                          borderRadius: RADIUS.md,
                          padding: "8px 12px",
                          fontSize: 14,
                          fontFamily: FONT,
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleSendSuggestion}
                        className="btn-ghost"
                        style={{
                          minHeight: TAP_MIN,
                          padding: "0 14px",
                          display: "inline-flex",
                          alignItems: "center",
                          fontSize: 14,
                          fontFamily: FONT,
                        }}
                      >
                        <Send size={15} strokeWidth={2.5} aria-hidden="true" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="text"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSendTyped()
                    }}
                    placeholder="Type a message…"
                    aria-label="Type a message"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      minHeight: TAP_MIN,
                      background: "rgba(10, 25, 41, 0.6)",
                      color: COLORS.text,
                      border: `1px solid ${COLORS.borderGlass}`,
                      borderRadius: RADIUS.md,
                      padding: "10px 14px",
                      fontSize: 16,
                      fontFamily: FONT,
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleSendTyped}
                    disabled={!typed.trim()}
                    className="btn-gradient"
                    aria-label="Send typed message"
                    style={{
                      width: TAP_MIN,
                      padding: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: FONT,
                    }}
                  >
                    <Send size={18} strokeWidth={2.5} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <p role="alert" style={{ margin: 0, fontSize: 13, fontWeight: 700, color: COLORS.danger }}>
                {error}
              </p>
            )}
          </div>
        </motion.section>
      </main>
    </div>
  )
}
