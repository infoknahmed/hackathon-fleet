import { motion } from "motion/react"
import type { CSSProperties, ReactNode } from "react"

/** Shared page entrance transition (Motion honors prefers-reduced-motion). */
export default function PageShell({
  children,
  style,
}: {
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      style={{ minHeight: "100vh", display: "flex", flexDirection: "column", ...style }}
    >
      {children}
    </motion.div>
  )
}
