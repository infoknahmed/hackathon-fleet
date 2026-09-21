import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "motion/react"
import { User, HeartHandshake, ShieldCheck, MessagesSquare, Play } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { COLORS, FONT, RADIUS, SHADOW } from "../theme"
import TopNav from "../components/TopNav"

const ROLES: {
  path: string
  icon: LucideIcon
  title: string
  desc: string
  aria: string
  accent: string
}[] = [
  {
    path: "/user",
    icon: User,
    title: "I am a User",
    desc: "Tap pictograms to speak",
    aria: "Continue as user — open the communication dashboard",
    accent: COLORS.accent,
  },
  {
    path: "/conversation",
    icon: MessagesSquare,
    title: "Conversation Mode",
    desc: "Two-way talk: signs + voice",
    aria: "Open conversation mode — split screen for two-way talk",
    accent: "#7C3AED",
  },
  {
    path: "/guardian",
    icon: HeartHandshake,
    title: "I am a Guardian",
    desc: "Watch the live message feed",
    aria: "Continue as guardian — open the live feed dashboard",
    accent: COLORS.success,
  },
  {
    path: "/admin",
    icon: ShieldCheck,
    title: "I am an Admin",
    desc: "View live platform stats",
    aria: "Continue as admin — open the analytics dashboard",
    accent: COLORS.warning,
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
        gap: 32,
      }}
    >
      <TopNav />

      <motion.main
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 36,
          padding: "32px 24px 56px",
        }}
      >
        <motion.header
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          style={{ textAlign: "center" }}
        >
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ repeat: Infinity, duration: 3.2, ease: "easeInOut" }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 96,
              height: 96,
              borderRadius: RADIUS.xl,
              background: `linear-gradient(135deg, rgba(34,211,238,0.18), rgba(124,58,237,0.18))`,
              border: `1px solid ${COLORS.borderGlass}`,
              boxShadow: SHADOW.md,
              fontSize: 52,
              lineHeight: 1,
            }}
            aria-hidden="true"
          >
            🗣️
          </motion.div>
          <h1
            style={{
              margin: "14px 0 0",
              fontSize: 54,
              fontWeight: 900,
              letterSpacing: -0.5,
              background: `linear-gradient(120deg, ${COLORS.text} 30%, ${COLORS.accentBright})`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            VaakSetu
          </h1>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 21,
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
            gap: 20,
            flexWrap: "wrap",
            justifyContent: "center",
            maxWidth: 1040,
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
              transition={{ delay: 0.1 + 0.08 * i, duration: 0.4 }}
              whileHover={{ y: -4, borderColor: role.accent }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate(role.path)}
              aria-label={role.aria}
              style={{
                width: 280,
                minHeight: 250,
                background: "rgba(30, 41, 59, 0.55)",
                backdropFilter: "blur(20px) saturate(150%)",
                WebkitBackdropFilter: "blur(20px) saturate(150%)",
                border: `1px solid ${COLORS.borderGlass}`,
                borderRadius: 24,
                padding: 26,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                cursor: "pointer",
                color: COLORS.text,
                fontFamily: FONT,
                boxShadow: SHADOW.md,
                transition: "border-color 0.2s ease, box-shadow 0.2s ease",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 64,
                  height: 64,
                  borderRadius: RADIUS.xl,
                  background: `${role.accent}22`,
                  border: `1px solid ${role.accent}55`,
                  color: role.accent,
                }}
                aria-hidden="true"
              >
                <role.icon size={32} strokeWidth={2.2} />
              </span>
              <span style={{ fontSize: 22, fontWeight: 800 }}>{role.title}</span>
              <span style={{ fontSize: 15, color: COLORS.textDim }}>{role.desc}</span>
            </motion.button>
          ))}
        </div>

        <p style={{ color: COLORS.textDim, fontSize: 14, textAlign: "center" }}>
          Open this app in two browser windows to see the live demo.
        </p>
      </motion.main>

      {/* Hidden demo-mode launcher */}
      <motion.button
        type="button"
        onClick={() => navigate("/guardian?demo=true")}
        whileHover={{ scale: 1.04 }}
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
          minHeight: 32,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontFamily: FONT,
        }}
      >
        <Play size={13} aria-hidden="true" /> Demo
      </motion.button>
    </div>
  )
}
