/**
 * IndexedDB-backed offline layer for VaakSetu (uses the `idb` package).
 *
 * Stores:
 *   - messages : every conversation message (offline-readable history)
 *   - outbox   : messages created while offline, synced when online
 *
 * Sync flow: enqueue → 'online' event | 'vaaksetu-sync' SW message
 * → flushOutbox() → POST /api/messages → remove from outbox → dispatch
 * "vaaksetu:synced" CustomEvent with the synced count for toasts.
 */

import { openDB } from "idb"
import type { IDBPDatabase } from "idb"
import type { VaakSetuMessage } from "./messageBus"
import { sendMessage } from "./messageBus"

const DB_NAME = "vaaksetu-offline"
const DB_VERSION = 1
const MESSAGES_STORE = "messages"
const OUTBOX_STORE = "outbox"

let dbPromise: Promise<IDBPDatabase> | null = null

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
          db.createObjectStore(MESSAGES_STORE, { keyPath: "key" })
        }
        if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
          db.createObjectStore(OUTBOX_STORE, { keyPath: "key" })
        }
      },
    })
  }
  return dbPromise
}

function makeKey(msg: VaakSetuMessage): string {
  return `${msg.timestamp}-${msg.id ?? Math.random().toString(36).slice(2, 8)}`
}

/* ── Local message cache (offline history) ──────────────────────── */

export async function cacheMessage(msg: VaakSetuMessage): Promise<void> {
  try {
    const db = await getDb()
    await db.put(MESSAGES_STORE, { key: makeKey(msg), msg })
  } catch {
    /* IndexedDB unavailable (private mode) — non-fatal */
  }
}

export async function cacheMessages(msgs: VaakSetuMessage[]): Promise<void> {
  try {
    const db = await getDb()
    const tx = db.transaction(MESSAGES_STORE, "readwrite")
    for (const msg of msgs) void tx.store.put({ key: makeKey(msg), msg })
    await tx.done
  } catch {
    /* non-fatal */
  }
}

export async function getCachedMessages(limit = 100): Promise<VaakSetuMessage[]> {
  try {
    const db = await getDb()
    const all = (await db.getAll(MESSAGES_STORE)) as { key: string; msg: VaakSetuMessage }[]
    return all
      .map((r) => r.msg)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
  } catch {
    return []
  }
}

export async function clearCachedMessages(): Promise<void> {
  try {
    const db = await getDb()
    await db.clear(MESSAGES_STORE)
  } catch {
    /* non-fatal */
  }
}

/* ── Outbox (offline → online sync) ─────────────────────────────── */

export async function enqueueMessage(msg: VaakSetuMessage): Promise<void> {
  try {
    const db = await getDb()
    await db.put(OUTBOX_STORE, { key: makeKey(msg), msg })
  } catch {
    /* non-fatal */
  }
}

export async function getOutboxCount(): Promise<number> {
  try {
    const db = await getDb()
    return await db.count(OUTBOX_STORE)
  } catch {
    return 0
  }
}

let flushing = false

/** Sends every queued message through the normal bus; returns count sent. */
export async function flushOutbox(): Promise<number> {
  if (flushing) return 0
  flushing = true
  let synced = 0
  try {
    const db = await getDb()
    const pending = (await db.getAll(OUTBOX_STORE)) as { key: string; msg: VaakSetuMessage }[]
    for (const entry of pending) {
      try {
        sendMessage(entry.msg)
        await db.delete(OUTBOX_STORE, entry.key)
        synced += 1
      } catch {
        break // still offline — keep the rest queued
      }
    }
  } catch {
    /* non-fatal */
  } finally {
    flushing = false
  }
  if (synced > 0) {
    window.dispatchEvent(new CustomEvent("vaaksetu:synced", { detail: { count: synced } }))
  }
  return synced
}

/* ── Connectivity state ─────────────────────────────────────────── */

export function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false
}

/** Install online/offline listeners once per app session. */
let listenersInstalled = false

export function installSyncListeners(): void {
  if (listenersInstalled || typeof window === "undefined") return
  listenersInstalled = true

  window.addEventListener("online", () => {
    void flushOutbox()
    // Ask the service worker to flush too (Background Sync fallback).
    navigator.serviceWorker?.ready
      .then((reg) => reg.active?.postMessage({ type: "vaaksetu-sync" }))
      .catch(() => undefined)
  })

  window.addEventListener("vaaksetu:flush", () => {
    void flushOutbox()
  })

  // Flush anything left over from a previous offline session.
  if (isOnline()) void flushOutbox()
}

/** Request a Background Sync registration where supported. */
export async function requestBackgroundSync(): Promise<void> {
  try {
    const reg = (await navigator.serviceWorker?.ready) as
      | (ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } })
      | undefined
    await reg?.sync?.register("vaaksetu-outbox-sync")
  } catch {
    /* not supported — online event covers it */
  }
}
