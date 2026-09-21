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
import { StatCard } from "../components/StatCard"
import { subscribeToMessages, getUserId } from "../lib/messageBus"
import type { VaakSetuMessage } from "../lib/messageBus"
import { COLORS, FONT } from "../theme"

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
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 16,
    padding: "20px 22px",
    fontFamily: FONT,
    color: COLORS.text,
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: FONT,
        padding: "24px 28px 40px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 22,
      }}
    >
      {/* Header */}
      <header style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontSize: 32 }} aria-hidden="true">
          🦸
        </span>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>Admin Dashboard</h1>
          <p style={{ margin: 0, fontSize: 14, color: COLORS.textDim }}>
            Live platform analytics · {getUserId()}
          </p>
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: COLORS.successSoft,
            border: `1px solid ${COLORS.success}`,
            borderRadius: 999,
            padding: "8px 16px",
            fontSize: 14,
            fontWeight: 700,
            color: COLORS.success,
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
          WebSocket: BroadcastChannel — Connected
        </span>
      </header>

      {/* Stat cards */}
      <section
        aria-label="Platform statistics"
        style={{ display: "flex", gap: 16, flexWrap: "wrap" }}
      >
        <StatCard icon="💬" label="Total Messages" value={total} accent={COLORS.accent} />
        <StatCard icon="👤" label="Active Users" value={1} accent={COLORS.success} />
        <StatCard
          icon="⚡"
          label="Avg Latency"
          value={`${avgLatency} ms`}
          accent={COLORS.warning}
        />
        <StatCard
          icon="🚨"
          label="Emergency Alerts"
          value={emergencies}
          accent={COLORS.danger}
        />
      </section>

      {/* Charts */}
      <section style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div style={{ ...cardStyle, flex: 2, minWidth: 340, height: 320 }}>
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
                  background: COLORS.card,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 10,
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
        </div>

        <div style={{ ...cardStyle, flex: 1, minWidth: 300, height: 320 }}>
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
                    background: COLORS.card,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 10,
                    color: COLORS.text,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>
    </div>
  )
}
