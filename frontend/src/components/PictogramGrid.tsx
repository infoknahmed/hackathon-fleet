import { motion, AnimatePresence } from "motion/react"
import { COLORS, FONT, RADIUS, TAP_MIN } from "../theme"

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
      {PICTOGRAMS.map((p) => {
        const isSelected = selected.some((s) => s.id === p.id)
        return (
          <motion.button
            key={p.id}
            type="button"
            onClick={() => onSelect(p)}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.95 }}
            animate={
              isSelected
                ? {
                    scale: 1.02,
                    boxShadow: `0 0 24px 4px ${COLORS.accentSoft}, 0 0 0 2px ${COLORS.accent}`,
                  }
                : {
                    scale: 1,
                    boxShadow:
                      "0 4px 16px rgba(2, 8, 20, 0.3), 0 0 0 1px rgba(148,163,184,0.16)",
                  }
            }
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: compact ? 4 : 8,
              background: isSelected
                ? "rgba(0, 180, 216, 0.14)"
                : "rgba(30, 41, 59, 0.55)",
              backdropFilter: "blur(20px) saturate(150%)",
              WebkitBackdropFilter: "blur(20px) saturate(150%)",
              color: COLORS.text,
              border: isSelected
                ? `2px solid ${COLORS.accent}`
                : "2px solid rgba(148, 163, 184, 0.14)",
              borderRadius: compact ? RADIUS.md : 18,
              minHeight: compact ? 78 : 110,
              padding: compact ? 8 : 12,
              cursor: "pointer",
              WebkitTapHighlightColor: "transparent",
              touchAction: "manipulation",
              fontFamily: FONT,
            }}
            aria-pressed={isSelected}
            aria-label={p.aria}
          >
            <span
              style={{ fontSize: compact ? 28 : 44, lineHeight: 1 }}
              aria-hidden="true"
            >
              {p.emoji}
            </span>
            <span style={{ fontSize: compact ? 14 : 19, fontWeight: 700 }}>
              {p.label}
            </span>
          </motion.button>
        )
      })}
    </div>
  )
}

/** Animated selection chips shown above the grid. */
export function SelectionChips({
  selected,
  max = MAX_SELECTION,
}: {
  selected: Pictogram[]
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
              background: COLORS.accentSoft,
              color: COLORS.text,
              border: `1px solid ${COLORS.accent}`,
              borderRadius: RADIUS.pill,
              padding: "8px 14px",
              fontSize: 18,
              fontWeight: 700,
              whiteSpace: "nowrap",
              fontFamily: FONT,
            }}
          >
            <span aria-hidden="true">{s.emoji}</span> {s.label}
          </motion.span>
        ))}
      </AnimatePresence>
      {selected.length === 0 && (
        <span style={{ color: COLORS.textDim, fontSize: 16, fontWeight: 500 }}>
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
              color: COLORS.textDim,
              border: `1px dashed ${COLORS.border}`,
              borderRadius: RADIUS.pill,
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

export { TAP_MIN }
