import type { CSSProperties } from "react"
import { ds } from "./styles/design-system"

/**
 * Shared palette + focus styles for all VaakSetu screens.
 * Values derive from the design system (src/styles/design-system.ts);
 * legacy keys keep their names so existing pages render unchanged.
 */
export const COLORS = {
  bg: ds.colors.bg.primary,
  card: ds.colors.bg.elevated,
  cardGlass: "rgba(22, 24, 31, 0.62)",
  accent: "#00E0FF",
  accentBright: "#33E8FF",
  accentDeep: "#0090A8",
  accentSoft: ds.colors.brand.primarySubtle,
  violet: ds.colors.brand.secondary,
  border: ds.colors.border.default,
  borderGlass: ds.colors.border.subtle,
  text: ds.colors.text.primary,
  textDim: ds.colors.text.secondary,
  danger: ds.colors.semantic.danger,
  dangerSoft: "rgba(239, 68, 68, 0.14)",
  success: ds.colors.semantic.success,
  successSoft: "rgba(34, 197, 94, 0.14)",
  warning: ds.colors.semantic.warning,
} as const

export const FONT = ds.typography.fontSans
export const FONT_MONO = ds.typography.fontMono

/** Corner radius scale (16px = standard glass card). */
export const RADIUS = {
  sm: ds.radius.sm,
  md: ds.radius.md,
  lg: ds.radius.lg,
  xl: ds.radius.xl,
  pill: ds.radius.pill,
} as const

/** Elevation shadows for glass surfaces. */
export const SHADOW = {
  sm: ds.shadow.sm,
  md: ds.shadow.base,
  lg: ds.shadow.lg,
  accentGlow: ds.shadow.glow,
  dangerGlow: "0 8px 30px rgba(239, 68, 68, 0.45)",
} as const

/** Teal gradient for primary buttons / hero accents. */
export const GRADIENT = {
  teal: ds.colors.brand.gradient,
  tealText: "#04121F",
  aurora: `radial-gradient(circle at 20% 20%, ${ds.colors.brand.primarySubtle}, transparent 55%), radial-gradient(circle at 80% 80%, rgba(124,58,237,0.10), transparent 55%)`,
} as const

/** Standard glass card surface. */
export function glassStyle(strong = false): CSSProperties {
  return strong
    ? {
        background: "rgba(15, 17, 23, 0.85)",
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
        border: `1px solid ${ds.colors.border.default}`,
        borderRadius: RADIUS.lg,
        boxShadow: ds.shadow.lg,
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
