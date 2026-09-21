import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { AnimatePresence, motion } from "motion/react"
import { MessageCard } from "../components/MessageCard"
import { subscribeToMessages, sendMessage, getUserId } from "../lib/messageBus"
import type { VaakSetuMessage } from "../lib/messageBus"
import { speak, playEmergencyBeep } from "../lib/speech"
import { startDemo, stopDemo } from "../lib/demoRunner"
import { COLORS, FONT } from "../theme"

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
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "18px 24px",
          borderBottom: `1px solid ${COLORS.border}`,
          background: "rgba(30, 41, 59, 0.4)",
          position: "sticky",
          top: 0,
          zIndex: 10,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 30 }} aria-hidden="true">
          👨‍👩‍👧
        </span>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, flex: 1 }}>
          Guardian Dashboard
        </h1>

        <span
          aria-label="Live feed active"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: COLORS.successSoft,
            border: `1px solid ${COLORS.success}`,
            borderRadius: 999,
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
          LIVE
        </span>

        <span style={{ fontSize: 14, color: COLORS.textDim, fontWeight: 600 }}>
          User: {getUserId()}
        </span>

        <button
          type="button"
          onClick={() => setMessages([])}
          aria-label="Clear all messages from the feed"
          style={{
            minHeight: 48,
            padding: "10px 20px",
            background: "transparent",
            color: COLORS.textDim,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          Clear Feed
        </button>
      </header>

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
                minHeight: 36,
                padding: "6px 16px",
                background: COLORS.warning,
                color: "#1F1300",
                border: "none",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: FONT,
              }}
            >
              Stop Demo
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Feed */}
      <main style={{ flex: 1, padding: "20px 24px 32px", overflowY: "auto" }}>
        {messages.length === 0 ? (
          <div
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
            <span style={{ fontSize: 52 }} aria-hidden="true">
              📡
            </span>
            <p style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
              Waiting for messages…
            </p>
            <p style={{ fontSize: 15, margin: 0 }}>
              Open the User dashboard in another tab and tap pictograms.
            </p>
          </div>
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
                <MessageCard
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
