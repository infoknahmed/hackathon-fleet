import { useEffect, useState } from "react"
import type { CSSProperties, ReactNode } from "react"
import { motion } from "motion/react"
import { Volume2 } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { VaakSetuMessage } from "../lib/messageBus"
import { tokens } from "../styles/tokens"
import { FONT, RADIUS, TAP_MIN } from "../theme"

/** Side of the conversation the sender is on. */
export type ChatSide = "left" | "right"

export interface ChatMessage {
  id: string
  side: ChatSide
  text: string
  /** Display text as delivered (may be translated). */
  displayText?: string
  confidence?: number
  timestamp: number
  avatar?: string
  /** Pictogram emoji chain for user messages. */
  picto?: string
}

interface Props {
  msg: ChatMessage
  /** TTS the message (speech bubbles). */
  onSpeak?: (text: string) => void
}

function confidenceColor(confidence: number): string {
  if (confidence > 80) return tokens.aurora.emerald
  if (confidence > 50) return "#FFC94D"
  return "#FF5C5C"
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
}

/** "just now" / "Xs ago" / "Xm ago" relative label, re-rendered every 5s. */
function useRelativeTime(ts: number): string {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 5000)
    return () => window.clearInterval(id)
  }, [])
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (s < 5) return "just now"
  if (s < 60) return `${s}s ago`
  return `${Math.floor(s / 60)}m ago`
}

export function MessageCard({ msg, onSpeak }: Props) {
  const isLeft = msg.side === "left"

  const bubble: CSSProperties = {
    maxWidth: "88%",
    display: "flex",
    flexDirection: isLeft ? "row" : "row-reverse",
    gap: 10,
    alignItems: "flex-end",
    alignSelf: isLeft ? "flex-start" : "flex-end",
    fontFamily: FONT,
  }

  const bubbleBody: CSSProperties = {
    background: isLeft ? "rgba(10,12,18,0.72)" : "rgba(0,224,255,0.07)",
    backdropFilter: "blur(20px) saturate(150%)",
    WebkitBackdropFilter: "blur(20px) saturate(150%)",
    border: `1px solid ${isLeft ? tokens.border.hairline : "rgba(0,224,255,0.35)"}`,
    borderRadius: RADIUS.lg,
    borderBottomLeftRadius: isLeft ? RADIUS.sm : RADIUS.lg,
    borderBottomRightRadius: isLeft ? RADIUS.lg : RADIUS.sm,
    padding: "12px 16px",
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
    minWidth: 0,
  }

  const avatarRing: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
    borderRadius: RADIUS.pill,
    flexShrink: 0,
    fontSize: 20,
    background: isLeft ? "rgba(0,224,255,0.1)" : "rgba(124,58,237,0.16)",
    border: `1px solid ${isLeft ? "rgba(0,224,255,0.35)" : "rgba(124,58,237,0.4)"}`,
    boxShadow: "0 4px 14px rgba(0, 0, 0, 0.35)",
  }

  const confidence = msg.confidence
  const confColor = confidence != null ? confidenceColor(confidence) : null

  const headerRow: ReactNode = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        marginBottom: 4,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: isLeft ? tokens.aurora.cyan : "#C4B5FD",
        }}
      >
        {isLeft ? "User" : "Listener"}
      </span>
      {confColor && confidence != null && (
        <span
          aria-label={`Confidence ${Math.round(confidence)} percent`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            fontSize: 11,
            fontWeight: 800,
            color: confColor,
            background: `${confColor}1f`,
            border: `1px solid ${confColor}`,
            borderRadius: RADIUS.pill,
            padding: "1px 8px",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {Math.round(confidence)}%
        </span>
      )}
      <span
        style={{
          fontSize: 11,
          color: tokens.text.secondary,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {formatTime(msg.timestamp)}
      </span>
    </div>
  )

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      style={bubble}
      role="listitem"
    >
      <span style={avatarRing} aria-hidden="true">
        {msg.avatar ?? (isLeft ? "🧑" : "👂")}
      </span>

      <div style={bubbleBody}>
        {headerRow}
        <p
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 700,
            lineHeight: 1.4,
            overflowWrap: "anywhere",
            color: tokens.text.primary,
          }}
        >
          {msg.picto ? `${msg.picto} ` : ""}
          {msg.displayText ?? msg.text}
        </p>
        {msg.displayText && msg.displayText !== msg.text && (
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 13,
              fontWeight: 500,
              color: tokens.text.secondary,
            }}
          >
            {msg.text}
          </p>
        )}
        {onSpeak && (
          <button
            type="button"
            onClick={() => onSpeak(msg.displayText ?? msg.text)}
            aria-label={`Play message aloud: ${msg.displayText ?? msg.text}`}
            style={{
              marginTop: 8,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              minHeight: Math.max(TAP_MIN, 36),
              padding: "4px 12px",
              background: "transparent",
              color: tokens.aurora.cyan,
              border: "1px solid rgba(0,224,255,0.35)",
              borderRadius: RADIUS.pill,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: FONT,
            }}
          >
            <Volume2 size={15} strokeWidth={2.4} aria-hidden="true" />
            Play
          </button>
        )}
      </div>
    </motion.div>
  )
}

/** Guardian-feed card: aurora style with relative time + confidence bar. */
export function FeedMessageCard({
  msg,
  emergencyStyle = false,
  onReply,
  replyOpen = false,
  replySent = false,
  onQuickReply,
  onCustomReply,
  onCancelReply,
}: {
  msg: VaakSetuMessage
  emergencyStyle?: boolean
  onReply?: () => void
  replyOpen?: boolean
  replySent?: boolean
  onQuickReply?: (chip: string) => void
  onCustomReply?: (text: string) => void
  onCancelReply?: () => void
}) {
  const isEmergency = emergencyStyle && msg.type === "message"
  const relative = useRelativeTime(msg.timestamp)
  const [customMode, setCustomMode] = useState(false)
  const [customText, setCustomText] = useState("")

  useEffect(() => {
    if (!replyOpen) setCustomMode(false)
  }, [replyOpen])

  const confColor =
    msg.type === "message" ? confidenceColor(msg.confidence) : tokens.text.secondary

  const cardStyle: CSSProperties = {
    position: "relative",
    overflow: "hidden",
    background: isEmergency
      ? `linear-gradient(135deg, rgba(255,61,110,0.14), rgba(124,58,237,0.08))`
      : "rgba(10,12,18,0.6)",
    backdropFilter: "blur(20px) saturate(150%)",
    WebkitBackdropFilter: "blur(20px) saturate(150%)",
    border: `1px solid ${isEmergency ? "rgba(255,61,110,0.6)" : tokens.border.hairline}`,
    borderRadius: 16,
    padding: "14px 16px 16px",
    fontFamily: FONT,
    color: tokens.text.primary,
    boxShadow: isEmergency
      ? "0 0 0 1px rgba(255,61,110,0.35), 0 0 32px rgba(255,61,110,0.25)"
      : "0 8px 32px rgba(0, 0, 0, 0.35)",
  }

  const avatarEmoji =
    msg.type === "message" ? (msg.emergency ? "🚨" : msg.pictograms[0]?.emoji ?? "💬") : "💬"

  return (
    <div style={cardStyle} aria-label={isEmergency ? `Emergency message: ${msg.text}` : undefined}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 40,
            height: 40,
            borderRadius: "50%",
            fontSize: 19,
            flexShrink: 0,
            background: isEmergency ? "rgba(255,61,110,0.18)" : tokens.bg.surface2,
            border: `1px solid ${isEmergency ? "rgba(255,61,110,0.5)" : tokens.border.soft}`,
          }}
        >
          {avatarEmoji}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 700,
              lineHeight: 1.35,
              overflowWrap: "anywhere",
            }}
          >
            {msg.type === "mood" ? `Mood update: ${msg.mood}` : msg.text}
          </p>
          <span
            style={{
              fontSize: 12,
              color: tokens.text.secondary,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {relative}
          </span>
        </div>
        {isEmergency && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "#FF3D6E",
              color: "#fff",
              borderRadius: RADIUS.pill,
              padding: "4px 12px",
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 1,
            }}
          >
            SOS
          </span>
        )}
      </div>

      {onReply && (
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onReply()
            }}
            aria-expanded={replyOpen}
            aria-label={`Reply to: ${msg.type === "mood" ? msg.mood : msg.text}`}
            style={{
              background: "transparent",
              border: "none",
              color: tokens.aurora.cyan,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              padding: "2px 0",
              minHeight: TAP_MIN,
              fontFamily: FONT,
            }}
          >
            ↩ Reply
          </button>

          <motion.div
            initial={false}
            animate={{ height: replyOpen ? "auto" : 0, opacity: replyOpen ? 1 : 0 }}
            transition={{ duration: 0.18 }}
            style={{ overflow: "hidden" }}
          >
            {customMode ? (
              <div style={{ display: "flex", gap: 8, paddingTop: 8 }}>
                <input
                  type="text"
                  autoFocus
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && onCustomReply) {
                      onCustomReply(customText)
                    }
                  }}
                  placeholder="Type your reply…"
                  aria-label="Custom reply text"
                  style={{
                    flex: 1,
                    minHeight: 42,
                    background: tokens.bg.surface,
                    color: tokens.text.primary,
                    border: `1px solid ${tokens.border.soft}`,
                    borderRadius: 10,
                    padding: "8px 12px",
                    fontSize: 15,
                    fontFamily: FONT,
                  }}
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (onCustomReply) onCustomReply(customText)
                  }}
                  style={{
                    background: tokens.aurora.emerald,
                    color: "#04291B",
                    border: "none",
                    borderRadius: 10,
                    padding: "8px 16px",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: "pointer",
                    minHeight: 42,
                    fontFamily: FONT,
                  }}
                >
                  Send
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (onCancelReply) onCancelReply()
                  }}
                  aria-label="Cancel reply"
                  style={{
                    background: "transparent",
                    color: tokens.text.secondary,
                    border: `1px solid ${tokens.border.soft}`,
                    borderRadius: 10,
                    padding: "8px 16px",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: "pointer",
                    minHeight: 42,
                    fontFamily: FONT,
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  paddingTop: 8,
                }}
                role="group"
                aria-label="Quick replies"
              >
                {["On my way", "I understand", "Stay calm"].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (onQuickReply) onQuickReply(chip)
                    }}
                    style={{
                      background: "rgba(0,224,255,0.08)",
                      color: tokens.aurora.cyan,
                      border: "1px solid rgba(0,224,255,0.35)",
                      borderRadius: 999,
                      padding: "7px 14px",
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: "pointer",
                      minHeight: 36,
                      fontFamily: FONT,
                    }}
                  >
                    {chip}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setCustomMode(true)
                  }}
                  style={{
                    background: "rgba(0,224,255,0.08)",
                    color: tokens.aurora.cyan,
                    border: "1px solid rgba(0,224,255,0.35)",
                    borderRadius: 999,
                    padding: "7px 14px",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: "pointer",
                    minHeight: 36,
                    fontFamily: FONT,
                  }}
                >
                  Custom...
                </button>
              </div>
            )}
          </motion.div>

          {replySent && (
            <motion.span
              role="status"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                display: "inline-block",
                marginTop: 10,
                background: tokens.aurora.emerald,
                color: "#04291B",
                borderRadius: 999,
                padding: "5px 14px",
                fontSize: 13,
                fontWeight: 800,
              }}
            >
              Reply sent ✓
            </motion.span>
          )}
        </div>
      )}

      {msg.type === "message" && msg.pictograms.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
            marginTop: 10,
          }}
          aria-label="Pictograms used"
        >
          {msg.pictograms.map((p) => (
            <span
              key={p.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: tokens.bg.surface2,
                border: `1px solid ${tokens.border.hairline}`,
                borderRadius: RADIUS.pill,
                padding: "3px 10px",
                fontSize: 12.5,
                fontWeight: 600,
                color: tokens.text.secondary,
              }}
            >
              <span aria-hidden="true">{p.emoji}</span> {p.label}
            </span>
          ))}
        </div>
      )}

      {/* 2px bottom confidence bar */}
      {msg.type === "message" && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 2,
            background: "rgba(255,255,255,0.05)",
          }}
          role="progressbar"
          aria-valuenow={Math.round(msg.confidence)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Prediction confidence"
        >
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, Math.max(0, msg.confidence))}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            style={{ height: "100%", background: confColor }}
          />
        </div>
      )}
    </div>
  )
}

export type { LucideIcon }
