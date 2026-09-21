// Cross-device message bus for VaakSetu.
// Powered by Socket.IO — works across ALL devices connected to the same backend.

import { io, Socket } from 'socket.io-client'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

/** REST base — same origin as the socket, used for persistence + hydration. */
const REST_URL = API_URL.replace(/\/$/, '')

/** Persist a message via the backend REST API (fire-and-forget). */
function persistToApi(payload: WireShape): void {
  fetch(`${REST_URL}/api/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch((err) => console.warn('[messageBus] REST persist failed:', err))
}

/** Hydrate recent messages from the backend on page load. */
export async function fetchHistory(limit = 50): Promise<VaakSetuMessage[]> {
  try {
    const res = await fetch(`${REST_URL}/api/messages?limit=${limit}`)
    if (!res.ok) return []
    const raw = (await res.json()) as unknown[]
    return raw
      .map((r) => fromWire(r))
      .filter((m): m is VaakSetuMessage => m !== null)
      .reverse() // oldest → newest so pages can append
  } catch (err) {
    console.warn('[messageBus] fetchHistory failed:', err)
    return []
  }
}

/** Fetch a specific user's messages (History tab). */
export async function fetchUserMessages(userId: string, limit = 50): Promise<VaakSetuMessage[]> {
  try {
    const res = await fetch(`${REST_URL}/api/messages?userId=${encodeURIComponent(userId)}&limit=${limit}`)
    if (!res.ok) return []
    const raw = (await res.json()) as unknown[]
    return raw
      .map((r) => fromWire(r))
      .filter((m): m is VaakSetuMessage => m !== null)
  } catch (err) {
    console.warn('[messageBus] fetchUserMessages failed:', err)
    return []
  }
}

/** DELETE /api/messages?userId=X — clear a user's persisted history. */
export async function deleteUserMessages(userId: string): Promise<boolean> {
  try {
    const res = await fetch(`${REST_URL}/api/messages?userId=${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    })
    return res.ok
  } catch {
    return false
  }
}

/** POST /api/replies — persist a guardian reply. */
export async function postReply(text: string, userId: string, messageId?: string): Promise<boolean> {
  try {
    const res = await fetch(`${REST_URL}/api/replies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, userId, messageId }),
    })
    return res.ok
  } catch {
    return false
  }
}

/** PATCH /api/messages/:id/delivered — mark a message as delivered. */
export async function markDelivered(id: string): Promise<void> {
  try {
    await fetch(`${REST_URL}/api/messages/${encodeURIComponent(id)}/delivered`, {
      method: 'PATCH',
    })
  } catch {
    /* best-effort */
  }
}

/** GET /api/admin/stats — admin dashboard numbers. */
export interface AdminStats {
  totalMessages: number
  emergencies: number
  activeUsers: number
  avgConfidence: number
  byRole: { name: string; value: number }[]
}

export async function fetchAdminStats(days = 7): Promise<AdminStats | null> {
  try {
    const res = await fetch(`${REST_URL}/api/admin/stats?days=${days}`)
    if (!res.ok) return null
    return (await res.json()) as AdminStats
  } catch {
    return null
  }
}

/** GET /api/admin/timeline — per-day message counts. */
export async function fetchAdminTimeline(
  days = 7,
): Promise<{ day: string; count: number }[] | null> {
  try {
    const res = await fetch(`${REST_URL}/api/admin/timeline?days=${days}`)
    if (!res.ok) return null
    return (await res.json()) as { day: string; count: number }[]
  } catch {
    return null
  }
}

/** Base fields every message carries. */
export interface BaseMessage {
  id?: string
  latencyMs?: number
  timestamp: number
}

/** A sentence spoken by the user (pictogram pick or SOS). */
export interface DataMessage extends BaseMessage {
  type: 'message'
  text: string
  pictograms: { id: string; label: string; emoji: string }[]
  /** 0–100 */
  confidence: number
  mood: string
  emergency?: boolean
}

/** A guardian's answer, delivered back to the user dashboard. */
export interface ReplyMessage extends BaseMessage {
  type: 'reply'
  text: string
}

/** A standalone mood update. */
export interface MoodMessage extends BaseMessage {
  type: 'mood'
  mood: string
}

/** A sign-language gesture sent from the /sign page. */
export interface SignMessage extends BaseMessage {
  type: 'sign'
  text: string
  confidence?: number
}

/** Anything the app can put on the bus. */
export type VaakSetuMessage = DataMessage | ReplyMessage | MoodMessage | SignMessage

const SOCKET_EVENTS = {
  SEND: 'message:send',
  NEW: 'message:new',
  HISTORY: 'messages:history'
} as const

/**
 * The backend (backend/server.js) rebuilds every incoming payload through
 * makeMessage(), which only keeps role/content/confidence/lang/emergency.
 * We smuggle the richer client shape through `role` and `content` so the
 * original type survives the round-trip and every dashboard keeps working.
 */
interface WireShape {
  role: string
  content: string
  confidence: number
  emergency: boolean
  lang?: string
  [key: string]: unknown
}

/** Serializes a typed app message into the backend's wire shape. */
function toWire(msg: VaakSetuMessage): WireShape {
  const base: WireShape = {
    role: msg.type, // smuggled discriminator (backend passes it through)
    content: msg.type === 'mood' ? msg.mood : msg.text,
    confidence:
      msg.type === 'message'
        ? msg.confidence
        : msg.type === 'sign'
          ? msg.confidence ?? 95
          : 100,
    emergency: msg.type === 'message' ? Boolean(msg.emergency) : false,
  }
  if (msg.type === 'message') {
    base.pictograms = msg.pictograms
    base.mood = msg.mood
  }
  if (msg.type === 'mood') base.mood = msg.mood
  return base
}

/**
 * Rebuilds a typed app message from what the backend echoes back.
 * Accepts both the backend's makeMessage shape and plain client payloads.
 */
function fromWire(raw: unknown): VaakSetuMessage | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>

  const numericTs = toNumber(m.timestamp)
  // Backend stamps timestamps as ISO strings — parse them.
  const ts =
    numericTs ??
    (typeof m.timestamp === 'string' && m.timestamp
      ? Date.parse(m.timestamp) || Date.now()
      : Date.now())
  const id = typeof m.id === 'string' && m.id ? m.id : undefined

  // Messages sent through toWire() carry the real type in `role`.
  const type = typeof m.role === 'string' && m.role !== 'user' ? m.role : m.type
  const text =
    typeof m.content === 'string' && m.content
      ? m.content
      : typeof m.text === 'string'
        ? m.text
        : ''
  const confidence = toNumber(m.confidence) ?? 90

  switch (type) {
    case 'message':
      return {
        type: 'message',
        id,
        timestamp: ts,
        text,
        pictograms: Array.isArray(m.pictograms)
          ? (m.pictograms as DataMessage['pictograms'])
          : [],
        confidence,
        mood: typeof m.mood === 'string' ? m.mood : 'Neutral',
        emergency: Boolean(m.emergency),
        latencyMs: toNumber(m.latencyMs),
      }
    case 'reply':
      return { type: 'reply', id, timestamp: ts, text }
    case 'mood':
      return {
        type: 'mood',
        id,
        timestamp: ts,
        mood: typeof m.mood === 'string' ? m.mood : text,
      }
    case 'sign':
      return { type: 'sign', id, timestamp: ts, text, confidence }
    default:
      return null
  }
}

function toNumber(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}

// ── Socket.IO client (singleton) ────────────────────────────────
let socket: Socket | null = null
const subscribers = new Set<(msg: VaakSetuMessage) => void>()
const localEcho = new Set<string>()
/** Fallback echo suppression when the backend strips our id. */
let lastSentAt = 0
let recentSentFingerprint: string | null = null

function handleIncoming(raw: unknown): void {
  const msg = fromWire(raw)
  if (!msg) return
  if (msg.id && localEcho.has(msg.id)) {
    localEcho.delete(msg.id)
    return
  }
  // Backend strips ids: drop a same-shape echo within a short window.
  const fingerprint = `${msg.type}|${msg.type === 'mood' ? msg.mood : msg.text}`
  if (
    !msg.id &&
    recentSentFingerprint !== null &&
    recentSentFingerprint === fingerprint &&
    Date.now() - lastSentAt < 1500
  ) {
    recentSentFingerprint = null
    return
  }
  subscribers.forEach((cb) => cb(msg))
}

function ensureSocket(): Socket {
  if (socket) return socket

  socket = io(API_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
  })

  socket.on(SOCKET_EVENTS.NEW, handleIncoming)

  socket.on(SOCKET_EVENTS.HISTORY, (history: unknown) => {
    if (!Array.isArray(history)) return
    history.slice(-50).forEach((raw) => {
      const msg = fromWire(raw)
      if (msg) subscribers.forEach((cb) => cb(msg))
    })
  })

  socket.on('connect', () => {
    console.log('[messageBus] Connected to backend:', API_URL)
  })

  socket.on('disconnect', (reason) => {
    console.warn('[messageBus] Disconnected:', reason)
  })

  socket.on('connect_error', (err) => {
    console.warn('[messageBus] Connection error (will retry):', err.message)
  })

  return socket
}

ensureSocket()

// ── Public API — MUST match what pages import ─────────────────────

/**
 * Subscribe to incoming messages.
 * Returns an unsubscribe function.
 */
export function subscribeToMessages(cb: (msg: VaakSetuMessage) => void): () => void {
  subscribers.add(cb)
  return () => {
    subscribers.delete(cb)
  }
}

/**
 * Send a message via the backend.
 * The backend broadcasts to all connected clients via 'message:new'.
 */
export function sendMessage(msg: VaakSetuMessage): void {
  const s = ensureSocket()
  if (msg.id) localEcho.add(msg.id)
  lastSentAt = Date.now()
  recentSentFingerprint =
    msg.type === 'mood' ? `mood|${msg.mood}` : `${msg.type}|${msg.text}`
  const payload: WireShape = {
    ...toWire(msg),
    id: msg.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: msg.timestamp,
  }
  // Persist via REST (SQLite) — survives restarts; socket stays real-time.
  persistToApi(payload)
  s.emit(SOCKET_EVENTS.SEND, payload)
}

/** Stable pseudo-user for this browser session, shown on dashboards. */
export function getUserId(): string {
  if (typeof localStorage === 'undefined') return 'anon'
  let id = localStorage.getItem('vaaksetu-user-id')
  if (!id) {
    id = Math.random().toString(36).slice(2, 8).toUpperCase()
    localStorage.setItem('vaaksetu-user-id', id)
  }
  return id
}
