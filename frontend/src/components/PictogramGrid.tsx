import { motion, AnimatePresence } from "motion/react"
import { COLORS, FONT } from "../theme"

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
}

export function PictogramGrid({ selected, onSelect }: Props) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 12,
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
                      "0 0 0 0 rgba(0,0,0,0), 0 0 0 1px rgba(51,65,85,0.9)",
                  }
            }
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              background: COLORS.card,
              color: COLORS.text,
              border: isSelected ? `2px solid ${COLORS.accent}` : "2px solid transparent",
              borderRadius: 18,
              minHeight: 110,
              padding: 12,
              cursor: "pointer",
              WebkitTapHighlightColor: "transparent",
              touchAction: "manipulation",
              fontFamily: FONT,
            }}
            aria-pressed={isSelected}
            aria-label={p.aria}
          >
            <span style={{ fontSize: 44, lineHeight: 1 }} aria-hidden="true">
              {p.emoji}
            </span>
            <span style={{ fontSize: 19, fontWeight: 700 }}>{p.label}</span>
          </motion.button>
        )
      })}
    </div>
  )
}

/** Animated selection chips shown above the grid. */
export function SelectionChips({ selected }: { selected: Pictogram[] }) {
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
              borderRadius: 999,
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
          Tap {MAX_SELECTION} pictograms below…
        </span>
      )}
      {selected.length > 0 &&
        selected.length < MAX_SELECTION &&
        Array.from({ length: MAX_SELECTION - selected.length }).map((_, i) => (
          <span
            key={`slot-${i}`}
            aria-hidden="true"
            style={{
              color: COLORS.textDim,
              border: `1px dashed ${COLORS.border}`,
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
