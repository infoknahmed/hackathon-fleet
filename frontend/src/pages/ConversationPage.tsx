import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties, ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  Mic,
  MicOff,
  Send,
  Languages,
  Trash2,
  Hand,
  Ear,
  FileDown,
  Check,
  CheckCheck,
  AlertTriangle,
} from "lucide-react"
import { PictogramGrid } from "../components/PictogramGrid"
import type { Pictogram } from "../components/PictogramGrid"
import { MessageCard } from "../components/MessageCard"
import type { ChatMessage } from "../components/MessageCard"
import { SignAvatar } from "../components/SignAvatar"
import { predictSentence, recordPhraseUsed, recordCorrection } from "../lib/predict"
import {
  speak,
  speakWithLanguage,
  stopSpeaking,
  loadVoiceSettings,
  isLanguageSupported,
} from "../lib/speech"
import { startNoiseGate } from "../lib/noise"
import type { NoiseGate } from "../lib/noise"
import { playTap, playSuccess, playError } from "../lib/soundEffects"
import { announce } from "../lib/a11y"
import { LANGUAGES, lookupTranslation } from "../lib/translations"
import type { LanguageCode } from "../lib/translations"
import { sendMessage, getUserId } from "../lib/messageBus"
import { cacheMessage, enqueueMessage, isOnline } from "../lib/offline"
import { tokens } from "../styles/tokens"
import { COLORS, FONT, RADIUS, SHADOW, TAP_MIN } from "../theme"
import AuroraButton from "../components/ui/AuroraButton"
import TopNav from "../components/TopNav"

const STORAGE_KEY = "vaaksetu-conversation"

/** BCP-47 tags for speech recognition + synthesis. */
const BCP47: Record<string, string> = {
  en: "en-IN",
  hi: "hi-IN",
  kn: "kn-IN",
  te: "te-IN",
  ta: "ta-IN",
  mr: "mr-IN",
  bn: "bn-IN",
  ml: "ml-IN",
}

/** Simple ISL-style sign vocabulary mapped from pictograms. */
const SIGNS: Record<string, string> = {
  yes: "👍", no: "👎", water: "💧", food: "🍛", toilet: "🚽",
  pain: "🤕", help: "🆘", family: "👨‍👩‍👧", more: "➕",
}

type DelivStatus = "sending" | "sent" | "delivered" | "read" | "queued"

interface LocalChatMessage extends ChatMessage {
  status?: DelivStatus
  lang?: string
  typeBadge?: string
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

function loadConversation(): LocalChatMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as LocalChatMessage[]
  } catch {
    /* ignore */
  }
  return []
}

function persist(msgs: LocalChatMessage[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-100)))
  } catch {
    /* ignore */
  }
}

/** ASR confidence badge color (>0.8 green, 0.5–0.8 yellow, <0.5 red). */
function asrConfColor(confidence: number): string {
  if (confidence > 0.8) return COLORS.success
  if (confidence >= 0.5) return COLORS.warning
  return COLORS.danger
}

function StatusTicks({ status }: { status: DelivStatus }) {
  if (status === "queued") {
    return <span title="Queued — will sync when online" style={{ display: "inline-flex", alignItems: "center", color: COLORS.warning }}><AlertTriangle size={13} aria-hidden="true" /></span>
  }
  if (status === "sending") return <span aria-label="Sending" style={{ fontSize: 11, color: COLORS.textDim }}>…</span>
  if (status === "sent") return <Check size={13} aria-label="Sent" style={{ color: COLORS.textDim }} />
  if (status === "delivered") return <CheckCheck size={13} aria-label="Delivered" style={{ color: COLORS.accentBright }} />
  return <CheckCheck size={13} aria-label="Read" style={{ color: COLORS.success }} />
}

export default function ConversationPage() {
  const [messages, setMessages] = useState<LocalChatMessage[]>(() => loadConversation())
  const [selected, setSelected] = useState<Pictogram[]>([])
  const [lang, setLang] = useState<LanguageCode>("en")
  const [typed, setTyped] = useState("")
  const [interim, setInterim] = useState("")
  const [listening, setListening] = useState(false)
  const [speechSupported] = useState(() => getRecognitionCtor() !== null)
  const [error, setError] = useState<string | null>(null)
  const [signPopup, setSignPopup] = useState<{ text: string } | null>(null)
  const [speechConfidence, setSpeechConfidence] = useState<number | null>(null)
  const [lowConfAlternatives, setLowConfAlternatives] = useState<string[] | null>(null)
  const [micLevel, setMicLevel] = useState(0)
  const [noisy, setNoisy] = useState(false)
  const [speechActive, setSpeechActive] = useState(false)
  const [guardianTyping, setGuardianTyping] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [showJump, setShowJump] = useState(false)
  /** Last low-confidence transcript (for learning from corrections). */
  const [lastLowConfText, setLastLowConfText] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const noiseGateRef = useRef<NoiseGate | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const chatScrollRef = useRef<HTMLDivElement | null>(null)
  const socketTypingHandlerRef = useRef<((payload: { who?: string; typing?: boolean }) => void) | null>(null)

  // Persist to sessionStorage on every change.
  useEffect(() => {
    persist(messages)
  }, [messages])

  // Typing indicator via Socket.IO relay.
  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    void (async () => {
      const { getSocket } = await import("../lib/messageBus")
      const socket = getSocket()
      if (!socket) return
      socketTypingHandlerRef.current = (payload) => {
        if (payload && typeof payload.who === "string") {
          setGuardianTyping(payload.typing ? payload.who : null)
        }
      }
      socket.on("typing", socketTypingHandlerRef.current)
      socket.on("message:status", (payload: { id?: string; status?: string }) => {
        if (!payload?.id) return
        setMessages((prev) =>
          prev.map((m) => (m.id === payload.id ? { ...m, status: (payload.status as DelivStatus) ?? m.status } : m)),
        )
      })
      unsubscribe = () => {
        socket.off("typing", socketTypingHandlerRef.current ?? undefined)
      }
    })()
    return unsubscribe
  }, [])

  // Autoscroll + jump-to-newest visibility.
  useEffect(() => {
    const el = chatScrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    if (nearBottom) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
      setShowJump(false)
    } else {
      setShowJump(true)
    }
  }, [messages, signPopup, guardianTyping])

  // Cleanup recognition + mic meter on unmount.
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort()
      noiseGateRef.current?.stop()
    }
  }, [])

  const stopNoiseGate = useCallback(() => {
    noiseGateRef.current?.stop()
    noiseGateRef.current = null
    setMicLevel(0)
    setNoisy(false)
    setSpeechActive(false)
  }, [])

  const pushMessage = useCallback((msg: LocalChatMessage) => {
    setMessages((prev) => [...prev, msg])
    // Persist + offline-queue outside this transaction.
    const busMsg = {
      id: msg.id,
      type: msg.side === "left" ? ("message" as const) : ("reply" as const),
      text: msg.text,
      pictograms: [],
      confidence: msg.confidence ?? 90,
      timestamp: msg.timestamp,
      mood: "Neutral",
    }
    void cacheMessage(busMsg)
    if (isOnline()) {
      sendMessage(busMsg)
      void import("../lib/messageBus").then(({ postReply }) => {
        if (msg.side === "right") void postReply(msg.text, "conversation", msg.id)
      })
    } else {
      void enqueueMessage(busMsg)
    }
  }, [])

  /** LEFT → TTS on the RIGHT side (spoken in the selected language). */
  const speakForRight = useCallback(
    (englishText: string): string | null => {
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
    (englishText: string, displayText: string, confidence?: number) => {
      showSigns(englishText)
      const id = `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      pushMessage({
        id,
        side: "right",
        text: englishText,
        displayText: displayText !== englishText ? displayText : undefined,
        timestamp: Date.now(),
        avatar: "👂",
        confidence,
        status: "sent",
        lang,
        typeBadge: "voice/text",
      })
      announce(`New message from Guardian: ${englishText}`)
    },
    [pushMessage],
  )

  const showSigns = useCallback((text: string) => {
    setSignPopup({ text })
    window.setTimeout(() => {
      setSignPopup((cur) => (cur?.text === text ? null : cur))
    }, 20000)
  }, [])

  const closeSignPopup = useCallback(() => setSignPopup(null), [])

  const clearSelection = () => setSelected([])

  /** LEFT: tap pictograms → sentence → send + TTS. */
  const handleSendPictos = () => {
    if (selected.length === 0) return
    const result = predictSentence(selected.map((s) => s.label))
    const translated = speakForRight(result.text)
    recordPhraseUsed(result.text)
    const id = `l-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    pushMessage({
      id,
      side: "left",
      text: result.text,
      displayText: translated ?? undefined,
      confidence: result.confidence,
      timestamp: Date.now(),
      avatar: "🧑",
      picto: selected.map((p) => SIGNS[p.id] ?? p.emoji).join(" "),
      status: "sent",
      typeBadge: "pictogram",
    })
    announce(`Message sent: ${result.text}`)
    playSuccess()
    setSelected([])
  }

  /** LEFT: single-tap quick send (tap-to-send). */
  const handleQuickTap = (p: Pictogram) => {
    playTap()
    const result = predictSentence([p.label])
    const translated = speakForRight(result.text)
    const id = `l-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    pushMessage({
      id,
      side: "left",
      text: result.text,
      displayText: translated ?? undefined,
      confidence: result.confidence,
      timestamp: Date.now(),
      avatar: "🧑",
      picto: SIGNS[p.id] ?? p.emoji,
      status: "sent",
      typeBadge: "pictogram",
    })
  }

  /** RIGHT: hold-to-record with webkitSpeechRecognition + noise gate. */
  const startListening = () => {
    const Ctor = getRecognitionCtor()
    if (!Ctor || listening) return
    setError(null)
    setSpeechConfidence(null)
    setLowConfAlternatives(null)
    setInterim("")
    stopSpeaking()

    const recognition = new Ctor()
    recognition.lang = BCP47[lang]
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 3

    let finalTranscript = ""
    let finalConfidence: number | undefined = undefined
    let finalAlternatives: string[] = []

    recognition.onresult = (e) => {
      let liveInterim = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        const alt = res[0] as { transcript?: string; confidence?: number } | undefined
        const transcript = alt?.transcript ?? ""
        if (res.isFinal) {
          // Noise gate: drop finals that arrived without speech activity.
          const gate = noiseGateRef.current
          if (gate && !gate.speechActive() && gate.snr() < 1.4) continue
          finalTranscript += transcript
          if (typeof alt?.confidence === "number" && alt.confidence > 0) {
            finalConfidence = alt.confidence
            setSpeechConfidence(alt.confidence)
          }
          // Collect alternatives for low-confidence correction UI.
          const alts: string[] = []
          for (let a = 1; a < res.length; a++) {
            const altText = (res[a] as { transcript?: string })?.transcript
            if (altText) alts.push(altText)
          }
          if (alts.length > 0) finalAlternatives = alts
        } else {
          liveInterim += transcript
        }
      }
      setInterim(liveInterim)
      if (finalTranscript) setTyped(finalTranscript)
    }

    recognition.onend = () => {
      setListening(false)
      stopNoiseGate()
      const text = finalTranscript.trim() || interimRef.current.trim()
      if (text) {
        const conf = finalConfidence ?? 0.6
        deliverToLeft(text, text, Math.round(conf * 100))
        if (conf < 0.5) {
          setLowConfAlternatives(finalAlternatives.length > 0 ? finalAlternatives : [text])
          setLastLowConfText(text)
        }
      }
      setInterim("")
    }

    recognition.onerror = (e) => {
      setListening(false)
      stopNoiseGate()
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("Microphone blocked — allow mic access in your browser settings.")
      } else if (e.error === "network") {
        setError("Speech service unreachable — check your connection or type instead.")
      } else if (e.error !== "aborted" && e.error !== "no-speech") {
        setError(`Mic error: ${e.error}`)
      }
      if (e.error !== "aborted") playError()
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
      setListening(true)
      announce("Mic listening")
      void startNoiseGate({
        onLevel: setMicLevel,
        onNoisyChange: setNoisy,
        onSpeechChange: setSpeechActive,
      }).then((gate) => {
        noiseGateRef.current = gate
      })
    } catch {
      setError("Could not start the microphone.")
      setListening(false)
      stopNoiseGate()
      playError()
    }
  }

  // Keep the latest interim value for the onend commit.
  const interimRef = useRef("")
  useEffect(() => {
    interimRef.current = interim
  }, [interim])

  const stopListening = () => {
    recognitionRef.current?.stop()
  }

  /** Send typed text (or corrected transcript). */
  const handleSendTyped = (override?: string) => {
    const text = (override ?? typed).trim()
    if (!text) return
    // Learning: when the user sends a corrected alternative, record which
    // words changed so the predictor prefers them next time.
    if (lastLowConfText) {
      const fromWords = lastLowConfText.toLowerCase().split(/\s+/)
      const toWords = text.toLowerCase().split(/\s+/)
      for (let i = 0; i < Math.min(fromWords.length, toWords.length); i++) {
        if (fromWords[i] !== toWords[i]) recordCorrection(fromWords[i], toWords[i])
      }
      setLastLowConfText(null)
    }
    deliverToLeft(text, text)
    setTyped("")
    setLowConfAlternatives(null)
  }

  /** RIGHT: typed text input sends; Enter key sends. */
  const handleSpeakMessage = useCallback((text: string) => {
    speak(text, loadVoiceSettings())
  }, [])

  const handleExportPdf = () => {
    const win = window.open("", "_blank", "width=800,height=900")
    if (!win) {
      setError("Popup blocked — allow popups to export the conversation.")
      playError()
      return
    }
    const rows = messages
      .map(
        (m) => `<tr>
          <td>${new Date(m.timestamp).toLocaleTimeString()}</td>
          <td>${m.side === "left" ? "User" : "Guardian"}</td>
          <td>${escapeHtml(m.displayText ?? m.text)}</td>
          <td>${m.confidence != null ? `${m.confidence}%` : "—"}</td>
        </tr>`,
      )
      .join("")
    win.document.write(`<!doctype html><html><head><title>VaakSetu Conversation</title>
      <style>body{font-family:system-ui;padding:24px}table{border-collapse:collapse;width:100%}
      td,th{border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:14px}
      th{background:#f0f0f0}</style></head><body>
      <h1>VaakSetu Conversation — ${new Date().toLocaleString()}</h1>
      <p>User ID: ${getUserId()} · ${messages.length} messages</p>
      <table><tr><th>Time</th><th>Sender</th><th>Message</th><th>Confidence</th></tr>${rows}</table>
      </body></html>`)
    win.document.close()
    win.print()
  }

  const handleClearChat = () => {
    setConfirmClear(true)
  }

  const doClear = () => {
    setMessages([])
    sessionStorage.removeItem(STORAGE_KEY)
    setConfirmClear(false)
  }

  const rightMessages = useMemo(() => messages, [messages])

  const panelTitle = (icon: ReactNode, title: string, sub: string) => (
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

  const renderMessages = (sideFilter: "all" | "left" | "right") => {
    const list = sideFilter === "all" ? rightMessages : rightMessages.filter((m) => m.side === sideFilter)
    if (list.length === 0) {
      return (
        <p style={{ margin: "auto", color: COLORS.textDim, fontSize: 14 }}>
          {sideFilter === "all"
            ? "Hold the mic and speak, or type below."
            : "Sent messages will appear here — tap a pictogram to start."}
        </p>
      )
    }
    return list.map((m) => (
      <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <MessageCard msg={m} onSpeak={handleSpeakMessage} />
        {m.side === "left" && m.status && (
          <span style={{ alignSelf: "flex-end", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: COLORS.textDim }}>
            {m.status === "queued" ? "queued" : <StatusTicks status={m.status} />}
          </span>
        )}
      </div>
    ))
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        color: tokens.text.primary,
        fontFamily: FONT,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <TopNav
        right={
          <>
            <AuroraButton
              type="button"
              onClick={handleExportPdf}
              variant="ghost"
              aria-label="Export the conversation as PDF"
              style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 44, padding: "8px 16px", fontSize: 14, fontFamily: FONT }}
            >
              <FileDown size={15} strokeWidth={2.4} aria-hidden="true" /> PDF
            </AuroraButton>
            <AuroraButton
              type="button"
              onClick={handleClearChat}
              variant="ghost"
              aria-label="Clear the conversation"
              style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 44, padding: "8px 16px", fontSize: 14, fontFamily: FONT }}
            >
              <Trash2 size={15} strokeWidth={2.4} aria-hidden="true" /> Clear
            </AuroraButton>
          </>
        }
      />

      {/* Clear-conversation confirm dialog */}
      <AnimatePresence>
        {confirmClear && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Confirm clear conversation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 80,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.6)",
              padding: 20,
            }}
            onKeyDown={(e) => e.key === "Escape" && setConfirmClear(false)}
          >
            <div
              style={{
                background: "#131722",
                border: `1px solid ${COLORS.borderGlass}`,
                borderRadius: RADIUS.lg,
                padding: 24,
                maxWidth: 380,
                width: "100%",
                boxShadow: SHADOW.lg,
              }}
            >
              <h3 style={{ margin: "0 0 8", fontSize: 18, fontWeight: 800 }}>Clear this conversation?</h3>
              <p style={{ margin: "0 0 16", fontSize: 14, color: COLORS.textDim }}>
                Messages on this screen will be removed. Saved history is kept.
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className="btn-ghost" onClick={() => setConfirmClear(false)} style={{ minHeight: 44, padding: "0 16px", fontSize: 14 }}>
                  Cancel
                </button>
                <button type="button" className="btn-gradient" onClick={doClear} style={{ minHeight: 44, padding: "0 16px", fontSize: 14 }}>
                  Clear
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "14px 18px", borderBottom: `1px solid ${COLORS.borderGlass}` }}>
            {panelTitle(<Hand size={20} />, "Non-verbal User", "Tap pictograms to speak")}
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, color: COLORS.accentBright, background: COLORS.accentSoft, border: `1px solid rgba(0, 180, 216, 0.4)`, borderRadius: RADIUS.pill, padding: "4px 10px" }}>
              LEFT
            </span>
          </div>

          {/* Sign avatar popup (incoming from RIGHT) */}
          <div style={{ position: "relative", minHeight: 150, borderBottom: `1px solid ${COLORS.borderGlass}` }}>
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
                    gap: 2,
                    padding: 8,
                    background: "radial-gradient(circle at 50% 30%, rgba(124, 58, 237, 0.16), rgba(10, 25, 41, 0.4))",
                    overflow: "hidden",
                  }}
                >
                  <SignAvatar text={signPopup.text} onComplete={closeSignPopup} size={96} />
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, textAlign: "center" }}>“{signPopup.text}”</p>
                </motion.div>
              )}
            </AnimatePresence>
            {!signPopup && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: COLORS.textDim, fontSize: 13.5, fontWeight: 600 }}>
                <Ear size={16} aria-hidden="true" /> Sign avatar appears here for spoken replies
              </div>
            )}
          </div>

          {/* Chat stream */}
          <div
            ref={chatScrollRef}
            role="list"
            aria-label="Conversation messages"
            style={{
              flex: 1,
              minHeight: 180,
              maxHeight: 340,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              padding: "14px 16px",
              position: "relative",
            }}
          >
            {renderMessages("all")}
            <div ref={chatEndRef} />
          </div>

          {/* Jump to newest */}
          {showJump && (
            <button
              type="button"
              onClick={() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" })}
              className="btn-ghost"
              aria-label="Jump to the newest message"
              style={{ margin: "0 16px 8", minHeight: 40, fontSize: 13, borderRadius: RADIUS.pill }}
            >
              ↓ Jump to newest
            </button>
          )}

          {/* Typing indicator */}
          <div style={{ minHeight: 22, padding: "0 16px", fontSize: 13, fontWeight: 700, color: COLORS.accentBright }} role="status" aria-live="polite">
            {guardianTyping ? `${guardianTyping} is typing…` : ""}
          </div>

          {/* Pictogram grid + send */}
          <div style={{ padding: "12px 16px 16px", display: "flex", flexDirection: "column", gap: 10, borderTop: `1px solid ${COLORS.borderGlass}` }}>
            <PictogramGrid selected={selected} onSelect={handleQuickTap} columns={3} compact />
            <div style={{ display: "flex", gap: 8 }}>
              <AuroraButton
                type="button"
                onClick={handleSendPictos}
                disabled={selected.length === 0}
                variant="primary"
                style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: TAP_MIN, height: "auto", fontSize: 16, fontFamily: FONT }}
              >
                <Send size={17} strokeWidth={2.5} aria-hidden="true" />
                Send{selected.length > 0 ? ` (${selected.length})` : ""}
              </AuroraButton>
              <button
                type="button"
                onClick={clearSelection}
                disabled={selected.length === 0}
                className="btn-ghost"
                aria-label="Clear selected pictograms"
                style={{ minHeight: TAP_MIN, padding: "0 16px", display: "inline-flex", alignItems: "center", fontFamily: FONT }}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
              <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", fontSize: 12.5, color: COLORS.textDim, fontWeight: 600, padding: "0 4px" }}>
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", padding: "14px 18px", borderBottom: `1px solid ${COLORS.borderGlass}` }}>
            {panelTitle(<Ear size={20} />, "Hearing Person", "Hold the mic and speak")}
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, color: "#C4B5FD", background: "rgba(124, 58, 237, 0.14)", border: `1px solid rgba(124, 58, 237, 0.4)`, borderRadius: RADIUS.pill, padding: "4px 10px" }}>
              RIGHT
            </span>
          </div>

          {/* Chat stream (right view) */}
          <div
            role="list"
            aria-label="Conversation messages"
            style={{ flex: 1, minHeight: 200, maxHeight: 420, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, padding: "14px 16px" }}
          >
            {renderMessages("all")}
            {guardianTyping && (
              <motion.span
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ alignSelf: "flex-start", fontSize: 13, fontWeight: 700, color: COLORS.accentBright }}
              >
                {guardianTyping} is typing…
              </motion.span>
            )}
          </div>

          {/* Composer: language + mic + input */}
          <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 10, borderTop: `1px solid ${COLORS.borderGlass}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Languages size={16} color={COLORS.accentBright} aria-hidden="true" />
              <select
                value={lang}
                onChange={(e) => {
                  setLang(e.target.value as LanguageCode)
                  announce(`Language set to ${e.target.selectedOptions[0]?.text ?? e.target.value}`)
                }}
                aria-label="Speech language"
                style={{ flex: 1, minWidth: 150, minHeight: TAP_MIN, background: "rgba(10, 25, 41, 0.6)", color: COLORS.text, border: `1px solid ${COLORS.borderGlass}`, borderRadius: RADIUS.md, padding: "8px 12px", fontSize: 15, fontFamily: FONT }}
              >
                {LANGUAGES.map((l) => {
                  const supported = speechSupported && isLanguageSupported(l.code)
                  return (
                    <option key={l.code} value={l.code} disabled={!supported && l.code !== "en"} title={supported ? undefined : "Not supported by your browser"}>
                      {l.label}
                      {supported || l.code === "en" ? "" : " — not supported"}
                    </option>
                  )
                })}
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
                      ? { scale: [1, 1.05, 1], boxShadow: ["0 0 0 0 rgba(239, 68, 68, 0.5)", "0 0 0 18px rgba(239, 68, 68, 0)"] }
                      : { scale: 1, boxShadow: "0 8px 24px rgba(0, 180, 216, 0.35)" }
                  }
                  transition={listening ? { scale: { repeat: Infinity, duration: 1.2 }, boxShadow: { repeat: Infinity, duration: 1.2 } } : { duration: 0.2 }}
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
                    background: listening ? `radial-gradient(circle at 30% 30%, #F87171, ${COLORS.danger})` : `linear-gradient(135deg, ${COLORS.accentBright}, ${COLORS.accentDeep})`,
                    color: "#04121F",
                    border: "none",
                    cursor: speechSupported ? "pointer" : "not-allowed",
                    opacity: speechSupported ? 1 : 0.5,
                    touchAction: "none",
                    fontFamily: FONT,
                  }}
                >
                  {listening ? <MicOff size={30} strokeWidth={2.6} aria-hidden="true" /> : <Mic size={30} strokeWidth={2.6} aria-hidden="true" />}
                </motion.button>

                {/* Mic level bars (5) + VAD dot */}
                <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 40, flexShrink: 0 }} aria-hidden="true">
                  {[0.06, 0.22, 0.4, 0.58, 0.78].map((step, i) => {
                    const active = listening && micLevel >= step
                    return (
                      <motion.span
                        key={i}
                        animate={{ height: active ? 12 + i * 6 : 8, backgroundColor: active ? COLORS.accentBright : "rgba(148, 163, 184, 0.3)" }}
                        transition={{ duration: 0.12 }}
                        style={{ width: 6, borderRadius: 3, display: "inline-block" }}
                      />
                    )
                  })}
                </div>
                {listening && (
                  <span
                    role="status"
                    aria-label={speechActive ? "Speech detected" : "Silence — noise only"}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 11,
                      fontWeight: 800,
                      color: speechActive ? COLORS.success : COLORS.textDim,
                    }}
                  >
                    <motion.span
                      animate={{ opacity: speechActive ? [1, 0.3, 1] : 0.3 }}
                      transition={{ repeat: Infinity, duration: 1 }}
                      style={{ width: 8, height: 8, borderRadius: "50%", background: speechActive ? COLORS.success : "rgba(148,163,184,0.5)", display: "inline-block" }}
                    />
                    {speechActive ? "VOICE" : "noise"}
                  </span>
                )}
              </div>

              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                <div role="status" aria-live="polite" style={{ minHeight: 22, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13.5, fontWeight: 700, color: listening ? COLORS.danger : COLORS.textDim }}>
                  {listening ? "● Listening… release to send" : speechSupported ? "Hold the mic to record" : "Voice not supported here — use text input"}
                  {speechConfidence != null && !listening && (
                    <span
                      aria-label={`Speech confidence ${Math.round(speechConfidence * 100)} percent`}
                      style={{ display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 800, color: asrConfColor(speechConfidence), background: speechConfidence > 0.8 ? COLORS.successSoft : speechConfidence >= 0.5 ? "rgba(250, 204, 21, 0.14)" : COLORS.dangerSoft, border: `1px solid ${asrConfColor(speechConfidence)}`, borderRadius: RADIUS.pill, padding: "1px 8px", fontVariantNumeric: "tabular-nums" }}
                    >
                      {Math.round(speechConfidence * 100)}% confidence
                    </span>
                  )}
                </div>

                {/* Live interim transcript */}
                {listening && interim && (
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: COLORS.textDim, fontStyle: "italic" }} aria-live="polite">
                    {interim}…
                  </p>
                )}

                {/* Noise warning */}
                <AnimatePresence>
                  {noisy && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      role="alert"
                      style={{ margin: 0, fontSize: 13, fontWeight: 800, color: COLORS.warning }}
                    >
                      🔊 Noisy environment — speak closer to the mic or move somewhere quieter
                    </motion.p>
                  )}
                </AnimatePresence>

                {/* Low-confidence alternatives ("Did you mean?") */}
                <AnimatePresence>
                  {lowConfAlternatives && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      role="alert"
                      style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.warning }}>Did you mean:</span>
                      {lowConfAlternatives.slice(0, 3).map((alt) => (
                        <button
                          key={alt}
                          type="button"
                          onClick={() => handleSendTyped(alt)}
                          className="btn-ghost"
                          style={{ minHeight: 40, padding: "0 12px", fontSize: 13, color: COLORS.accentBright, borderColor: "rgba(250, 204, 21, 0.5)" }}
                        >
                          {alt}
                        </button>
                      ))}
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
                    style={{ flex: 1, minWidth: 0, minHeight: TAP_MIN, background: "rgba(10, 25, 41, 0.6)", color: COLORS.text, border: `1px solid ${COLORS.borderGlass}`, borderRadius: RADIUS.md, padding: "10px 14px", fontSize: 16, fontFamily: FONT }}
                  />
                  <AuroraButton
                    type="button"
                    onClick={() => handleSendTyped()}
                    disabled={!typed.trim()}
                    variant="primary"
                    aria-label="Send typed message"
                    style={{ width: TAP_MIN, height: TAP_MIN, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}
                  >
                    <Send size={18} strokeWidth={2.5} aria-hidden="true" />
                  </AuroraButton>
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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c)
}
