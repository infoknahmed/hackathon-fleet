import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "motion/react"
import { COLORS, FONT } from "../theme"

const ROLES = [
  {
    path: "/user",
    icon: "👤",
    title: "I am a User",
    desc: "Tap pictograms to speak",
    aria: "Continue as user — open the communication dashboard",
  },
  {
    path: "/guardian",
    icon: "👨‍👩‍👧",
    title: "I am a Guardian",
    desc: "Watch the live message feed",
    aria: "Continue as guardian — open the live feed dashboard",
  },
  {
    path: "/admin",
    icon: "🦸",
    title: "I am an Admin",
    desc: "View live platform stats",
    aria: "Continue as admin — open the analytics dashboard",
  },
]

export default function RoleSelection() {
  const navigate = useNavigate()
  const [demoHovered, setDemoHovered] = useState(false)

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: FONT,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 40,
        padding: 24,
      }}
    >
      <motion.header
        initial={{ opacity: 0, y: -18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{ textAlign: "center" }}
      >
        <div style={{ fontSize: 64, lineHeight: 1 }} aria-hidden="true">
          🗣️
        </div>
        <h1
          style={{
            margin: "10px 0 0",
            fontSize: 52,
            fontWeight: 800,
            letterSpacing: 0.5,
          }}
        >
          VaakSetu
        </h1>
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 22,
            fontWeight: 600,
            color: COLORS.accent,
          }}
        >
          Tap to speak
        </p>
      </motion.header>

      <div
        style={{
          display: "flex",
          gap: 22,
          flexWrap: "wrap",
          justifyContent: "center",
          maxWidth: 1000,
        }}
        role="navigation"
        aria-label="Choose your role"
      >
        {ROLES.map((role, i) => (
          <motion.button
            key={role.path}
            type="button"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 * i, duration: 0.4 }}
            whileHover={{ scale: 1.04, borderColor: COLORS.accent }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate(role.path)}
            aria-label={role.aria}
            style={{
              width: 280,
              minHeight: 260,
              background: "rgba(30, 41, 59, 0.55)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: `2px solid ${COLORS.border}`,
              borderRadius: 24,
              padding: 28,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              cursor: "pointer",
              color: COLORS.text,
              fontFamily: FONT,
            }}
          >
            <span style={{ fontSize: 58, lineHeight: 1 }} aria-hidden="true">
              {role.icon}
            </span>
            <span style={{ fontSize: 24, fontWeight: 800 }}>{role.title}</span>
            <span style={{ fontSize: 15, color: COLORS.textDim }}>{role.desc}</span>
          </motion.button>
        ))}
      </div>

      <p style={{ color: COLORS.textDim, fontSize: 14 }}>
        Open this app in two browser windows to see the live demo.
      </p>

      {/* Feature 3: hidden demo-mode launcher */}
      <button
        type="button"
        onClick={() => navigate("/guardian?demo=true")}
        onMouseEnter={() => setDemoHovered(true)}
        onMouseLeave={() => setDemoHovered(false)}
        onFocus={() => setDemoHovered(true)}
        onBlur={() => setDemoHovered(false)}
        aria-label="Start the scripted demo mode"
        style={{
          position: "fixed",
          right: 14,
          bottom: 12,
          background: "transparent",
          color: COLORS.textDim,
          border: "none",
          fontSize: 13,
          fontWeight: 600,
          opacity: demoHovered ? 1 : 0.3,
          cursor: "pointer",
          padding: "6px 10px",
          fontFamily: FONT,
        }}
      >
        ▶ Demo
      </button>
    </div>
  )
}
