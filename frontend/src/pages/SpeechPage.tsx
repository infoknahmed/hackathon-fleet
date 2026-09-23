import { useCallback, useEffect, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { motion } from "motion/react"
import { Mic, MicOff, RotateCcw, Volume2, Trash2, Languages, AlertTriangle } from "lucide-react"
import {
  speak,
  isLanguageSupported,
} from "../lib/speech"
import { startNoiseGate } from "../lib/noise"
import type { NoiseGate } from "../lib/noise"
import { playSuccess, playError } from "../lib/soundEffects"
import { announce } from "../lib/a11y"
import { LANGUAGES } from "../lib/translations"
import type { LanguageCode } from "../lib/translations"
import { sendMessage } from "../lib/messageBus"
import { cacheMessage, enqueueMessage, isOnline } from "../lib/offline"
import { COLORS, FONT, RADIUS, SHADOW, TAP_MIN } from "../theme"
import TopNav from "../components/TopNav"
import { onSpeechModelStatus, tryOfflineTranscribe } from "../lib/ai/offlineSpeech"

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

interface TranscriptEntry {
  id: string
  text: string
  lang: string
  confidence: number | null
  timestamp: number
  alternatives?: string[]
}

function confColor(c: number): string {
  if (c > 0.8) return COLORS.success
  if (c >= 0.5) return COLORS.warning
  return COLORS.danger
}

export default function SpeechPage() {
  const [lang, setLang] = useState<LanguageCode>("en")
  const [listening, setListening] = useState(false)
  const [supported] = useState(() => getRecognitionCtor() !== null)
  const [interim, setInterim] = useState("")
  const [entries, setEntries] = useState<TranscriptEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  // Offline Whisper model state ("idle" | "loading" | "ready" | "error").
  const [offlineStt, setOfflineStt] = useState<string>("idle")
  const [offlinePct, setOfflinePct] = useState(0)
  useEffect(() => onSpeechModelStatus((s) => {
    setOfflineStt(s.stt)
    if (s.stt === "loading") return
  }), [])
  useEffect(() => {
    if (offlineStt !== "loading") return
    const t = window.setInterval(() => setOfflinePct((p) => Math.min(p + 7, 95)), 700)
    return () => window.clearInterval(t)
  }, [offlineStt])
  const [micLevel, setMicLevel] = useState(0)
  const [noisy, setNoisy] = useState(false)
  const [speechActive, setSpeechActive] = useState(false)
  const [autoPunctuate] = useState(() => "SpeechRecognition" in window) // Chrome auto-punctuation

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const wantListeningRef = useRef(false)
  const noiseGateRef = useRef<NoiseGate | null>(null)
  const langRef = useRef(lang)
  const entriesRef = useRef(entries)

  useEffect(() => {
    langRef.current = lang
  }, [lang])
  useEffect(() => {
    entriesRef.current = entries
  }, [entries])

  /** Persist one committed transcript to SQLite / offline queue. */
  const persistTranscript = useCallback((text: string, confidence: number | null) => {
    const msg = {
      id: `speech-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: "sign" as const, // reuse the text+confidence wire shape
      text,
      confidence: Math.round((confidence ?? 0.6) * 100),
      timestamp: Date.now(),
    }
    void cacheMessage(msg)
    if (isOnline()) {
      sendMessage(msg)
    } else {
      void enqueueMessage(msg)
    }
  }, [])

  const startNoiseMonitoring = useCallback(async () => {
    const gate = await startNoiseGate({
      onLevel: setMicLevel,
      onNoisyChange: setNoisy,
      onSpeechChange: setSpeechActive,
    })
    noiseGateRef.current = gate
  }, [])

  const stopNoiseMonitoring = useCallback(() => {
    noiseGateRef.current?.stop()
    noiseGateRef.current = null
    setMicLevel(0)
    setNoisy(false)
    setSpeechActive(false)
  }, [])

  // ── Offline fallback (Phase 2B): MediaRecorder → on-device Whisper ──
  const [offlineMode, setOfflineMode] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  /** Record until stopped, then transcribe fully on-device. */
  const startOfflineRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : ""
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data)
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" })
        setListening(false)
        if (blob.size < 2000) return // silence guard
        const text = await tryOfflineTranscribe(blob)
        if (text) {
          const id = `off-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
          setEntries((prev) => [
            { id, text, lang: langRef.current, confidence: 0.75, timestamp: Date.now() },
            ...prev,
          ])
          persistTranscript(text, 0.75)
          playSuccess()
          announce(`Transcribed offline: ${text}`)
        } else {
          setError("Offline transcription unavailable — reconnect and press Retry.")
          playError()
        }
        setListening(false)
      }
      recorderRef.current = recorder
      recorder.start()
      setListening(true)
      announce("Offline recording — press the mic to stop and transcribe")
    } catch {
      setError("Microphone unavailable for offline capture.")
      setListening(false)
      playError()
    }
  }, [persistTranscript])

  const stopOfflineRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop()
    }
  }, [])

  const buildRecognition = useCallback((): SpeechRecognitionLike | null => {
    const Ctor = getRecognitionCtor()
    if (!Ctor) return null
    const recognition = new Ctor()
    recognition.lang = BCP47[langRef.current]
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 3

    recognition.onresult = (e) => {
      let live = ""
      const finals: { text: string; confidence: number | null; alternatives: string[] }[] = []
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        const alt = res[0] as { transcript?: string; confidence?: number } | undefined
        const transcript = alt?.transcript ?? ""
        if (res.isFinal) {
          // Noise gate: drop suspected noise-only results.
          const gate = noiseGateRef.current
          if (gate && !gate.speechActive() && gate.snr() < 1.4) continue
          const alternatives: string[] = []
          for (let a = 1; a < res.length; a++) {
            const t = (res[a] as { transcript?: string })?.transcript
            if (t) alternatives.push(t)
          }
          finals.push({ text: transcript, confidence: alt?.confidence ?? null, alternatives })
        } else {
          live += transcript
        }
      }
      if (live) setInterim(live)
      if (finals.length > 0) {
        setEntries((prev) => [
          ...finals.map((f) => ({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            text: f.text.trim(),
            lang: langRef.current,
            confidence: f.confidence,
            timestamp: Date.now(),
            alternatives: f.alternatives,
          })),
          ...prev,
        ])
        for (const f of finals) persistTranscript(f.text.trim(), f.confidence)
        playSuccess()
        announce(`Transcribed: ${finals[0].text.trim()}`)
      }
    }

    recognition.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("Microphone blocked — allow mic access in your browser settings, then press Retry.")
        wantListeningRef.current = false
        setListening(false)
        stopNoiseMonitoring()
        playError()
      } else if (e.error === "network") {
        // Offline fallback: switch to on-device Whisper (Phase 2).
        setOfflineMode(true)
        setError(null)
        announce("Network unavailable — switching to offline speech recognition")
        stopNoiseMonitoring()
        void startOfflineRecording()
      } else if (e.error === "no-speech") {
        // Chrome ends the session on silence — restart if the user still wants it.
      } else if (e.error !== "aborted") {
        setError(`Mic error: ${e.error}`)
      }
    }

    recognition.onend = () => {
      setInterim("")
      if (wantListeningRef.current) {
        // Chrome auto-stops after silence; restart to stay continuous.
        try {
          recognition.start()
        } catch {
          setListening(false)
          stopNoiseMonitoring()
        }
      } else {
        setListening(false)
        stopNoiseMonitoring()
      }
    }

    return recognition
  }, [persistTranscript, stopNoiseMonitoring])

  const startListening = () => {
    if (listening) return
    setError(null)
    if (offlineMode) {
      void startOfflineRecording()
      return
    }
    wantListeningRef.current = true
    const recognition = buildRecognition()
    if (!recognition) {
      // No Web Speech API at all — go straight to offline capture.
      setOfflineMode(true)
      void startOfflineRecording()
      return
    }
    recognitionRef.current = recognition
    try {
      recognition.start()
      setListening(true)
      announce("Mic listening")
      void startNoiseMonitoring()
    } catch {
      setError("Could not start the microphone — press Retry.")
      wantListeningRef.current = false
      setListening(false)
      playError()
    }
  }

  const stopListening = () => {
    wantListeningRef.current = false
    if (offlineMode) {
      stopOfflineRecording()
      return
    }
    recognitionRef.current?.stop()
    announce("Mic stopped")
  }

  const handleRetry = () => {
    setError(null)
    stopListening()
    window.setTimeout(() => startListening(), 300)
  }

  const replay = (text: string) => speak(text)
  const removeEntry = (id: string) => setEntries((prev) => prev.filter((e) => e.id !== id))

  useEffect(() => {
    return () => {
      wantListeningRef.current = false
      recognitionRef.current?.abort()
      stopNoiseMonitoring()
    }
  }, [stopNoiseMonitoring])

  const cardStyle: CSSProperties = {
    background: "rgba(30, 41, 59, 0.55)",
    backdropFilter: "blur(20px) saturate(150%)",
    WebkitBackdropFilter: "blur(20px) saturate(150%)",
    border: `1px solid ${COLORS.borderGlass}`,
    borderRadius: RADIUS.lg,
    padding: 20,
    boxShadow: SHADOW.md,
  }

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: FONT, padding: "0 16px 60px", maxWidth: 860, margin: "0 auto" }}>
      <TopNav />
      <motion.main initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 12 }}>
        <header>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900 }}>Speech → Text</h1>
          <p style={{ margin: "4px 0 0", fontSize: 15, color: COLORS.textDim }}>
            Continuous live transcription with confidence scoring and noise monitoring.
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }} role="status">
            {offlineMode && (
              <span
                title="Transcribing on this device with Whisper — no internet needed"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 800,
                  color: COLORS.warning,
                  background: "rgba(250, 204, 21, 0.12)",
                  border: `1px solid ${COLORS.warning}`,
                  borderRadius: RADIUS.pill,
                  padding: "3px 10px",
                }}
              >
                ⚡ Offline AI active
              </span>
            )}
            {offlineStt === "loading" && (
              <span style={{ fontSize: 12, fontWeight: 800, color: COLORS.textDim, border: `1px dashed ${COLORS.borderGlass}`, borderRadius: RADIUS.pill, padding: "3px 10px" }}>
                {`⬇ Downloading offline model ${offlinePct}%`}
              </span>
            )}
            {offlineStt === "ready" && !offlineMode && (
              <span style={{ fontSize: 12, fontWeight: 800, color: COLORS.success, border: `1px solid ${COLORS.success}`, borderRadius: RADIUS.pill, padding: "3px 10px" }}>
                ✓ Offline model ready
              </span>
            )}
          </div>
        </header>

        {!supported && (
          <div role="alert" style={{ ...cardStyle, borderColor: "rgba(239, 68, 68, 0.5)" }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: COLORS.danger }}>
              Use text input — voice not supported on this browser
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 14, color: COLORS.textDim }}>
              VaakSetu voice input needs Chrome, Edge, or Safari. Everything else still works.
            </p>
          </div>
        )}

        {/* Language selector */}
        <div style={cardStyle}>
          <label htmlFor="speech-lang" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 800, marginBottom: 8 }}>
            <Languages size={17} aria-hidden="true" /> Language
          </label>
          <select
            id="speech-lang"
            value={lang}
            onChange={(e) => {
              setLang(e.target.value as LanguageCode)
              if (listening) {
                // Restart recognition with the new language.
                stopListening()
                window.setTimeout(() => startListening(), 250)
              }
            }}
            style={{ width: "100%", minHeight: TAP_MIN, background: "rgba(10, 25, 41, 0.6)", color: COLORS.text, border: `1px solid ${COLORS.borderGlass}`, borderRadius: RADIUS.md, padding: "10px 12px", fontSize: 16, fontFamily: FONT }}
          >
            {LANGUAGES.map((l) => {
              const ok = supported && isLanguageSupported(l.code)
              return (
                <option key={l.code} value={l.code} disabled={!ok && l.code !== "en"} title={ok ? undefined : "Not supported by your browser"}>
                  {l.label}
                  {ok || l.code === "en" ? "" : " — not supported"}
                </option>
              )
            })}
          </select>
          {autoPunctuate && (
            <p style={{ margin: "8px 0 0", fontSize: 12.5, color: COLORS.textDim }}>
              ✦ Auto-punctuation enabled by your browser.
            </p>
          )}
        </div>

        {/* Mic controls + live area */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <motion.button
              type="button"
              onClick={listening ? stopListening : startListening}
              whileTap={{ scale: 0.95 }}
              aria-label={listening ? "Stop listening" : "Start listening"}
              aria-pressed={listening}
              style={{
                width: 84,
                height: 84,
                borderRadius: "50%",
                border: "none",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: listening ? `radial-gradient(circle at 30% 30%, #F87171, ${COLORS.danger})` : `linear-gradient(135deg, ${COLORS.accentBright}, ${COLORS.accentDeep})`,
                color: "#04121F",
                boxShadow: listening ? SHADOW.dangerGlow : SHADOW.accentGlow,
              }}
            >
              {listening ? <MicOff size={34} aria-hidden="true" /> : <Mic size={34} aria-hidden="true" />}
            </motion.button>

            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }} aria-hidden="true">
                {[0.06, 0.22, 0.4, 0.58, 0.78].map((step, i) => (
                  <motion.span
                    key={i}
                    animate={{ height: micLevel >= step ? 14 + i * 7 : 8, backgroundColor: micLevel >= step ? COLORS.accentBright : "rgba(148, 163, 184, 0.3)" }}
                    transition={{ duration: 0.1 }}
                    style={{ width: 8, borderRadius: 4, display: "inline-block" }}
                  />
                ))}
                <span style={{ fontSize: 12, fontWeight: 800, color: speechActive ? COLORS.success : COLORS.textDim, marginLeft: 6 }}>
                  {speechActive ? "VOICE" : "ambient"}
                </span>
              </div>
              <div role="status" aria-live="polite" style={{ fontSize: 15, fontWeight: 700, minHeight: 24, color: listening ? COLORS.danger : COLORS.textDim }}>
                {listening ? "● Listening — speak naturally" : "Press the mic to start transcription"}
              </div>
              {listening && interim && (
                <p style={{ margin: "8px 0 0", fontSize: 20, fontWeight: 600, color: COLORS.textDim, fontStyle: "italic", minHeight: 30 }}>
                  {interim}…
                </p>
              )}
            </div>

            {listening && (
              <button type="button" onClick={handleRetry} className="btn-ghost" aria-label="Restart recognition" style={{ minHeight: TAP_MIN, display: "inline-flex", alignItems: "center", gap: 7, padding: "0 16px", fontSize: 14 }}>
                <RotateCcw size={16} aria-hidden="true" /> Retry
              </button>
            )}
          </div>

          {noisy && (
            <motion.p
              role="alert"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ margin: "12px 0 0", fontSize: 14, fontWeight: 800, color: COLORS.warning, display: "flex", alignItems: "center", gap: 8 }}
            >
              <AlertTriangle size={16} aria-hidden="true" /> Noisy environment — speak closer to the mic
            </motion.p>
          )}
          {error && (
            <p role="alert" style={{ margin: "12px 0 0", fontSize: 14, fontWeight: 700, color: COLORS.danger }}>
              {error}
            </p>
          )}
        </div>

        {/* Transcript log */}
        <section aria-label="Transcript history" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Transcripts ({entries.length})</h2>
            {entries.length > 0 && (
              <button type="button" onClick={() => setEntries([])} className="btn-ghost" aria-label="Clear transcripts from this view" style={{ minHeight: 40, padding: "0 14px", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Trash2 size={14} aria-hidden="true" /> Clear view
              </button>
            )}
          </div>
          {entries.length === 0 ? (
            <p style={{ margin: 0, fontSize: 15, color: COLORS.textDim }}>
              Committed sentences appear here with their confidence score.
            </p>
          ) : (
            entries.map((entry) => (
              <motion.div key={entry.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={cardStyle}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 19, fontWeight: 700, lineHeight: 1.4 }}>{entry.text}</p>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, color: COLORS.textDim, fontVariantNumeric: "tabular-nums" }}>
                        {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: COLORS.accentBright, textTransform: "uppercase" }}>{entry.lang}</span>
                      {entry.confidence != null && (
                        <span
                          aria-label={`Confidence ${Math.round(entry.confidence * 100)} percent`}
                          style={{ fontSize: 11, fontWeight: 800, color: confColor(entry.confidence), background: `${confColor(entry.confidence)}1f`, border: `1px solid ${confColor(entry.confidence)}`, borderRadius: RADIUS.pill, padding: "1px 8px" }}
                        >
                          {Math.round(entry.confidence * 100)}%
                        </span>
                      )}
                      {entry.confidence != null && entry.confidence < 0.5 && (
                        <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.danger }}>Low confidence — consider correcting</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" onClick={() => replay(entry.text)} aria-label={`Speak: ${entry.text}`} className="btn-ghost" style={{ width: 44, height: 44, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                      <Volume2 size={17} aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => removeEntry(entry.id)} aria-label={`Remove transcript: ${entry.text}`} className="btn-ghost" style={{ width: 44, height: 44, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </section>
      </motion.main>
    </div>
  )
}
