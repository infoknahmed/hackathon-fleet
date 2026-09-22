import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "motion/react"
import { Play, AudioLines, Zap, Languages } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { tokens } from "../styles/tokens"
import TopNav, { VaakSetuLogo } from "../components/TopNav"
import MouseFollowGradient from "../components/MouseFollowGradient"
import AuroraButton from "../components/ui/AuroraButton"
import SplitText from "../components/ui/SplitText"
import CountUp from "../components/ui/CountUp"
import Pulse from "../components/ui/Pulse"
import { startDemo } from "../lib/demoRunner"
import { FONT } from "../theme"

const FEATURES: { icon: LucideIcon; label: string; accent: string }[] = [
  { icon: Zap, label: "<200ms latency", accent: tokens.aurora.cyan },
  { icon: AudioLines, label: "ISL sign pipeline", accent: tokens.aurora.violet },
  { icon: Languages, label: "5 languages", accent: tokens.aurora.magenta },
]

export default function RoleSelection() {
  const navigate = useNavigate()
  const [demoHovered, setDemoHovered] = useState(false)

  // "Watch demo" plays the scripted scenario inside the current tab.
  const [demoTick, setDemoTick] = useState(0)
  useEffect(() => {
    if (demoTick === 0) return
    navigate("/guardian?demo=true")
    const t = window.setTimeout(startDemo, 1000)
    return () => window.clearTimeout(t)
  }, [demoTick, navigate])

  const heroStyle = {
    fontFamily: FONT,
    fontWeight: 700,
    fontSize: "clamp(48px, 8vw, 96px)",
    letterSpacing: "-0.04em",
    lineHeight: 1.02,
    margin: 0,
  } as const

  return (
    <div
      style={{
        minHeight: "100vh",
        color: tokens.text.primary,
        fontFamily: FONT,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <MouseFollowGradient />
      <TopNav />

      <main
        style={{
          flex: 1,
          display: "flex",
          gap: 48,
          alignItems: "center",
          justifyContent: "center",
          flexWrap: "wrap",
          padding: "40px 24px 80px",
          maxWidth: 1280,
          width: "100%",
          margin: "0 auto",
          boxSizing: "border-box",
        }}
      >
        {/* ===================== LEFT: hero ===================== */}
        <section style={{ flex: "1 1 480px", maxWidth: 620, minWidth: 300 }}>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 14px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${tokens.border.hairline}`,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: 0.4,
              color: tokens.text.secondary,
              marginBottom: 22,
            }}
          >
            <Pulse color="green" size={7} />
            Now live — HACKORA 2026
          </motion.div>

          <h1 style={heroStyle} aria-label="The Bridge of Voice">
            <SplitText text="The Bridge of" delay={0.1} />
            <br />
            <span
              style={{
                background: `linear-gradient(120deg, ${tokens.aurora.cyan}, ${tokens.aurora.violet})`,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              <SplitText text="Voice" delay={0.35} />
            </span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            style={{
              margin: "18px 0 0",
              fontSize: 18,
              lineHeight: 1.6,
              color: tokens.text.secondary,
              maxWidth: 480,
            }}
          >
            VaakSetu turns pictograms into speech, sign and live guardian alerts —
            a communication bridge for non-verbal users across India.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.4 }}
            style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}
          >
            <AuroraButton variant="primary" onClick={() => navigate("/user")} style={{ height: 46, paddingInline: 22 }}>
              Enter as User
            </AuroraButton>
            <AuroraButton variant="secondary" onClick={() => navigate("/guardian")} style={{ height: 46, paddingInline: 22 }}>
              Guardian
            </AuroraButton>
            <AuroraButton variant="ghost" onClick={() => setDemoTick((t) => t + 1)} style={{ height: 46, paddingInline: 22 }}>
              <Play size={15} aria-hidden="true" /> Watch demo
            </AuroraButton>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.5 }}
            style={{ display: "flex", gap: 36, flexWrap: "wrap", marginTop: 44 }}
          >
            {[
              { value: 7, suffix: "M+", label: "Indians" },
              { value: 200, prefix: "<", suffix: "ms", label: "Latency" },
              { value: 5, suffix: "", label: "Languages" },
            ].map((s) => (
              <div key={s.label}>
                <div
                  style={{
                    fontSize: 34,
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                    fontFamily: "'JetBrains Mono', monospace",
                    color: tokens.text.primary,
                  }}
                >
                  {s.prefix}
                  <CountUp value={s.value} />
                  {s.suffix}
                </div>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.12, color: tokens.text.tertiary, marginTop: 2 }}>
                  {s.label}
                </div>
              </div>
            ))}
          </motion.div>
        </section>

        {/* ===================== RIGHT: illustration ===================== */}
        <motion.section
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          aria-hidden="true"
          style={{
            flex: "1 1 380px",
            maxWidth: 520,
            minWidth: 300,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 26,
          }}
        >
          <div
            style={{
              position: "relative",
              width: "min(380px, 80vw)",
              aspectRatio: "1",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* aurora glow behind rings */}
            <div
              style={{
                position: "absolute",
                inset: "-15%",
                background: `radial-gradient(circle at 50% 45%, rgba(0,224,255,0.14), rgba(124,58,237,0.12) 45%, transparent 70%)`,
                filter: "blur(40px)",
              }}
            />
            {/* 3 concentric rings, different speeds */}
            {[
              { size: "100%", dur: 26, dir: "normal", op: 0.5 },
              { size: "76%", dur: 18, dir: "reverse", op: 0.65 },
              { size: "52%", dur: 12, dir: "normal", op: 0.85 },
            ].map((r, i) => (
              <motion.div
                key={i}
                animate={{ rotate: r.dir === "reverse" ? -360 : 360 }}
                transition={{ repeat: Infinity, duration: r.dur, ease: "linear" }}
                style={{
                  position: "absolute",
                  width: r.size,
                  height: r.size,
                  borderRadius: "50%",
                  border: `1px dashed rgba(255,255,255,${0.18 * r.op + 0.06})`,
                  opacity: r.op,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: -4,
                    left: "50%",
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: i === 0 ? tokens.aurora.cyan : i === 1 ? tokens.aurora.violet : tokens.aurora.magenta,
                    boxShadow: `0 0 12px currentColor`,
                  }}
                />
              </motion.div>
            ))}

            {/* particle stream left → right */}
            {[0, 1, 2, 3].map((i) => (
              <motion.span
                key={`p-${i}`}
                animate={{ x: [-150, 150], opacity: [0, 1, 1, 0] }}
                transition={{ repeat: Infinity, duration: 2.6, delay: i * 0.65, ease: "linear" }}
                style={{
                  position: "absolute",
                  top: "50%",
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: tokens.aurora.cyan,
                  boxShadow: `0 0 8px ${tokens.aurora.cyan}`,
                }}
              />
            ))}

            {/* center pulsing icon */}
            <motion.div
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 108,
                height: 108,
                borderRadius: 28,
                background: "rgba(10,12,18,0.75)",
                border: `1px solid ${tokens.border.soft}`,
                boxShadow: `0 0 60px rgba(0,224,255,0.18), 0 0 90px rgba(124,58,237,0.14)`,
                backdropFilter: "blur(10px)",
              }}
            >
              <VaakSetuLogo size={56} />
            </motion.div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            {FEATURES.map((f) => (
              <span
                key={f.label}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "8px 14px",
                  borderRadius: 999,
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: tokens.text.secondary,
                  background: tokens.bg.surface2,
                  border: `1px solid ${tokens.border.hairline}`,
                }}
              >
                <f.icon size={14} color={f.accent} aria-hidden="true" />
                {f.label}
              </span>
            ))}
          </div>
        </motion.section>
      </main>

      {/* ===================== BOTTOM: tech marquee ===================== */}
      <div
        className="marquee"
        aria-hidden="true"
        style={{
          borderTop: `1px solid ${tokens.border.hairline}`,
          padding: "14px 0",
          background: "rgba(255,255,255,0.015)",
        }}
      >
        <div className="marquee-track" style={{ color: tokens.text.tertiary, fontSize: 13, fontWeight: 600 }}>
          {[0, 1].map((copy) => (
            <span key={copy} style={{ display: "inline-flex", gap: 48 }}>
              {["React 19", "Socket.IO", "SQLite", "MediaPipe", "Web Speech API", "PWA", "Motion", "Lucide"].map((t) => (
                <span key={t}>{t} <span style={{ color: tokens.aurora.cyan }}>·</span></span>
              ))}
            </span>
          ))}
        </div>
      </div>

      {/* Hidden demo-mode launcher */}
      <button
        type="button"
        onClick={() => {
          navigate("/guardian?demo=true")
          window.setTimeout(startDemo, 1000)
        }}
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
          color: tokens.text.secondary,
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
          zIndex: 45,
        }}
      >
        <Play size={13} aria-hidden="true" /> Demo
      </button>
    </div>
  )
}
