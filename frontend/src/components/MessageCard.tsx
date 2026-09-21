import { useEffect, useState } from "react"
import type { CSSProperties, ReactNode } from "react"
import { motion } from "motion/react"
import { Volume2 } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { VaakSetuMessage } from "../lib/messageBus"
import { COLORS, FONT, RADIUS, TAP_MIN } from "../theme"

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

const QUICK_REPLIES = ["On my way", "I understand", "Stay calm"]
const CUSTOM_LABEL = "Custom..."

function confidenceColor(confidence: number): string {
  if (confidence > 80) return COLORS.success
  if (confidence > 50) return COLORS.warning
  return COLORS.danger
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
}

const chipStyle: CSSProperties = {
  background: COLORS.accentSoft,
  color: COLORS.accent,
  border: `1px solid ${COLORS.accent}`,
  borderRadius: RADIUS.pill,
  padding: "7px 14px",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  minHeight: 36,
  fontFamily: FONT,
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
    background: isLeft ? "rgba(30, 41, 59, 0.72)" : "rgba(0, 116, 140, 0.32)",
    backdropFilter: "blur(20px) saturate(150%)",
    WebkitBackdropFilter: "blur(20px) saturate(150%)",
    border: `1px solid ${isLeft ? COLORS.borderGlass : "rgba(0, 180, 216, 0.4)"}`,
    borderRadius: RADIUS.lg,
    borderBottomLeftRadius: isLeft ? RADIUS.sm : RADIUS.lg,
    borderBottomRightRadius: isLeft ? RADIUS.lg : RADIUS.sm,
    padding: "12px 16px",
    boxShadow: "0 8px 24px rgba(2, 8, 20, 0.35)",
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
    background: isLeft ? "rgba(0, 180, 216, 0.14)" : "rgba(124, 58, 237, 0.18)",
    border: `1px solid ${isLeft ? "rgba(0, 180, 216, 0.4)" : "rgba(124, 58, 237, 0.4)"}`,
    boxShadow: "0 4px 14px rgba(2, 8, 20, 0.35)",
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
          color: isLeft ? COLORS.accentBright : "#C4B5FD",
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
            background:
              confColor === COLORS.success
                ? COLORS.successSoft
                : confColor === COLORS.warning
                  ? "rgba(250, 204, 21, 0.14)"
                  : COLORS.dangerSoft,
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
          color: COLORS.textDim,
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
              color: COLORS.textDim,
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
              color: COLORS.accentBright,
              border: `1px solid rgba(0, 180, 216, 0.4)`,
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

/** Guardian-feed card: full-width emergency aware variant. */
export function FeedMessageCard({
  msg,
  onReply,
  replyOpen = false,
  replySent = false,
  onQuickReply,
  onCustomReply,
  onCancelReply,
}: {
  msg: VaakSetuMessage
  onReply?: () => void
  replyOpen?: boolean
  replySent?: boolean
  onQuickReply?: (chip: string) => void
  onCustomReply?: (text: string) => void
  onCancelReply?: () => void
}) {
  const isEmergency = msg.type === "message" && Boolean(msg.emergency)
  const [customMode, setCustomMode] = useState(false)
  const [customText, setCustomText] = useState("")

  useEffect(() => {
    if (!replyOpen) setCustomMode(false)
  }, [replyOpen])

  const confColor =
    msg.type === "message" ? confidenceColor(msg.confidence) : COLORS.textDim

  const cardStyle: CSSProperties = {
    background: isEmergency ? "rgba(239, 68, 68, 0.10)" : "rgba(30, 41, 59, 0.55)",
    backdropFilter: "blur(20px) saturate(150%)",
    WebkitBackdropFilter: "blur(20px) saturate(150%)",
    border: `1px solid ${isEmergency ? COLORS.danger : COLORS.borderGlass}`,
    borderLeft: `6px solid ${isEmergency ? COLORS.danger : COLORS.accent}`,
    borderRadius: RADIUS.lg,
    padding: "16px 18px",
    fontFamily: FONT,
    color: COLORS.text,
    boxShadow: "0 8px 32px rgba(2, 8, 20, 0.35)",
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -28, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      style={cardStyle}
      role="listitem"
      aria-label={
        isEmergency
          ? `Emergency message: ${msg.text}`
          : msg.type === "message"
            ? `Message: ${msg.text}`
            : undefined
      }
    >
      {isEmergency && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: COLORS.danger,
            color: "#fff",
            borderRadius: RADIUS.pill,
            padding: "4px 12px",
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: 1,
            marginBottom: 10,
          }}
        >
          🚨 EMERGENCY SOS
        </div>
      )}

      <p
        style={{
          margin: 0,
          fontSize: isEmergency ? 30 : 26,
          fontWeight: 800,
          lineHeight: 1.3,
        }}
      >
        {msg.type === "mood" ? `Mood update: ${msg.mood}` : msg.text}
      </p>

      {msg.type === "message" && msg.pictograms.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
            marginTop: 12,
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
                background: "rgba(148, 163, 184, 0.12)",
                border: `1px solid ${COLORS.border}`,
                borderRadius: RADIUS.pill,
                padding: "3px 10px",
                fontSize: 13,
                fontWeight: 600,
                color: COLORS.textDim,
              }}
            >
              <span aria-hidden="true">{p.emoji}</span> {p.label}
            </span>
          ))}
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginTop: 12,
        }}
      >
        {msg.type === "message" && (
          <>
            <div
              style={{
                flex: 1,
                height: 8,
                background: "rgba(148, 163, 184, 0.15)",
                borderRadius: RADIUS.pill,
                overflow: "hidden",
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
                style={{ height: "100%", background: confColor, borderRadius: RADIUS.pill }}
              />
            </div>
            <span
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: confColor,
                minWidth: 44,
                textAlign: "right",
              }}
            >
              {Math.round(msg.confidence)}%
            </span>
          </>
        )}
        <span
          style={{
            marginLeft: msg.type === "message" ? 0 : "auto",
            fontSize: 13,
            color: COLORS.textDim,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatTime(msg.timestamp)}
        </span>
      </div>

      {onReply && (
        <div style={{ marginTop: 12 }}>
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
              color: COLORS.accent,
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
                    background: "rgba(10, 25, 41, 0.6)",
                    color: COLORS.text,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: RADIUS.sm,
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
                    ...chipStyle,
                    background: COLORS.success,
                    color: "#04291B",
                    border: "none",
                    borderRadius: RADIUS.sm,
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
                  style={{ ...chipStyle, color: COLORS.textDim, borderColor: COLORS.border }}
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
                {QUICK_REPLIES.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (onQuickReply) onQuickReply(chip)
                    }}
                    style={chipStyle}
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
                  style={chipStyle}
                >
                  {CUSTOM_LABEL}
                </button>
              </div>
            )}
          </motion.div>

          <motion.div
            role="status"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: replySent ? 1 : 0, y: replySent ? 0 : 6 }}
            transition={{ duration: 0.2 }}
            style={{
              display: "inline-block",
              marginTop: 10,
              background: COLORS.success,
              color: "#04291B",
              borderRadius: RADIUS.pill,
              padding: "5px 14px",
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            Reply sent ✓
          </motion.div>
        </div>
      )}
    </motion.div>
  )
}

export type { LucideIcon }
