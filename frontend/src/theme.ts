import type { CSSProperties } from "react"

/** Shared palette + focus styles for all VaakSetu screens. */
export const COLORS = {
  bg: "#0A1929",
  card: "#1E293B",
  cardGlass: "rgba(30, 41, 59, 0.55)",
  accent: "#00B4D8",
  accentBright: "#22D3EE",
  accentDeep: "#0891B2",
  accentSoft: "rgba(0, 180, 216, 0.14)",
  violet: "#7C3AED",
  border: "#334155",
  borderGlass: "rgba(148, 163, 184, 0.16)",
  text: "#F1F5F9",
  textDim: "#94A3B8",
  danger: "#EF4444",
  dangerSoft: "rgba(239, 68, 68, 0.14)",
  success: "#10B981",
  successSoft: "rgba(16, 185, 129, 0.14)",
  warning: "#FACC15",
} as const

export const FONT =
  "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

/** Corner radius scale (16px = standard glass card). */
export const RADIUS = {
  sm: 10,
  md: 14,
  lg: 16,
  xl: 20,
  pill: 999,
} as const

/** Elevation shadows for glass surfaces. */
export const SHADOW = {
  sm: "0 4px 16px rgba(2, 8, 20, 0.3)",
  md: "0 8px 32px rgba(2, 8, 20, 0.35), inset 0 1px 0 rgba(255,255,255,0.05)",
  lg: "0 12px 40px rgba(2, 8, 20, 0.45), inset 0 1px 0 rgba(255,255,255,0.06)",
  accentGlow: `0 8px 24px rgba(0, 180, 216, 0.35)`,
  dangerGlow: "0 8px 30px rgba(239, 68, 68, 0.45)",
} as const

/** Teal gradient for primary buttons / hero accents. */
export const GRADIENT = {
  teal: "linear-gradient(135deg, #22D3EE 0%, #00B4D8 45%, #0891B2 100%)",
  tealText: "#04121F",
  aurora: "radial-gradient(circle at 20% 20%, rgba(0,180,216,0.10), transparent 55%), radial-gradient(circle at 80% 80%, rgba(124,58,237,0.10), transparent 55%)",
} as const

/** Standard glass card surface. */
export function glassStyle(strong = false): CSSProperties {
  return strong
    ? {
        background: "rgba(23, 34, 51, 0.78)",
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
        border: `1px solid rgba(148, 163, 184, 0.18)`,
        borderRadius: RADIUS.lg,
        boxShadow: SHADOW.lg,
      }
    : {
        background: COLORS.cardGlass,
        backdropFilter: "blur(20px) saturate(150%)",
        WebkitBackdropFilter: "blur(20px) saturate(150%)",
        border: `1px solid ${COLORS.borderGlass}`,
        borderRadius: RADIUS.lg,
        boxShadow: SHADOW.md,
      }
}

/** Hover lift for interactive glass cards. */
export const glassHover: CSSProperties = {
  transition:
    "transform 0.22s cubic-bezier(0.22,1,0.36,1), border-color 0.22s ease, box-shadow 0.22s ease",
}

/** Minimum accessible tap target. */
export const TAP_MIN = 48

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
