/**
 * /avatar-talk — Phase 5: bidirectional avatar conversation.
 *
 * Three panels around a central SigningAvatar interpreter:
 *   LEFT   — hearing person: hold-mic → live transcript → send (avatar signs)
 *   CENTER — the avatar: state machine (idle/listening/signing/speaking) + emotion
 *   RIGHT  — deaf/non-verbal person: camera + continuous ISL → send (avatar speaks)
 *   BOTTOM — shared chat history (hearing = right-aligned cyan, deaf = left-aligned green)
 *
 * Group mode: session room via Socket.IO (`avatar-room:<id>`), QR join URL,
 * turns broadcast both ways between tabs/devices.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Mic, MicOff, Send, Languages, Ear, Hand, Users, X, Volume2 } from "lucide-react"
import { SigningAvatar, parseEmotion } from "../components/Avatar/SigningAvatar"
import type { AvatarState } from "../components/Avatar/SigningAvatar"
import { AvatarPlayer } from "../components/Avatar/AvatarPlayer"
import { sentenceToSignSequence } from "../lib/avatar/sequencer"
import {
  ContinuousRecognizer,
  SEGMENT_DISPLAY,
  segmentsToSentence,
} from "../lib/sign/continuousRecognizer"
import { speak, stopSpeaking } from "../lib/speech"
import { speakForUser, isClonedVoiceEnabled } from "../lib/voiceClone"
import {
  sendMessage,
  getUserId,
  joinAvatarRoom,
  leaveAvatarRoom,
  sendAvatarRoomTurn,
  onAvatarRoomTurn,
} from "../lib/messageBus"
import type { AvatarRoomTurn } from "../lib/messageBus"
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision"
import { COLORS, FONT, RADIUS, SHADOW, TAP_MIN } from "../theme"
import TopNav from "../components/TopNav"
import { announce } from "../lib/a11y"
import { playTap, playSuccess } from "../lib/soundEffects"
import { LANGUAGES } from "../lib/translations"
import type { LanguageCode } from "../lib/translations"

/* ── Session id helpers (group mode) ─────────────────────────── */

function makeSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** QR code without dependencies: goqr.me image endpoint (https, cacheable). */
function qrUrl(url: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(url)}`
}

/* ── Speech recognition (webkitSpeechRecognition) ─────────────── */

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

/** BCP-47 tag for the selector's language codes. */
const BCP47: Record<string, string> = {
  en: "en-IN",
  hi: "hi-IN",
  kn: "kn-IN",
  te: "te-IN",
  ta: "ta-IN",
}

/* ── Chat model ───────────────────────────────────────────────── */

interface ChatEntry {
  id: string
  side: "hearing" | "deaf"
  text: string
  confidence?: number
  timestamp: number
}

/* ── Small components ─────────────────────────────────────────── */

const card: CSSProperties = {
  background: "rgba(30, 41, 59, 0.55)",
  backdropFilter: "blur(20px) saturate(150%)",
  WebkitBackdropFilter: "blur(20px) saturate(150%)",
  border: `1px solid ${COLORS.borderGlass}`,
  borderRadius: RADIUS.lg,
  padding: 16,
  boxShadow: SHADOW.md,
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = pct > 80 ? COLORS.success : pct >= 50 ? COLORS.warning : COLORS.danger
  return (
    <span
      aria-label={`Detection confidence ${pct} percent`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: 11,
        fontWeight: 800,
        color,
        border: `1px solid ${color}`,
        borderRadius: RADIUS.pill,
        padding: "1px 8px",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {pct}%
    </span>
  )
}

/* ── Page ─────────────────────────────────────────────────────── */

export default function AvatarConversationPage() {
  /* Panels */
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState("")
  const [transcript, setTranscript] = useState("")
  const [lang, setLang] = useState<LanguageCode>("en")
  const [speechSupported] = useState(() => getRecognitionCtor() !== null)
  const [micError, setMicError] = useState<string | null>(null)

  /* Avatar state machine */
  const [avatarState, setAvatarState] = useState<AvatarState>("idle")
  const [signText, setSignText] = useState("") // sentence the avatar is signing
  const [speakText, setSpeakText] = useState("") // sentence being spoken
  const [emotionOverride, setEmotionOverride] = useState<"neutral" | "positive" | "negative" | null>(null)

  /* Deaf side: camera + continuous recognition */
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const landmarkerRef = useRef<HandLandmarker | null>(null)
  const rafRef = useRef(0)
  const camRunningRef = useRef(false)
  const recognizerRef = useRef<ContinuousRecognizer | null>(null)
  const [camState, setCamState] = useState<"off" | "loading" | "on" | "denied" | "failed">("off")
  const [segments, setSegments] = useState<{ label: string; confidence: number }[]>([])
  const [lastSign, setLastSign] = useState<{ label: string; confidence: number } | null>(null)

  /* Chat */
  const [chat, setChat] = useState<ChatEntry[]>([])
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  /* Group mode */
  const [groupMode, setGroupMode] = useState(() => new URLSearchParams(window.location.search).has("session"))
  const [sessionId, setSessionId] = useState<string>(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("session")
    return fromUrl ?? makeSessionId()
  })
  const [roomMembers, setRoomMembers] = useState(1)

  /* Refs mirroring latest values for socket handlers */
  const signTextRef = useRef("")
  const speakTextRef = useRef("")
  useEffect(() => {
    signTextRef.current = signText
  }, [signText])
  useEffect(() => {
    speakTextRef.current = speakText
  }, [speakText])

  const joinUrl = `${window.location.origin}/avatar-talk?session=${encodeURIComponent(sessionId)}`
  const roomName = `avatar-room:${sessionId}`

  /* ── Group room lifecycle ───────────────────────────────────── */
  useEffect(() => {
    if (!groupMode) return
    joinAvatarRoom(roomName)
    const off = onAvatarRoomTurn((t) => {
      if (t.room !== roomName) return
      pushChat(t.side, t.text, t.confidence, t.timestamp, false)
      if (t.side === "hearing") void speakSigns(t.text, t.lang)
      else void speakAloud(t.text)
    })
    return () => {
      leaveAvatarRoom(roomName)
      off()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupMode, roomName])

  /* ── Chat helpers ───────────────────────────────────────────── */
  const pushChat = useCallback(
    (
      side: "hearing" | "deaf",
      text: string,
      confidence?: number,
      timestamp?: number,
      broadcast = true,
    ) => {
      const entry: ChatEntry = {
        id: `at-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        side,
        text,
        confidence,
        timestamp: timestamp ?? Date.now(),
      }
      setChat((prev) => [...prev, entry])
      if (broadcast && groupMode) {
        sendAvatarRoomTurn({ room: roomName, side, text, confidence: confidence ?? 0, lang })
      }
      if (side === "deaf") {
        sendMessage({
          id: entry.id,
          type: "sign",
          text,
          confidence: confidence != null ? Math.round(confidence * 100) : undefined,
          timestamp: entry.timestamp,
        })
      }
    },
    [groupMode, roomName, lang],
  )

  /* Auto-scroll chat to newest */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [chat])

  /* ── Avatar behaviors ───────────────────────────────────────── */
  /** Hearing → Deaf: play the sentence as signs on the avatar. */
  const speakSigns = useCallback(async (text: string, l = lang) => {
    if (!text.trim()) return
    stopSpeaking()
    setAvatarState("signing")
    setSignText(text)
    setEmotionOverride(parseEmotion(text))
    announce(`Avatar signing: ${text}`)
    await new Promise<void>((resolve) => {
      const check = window.setInterval(() => {
        if (signTextRef.current !== text) {
          window.clearInterval(check)
          resolve()
        }
      }, 200)
      // Hard stop: sequence length + buffer (AvatarPlayer also calls onComplete).
      window.setTimeout(() => {
        window.clearInterval(check)
        resolve()
      }, Math.min(45_000, 1600 + text.length * 380))
    })
    setSignText((cur) => (cur === text ? "" : cur))
    setAvatarState((cur) => (cur === "signing" ? "idle" : cur))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang])

  /** Deaf → Hearing: TTS (cloned voice when enabled) while the mouth animates. */
  const speakAloud = useCallback(async (text: string) => {
    if (!text.trim()) return
    setAvatarState("speaking")
    setSpeakText(text)
    setEmotionOverride(parseEmotion(text))
    announce(`Avatar speaking: ${text}`)
    try {
      if (isClonedVoiceEnabled()) speakForUser(text)
      else speak(text)
    } catch {
      speak(text)
    }
    // Rough duration: ~14 chars/sec at rate 0.95.
    const dur = Math.min(30_000, Math.max(1800, text.length * 72))
    await new Promise((r) => window.setTimeout(r, dur))
    setSpeakText((cur) => (cur === text ? "" : cur))
    setAvatarState((cur) => (cur === "speaking" ? "idle" : cur))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── LEFT: hearing side mic ─────────────────────────────────── */
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  const startListening = useCallback(() => {
    const Ctor = getRecognitionCtor()
    if (!Ctor || listening) return
    setMicError(null)
    setInterim("")
    setTranscript("")
    stopSpeaking()

    const rec = new Ctor()
    rec.lang = BCP47[lang] ?? "en-IN"
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1

    let finalText = ""
    rec.onresult = (e) => {
      let live = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        const alt = res[0] as { transcript?: string } | undefined
        if (res.isFinal) finalText += alt?.transcript ?? ""
        else live += alt?.transcript ?? ""
      }
      setInterim(live)
      setTranscript(finalText)
    }
    rec.onend = () => {
      setListening(false)
      const text = (finalText || interimRef.current).trim()
      setInterim("")
      if (text) {
        pushChat("hearing", text)
        playSuccess()
        announce(`Sent: ${text}`)
      } else {
        setTranscript("")
      }
    }
    rec.onerror = (e) => {
      setListening(false)
      if (e.error === "not-allowed" || e.error === "service-not-allowed")
        setMicError("Microphone blocked — allow mic access in your browser settings.")
      else if (e.error === "network") setMicError("Speech service unreachable — type or retry.")
      else if (e.error !== "aborted" && e.error !== "no-speech") setMicError(`Mic error: ${e.error}`)
    }

    recognitionRef.current = rec
    try {
      rec.start()
      setListening(true)
      announce("Mic listening")
    } catch {
      setMicError("Could not start the microphone.")
      setListening(false)
    }
  }, [listening, lang, pushChat])

  /** Keep the latest interim for the onend commit. */
  const interimRef = useRef("")
  useEffect(() => {
    interimRef.current = interim
  }, [interim])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  /** Send the current transcript without waiting for auto-stop. */
  const sendTranscript = useCallback(() => {
    const text = (transcriptRef.current || interimRef.current).trim()
    if (!text) return
    recognitionRef.current?.abort()
    recognitionRef.current = null
    setListening(false)
    setInterim("")
    setTranscript("")
    pushChat("hearing", text)
    void speakSigns(text)
  }, [pushChat, speakSigns])

  const transcriptRef = useRef("")
  useEffect(() => {
    transcriptRef.current = transcript
  }, [transcript])

  /* ── RIGHT: deaf side camera + continuous ISL ───────────────── */
  const startCamera = useCallback(async () => {
    if (camState === "on" || camState === "loading") return
    setCamState("loading")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => undefined)
      }
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
      )
      landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
      })
      setCamState("on")
      camRunningRef.current = true
      if (!recognizerRef.current) recognizerRef.current = new ContinuousRecognizer()
      else recognizerRef.current.reset()
      setAvatarState((s) => (s === "idle" ? "listening" : s))
      rafRef.current = requestAnimationFrame(camTick)
    } catch (err) {
      const name = (err as { name?: string })?.name ?? ""
      setCamState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "failed")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camState])

  const stopCamera = useCallback(() => {
    camRunningRef.current = false
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    try {
      landmarkerRef.current?.close()
    } catch {
      /* ignore */
    }
    landmarkerRef.current = null
    setCamState("off")
    setAvatarState((s) => (s === "listening" ? "idle" : s))
  }, [])

  /** Detection loop: hands → continuous recognizer → segment labels. */
  const camTick = useCallback(() => {
    if (!camRunningRef.current) return
    const video = videoRef.current
    const landmarker = landmarkerRef.current
    const recognizer = recognizerRef.current
    if (video && landmarker && recognizer && video.readyState >= 2 && video.videoWidth > 0) {
      try {
        const now = performance.now()
        const result = landmarker.detectForVideo(video, now)
        const hands = (result?.landmarks ?? []) as { x: number; y: number; z: number }[][]
        const seg = recognizer.push(hands[0] ?? null, now)
        if (seg) {
          const label = SEGMENT_DISPLAY[seg.label] ?? seg.label
          setLastSign({ label, confidence: seg.confidence })
          setSegments((prev) => [...prev, { label, confidence: seg.confidence }].slice(-8))
          playSuccess()
        }
      } catch {
        /* per-frame errors are non-fatal */
      }
    }
    rafRef.current = requestAnimationFrame(camTick)
  }, [])

  useEffect(() => {
    return () => {
      camRunningRef.current = false
      cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      recognitionRef.current?.abort()
    }
  }, [])

  /** Deaf side "Send": detected sentence → avatar speaks + chat. */
  const sendDetected = useCallback(() => {
    const sentence = segmentsToSentence(
      segments.map((s, i) => ({ label: Object.keys(SEGMENT_DISPLAY).find((k) => SEGMENT_DISPLAY[k] === s.label) ?? s.label, confidence: s.confidence, startFrame: i, endFrame: i })),
    )
    const text = sentence || lastSign?.label || ""
    if (!text) return
    playTap()
    pushChat("deaf", text, lastSign?.confidence ?? 0.8)
    setSegments([])
    void speakAloud(text)
  }, [segments, lastSign, pushChat, speakAloud])

  /* ── Derived ────────────────────────────────────────────────── */
  const detectedSentence = useMemo(
    () => segments.map((s) => s.label).join(" "),
    [segments],
  )

  const statusLabel =
    avatarState === "signing"
      ? "Signing…"
      : avatarState === "speaking"
        ? "Speaking…"
        : listening || camState === "on"
          ? "Listening…"
          : "Idle"

  const statusColor =
    avatarState === "signing"
      ? COLORS.violet
      : avatarState === "speaking"
        ? COLORS.success
        : listening || camState === "on"
          ? COLORS.accentBright
          : COLORS.textDim

  /* ── Layout ─────────────────────────────────────────────────── */
  const panelHead = (icon: React.ReactNode, title: string, sub: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
      <span
        aria-hidden="true"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 38,
          height: 38,
          borderRadius: RADIUS.md,
          background: "rgba(0, 180, 216, 0.12)",
          border: "1px solid rgba(0, 180, 216, 0.35)",
          color: COLORS.accentBright,
        }}
      >
        {icon}
      </span>
      <div>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{title}</h2>
        <p style={{ margin: 0, fontSize: 12, color: COLORS.textDim }}>{sub}</p>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: FONT, padding: "0 16px 40px" }}>
      <TopNav />

      <main style={{ maxWidth: 1280, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16, paddingTop: 14 }}>
        {/* Group toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div role="group" aria-label="Conversation mode" style={{ display: "inline-flex", border: `1px solid ${COLORS.borderGlass}`, borderRadius: RADIUS.pill, overflow: "hidden" }}>
            {(["1-on-1", "Group"] as const).map((m) => {
              const active = m === "Group" ? groupMode : !groupMode
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    playTap()
                    if (m === "Group") setGroupMode(true)
                    else {
                      setGroupMode(false)
                      leaveAvatarRoom(roomName)
                    }
                  }}
                  aria-pressed={active}
                  style={{
                    minHeight: 40,
                    padding: "0 18px",
                    fontSize: 14,
                    fontWeight: 800,
                    border: "none",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    background: active ? "rgba(0,224,255,0.14)" : "transparent",
                    color: active ? COLORS.accentBright : COLORS.textDim,
                    fontFamily: FONT,
                  }}
                >
                  {m === "Group" ? <Users size={15} aria-hidden="true" /> : null}
                  {m}
                </button>
              )
            })}
          </div>
          {groupMode && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", ...card, padding: "8px 12px" }}>
              <img src={qrUrl(joinUrl)} alt={`QR code to join session ${sessionId}`} width={56} height={56} style={{ borderRadius: 8, background: "#fff", padding: 3 }} />
              <div style={{ fontSize: 12.5, color: COLORS.textDim, maxWidth: 300 }}>
                <strong style={{ color: COLORS.text }}>Session {sessionId.slice(0, 8)}</strong>
                <br />
                <span style={{ wordBreak: "break-all" }}>{joinUrl}</span>
                <br />
                {roomMembers} participant{roomMembers === 1 ? "" : "s"} in room
              </div>
              <button type="button" onClick={() => void navigator.clipboard?.writeText(joinUrl).then(() => announce("Join link copied"))} className="btn-ghost" style={{ minHeight: 36, padding: "0 12px", fontSize: 12.5 }}>
                Copy link
              </button>
            </div>
          )}
        </div>

        {/* 3-column grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, alignItems: "stretch" }}>
          {/* LEFT — hearing person */}
          <section style={card} aria-label="Hearing person panel">
            {panelHead(<Ear size={19} />, "Hearing Person", "Hold the mic and speak")}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
                    ? { scale: [1, 1.05, 1], boxShadow: ["0 0 0 0 rgba(239,68,68,0.5)", "0 0 0 18px rgba(239,68,68,0)"] }
                    : { scale: 1 }
                }
                transition={listening ? { scale: { repeat: Infinity, duration: 1.2 }, boxShadow: { repeat: Infinity, duration: 1.2 } } : { duration: 0.2 }}
                aria-label={listening ? "Release to stop recording" : "Hold to record speech"}
                aria-pressed={listening}
                style={{
                  width: 76,
                  height: 76,
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
                }}
              >
                {listening ? <MicOff size={30} strokeWidth={2.6} aria-hidden="true" /> : <Mic size={30} strokeWidth={2.6} aria-hidden="true" />}
              </motion.button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div role="status" aria-live="polite" style={{ minHeight: 20, fontSize: 13, fontWeight: 700, color: listening ? COLORS.danger : COLORS.textDim }}>
                  {listening ? "● Listening… release to send" : speechSupported ? "Hold the mic to record" : "Voice input unsupported — type below"}
                </div>
                <div aria-live="polite" style={{ minHeight: 56, marginTop: 6, padding: "8px 10px", background: "rgba(10,25,41,0.6)", border: `1px solid ${COLORS.borderGlass}`, borderRadius: RADIUS.md, fontSize: 14.5, overflowWrap: "anywhere" }}>
                  {transcript || interim || <span style={{ color: COLORS.textDim }}>Live transcript appears here…</span>}
                  {interim && <span style={{ color: COLORS.textDim }}> {interim}</span>}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <Languages size={16} color={COLORS.accentBright} aria-hidden="true" />
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as LanguageCode)}
                aria-label="Spoken language"
                style={{ flex: 1, minWidth: 140, minHeight: TAP_MIN, background: "rgba(10,25,41,0.6)", color: COLORS.text, border: `1px solid ${COLORS.borderGlass}`, borderRadius: RADIUS.md, padding: "8px 12px", fontSize: 15, fontFamily: FONT }}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
              <button type="button" onClick={sendTranscript} disabled={!transcript.trim() && !interim.trim()} className="btn-gradient" style={{ minHeight: TAP_MIN, padding: "0 18px", display: "inline-flex", alignItems: "center", gap: 8, fontSize: 15, opacity: transcript.trim() || interim.trim() ? 1 : 0.5 }}>
                <Send size={16} aria-hidden="true" /> Send
              </button>
            </div>
            {micError && (
              <p role="alert" style={{ margin: "10px 0 0", fontSize: 13, fontWeight: 700, color: COLORS.danger }}>
                {micError}
              </p>
            )}
          </section>

          {/* CENTER — the avatar interpreter */}
          <section style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }} aria-label="Avatar interpreter">
            <div
              role="status"
              aria-live="polite"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                fontWeight: 900,
                letterSpacing: 1.4,
                textTransform: "uppercase",
                color: statusColor,
                border: `1px solid ${statusColor}`,
                borderRadius: RADIUS.pill,
                padding: "4px 14px",
              }}
            >
              <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1.2 }} style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor, display: "inline-block" }} />
              {statusLabel}
            </div>
            {signText ? (
              <AvatarPlayer key={signText} text={signText} size={300} onComplete={() => {
                setSignText("")
                setAvatarState((s) => (s === "signing" ? "idle" : s))
              }} />
            ) : (
              <SigningAvatar state={avatarState} emotion={emotionOverride ?? "neutral"} size={300} ariaLabel={`Avatar ${avatarState}`} />
            )}
            {speakText && <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: COLORS.success }}>“{speakText}”</p>}
          </section>

          {/* RIGHT — deaf / non-verbal person */}
          <section style={card} aria-label="Deaf person panel">
            {panelHead(<Hand size={19} />, "Deaf / Non-Verbal", "Sign — the avatar speaks")}
            <div style={{ position: "relative", width: "100%", aspectRatio: "4 / 3", background: "rgba(10,25,41,0.7)", borderRadius: RADIUS.md, overflow: "hidden", border: `1px solid ${COLORS.borderGlass}` }}>
              <video ref={videoRef} autoPlay playsInline muted style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
              <canvas ref={canvasRef} aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />
              {camState !== "on" && (
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 12, textAlign: "center", color: COLORS.textDim, fontSize: 13.5 }}>
                  {camState === "loading" ? (
                    "Starting camera & hand tracking…"
                  ) : camState === "denied" ? (
                    "Camera access denied — allow it in browser settings."
                  ) : camState === "failed" ? (
                    "Camera unavailable on this device."
                  ) : (
                    <>
                      <span>Camera is off</span>
                      <button type="button" onClick={() => void startCamera()} className="btn-gradient" style={{ minHeight: TAP_MIN, padding: "0 18px", fontSize: 14 }}>
                        Start camera
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: COLORS.textDim }}>Detected:</span>
              {lastSign ? (
                <>
                  <span style={{ fontSize: 17, fontWeight: 900, color: COLORS.accentBright }}>{lastSign.label}</span>
                  <ConfidenceBadge value={lastSign.confidence} />
                </>
              ) : (
                <span style={{ fontSize: 13.5, color: COLORS.textDim }}>— sign a phrase</span>
              )}
            </div>
            <div role="status" aria-live="polite" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, minHeight: 30 }}>
              {segments.map((s, i) => (
                <span key={`${s.label}-${i}`} style={{ background: "rgba(124,58,237,0.14)", border: "1px solid rgba(124,58,237,0.5)", borderRadius: RADIUS.pill, padding: "2px 10px", fontSize: 13, fontWeight: 800 }}>
                  {s.label}
                </span>
              ))}
              {segments.length > 0 && (
                <button type="button" onClick={() => setSegments([])} style={{ background: "transparent", border: "none", color: COLORS.textDim, fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
                  clear
                </button>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button type="button" onClick={sendDetected} disabled={!lastSign} className="btn-gradient" style={{ flex: 1, minHeight: TAP_MIN, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 15, opacity: lastSign ? 1 : 0.5 }}>
                <Send size={16} aria-hidden="true" /> Send{detectedSentence ? `: “${detectedSentence}”` : ""}
              </button>
              {camState === "on" ? (
                <button type="button" onClick={stopCamera} className="btn-ghost" aria-label="Stop camera" style={{ minHeight: TAP_MIN, padding: "0 14px", display: "inline-flex", alignItems: "center" }}>
                  <X size={17} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </section>
        </div>

        {/* BOTTOM — chat history */}
        <section style={card} aria-label="Chat history">
          <h2 style={{ margin: "0 0 10", fontSize: 15, fontWeight: 800 }}>Conversation</h2>
          <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, paddingRight: 4 }}>
            {chat.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: COLORS.textDim }}>Messages from both sides will appear here.</p>}
            {chat.map((m) => (
              <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: m.side === "hearing" ? "flex-end" : "flex-start" }}>
                <div
                  style={{
                    maxWidth: "78%",
                    padding: "8px 14px",
                    borderRadius: RADIUS.md,
                    fontSize: 14.5,
                    fontWeight: 600,
                    background: m.side === "hearing" ? "rgba(0,180,216,0.14)" : "rgba(16,185,129,0.14)",
                    border: `1px solid ${m.side === "hearing" ? "rgba(0,180,216,0.45)" : "rgba(16,185,129,0.45)"}`,
                    color: m.side === "hearing" ? COLORS.accentBright : COLORS.success,
                  }}
                >
                  {m.text}
                </div>
                <span style={{ fontSize: 10.5, color: COLORS.textDim, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                  {m.side === "hearing" ? "Hearing" : "Deaf"} · {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {m.confidence ? ` · ${Math.round(m.confidence * 100)}%` : ""}
                </span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        </section>
      </main>
    </div>
  )
}
