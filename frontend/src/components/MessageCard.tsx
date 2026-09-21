import { useEffect, useState } from "react"
import type { CSSProperties } from "react"
import { AnimatePresence, motion } from "motion/react"
import type { VaakSetuMessage } from "../lib/messageBus"
import { COLORS, FONT } from "../theme"

interface Props {
  msg: VaakSetuMessage
  /** Toggle the quick-reply row for this card. */
  onReply?: () => void
  replyOpen?: boolean
  /** Show the green "Reply sent ✓" toast on this card. */
  replySent?: boolean
  /** Fire a quick-reply chip ("On my way", "I understand", "Stay calm"). */
  onQuickReply?: (chip: string) => void
  /** Fire a custom typed reply. */
  onCustomReply?: (text: string) => void
  /** Close the reply row (input mode). */
  onCancelReply?: () => void
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
    second: "2-digit",
    hour12: false,
  })
}

const chipStyle: CSSProperties = {
  background: COLORS.accentSoft,
  color: COLORS.accent,
  border: `1px solid ${COLORS.accent}`,
  borderRadius: 999,
  padding: "7px 14px",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  minHeight: 36,
  fontFamily: FONT,
}

export function MessageCard({
  msg,
  onReply,
  replyOpen = false,
  replySent = false,
  onQuickReply,
  onCustomReply,
  onCancelReply,
}: Props) {
  const isEmergency = msg.type === "message" && Boolean(msg.emergency)
  const [customMode, setCustomMode] = useState(false)
  const [customText, setCustomText] = useState("")

  // Reset the custom input whenever the row closes.
  useEffect(() => {
    if (!replyOpen) setCustomMode(false)
  }, [replyOpen])

  const confColor = confidenceColor(msg.type === "message" ? msg.confidence : 0)

  const cardStyle: CSSProperties = {
    background: isEmergency ? "rgba(239, 68, 68, 0.10)" : COLORS.card,
    border: `1px solid ${isEmergency ? COLORS.danger : COLORS.border}`,
    borderLeft: `6px solid ${isEmergency ? COLORS.danger : COLORS.accent}`,
    borderRadius: 16,
    padding: "16px 18px",
    fontFamily: FONT,
    color: COLORS.text,
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -28, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
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
            borderRadius: 999,
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
                borderRadius: 999,
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
                borderRadius: 999,
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
                style={{ height: "100%", background: confColor, borderRadius: 999 }}
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

      {/* Reply UI (Feature 2) */}
      {onReply && (
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onReply()
            }}
            aria-expanded={replyOpen}
            aria-label={`Reply to: ${
              msg.type === "mood" ? msg.mood : msg.text
            }`}
            style={{
              background: "transparent",
              border: "none",
              color: COLORS.accent,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              padding: "2px 0",
              fontFamily: FONT,
            }}
          >
            ↩ Reply
          </button>

          <AnimatePresence initial={false}>
            {replyOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
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
                        ...chipStyle,
                        background: COLORS.success,
                        color: "#04291B",
                        border: "none",
                        borderRadius: 10,
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
            )}
          </AnimatePresence>

          <AnimatePresence>
            {replySent && (
              <motion.div
                role="status"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{
                  display: "inline-block",
                  marginTop: 10,
                  background: COLORS.success,
                  color: "#04291B",
                  borderRadius: 999,
                  padding: "5px 14px",
                  fontSize: 13,
                  fontWeight: 800,
                }}
              >
                Reply sent ✓
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  )
}
