import type { ReactNode, CSSProperties } from "react"
import { motion } from "motion/react"
import type { LucideIcon } from "lucide-react"
import { COLORS, FONT, RADIUS } from "../theme"

interface Props {
  /** Emoji string or a Lucide icon component. */
  icon: string | LucideIcon
  label: string
  value: ReactNode
  accent?: string
}

export function StatCard({ icon, label, value, accent = COLORS.accent }: Props) {
  const Icon = typeof icon === "string" ? null : icon

  const iconEl: ReactNode = Icon ? (
    <Icon size={18} strokeWidth={2.4} style={{ color: accent }} aria-hidden="true" />
  ) : (
    <span aria-hidden="true">{icon as string}</span>
  )

  const style: CSSProperties = {
    background: "rgba(30, 41, 59, 0.55)",
    backdropFilter: "blur(20px) saturate(150%)",
    WebkitBackdropFilter: "blur(20px) saturate(150%)",
    border: `1px solid ${COLORS.borderGlass}`,
    borderTop: `3px solid ${accent}`,
    borderRadius: RADIUS.lg,
    padding: "20px 22px",
    minWidth: 210,
    flex: 1,
    fontFamily: FONT,
    color: COLORS.text,
    boxShadow: "0 8px 32px rgba(2, 8, 20, 0.35), inset 0 1px 0 rgba(255,255,255,0.05)",
    transition:
      "transform 0.22s cubic-bezier(0.22,1,0.36,1), border-color 0.22s ease, box-shadow 0.22s ease",
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      whileHover={{ y: -2 }}
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
        {iconEl} {label}
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
