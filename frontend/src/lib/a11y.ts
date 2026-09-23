/**
 * Accessibility settings + screen-reader announcer.
 *
 * Settings persist in localStorage and apply CSS classes on <html>:
 *   .a11y-text-large / .a11y-text-xl  — font-size scaling
 *   .a11y-reduce-motion               — kills non-essential animations
 *   .a11y-high-contrast               — stronger borders/text contrast
 *
 * The announcer is an aria-live="assertive" region mounted once; call
 * announce() for new-message, emergency, and status-change events.
 */

export type TextSize = "normal" | "large" | "xl"

export interface A11ySettings {
  textSize: TextSize
  reduceMotion: boolean
  soundEffects: boolean
  highContrast: boolean
}

const SETTINGS_KEY = "vaaksetu-a11y"

const DEFAULTS: A11ySettings = {
  textSize: "normal",
  reduceMotion: false,
  soundEffects: true,
  highContrast: false,
}

export function loadA11ySettings(): A11ySettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<A11ySettings>) }
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS }
}

export function saveA11ySettings(s: A11ySettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
  applyA11ySettings(s)
}

/** Applies settings as CSS classes on the document root. */
export function applyA11ySettings(s: A11ySettings): void {
  const root = document.documentElement
  root.classList.toggle("a11y-text-large", s.textSize === "large")
  root.classList.toggle("a11y-text-xl", s.textSize === "xl")
  root.classList.toggle("a11y-reduce-motion", s.reduceMotion)
  root.classList.toggle("a11y-high-contrast", s.highContrast)
}

/* ── Screen-reader announcer ────────────────────────────────────── */

let announcer: HTMLElement | null = null

function getAnnouncer(): HTMLElement | null {
  if (announcer) return announcer
  if (typeof document === "undefined") return null
  announcer = document.createElement("div")
  announcer.setAttribute("aria-live", "assertive")
  announcer.setAttribute("aria-atomic", "true")
  announcer.className = "sr-only"
  document.body.appendChild(announcer)
  return announcer
}

/** Announce a message to screen readers (assertive — important events). */
export function announce(text: string): void {
  const el = getAnnouncer()
  if (!el) return
  el.textContent = ""
  window.setTimeout(() => {
    el.textContent = text
  }, 30)
}
