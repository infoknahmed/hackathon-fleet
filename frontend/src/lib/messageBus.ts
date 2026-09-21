/**
 * Cross-tab message bus for VaakSetu.
 * BroadcastChannel works across browser tabs/windows on the same machine —
 * perfect for the live demo (user tab → guardian/admin tabs).
 *
 * Posts are also delivered to local subscribers, so the sending tab (e.g. the
 * scripted demo running inside the Guardian tab) sees its own messages.
 */

interface BaseMessage {
  /** Optional stable id; receivers synthesize one when missing. */
  id?: string
  timestamp: number
  /** ms between send and receive, set on the receiving side */
  latencyMs?: number
}

/** A sentence spoken by the user (pictogram pick or SOS). */
export interface DataMessage extends BaseMessage {
  type: "message"
  text: string
  pictograms: { id: string; label: string; emoji: string }[]
  /** 0–100 */
  confidence: number
  mood: string
  emergency?: boolean
}

/** A guardian's answer, delivered back to the user dashboard. */
export interface ReplyMessage extends BaseMessage {
  type: "reply"
  text: string
}

/** A standalone mood update. */
export interface MoodMessage extends BaseMessage {
  type: "mood"
  mood: string
}

export type VaakSetuMessage = DataMessage | ReplyMessage | MoodMessage

const CHANNEL_NAME = "vaaksetu-messages"

const channel: BroadcastChannel | null =
  typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null

const localListeners = new Set<(msg: VaakSetuMessage) => void>()

export function sendMessage(msg: VaakSetuMessage): void {
  // Local echo first (same-tab subscribers), then broadcast to other tabs.
  for (const listener of localListeners) listener(msg)
  channel?.postMessage(msg)
}

export function subscribeToMessages(
  callback: (msg: VaakSetuMessage) => void,
): () => void {
  localListeners.add(callback)

  if (!channel) {
    console.warn("[VaakSetu] BroadcastChannel not supported in this browser.")
    return () => {
      localListeners.delete(callback)
    }
  }

  const handler = (event: MessageEvent) => callback(event.data as VaakSetuMessage)
  channel.addEventListener("message", handler)
  return () => {
    channel.removeEventListener("message", handler)
    localListeners.delete(callback)
  }
}

/** Stable pseudo-user id for this browser session, shown on dashboards. */
export function getUserId(): string {
  let id = localStorage.getItem("vaaksetu-user-id")
  if (!id) {
    id = `user-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    localStorage.setItem("vaaksetu-user-id", id)
  }
  return id
}
