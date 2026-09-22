import { motion, AnimatePresence } from "motion/react"
import { X } from "lucide-react"
import { tokens } from "../styles/tokens"
import { FONT } from "../theme"

export interface Pictogram {
  id: string
  label: string
  emoji: string
  aria: string
}

export const PICTOGRAMS: Pictogram[] = [
  { id: "yes", label: "Yes", emoji: "👍", aria: "Yes" },
  { id: "no", label: "No", emoji: "👎", aria: "No" },
  { id: "water", label: "Water", emoji: "💧", aria: "Water" },
  { id: "food", label: "Food", emoji: "🍛", aria: "Food" },
  { id: "toilet", label: "Toilet", emoji: "🚽", aria: "Toilet" },
  { id: "pain", label: "Pain", emoji: "🤕", aria: "Pain" },
  { id: "help", label: "Help", emoji: "🆘", aria: "Help" },
  { id: "family", label: "Family", emoji: "👨‍👩‍👧", aria: "Family" },
  { id: "more", label: "More", emoji: "➕", aria: "More" },
]

export const MAX_SELECTION = 3

interface Props {
  selected: Pictogram[]
  onSelect: (p: Pictogram) => void
  /** Grid column count (default 3). */
  columns?: number
  /** Compact tiles for the conversation panel (default false). */
  compact?: boolean
}

export function PictogramGrid({ selected, onSelect, columns = 3, compact = false }: Props) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: compact ? 8 : 12,
        fontFamily: FONT,
      }}
      role="group"
      aria-label="Pictogram grid"
    >
      {PICTOGRAMS.map((p, i) => {
        const isSelected = selected.some((s) => s.id === p.id)
        return (
          <motion.button
            key={p.id}
            type="button"
            onClick={() => onSelect(p)}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.94 }}
            aria-pressed={isSelected}
            aria-label={p.aria}
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: compact ? 4 : 8,
              height: compact ? 84 : 160,
              padding: compact ? 8 : 12,
              cursor: "pointer",
              WebkitTapHighlightColor: "transparent",
              touchAction: "manipulation",
              fontFamily: FONT,
              color: tokens.text.primary,
              background: isSelected ? "rgba(0,224,255,0.07)" : "rgba(10,12,18,0.6)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: `1px solid ${isSelected ? "rgba(0,224,255,0.6)" : tokens.border.hairline}`,
              borderRadius: compact ? 14 : 20,
              boxShadow: isSelected
                ? `0 0 24px rgba(0,224,255,0.18), inset 0 0 18px rgba(0,224,255,0.06)`
                : "0 4px 16px rgba(0,0,0,0.35)",
            }}
          >
            {/* hover gradient border (hidden until :hover via group) */}
            <span
              aria-hidden="true"
              className="picto-gradient-ring"
              style={{ position: "absolute", inset: 0, borderRadius: "inherit", padding: 1, pointerEvents: "none", opacity: 0, transition: "opacity 0.2s ease",
                background: `linear-gradient(135deg, ${tokens.aurora.cyan}, ${tokens.aurora.violet}, ${tokens.aurora.magenta})`,
                WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                WebkitMaskComposite: "xor",
                maskComposite: "exclude",
              }}
            />
            <span style={{ fontSize: compact ? 28 : 56, lineHeight: 1 }} aria-hidden="true">
              {p.emoji}
            </span>
            <span style={{ fontSize: compact ? 14 : 15, fontWeight: 600, color: isSelected ? tokens.aurora.cyan : tokens.text.secondary }}>
              {p.label}
            </span>

            {isSelected && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: `linear-gradient(135deg, ${tokens.aurora.cyan}, ${tokens.aurora.violet})`,
                  color: "#000",
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                ✓
              </motion.span>
            )}
          </motion.button>
        )
      })}
    </div>
  )
}

/** Animated selection chips shown above the grid — with remove buttons. */
export function SelectionChips({
  selected,
  onRemove,
  max = MAX_SELECTION,
}: {
  selected: Pictogram[]
  /** Optional remove handler; renders ✕ buttons when provided. */
  onRemove?: (p: Pictogram) => void
  max?: number
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flex: 1 }}>
      <AnimatePresence initial={false}>
        {selected.map((s) => (
          <motion.span
            key={s.id}
            layout
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.15 }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(0,224,255,0.09)",
              color: tokens.text.primary,
              border: "1px solid rgba(0,224,255,0.45)",
              borderRadius: 999,
              padding: onRemove ? "5px 7px 5px 13px" : "8px 14px",
              fontSize: 17,
              fontWeight: 700,
              whiteSpace: "nowrap",
              fontFamily: FONT,
            }}
          >
            <span aria-hidden="true">{s.emoji}</span> {s.label}
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(s)}
                aria-label={`Remove ${s.label} from the sentence`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 24,
                  height: 24,
                  minHeight: 24,
                  borderRadius: "50%",
                  border: "none",
                  cursor: "pointer",
                  background: "rgba(255,255,255,0.08)",
                  color: tokens.text.secondary,
                  padding: 0,
                }}
              >
                <X size={13} strokeWidth={2.6} aria-hidden="true" />
              </button>
            )}
          </motion.span>
        ))}
      </AnimatePresence>
      {selected.length === 0 && (
        <span style={{ color: tokens.text.secondary, fontSize: 15, fontWeight: 500 }}>
          Tap {max} pictograms below…
        </span>
      )}
      {selected.length > 0 &&
        selected.length < max &&
        Array.from({ length: max - selected.length }).map((_, i) => (
          <span
            key={`slot-${i}`}
            aria-hidden="true"
            style={{
              color: tokens.text.tertiary,
              border: `1px dashed ${tokens.border.strong}`,
              borderRadius: 999,
              padding: "8px 14px",
              fontSize: 14,
              letterSpacing: 2,
            }}
          >
            ···
          </span>
        ))}
    </div>
  )
}
