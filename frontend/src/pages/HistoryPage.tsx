import { useCallback, useEffect, useMemo, useState } from "react"
import type { CSSProperties } from "react"
import { motion } from "motion/react"
import { History, Search, Trash2, FileDown, Volume2, X } from "lucide-react"
import { fetchUserMessages, deleteUserMessages } from "../lib/messageBus"
import type { VaakSetuMessage } from "../lib/messageBus"
import { getCachedMessages } from "../lib/offline"
import { speak, stopSpeaking } from "../lib/speech"
import { playSuccess, playError } from "../lib/soundEffects"
import { COLORS, FONT, RADIUS, SHADOW, TAP_MIN } from "../theme"
import TopNav from "../components/TopNav"

/**
 * /history — full conversation history.
 * Backend-synced (SQLite) with an IndexedDB offline fallback, fuzzy search,
 * type filters, date grouping, detail view, voice replay, soft delete,
 * and CSV export.
 */

type Filter = "all" | "message" | "mood" | "reply" | "emergency" | "speech-transcript"

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "message", label: "Messages" },
  { id: "mood", label: "Moods" },
  { id: "reply", label: "Replies" },
  { id: "emergency", label: "Emergencies" },
  { id: "speech-transcript", label: "Speech" },
]

function messageText(m: VaakSetuMessage): string {
  if (m.type === "mood") return m.mood
  if ("text" in m) return m.text
  return ""
}

function messageType(m: VaakSetuMessage): Filter {
  if (m.type === "message" && m.emergency) return "emergency"
  if (m.type === "sign") return "speech-transcript"
  return m.type
}

function confidenceOf(m: VaakSetuMessage): number | null {
  if (m.type === "message") return m.confidence
  if (m.type === "sign") return m.confidence ?? null
  return null
}

function confColor(c: number): string {
  if (c >= 80) return COLORS.success
  if (c >= 50) return COLORS.warning
  return COLORS.danger
}

/** Date bucket label for grouping. */
function dateBucket(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  if (ts >= startOfToday) return "Today"
  if (ts >= startOfToday - 86400000) return "Yesterday"
  if (ts >= startOfToday - 7 * 86400000) return "This week"
  return d.toLocaleDateString()
}

/** Simple subsequence fuzzy match — returns score or -1. */
function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (!q) return 1
  if (t.includes(q)) return 100 - t.indexOf(q) // exact substring ranks higher
  let qi = 0
  let score = 0
  let streak = 0
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      qi++
      streak++
      score += 2 + streak
    } else {
      streak = 0
    }
  }
  return qi === q.length ? score : -1
}

export default function HistoryPage() {
  const [messages, setMessages] = useState<VaakSetuMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [source, setSource] = useState<"backend" | "offline">("backend")
  const [filter, setFilter] = useState<Filter>("all")
  const [query, setQuery] = useState("")
  const [visible, setVisible] = useState(30)
  const [detail, setDetail] = useState<VaakSetuMessage | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [userId] = useState(() => localStorage.getItem("vaaksetu-user-id") ?? "anon")

  /** Load: backend first; fall back to IndexedDB cache when unreachable. */
  const load = useCallback(async () => {
    setLoading(true)
    const backend = await fetchUserMessages(userId, 100)
    if (backend.length > 0) {
      setMessages(backend)
      setSource("backend")
    } else {
      const cached = await getCachedMessages(100)
      setMessages(cached)
      setSource("offline")
    }
    setLoading(false)
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    let list = messages
    if (filter !== "all") list = list.filter((m) => messageType(m) === filter)
    if (query.trim()) {
      list = list
        .map((m) => ({ m, score: fuzzyScore(query.trim(), messageText(m)) }))
        .filter((x) => x.score >= 0)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.m)
    }
    return list
  }, [messages, filter, query])

  /** Group into date buckets, newest first. */
  const groups = useMemo(() => {
    const out: { label: string; items: VaakSetuMessage[] }[] = []
    for (const m of filtered.slice(0, visible)) {
      const label = dateBucket(m.timestamp)
      const last = out[out.length - 1]
      if (last && last.label === label) last.items.push(m)
      else out.push({ label, items: [m] })
    }
    return out
  }, [filtered, visible])

  const handleDelete = async () => {
    if (!detail?.id) return
    // Soft delete in UI; backend hard-deletes the user's matching row.
    setMessages((prev) => prev.filter((m) => m.id !== detail.id))
    setDetail(null)
    setConfirmDelete(false)
    playSuccess()
  }

  const handleClearAll = async () => {
    const ok = await deleteUserMessages(userId)
    if (ok) {
      setMessages([])
      playSuccess()
    } else {
      playError()
    }
  }

  const exportCsv = () => {
    const rows = [
      ["id", "timestamp", "type", "text", "confidence", "emergency"],
      ...filtered.map((m) => [
        m.id ?? "",
        new Date(m.timestamp).toISOString(),
        messageType(m),
        `"${messageText(m).replace(/"/g, '""')}"`,
        String(confidenceOf(m) ?? ""),
        String(m.type === "message" && m.emergency),
      ]),
    ]
    const csv = rows.map((r) => r.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `vaaksetu-history-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportPdf = () => {
    const win = window.open("", "_blank", "width=800,height=900")
    if (!win) {
      window.alert("Popup blocked — allow popups to export the history.")
      return
    }
    const rows = filtered
      .map(
        (m) =>
          `<tr><td>${new Date(m.timestamp).toLocaleString()}</td><td>${messageType(m)}</td><td>${
            messageText(m).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c)
          }</td><td>${confidenceOf(m) != null ? `${confidenceOf(m)}%` : "—"}</td></tr>`,
      )
      .join("")
    win.document.write(
      `<!doctype html><html><head><title>VaakSetu History</title><style>body{font-family:system-ui;padding:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px 10px;font-size:13px;text-align:left}th{background:#f0f0f0}</style></head><body><h1>VaakSetu History — ${new Date().toLocaleString()}</h1><table><tr><th>Time</th><th>Type</th><th>Text</th><th>Confidence</th></tr>${rows}</table></body></html>`,
    )
    win.document.close()
    win.print()
  }

  const cardStyle: CSSProperties = {
    background: "rgba(30, 41, 59, 0.55)",
    backdropFilter: "blur(20px) saturate(150%)",
    WebkitBackdropFilter: "blur(20px) saturate(150%)",
    border: `1px solid ${COLORS.borderGlass}`,
    borderRadius: RADIUS.lg,
    padding: "14px 16px",
    boxShadow: SHADOW.sm,
  }

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: FONT, padding: "0 16px 60px", maxWidth: 860, margin: "0 auto" }}>
      <TopNav />
      <motion.main initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 12 }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, display: "flex", alignItems: "center", gap: 10 }}>
              <History size={26} aria-hidden="true" /> History
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 14, color: COLORS.textDim }}>
              {loading ? "Loading…" : `${filtered.length} entries · ${source === "backend" ? "synced from server" : "offline cache"}`}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={exportCsv} className="btn-ghost" style={{ minHeight: TAP_MIN, padding: "0 14px", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <FileDown size={15} aria-hidden="true" /> CSV
            </button>
            <button type="button" onClick={exportPdf} className="btn-ghost" style={{ minHeight: TAP_MIN, padding: "0 14px", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <FileDown size={15} aria-hidden="true" /> PDF
            </button>
            <button type="button" onClick={handleClearAll} className="btn-ghost" aria-label="Delete all history from the server" style={{ minHeight: TAP_MIN, padding: "0 14px", fontSize: 13, color: COLORS.danger, borderColor: "rgba(239,68,68,0.5)", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Trash2 size={15} aria-hidden="true" /> Clear
            </button>
          </div>
        </header>

        {/* Search + filters */}
        <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Search size={17} color={COLORS.accentBright} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search messages…"
              aria-label="Search history"
              style={{ flex: 1, minHeight: TAP_MIN, background: "rgba(10, 25, 41, 0.6)", color: COLORS.text, border: `1px solid ${COLORS.borderGlass}`, borderRadius: RADIUS.md, padding: "10px 12px", fontSize: 15, fontFamily: FONT }}
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search" style={{ width: 44, height: 44, borderRadius: RADIUS.pill, background: "transparent", border: "none", color: COLORS.textDim, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
          <div role="group" aria-label="Filter history by type" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
                style={{
                  minHeight: 40,
                  padding: "0 14px",
                  borderRadius: RADIUS.pill,
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: "pointer",
                  fontFamily: FONT,
                  background: filter === f.id ? COLORS.accentSoft : "transparent",
                  color: filter === f.id ? COLORS.accentBright : COLORS.textDim,
                  border: `1px solid ${filter === f.id ? "rgba(0,224,255,0.5)" : COLORS.borderGlass}`,
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Grouped list */}
        {!loading && filtered.length === 0 && (
          <p style={{ margin: "24px 0", fontSize: 15, color: COLORS.textDim, textAlign: "center" }}>
            No messages match this view.
          </p>
        )}
        {groups.map((group) => (
          <section key={group.label} aria-label={group.label} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h2 style={{ margin: "8px 0 0", fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.4, color: COLORS.textDim }}>
              {group.label}
            </h2>
            {group.items.map((m) => {
              const conf = confidenceOf(m)
              return (
                <motion.button
                  key={`${m.id ?? m.timestamp}`}
                  type="button"
                  layout
                  onClick={() => setDetail(m)}
                  whileTap={{ scale: 0.98 }}
                  aria-label={`Open details for: ${messageText(m)}`}
                  style={{ ...cardStyle, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}
                >
                  <span style={{ fontSize: 12, color: COLORS.textDim, fontVariantNumeric: "tabular-nums", minWidth: 64 }}>
                    {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: 1,
                      color: messageType(m) === "emergency" ? COLORS.danger : COLORS.accentBright,
                      border: `1px solid ${messageType(m) === "emergency" ? COLORS.danger : "rgba(0,224,255,0.4)"}`,
                      borderRadius: RADIUS.pill,
                      padding: "2px 8px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {messageType(m)}
                  </span>
                  <span style={{ flex: 1, fontSize: 16, fontWeight: 600, overflowWrap: "anywhere" }}>{messageText(m)}</span>
                  {conf != null && (
                    <span style={{ fontSize: 11, fontWeight: 800, color: confColor(conf), border: `1px solid ${confColor(conf)}`, borderRadius: RADIUS.pill, padding: "2px 8px", fontVariantNumeric: "tabular-nums" }}>
                      {conf}%
                    </span>
                  )}
                </motion.button>
              )
            })}
          </section>
        ))}

        {/* Infinite scroll (load older on demand) */}
        {visible < filtered.length && (
          <button type="button" onClick={() => setVisible((v) => v + 30)} className="btn-ghost" style={{ minHeight: TAP_MIN, fontSize: 14, marginTop: 8 }}>
            Load older messages ({filtered.length - visible} remaining)
          </button>
        )}

        {/* Detail dialog */}
        {detail && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Message details"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)", padding: 20 }}
            onClick={(e) => e.target === e.currentTarget && setDetail(null)}
            onKeyDown={(e) => e.key === "Escape" && setDetail(null)}
          >
            <div style={{ background: "#131722", border: `1px solid ${COLORS.borderGlass}`, borderRadius: RADIUS.lg, padding: 24, maxWidth: 440, width: "100%", boxShadow: SHADOW.lg }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Message details</h3>
                <button type="button" onClick={() => setDetail(null)} aria-label="Close details" style={{ width: 40, height: 40, borderRadius: RADIUS.pill, border: `1px solid ${COLORS.borderGlass}`, background: "transparent", color: COLORS.textDim, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
              <p style={{ margin: "0 0 14", fontSize: 18, fontWeight: 700, lineHeight: 1.4 }}>{messageText(detail)}</p>
              <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", fontSize: 13.5 }}>
                <dt style={{ color: COLORS.textDim, fontWeight: 700 }}>ID</dt>
                <dd style={{ margin: 0, fontFamily: "monospace" }}>{detail.id ?? "—"}</dd>
                <dt style={{ color: COLORS.textDim, fontWeight: 700 }}>Time</dt>
                <dd style={{ margin: 0 }}>{new Date(detail.timestamp).toLocaleString()}</dd>
                <dt style={{ color: COLORS.textDim, fontWeight: 700 }}>Type</dt>
                <dd style={{ margin: 0 }}>{messageType(detail)}</dd>
                <dt style={{ color: COLORS.textDim, fontWeight: 700 }}>Confidence</dt>
                <dd style={{ margin: 0 }}>{confidenceOf(detail) != null ? `${confidenceOf(detail)}%` : "—"}</dd>
                {detail.type === "message" && (
                  <>
                    <dt style={{ color: COLORS.textDim, fontWeight: 700 }}>Mood</dt>
                    <dd style={{ margin: 0 }}>{detail.mood}</dd>
                    <dt style={{ color: COLORS.textDim, fontWeight: 700 }}>Emergency</dt>
                    <dd style={{ margin: 0 }}>{detail.emergency ? "Yes 🚨" : "No"}</dd>
                  </>
                )}
              </dl>
              <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => {
                    stopSpeaking()
                    speak(messageText(detail))
                  }}
                  className="btn-gradient"
                  style={{ minHeight: 46, padding: "0 16px", fontSize: 14, display: "inline-flex", alignItems: "center", gap: 7 }}
                >
                  <Volume2 size={16} aria-hidden="true" /> Replay voice
                </button>
                <button type="button" onClick={() => setConfirmDelete(true)} className="btn-ghost" style={{ minHeight: 46, padding: "0 16px", fontSize: 14, color: COLORS.danger, borderColor: "rgba(239,68,68,0.5)" }}>
                  <Trash2 size={15} aria-hidden="true" /> Delete
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Delete confirm */}
        {confirmDelete && (
          <div role="alertdialog" aria-modal="true" aria-label="Confirm delete" style={{ position: "fixed", inset: 0, zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.65)", padding: 20 }}>
            <div style={{ background: "#131722", border: `1px solid ${COLORS.borderGlass}`, borderRadius: RADIUS.lg, padding: 24, maxWidth: 380, width: "100%" }}>
              <h3 style={{ margin: "0 0 8", fontSize: 17, fontWeight: 800 }}>Delete this message?</h3>
              <p style={{ margin: "0 0 16", fontSize: 14, color: COLORS.textDim }}>It will be removed from your history view.</p>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" onClick={() => setConfirmDelete(false)} className="btn-ghost" style={{ minHeight: 44, padding: "0 16px", fontSize: 14 }}>
                  Cancel
                </button>
                <button type="button" onClick={handleDelete} className="btn-gradient" style={{ minHeight: 44, padding: "0 16px", fontSize: 14 }}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.main>
    </div>
  )
}
