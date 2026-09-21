import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { AnimatePresence, motion } from "motion/react"
import { Trash2, Radio, X } from "lucide-react"
import { FeedMessageCard } from "../components/MessageCard"
import { subscribeToMessages, sendMessage } from "../lib/messageBus"
import type { VaakSetuMessage } from "../lib/messageBus"
import { speak, playEmergencyBeep } from "../lib/speech"
import { startDemo, stopDemo } from "../lib/demoRunner"
import { COLORS, FONT, RADIUS, SHADOW, TAP_MIN } from "../theme"
import TopNav from "../components/TopNav"

const TOAST_MS = 2000

/** Feed entries always have an id (stamped on receive). */
type FeedMessage = VaakSetuMessage & { id: string }

export default function GuardianDashboard() {
  const [messages, setMessages] = useState<FeedMessage[]>([])
  const [replyForId, setReplyForId] = useState<string | null>(null)
  const [replyToastId, setReplyToastId] = useState<string | null>(null)
  const [isDemoMode, setIsDemoMode] = useState(false)
  const [searchParams] = useSearchParams()

  const handleMessage = useCallback((msg: VaakSetuMessage) => {
    // Replies go to the user dashboard; guardian keeps them out of its feed.
    if (msg.type === "reply") return

    setMessages((prev) => {
      const id = msg.id ?? `${msg.timestamp}-${Math.random().toString(36).slice(2, 7)}`
      if (prev.some((m) => m.id === id)) return prev
      const stamped = {
        ...msg,
        id,
        latencyMs: Math.max(0, Date.now() - msg.timestamp),
      } as FeedMessage
      return [stamped, ...prev]
    })

    // Guardian hears the message from anywhere in the room.
    if (msg.type === "message") {
      speak(msg.text)
      if (msg.emergency) playEmergencyBeep()
    }
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeToMessages(handleMessage)
    return unsubscribe
  }, [handleMessage])

  // Demo mode: ?demo=true auto-plays a scripted scenario.
  useEffect(() => {
    if (searchParams.get("demo") !== "true") return
    setIsDemoMode(true)
    const timer = window.setTimeout(() => startDemo(), 1000)
    return () => {
      window.clearTimeout(timer)
      stopDemo()
    }
  }, [searchParams])

  const handleStopDemo = () => {
    stopDemo()
    setIsDemoMode(false)
  }

  const sendReply = (messageId: string, text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    sendMessage({ type: "reply", text: trimmed, timestamp: Date.now() })
    setReplyForId(null)
    setReplyToastId(messageId)
    window.setTimeout(
      () => setReplyToastId((current) => (current === messageId ? null : current)),
      TOAST_MS,
    )
  }

  const handleQuickReply = (messageId: string, chip: string) => {
    if (chip === "Custom...") {
      setReplyForId(messageId)
      return
    }
    sendReply(messageId, chip)
  }

  const hasEmergency = messages.some(
    (m) => m.type === "message" && m.emergency,
  )

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: FONT,
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      <TopNav
        right={
          <>
            <span
              aria-label="Live feed active"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: COLORS.successSoft,
                border: `1px solid ${COLORS.success}`,
                borderRadius: RADIUS.pill,
                padding: "6px 14px",
                fontSize: 14,
                fontWeight: 800,
                color: COLORS.success,
                letterSpacing: 1,
              }}
            >
              <motion.span
                aria-hidden="true"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ repeat: Infinity, duration: 1.4 }}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: COLORS.success,
                  display: "inline-block",
                }}
              />
              <Radio size={14} strokeWidth={2.6} aria-hidden="true" />
              LIVE
            </span>
            <button
              type="button"
              onClick={() => setMessages([])}
              aria-label="Clear all messages from the feed"
              className="btn-ghost"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                minHeight: TAP_MIN,
                padding: "10px 20px",
                fontSize: 15,
                fontFamily: FONT,
              }}
            >
              <Trash2 size={16} strokeWidth={2.4} aria-hidden="true" /> Clear Feed
            </button>
          </>
        }
      />

      {/* Demo mode banner */}
      <AnimatePresence>
        {isDemoMode && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 14,
              flexWrap: "wrap",
              padding: "10px 20px",
              background: "rgba(250, 204, 21, 0.12)",
              borderBottom: `1px solid ${COLORS.warning}`,
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 15,
                fontWeight: 800,
                color: COLORS.warning,
                letterSpacing: 0.5,
              }}
            >
              🎬 DEMO MODE — Auto-playing scripted scenario
            </span>
            <button
              type="button"
              onClick={handleStopDemo}
              aria-label="Stop the scripted demo"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                minHeight: 36,
                padding: "6px 16px",
                background: COLORS.warning,
                color: "#1F1300",
                border: "none",
                borderRadius: RADIUS.sm,
                fontSize: 14,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: FONT,
              }}
            >
              <X size={15} strokeWidth={3} aria-hidden="true" /> Stop Demo
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Feed */}
      <main style={{ flex: 1, padding: "20px 24px 32px", overflowY: "auto" }}>
        {messages.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            style={{
              height: "70vh",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              color: COLORS.textDim,
            }}
            role="status"
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 92,
                height: 92,
                borderRadius: RADIUS.xl,
                background: "rgba(30, 41, 59, 0.55)",
                border: `1px solid ${COLORS.borderGlass}`,
                fontSize: 44,
                boxShadow: SHADOW.md,
              }}
              aria-hidden="true"
            >
              📡
            </span>
            <p style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
              Waiting for messages…
            </p>
            <p style={{ fontSize: 15, margin: 0 }}>
              Open the User dashboard in another tab and tap pictograms.
            </p>
          </motion.div>
        ) : (
          <div
            role="list"
            aria-label="Live messages"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 14,
              maxWidth: 860,
              margin: "0 auto",
            }}
          >
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <FeedMessageCard
                  key={m.id}
                  msg={m}
                  onReply={
                    m.type === "message"
                      ? () => handleQuickReply(m.id, "Custom...")
                      : undefined
                  }
                  replyOpen={replyForId === m.id}
                  replySent={replyToastId === m.id}
                  onQuickReply={
                    m.type === "message"
                      ? (chip) => handleQuickReply(m.id, chip)
                      : undefined
                  }
                  onCustomReply={
                    m.type === "message"
                      ? (text) => sendReply(m.id, text)
                      : undefined
                  }
                  onCancelReply={() => setReplyForId(null)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* Screen-reader announcement for new emergencies */}
      <div aria-live="assertive" className="sr-only">
        {hasEmergency ? "Emergency alert received." : ""}
      </div>
    </div>
  )
}
