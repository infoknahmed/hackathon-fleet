import type { ReactNode, CSSProperties } from "react"
import { motion } from "motion/react"
import { COLORS, FONT } from "../theme"

interface Props {
  icon: string
  label: string
  value: ReactNode
  accent?: string
}

export function StatCard({ icon, label, value, accent = COLORS.accent }: Props) {
  const style: CSSProperties = {
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    borderTop: `3px solid ${accent}`,
    borderRadius: 16,
    padding: "20px 22px",
    minWidth: 210,
    flex: 1,
    fontFamily: FONT,
    color: COLORS.text,
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      style={style}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: COLORS.textDim,
        }}
      >
        <span aria-hidden="true">{icon}</span> {label}
      </div>
      <div
        style={{
          fontSize: 42,
          fontWeight: 800,
          lineHeight: 1.15,
          marginTop: 6,
          color: accent,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </motion.div>
  )
}
