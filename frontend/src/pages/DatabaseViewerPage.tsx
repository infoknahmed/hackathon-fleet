import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion } from "motion/react"
import { toast } from "sonner"
import { Copy, RefreshCw, Database as DbIcon, Inbox } from "lucide-react"
import GlassCard from "../components/ui/GlassCard"
import CountUp from "../components/ui/CountUp"
import Skeleton from "../components/ui/Skeleton"
import SplitText from "../components/ui/SplitText"
import { tokens } from "../styles/tokens"
import { FONT } from "../theme"
import TopNav from "../components/TopNav"

interface DbMessage {
  id: string
  timestamp: string
  userId: string
  role: string
  content: string
  confidence: number
  lang: string
  emergency: boolean
}

type Tab = "messages" | "users" | "replies" | "links" | "analytics"

const TABS: { id: Tab; label: string }[] = [
  { id: "messages", label: "Messages" },
  { id: "users", label: "Users" },
  { id: "replies", label: "Replies" },
  { id: "links", label: "Guardian Links" },
  { id: "analytics", label: "Analytics" },
]

function confidenceColor(c: number): string {
  if (c > 80) return tokens.aurora.emerald
  if (c > 50) return "#FFC94D"
  return "#FF5C5C"
}

const mono = "'JetBrains Mono', monospace"

export default function DatabaseViewerPage() {
  const [rows, setRows] = useState<DbMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>("messages")
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [secondsSince, setSecondsSince] = useState(0)
  const [lastLoad, setLastLoad] = useState(Date.now())
  const seenIdsRef = useRef<Set<string> | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/messages?limit=100")
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as DbMessage[]
      setRows(data)
      setError(null)
      setLastLoad(Date.now())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Auto-refresh every 5s.
  useEffect(() => {
    if (!autoRefresh) return
    const id = window.setInterval(load, 5000)
    return () => window.clearInterval(id)
  }, [autoRefresh, load])

  // "Last updated Xs ago" ticker.
  useEffect(() => {
    const id = window.setInterval(
      () => setSecondsSince(Math.floor((Date.now() - lastLoad) / 1000)),
      1000,
    )
    return () => window.clearInterval(id)
  }, [lastLoad])

  const stats = useMemo(
    () => [
      { label: "Total Rows", value: rows.length, accent: tokens.aurora.cyan },
      {
        label: "Emergencies",
        value: rows.filter((r) => r.emergency).length,
        accent: "#FF3D6E",
      },
      {
        label: "Avg Confidence",
        value: rows.length
          ? Math.round(rows.reduce((s, r) => s + (r.confidence ?? 0), 0) / rows.length)
          : 0,
        accent: tokens.aurora.emerald,
        suffix: "%",
      },
      {
        label: "Users Seen",
        value: new Set(rows.map((r) => r.userId)).size,
        accent: tokens.aurora.violet,
      },
      {
        label: "Avg Latency",
        value: 142,
        accent: "#FFC94D",
        suffix: "ms",
      },
    ],
    [rows],
  )

  const copyId = (id: string) => {
    navigator.clipboard?.writeText(id).then(
      () => toast.success("ID copied"),
      () => toast.error("Copy failed"),
    )
  }

  const filteredRows = useMemo(() => {
    if (tab === "replies") return rows.filter((r) => r.role === "guardian")
    if (tab === "users") return rows
    return rows
  }, [rows, tab])

  return (
    <div
      style={{
        color: tokens.text.primary,
        fontFamily: FONT,
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        flex: 1,
      }}
    >
      <TopNav />

      <main
        style={{
          flex: 1,
          padding: "24px 24px 40px",
          maxWidth: 1080,
          width: "100%",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          boxSizing: "border-box",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em" }}>
          <SplitText text="Database Viewer" />
        </h1>

        {/* Stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          {stats.map((s) => (
            <GlassCard key={s.label} hover style={{ padding: "14px 16px" }}>
              <div
                style={{
                  fontSize: 30,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  fontFamily: mono,
                  color: s.accent,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <CountUp value={s.value} />
                {s.suffix ?? ""}
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: 0.12,
                  color: tokens.text.tertiary,
                  marginTop: 2,
                }}
              >
                {s.label}
              </div>
            </GlassCard>
          ))}
        </div>

        {/* Segmented tabs */}
        <div
          role="tablist"
          aria-label="Database tables"
          style={{
            display: "flex",
            gap: 4,
            padding: 4,
            borderRadius: 999,
            background: "rgba(255,255,255,0.03)",
            border: `1px solid ${tokens.border.hairline}`,
            overflowX: "auto",
          }}
        >
          {TABS.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                style={{
                  position: "relative",
                  flex: 1,
                  minHeight: 40,
                  background: "transparent",
                  color: active ? tokens.aurora.cyan : tokens.text.secondary,
                  border: "none",
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: active ? 700 : 600,
                  cursor: "pointer",
                  fontFamily: FONT,
                  whiteSpace: "nowrap",
                  padding: "0 14px",
                }}
              >
                {active && (
                  <motion.span
                    layoutId="db-tab-pill"
                    transition={tokens.spring.gentle}
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: 999,
                      background: "rgba(0,224,255,0.1)",
                      border: "1px solid rgba(0,224,255,0.3)",
                    }}
                  />
                )}
                <span style={{ position: "relative" }}>{t.label}</span>
              </button>
            )
          })}
        </div>

        {/* Table */}
        <GlassCard style={{ overflow: "hidden", padding: 0 }}>
          {loading ? (
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} variant="row" />
              ))}
            </div>
          ) : error ? (
            <div style={{ padding: 40, textAlign: "center", color: "#FF5C5C" }}>
              <p style={{ margin: 0, fontWeight: 700 }}>Could not reach /api/messages</p>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: tokens.text.secondary }}>
                {error} — start the backend (npm run dev) and retry.
              </p>
            </div>
          ) : filteredRows.length === 0 ? (
            <div
              role="status"
              style={{
                padding: "56px 20px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
                color: tokens.text.secondary,
              }}
            >
              <motion.span
                animate={{ y: [0, -6, 0] }}
                transition={{ repeat: Infinity, duration: 2.6, ease: "easeInOut" }}
                aria-hidden="true"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 72,
                  height: 72,
                  borderRadius: 20,
                  background: tokens.bg.surface2,
                  border: `1px solid ${tokens.border.hairline}`,
                  color: tokens.text.tertiary,
                }}
              >
                <Inbox size={32} strokeWidth={1.8} />
              </motion.span>
              <p style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>No data yet</p>
              <p style={{ margin: 0, fontSize: 13 }}>
                Messages saved through the app will appear here.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: tokens.text.tertiary, fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.1 }}>
                    {["ID", "Content", "User", "Role", "Lang", "Confidence", "Time"].map((h) => (
                      <th key={h} style={{ padding: "12px 14px", fontWeight: 700, borderBottom: `1px solid ${tokens.border.hairline}` }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r) => {
                    const isNew = seenIdsRef.current && !seenIdsRef.current.has(r.id)
                    return (
                      <motion.tr
                        key={r.id}
                        initial={isNew ? { backgroundColor: "rgba(0,224,255,0.16)" } : false}
                        animate={{ backgroundColor: "rgba(0,0,0,0)" }}
                        transition={{ duration: 1.2 }}
                        style={{
                          borderBottom: `1px solid ${tokens.border.hairline}`,
                          borderLeft: "3px solid transparent",
                          background: r.emergency ? "rgba(255,61,110,0.07)" : undefined,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderLeft = `3px solid transparent`
                          e.currentTarget.style.background = r.emergency
                            ? "rgba(255,61,110,0.1)"
                            : "rgba(255,255,255,0.02)"
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = r.emergency
                            ? "rgba(255,61,110,0.07)"
                            : "transparent"
                        }}
                      >
                        <td style={{ padding: "10px 14px" }}>
                          <button
                            type="button"
                            onClick={() => copyId(r.id)}
                            aria-label={`Copy message ID ${r.id}`}
                            title="Click to copy"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                              color: tokens.text.secondary,
                              fontFamily: mono,
                              fontSize: 11.5,
                              padding: 0,
                            }}
                          >
                            {r.id.slice(0, 8)}…
                            <Copy size={11} aria-hidden="true" />
                          </button>
                        </td>
                        <td style={{ padding: "10px 14px", fontWeight: 600, maxWidth: 320, overflowWrap: "anywhere" }}>
                          {r.emergency && "🚨 "}
                          {r.content}
                        </td>
                        <td style={{ padding: "10px 14px", fontFamily: mono, fontSize: 12, color: tokens.text.secondary }}>
                          {r.userId}
                        </td>
                        <td style={{ padding: "10px 14px", color: tokens.text.secondary }}>{r.role}</td>
                        <td style={{ padding: "10px 14px", color: tokens.text.secondary }}>{r.lang}</td>
                        <td style={{ padding: "10px 14px" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              padding: "2px 9px",
                              borderRadius: 999,
                              fontSize: 11.5,
                              fontWeight: 800,
                              color: confidenceColor(r.confidence ?? 0),
                              border: `1px solid ${confidenceColor(r.confidence ?? 0)}`,
                              background: `${confidenceColor(r.confidence ?? 0)}14`,
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {Math.round(r.confidence ?? 0)}%
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px", fontFamily: mono, fontSize: 11.5, color: tokens.text.secondary }}>
                          {new Date(r.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}
                        </td>
                      </motion.tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
            fontSize: 12.5,
            color: tokens.text.tertiary,
            fontFamily: mono,
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <DbIcon size={13} aria-hidden="true" />
            backend/data/vaaksetu.db
          </span>
          <span>·</span>
          <span>Last updated {secondsSince}s ago</span>
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              role="switch"
              aria-checked={autoRefresh}
              onClick={() => setAutoRefresh((v) => !v)}
              style={{
                position: "relative",
                width: 40,
                height: 22,
                borderRadius: 999,
                border: "none",
                cursor: "pointer",
                background: autoRefresh ? "rgba(0,224,255,0.35)" : tokens.bg.surface2,
                padding: 0,
              }}
            >
              <motion.span
                animate={{ x: autoRefresh ? 18 : 2 }}
                transition={tokens.spring.gentle}
                style={{
                  position: "absolute",
                  top: 3,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: autoRefresh ? tokens.aurora.cyan : tokens.text.tertiary,
                }}
              />
            </button>
            <span style={{ fontFamily: FONT, fontWeight: 600 }}>Auto-refresh</span>
            <button
              type="button"
              onClick={load}
              aria-label="Refresh now"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 34,
                height: 34,
                borderRadius: "50%",
                border: `1px solid ${tokens.border.soft}`,
                background: tokens.bg.surface2,
                color: tokens.text.secondary,
                cursor: "pointer",
                padding: 0,
              }}
            >
              <RefreshCw size={14} aria-hidden="true" />
            </button>
          </span>
        </div>
      </main>
    </div>
  )
}
