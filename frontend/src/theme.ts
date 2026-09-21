import type { CSSProperties } from "react"

/** Shared palette + focus styles for all VaakSetu screens. */
export const COLORS = {
  bg: "#0A1929",
  card: "#1E293B",
  accent: "#00B4D8",
  accentSoft: "rgba(0, 180, 216, 0.14)",
  border: "#334155",
  text: "#F1F5F9",
  textDim: "#94A3B8",
  danger: "#EF4444",
  dangerSoft: "rgba(239, 68, 68, 0.14)",
  success: "#10B981",
  successSoft: "rgba(16, 185, 129, 0.14)",
  warning: "#FACC15",
} as const

export const FONT =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

/** Visible focus ring for keyboard users (applied to every interactive element). */
export const focusRing: CSSProperties = {
  outline: "none",
}
export const focusRingClass = `
  :where(button, a, [role="button"], input, select):focus-visible {
    outline: 3px solid ${COLORS.accent};
    outline-offset: 2px;
  }
`
