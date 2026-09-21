/**
 * VaakSetu design system — Linear/Vercel-inspired dark UI tokens.
 * Single source of truth for the production visual language.
 */

export const ds = {
  colors: {
    bg: {
      primary: '#08090C',
      secondary: '#0F1117',
      tertiary: '#16181F',
      elevated: '#1A1D24',
    },
    border: {
      subtle: 'rgba(255,255,255,0.06)',
      default: 'rgba(255,255,255,0.10)',
      strong: 'rgba(255,255,255,0.16)',
    },
    text: {
      primary: '#F5F6F8',
      secondary: '#A1A5AE',
      tertiary: '#6B7280',
      disabled: '#3F434C',
    },
    brand: {
      primary: '#00E0FF',
      primaryHover: '#33E8FF',
      primarySubtle: 'rgba(0,224,255,0.10)',
      secondary: '#7C3AED',
      gradient: 'linear-gradient(135deg, #00E0FF 0%, #7C3AED 100%)',
    },
    semantic: {
      success: '#22C55E',
      warning: '#F59E0B',
      danger: '#EF4444',
      info: '#3B82F6',
    },
  },
  typography: {
    fontSans: '"Inter", -apple-system, system-ui, sans-serif',
    fontMono: '"JetBrains Mono", ui-monospace, monospace',
    size: { xs: 11, sm: 13, base: 15, md: 17, lg: 20, xl: 24, '2xl': 32, '3xl': 44, '4xl': 56 } as Record<string, number>,
    weight: { normal: 400, medium: 500, semibold: 600, bold: 700 } as Record<string, number>,
    tracking: { tight: '-0.02em', normal: '0', wide: '0.02em' } as Record<string, string>,
  },
  spacing: { xs: 4, sm: 8, md: 12, base: 16, lg: 24, xl: 32, '2xl': 48, '3xl': 64 } as Record<string, number>,
  radius: { sm: 6, base: 8, md: 12, lg: 16, xl: 20, pill: 999 } as Record<string, number>,
  shadow: {
    sm: '0 1px 2px rgba(0,0,0,0.4)',
    base: '0 4px 12px rgba(0,0,0,0.3)',
    lg: '0 12px 32px rgba(0,0,0,0.4)',
    glow: '0 0 0 3px rgba(0,224,255,0.15), 0 4px 12px rgba(0,224,255,0.2)',
  } as Record<string, string>,
  motion: {
    fast: { duration: 0.15, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] },
    base: { duration: 0.25, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] },
    slow: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  },
} as const

export type DesignSystem = typeof ds
