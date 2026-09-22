import { useEffect, useState } from "react"
import type { CSSProperties, ReactNode } from "react"
import { Link, useLocation } from "react-router-dom"
import { motion } from "motion/react"
import { Home, MessagesSquare, Hand, HeartHandshake, BarChart3, Settings, Command as CommandIcon } from "lucide-react"
import Pulse from "./ui/Pulse"
import { tokens } from "../styles/tokens"

export const NAV_HEIGHT = 56

const LINKS = [
  { to: "/user", label: "User", icon: Home },
  { to: "/conversation", label: "Conversation", icon: MessagesSquare },
  { to: "/sign", label: "Sign", icon: Hand },
  { to: "/guardian", label: "Guardian", icon: HeartHandshake },
  { to: "/admin", label: "Admin", icon: BarChart3 },
]

/** Bridge + waveform logo, cyan→violet gradient. */
export function VaakSetuLogo({ size = 26 }: { size?: number }) {
  const id = "vsk"
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="2" y1="4" x2="30" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor={tokens.aurora.cyan} />
          <stop offset="1" stopColor={tokens.aurora.violet} />
        </linearGradient>
      </defs>
      {/* bridge deck + towers */}
      <path d="M3 20h26M6 20v-8M26 20v-8M6 12c4-5 16-5 20 0" stroke={`url(#${id})`} strokeWidth="2.2" strokeLinecap="round" />
      {/* waveform */}
      <path d="M9 25v-3M13 26v-5M17 27v-7M21 26v-5M25 25v-3" stroke={`url(#${id})`} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

interface Props {
  /** Right-aligned content (status pills, buttons, etc.). */
  right?: ReactNode
}

const headerStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 40,
  height: NAV_HEIGHT,
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "0 16px",
  background: "rgba(5,6,10,0.6)",
  backdropFilter: "blur(20px) saturate(150%)",
  WebkitBackdropFilter: "blur(20px) saturate(150%)",
  borderBottom: `1px solid ${tokens.border.hairline}`,
  fontFamily: "'Inter Display', system-ui, sans-serif",
}

/** Sticky aurora navigation shared by all dashboards. */
export function TopNav({ right }: Props) {
  const { pathname } = useLocation()
  const [avatarHover, setAvatarHover] = useState(false)

  // Open the command palette on ⌘K / Ctrl+K.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent("vaaksetu:command-palette"))
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      style={headerStyle}
    >
      <Link
        to="/"
        aria-label="VaakSetu home — choose a role"
        style={{ display: "inline-flex", alignItems: "center", gap: 9, textDecoration: "none", color: tokens.text.primary, minHeight: 40 }}
      >
        <VaakSetuLogo />
        <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: 0.2 }}>VaakSetu</span>
        <span
          aria-hidden="true"
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.8,
            color: tokens.aurora.cyan,
            border: `1px solid rgba(0,224,255,0.45)`,
            borderRadius: 999,
            padding: "1px 7px",
          }}
        >
          v2.0
        </span>
      </Link>

      <nav aria-label="Primary" style={{ display: "flex", gap: 2, marginLeft: 8 }}>
        {LINKS.map(({ to, label, icon: Icon }) => {
          const active = pathname.startsWith(to)
          return (
            <Link
              key={to}
              to={to}
              aria-current={active ? "page" : undefined}
              style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                minHeight: 36,
                padding: "6px 12px",
                borderRadius: 10,
                textDecoration: "none",
                fontSize: 13,
                fontWeight: 600,
                color: active ? tokens.aurora.cyan : tokens.text.secondary,
                border: `1px solid ${active ? "rgba(0,224,255,0.35)" : "transparent"}`,
                transition: "color 0.15s ease",
              }}
            >
              {active && (
                <motion.span
                  layoutId="nav-pill"
                  transition={tokens.spring.gentle}
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: 10,
                    background: "rgba(0,224,255,0.1)",
                  }}
                />
              )}
              <Icon size={15} strokeWidth={2.4} aria-hidden="true" style={{ position: "relative" }} />
              <span style={{ position: "relative" }}>{label}</span>
            </Link>
          )
        })}
      </nav>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
        {right}
        <span title="All systems live" style={{ display: "inline-flex", alignItems: "center" }}>
          <Pulse color="green" size={8} />
        </span>
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 11,
            fontWeight: 600,
            color: tokens.text.secondary,
            background: tokens.bg.surface2,
            border: `1px solid ${tokens.border.hairline}`,
            borderRadius: 7,
            padding: "3px 8px",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          <CommandIcon size={11} aria-hidden="true" /> K
        </span>
        <Link
          to="/user"
          aria-label="Settings"
          style={{ display: "inline-flex", alignItems: "center", color: tokens.text.secondary, minHeight: 40 }}
        >
          <Settings size={16} strokeWidth={2.2} />
        </Link>
        <button
          type="button"
          aria-label="Account"
          onMouseEnter={() => setAvatarHover(true)}
          onMouseLeave={() => setAvatarHover(false)}
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
            color: "#000",
            background: `linear-gradient(135deg, ${tokens.aurora.cyan}, ${tokens.aurora.violet})`,
            border: "none",
            padding: 0,
            boxShadow: avatarHover ? `0 0 0 2px ${tokens.bg.base}, 0 0 0 3.5px ${tokens.aurora.cyan}` : "none",
            transition: "box-shadow 0.2s ease",
          }}
        >
          V
        </button>
      </div>
    </motion.header>
  )
}

export default TopNav
