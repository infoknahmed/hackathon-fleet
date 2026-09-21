import type { ReactNode } from "react"
import { Link, useLocation } from "react-router-dom"
import { motion } from "motion/react"
import { Home, MessagesSquare, HeartHandshake, BarChart3 } from "lucide-react"
import { COLORS, FONT, RADIUS, SHADOW, TAP_MIN } from "../theme"

const LINKS = [
  { to: "/user", label: "User", icon: Home },
  { to: "/conversation", label: "Conversation", icon: MessagesSquare },
  { to: "/guardian", label: "Guardian", icon: HeartHandshake },
  { to: "/admin", label: "Admin", icon: BarChart3 },
]

interface Props {
  /** Right-aligned content (status pills, buttons, etc.). */
  right?: ReactNode
}

/** Sticky glassmorphism navigation shared by all dashboards. */
export function TopNav({ right }: Props) {
  const { pathname } = useLocation()

  return (
    <motion.header
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        padding: "10px 16px",
        background: "rgba(10, 25, 41, 0.72)",
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
        borderBottom: `1px solid ${COLORS.borderGlass}`,
        boxShadow: SHADOW.sm,
        fontFamily: FONT,
      }}
    >
      <Link
        to="/"
        aria-label="VaakSetu home — choose a role"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          textDecoration: "none",
          color: COLORS.text,
          minHeight: TAP_MIN,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 38,
            height: 38,
            borderRadius: RADIUS.md,
            background: `linear-gradient(135deg, ${COLORS.accentBright}, ${COLORS.accentDeep})`,
            fontSize: 20,
            boxShadow: "0 4px 14px rgba(0, 180, 216, 0.4)",
          }}
          aria-hidden="true"
        >
          🗣️
        </span>
        <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: 0.3 }}>
          VaakSetu
        </span>
      </Link>

      <nav
        aria-label="Primary"
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          marginLeft: 4,
        }}
      >
        {LINKS.map(({ to, label, icon: Icon }) => {
          const active = pathname.startsWith(to)
          return (
            <Link
              key={to}
              to={to}
              aria-current={active ? "page" : undefined}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                minHeight: TAP_MIN,
                padding: "8px 14px",
                borderRadius: RADIUS.pill,
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: 0.2,
                color: active ? COLORS.accentBright : COLORS.textDim,
                background: active ? COLORS.accentSoft : "transparent",
                border: `1px solid ${active ? "rgba(0, 180, 216, 0.45)" : "transparent"}`,
                transition:
                  "color 0.18s ease, background 0.18s ease, border-color 0.18s ease, transform 0.18s ease",
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.color = COLORS.text
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.color = COLORS.textDim
              }}
            >
              <Icon size={16} strokeWidth={2.4} aria-hidden="true" />
              {label}
            </Link>
          )
        })}
      </nav>

      <div
        style={{
          marginLeft: "auto",
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        {right}
      </div>
    </motion.header>
  )
}

export default TopNav
