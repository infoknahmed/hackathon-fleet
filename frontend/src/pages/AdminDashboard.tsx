import { useEffect, useMemo, useState } from "react"
import { motion } from "motion/react"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts"
import { MessageSquare, Users, Zap, Siren, ShieldCheck } from "lucide-react"
import { StatCard } from "../components/StatCard"
import { subscribeToMessages, getUserId } from "../lib/messageBus"
import type { VaakSetuMessage } from "../lib/messageBus"
import { COLORS, FONT, RADIUS, SHADOW } from "../theme"
import TopNav from "../components/TopNav"

const MOOD_COLORS: Record<string, string> = {
  Positive: COLORS.success,
  Neutral: COLORS.accent,
  Distressed: COLORS.warning,
  Urgent: COLORS.danger,
}

export default function AdminDashboard() {
  const [messages, setMessages] = useState<VaakSetuMessage[]>([])
  const [lastLatency, setLastLatency] = useState<number | null>(null)

  useEffect(() => {
    const unsubscribe = subscribeToMessages((msg) => {
      setMessages((prev) => [
        { ...msg, latencyMs: Math.max(0, Date.now() - msg.timestamp) },
        ...prev,
      ])
      setLastLatency(Math.max(0, Date.now() - msg.timestamp))
    })
    return unsubscribe
  }, [])

  const total = messages.length
  const emergencies = messages.filter(
    (m) => m.type === "message" && m.emergency,
  ).length
  const avgLatency =
    lastLatency !== null
      ? Math.round(
          messages.slice(0, 10).reduce((sum, m) => sum + (m.latencyMs ?? 0), 0) /
            Math.min(10, messages.length),
        )
      : 0

  /** Messages per minute, last 20 minutes. */
  const perMinute = useMemo(() => {
    const now = Date.now()
    const buckets: { minute: string; count: number }[] = []
    for (let i = 19; i >= 0; i--) {
      const t = new Date(now - i * 60_000)
      buckets.push({
        minute: `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`,
        count: 0,
      })
    }
    for (const m of messages) {
      const idx = 19 - Math.floor((now - m.timestamp) / 60_000)
      if (idx >= 0 && idx < 20) buckets[idx].count++
    }
    return buckets
  }, [messages])

  const moodData = useMemo(() => {
    const counts = new Map<string, number>()
    for (const m of messages) {
      if (m.type === "reply") continue
      counts.set(m.mood, (counts.get(m.mood) ?? 0) + 1)
    }
    return [...counts.entries()].map(([name, value]) => ({ name, value }))
  }, [messages])

  const cardStyle = {
    background: "rgba(30, 41, 59, 0.55)",
    backdropFilter: "blur(20px) saturate(150%)",
    WebkitBackdropFilter: "blur(20px) saturate(150%)",
    border: `1px solid ${COLORS.borderGlass}`,
    borderRadius: RADIUS.lg,
    padding: "20px 22px",
    fontFamily: FONT,
    color: COLORS.text,
    boxShadow: SHADOW.md,
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: FONT,
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      <TopNav
        right={
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: COLORS.successSoft,
              border: `1px solid ${COLORS.success}`,
              borderRadius: RADIUS.pill,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 700,
              color: COLORS.success,
              whiteSpace: "nowrap",
            }}
          >
            <motion.span
              aria-hidden="true"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ repeat: Infinity, duration: 1.4 }}
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: COLORS.success,
                display: "inline-block",
              }}
            />
            <ShieldCheck size={15} strokeWidth={2.4} aria-hidden="true" />
            BroadcastChannel — Connected
          </span>
        }
      />

      <motion.main
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{
          flex: 1,
          padding: "22px 28px 40px",
          display: "flex",
          flexDirection: "column",
          gap: 22,
          maxWidth: 1280,
          width: "100%",
          margin: "0 auto",
        }}
      >
        {/* Header */}
        <header style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: RADIUS.xl,
              background: "rgba(250, 204, 21, 0.12)",
              border: "1px solid rgba(250, 204, 21, 0.35)",
              color: COLORS.warning,
            }}
            aria-hidden="true"
          >
            <ShieldCheck size={30} strokeWidth={2.2} />
          </span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Admin Dashboard</h1>
            <p style={{ margin: 0, fontSize: 14, color: COLORS.textDim }}>
              Live platform analytics · {getUserId()}
            </p>
          </div>
        </header>

        {/* Stat cards */}
        <section
          aria-label="Platform statistics"
          style={{ display: "flex", gap: 16, flexWrap: "wrap" }}
        >
          <StatCard icon={MessageSquare} label="Total Messages" value={total} accent={COLORS.accent} />
          <StatCard icon={Users} label="Active Users" value={1} accent={COLORS.success} />
          <StatCard
            icon={Zap}
            label="Avg Latency"
            value={`${avgLatency} ms`}
            accent={COLORS.warning}
          />
          <StatCard
            icon={Siren}
            label="Emergency Alerts"
            value={emergencies}
            accent={COLORS.danger}
          />
        </section>

        {/* Charts */}
        <section style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <motion.div
            whileHover={{ y: -2 }}
            style={{ ...cardStyle, flex: 2, minWidth: 340, height: 320 }}
          >
            <h2 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 800 }}>
              Messages per minute (last 20 min)
            </h2>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={perMinute}>
                <CartesianGrid stroke={COLORS.border} strokeDasharray="3 3" />
                <XAxis dataKey="minute" stroke={COLORS.textDim} fontSize={11} />
                <YAxis allowDecimals={false} stroke={COLORS.textDim} fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "#1E293B",
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: RADIUS.sm,
                    color: COLORS.text,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke={COLORS.accent}
                  strokeWidth={2.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>

          <motion.div
            whileHover={{ y: -2 }}
            style={{ ...cardStyle, flex: 1, minWidth: 300, height: 320 }}
          >
            <h2 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 800 }}>
              Mood distribution
            </h2>
            {moodData.length === 0 ? (
              <p style={{ color: COLORS.textDim, fontSize: 15 }}>
                No mood data yet — waiting for messages.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={moodData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    isAnimationActive={false}
                  >
                    {moodData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={MOOD_COLORS[entry.name] ?? COLORS.accent}
                      />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 13, color: COLORS.text }} />
                  <Tooltip
                    contentStyle={{
                      background: "#1E293B",
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: RADIUS.sm,
                      color: COLORS.text,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </motion.div>
        </section>
      </motion.main>
    </div>
  )
}
