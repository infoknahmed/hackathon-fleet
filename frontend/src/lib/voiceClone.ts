/**
 * Voice cloning — Phase 3.
 *
 * Privacy-first design:
 *   - Voice samples are recorded in-browser and stored ONLY in IndexedDB,
 *     encrypted with the user's passphrase (AES-style keystream derived
 *     from SHA-256 — light protection against casual extraction).
 *   - Synthesis tries the backend (Coqui XTTS-v2) first; when the server
 *     is unavailable/not configured it falls back to the user's native
 *     TTS pitch-shifted to match their recorded pitch profile, so output
 *     always sounds close to the user's own voice.
 */

import { API_BASE } from "./api"

/* ── Types ─────────────────────────────────────────────────────── */

export interface VoiceProfile {
  /** Average fundamental frequency (Hz) across samples. */
  pitchHz: number
  /** Pitch variance proxy (Hz stddev). */
  pitchSpread: number
  /** Native TTS voice URI closest to the user's voice (if any). */
  matchedVoiceURI: string | null
  /** Synthesis strategy selected after recording. */
  strategy: "server" | "local-pitch"
  /** Rough server-side clone quality label (0–100). */
  quality: number
  createdAt: number
  sampleCount: number
}

const DB_NAME = "vaaksetu-voice"
const DB_VERSION = 1
const SAMPLES_KEY = "samples"
const PROFILE_KEY = "profile"
const SALT = "vaaksetu-voice-v1"

/* ── Encryption (passphrase-derived keystream) ─────────────────── */

async function deriveKey(passphrase: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const base = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, [
    "deriveKey",
  ])
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode(SALT), iterations: 120_000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
}

async function encryptJson(data: unknown, passphrase: string): Promise<ArrayBuffer> {
  const key = await deriveKey(passphrase)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(data))
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext)
  // Prepend IV for later decryption.
  const out = new Uint8Array(iv.length + cipher.byteLength)
  out.set(iv)
  out.set(new Uint8Array(cipher), iv.length)
  return out.buffer
}

async function decryptJson<T>(buffer: ArrayBuffer, passphrase: string): Promise<T> {
  const key = await deriveKey(passphrase)
  const iv = new Uint8Array(buffer.slice(0, 12))
  const cipher = buffer.slice(12)
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher)
  return JSON.parse(new TextDecoder().decode(plain)) as T
}

/* ── IndexedDB (tiny hand-rolled wrapper, no deps) ─────────────── */

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv")
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error("idb open failed"))
  })
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readonly")
    const req = tx.objectStore("kv").get(key)
    req.onsuccess = () => resolve((req.result as T) ?? null)
    req.onerror = () => reject(req.error ?? new Error("idb get failed"))
  })
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite")
    tx.objectStore("kv").put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("idb set failed"))
  })
}

async function idbDel(key: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readwrite")
    tx.objectStore("kv").delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("idb delete failed"))
  })
}

/* ── Recording + pitch analysis ────────────────────────────────── */

export interface Recording {
  blob: Blob
  durationSec: number
}

/** Record from the default mic until stop() is called. */
export function startRecording(): Promise<{ stop: () => Promise<Recording> }> {
  return new Promise((resolve, reject) => {
    navigator.mediaDevices
      .getUserMedia({ audio: { channelCount: 1, echoCancellation: true } })
      .then((stream) => {
        const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : ""
        const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
        const chunks: Blob[] = []
        const started = performance.now()
        recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
        recorder.start()
        resolve({
          stop: () =>
            new Promise<Recording>((res, rej) => {
              recorder.onstop = () => {
                stream.getTracks().forEach((t) => t.stop())
                const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" })
                res({ blob, durationSec: (performance.now() - started) / 1000 })
              }
              recorder.onerror = () => rej(new Error("recording failed"))
              recorder.stop()
            }),
        })
      })
      .catch(() => reject(new Error("Microphone access denied.")))
  })
}

/** Decode audio to mono Float32 PCM at the buffer's native rate. */
async function decodeMono(blob: Blob): Promise<{ data: Float32Array; rate: number }> {
  const AudioCtx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new AudioCtx()
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer())
    const mono = new Float32Array(buf.length)
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const d = buf.getChannelData(ch)
      for (let i = 0; i < buf.length; i++) mono[i] += d[i] / buf.numberOfChannels
    }
    return { data: mono, rate: buf.sampleRate }
  } finally {
    void ctx.close()
  }
}

/**
 * Estimate median f0 via autocorrelation over 40ms windows.
 * Range 70–400 Hz covers adult speech.
 */
export async function analyzePitch(blob: Blob): Promise<{ hz: number; spread: number }> {
  const { data, rate } = await decodeMono(blob)
  const win = Math.floor(rate * 0.04)
  const hop = win
  const minLag = Math.floor(rate / 400)
  const maxLag = Math.floor(rate / 70)
  const f0s: number[] = []
  for (let start = 0; start + win < data.length; start += hop) {
    const frame = data.subarray(start, start + win)
    let energy = 0
    for (let i = 0; i < win; i++) energy += frame[i] * frame[i]
    if (energy / win < 0.0004) continue // silence gate
    let bestLag = -1
    let bestCorr = 0
    for (let lag = minLag; lag <= maxLag && lag < win; lag++) {
      let corr = 0
      for (let i = 0; i + lag < win; i++) corr += frame[i] * frame[i + lag]
      const norm = corr / (energy || 1)
      if (norm > bestCorr) {
        bestCorr = norm
        bestLag = lag
      }
    }
    if (bestLag > 0 && bestCorr > 0.35) f0s.push(rate / bestLag)
  }
  if (f0s.length < 5) return { hz: 0, spread: 0 }
  f0s.sort((a, b) => a - b)
  const median = f0s[Math.floor(f0s.length / 2)]
  const mean = f0s.reduce((a, b) => a + b, 0) / f0s.length
  const variance = f0s.reduce((a, b) => a + (b - mean) ** 2, 0) / f0s.length
  return { hz: Math.round(median), spread: Math.round(Math.sqrt(variance)) }
}

/** Pick the installed native voice whose average pitch best matches. */
function matchNativeVoice(targetHz: number): string | null {
  const voices = speechSynthesis.getVoices()
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en"))
  if (english.length === 0) return null
  // Heuristic defaults: female-en voice ~180Hz, male ~120Hz.
  const scored = english.map((v) => {
    const nameHint = /female|zira|samantha|google uk english female|heera/i.test(v.name) ? 185 : 120
    return { uri: v.voiceURI, dist: Math.abs(nameHint - targetHz) }
  })
  scored.sort((a, b) => a.dist - b.dist)
  return scored[0]?.uri ?? null
}

/* ── Profile persistence (encrypted) ───────────────────────────── */

export async function saveVoiceProfile(
  samples: Blob[],
  passphrase: string,
): Promise<VoiceProfile> {
  const analyses = await Promise.all(samples.map((s) => analyzePitch(s)))
  const valid = analyses.filter((a) => a.hz > 0)
  const hz = valid.length > 0 ? valid.reduce((a, b) => a + b.hz, 0) / valid.length : 0
  const spread = valid.length > 0 ? Math.max(...valid.map((a) => a.spread)) : 0
  const base64 = await Promise.all(samples.map(blobToBase64))
  const profile: VoiceProfile = {
    pitchHz: Math.round(hz),
    pitchSpread: spread,
    matchedVoiceURI: hz > 0 ? matchNativeVoice(hz) : null,
    strategy: "local-pitch",
    quality: Math.min(95, 40 + samples.length * 18),
    createdAt: Date.now(),
    sampleCount: samples.length,
  }
  await idbSet(SAMPLES_KEY, await encryptJson(base64, passphrase))
  await idbSet(PROFILE_KEY, await encryptJson(profile, passphrase))
  return profile
}

export async function loadVoiceProfile(passphrase: string): Promise<VoiceProfile | null> {
  try {
    const enc = await idbGet<ArrayBuffer>(PROFILE_KEY)
    if (!enc) return null
    return await decryptJson<VoiceProfile>(enc, passphrase)
  } catch {
    return null // wrong passphrase or corrupt
  }
}

export async function loadVoiceSamples(passphrase: string): Promise<Blob[] | null> {
  try {
    const enc = await idbGet<ArrayBuffer>(SAMPLES_KEY)
    if (!enc) return null
    const base64 = await decryptJson<string[]>(enc, passphrase)
    return base64.map(b64toBlob)
  } catch {
    return null
  }
}

export async function hasVoiceProfile(): Promise<boolean> {
  return (await idbGet<unknown>(PROFILE_KEY)) !== null
}

export async function deleteVoiceProfile(): Promise<void> {
  await idbDel(SAMPLES_KEY)
  await idbDel(PROFILE_KEY)
}

/* ── Preferences ───────────────────────────────────────────────── */

const CLONE_TOGGLE_KEY = "vaaksetu-cloned-voice"

export function isClonedVoiceEnabled(): boolean {
  try {
    return localStorage.getItem(CLONE_TOGGLE_KEY) === "1"
  } catch {
    return false
  }
}

export function setClonedVoiceEnabled(on: boolean): void {
  try {
    localStorage.setItem(CLONE_TOGGLE_KEY, on ? "1" : "0")
  } catch {
    /* ignore */
  }
}

/* ── Synthesis ─────────────────────────────────────────────────── */

/**
 * Speak `text` in the user's cloned voice.
 * Returns the engine actually used.
 */
export async function speakCloned(
  text: string,
  passphrase: string,
): Promise<"server" | "local-pitch" | "native"> {
  const profile = await loadVoiceProfile(passphrase)
  if (!profile) {
    // No profile — plain native speech.
    const { speak } = await import("./speech")
    speak(text)
    return "native"
  }

  // 1) Server-side XTTS-v2 clone (best quality).
  try {
    const samples = await loadVoiceSamples(passphrase)
    if (samples && samples.length >= 2) {
      const audioUrl = await serverVoiceClone(text, samples)
      await playUrl(audioUrl)
      return "server"
    }
  } catch {
    /* server unavailable — fall through */
  }

  // 2) Local pitch-matched native voice.
  pitchMatchedSpeak(text, profile)
  return "local-pitch"
}

/** POST the samples + text to the backend XTTS-v2 endpoint; returns audio URL. */
export async function serverVoiceClone(text: string, samples: Blob[]): Promise<string> {
  const form = new FormData()
  form.append("text", text)
  samples.slice(0, 3).forEach((s, i) => form.append(`sample${i}`, s, `sample${i}.webm`))
  const res = await fetch(`${API_BASE}/api/tts/voice-clone`, {
    method: "POST",
    body: form,
  })
  if (!res.ok) throw new Error(`voice clone failed: ${res.status}`)
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

/** Play an audio URL and resolve when playback finishes. */
export function playUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url)
    audio.onended = () => {
      URL.revokeObjectURL(url)
      resolve()
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("audio playback failed"))
    }
    void audio.play()
  })
}

/** Native TTS with pitch/rate tuned from the recorded profile. */
export function pitchMatchedSpeak(text: string, profile: VoiceProfile): void {
  void import("./speech").then(({ speak }) => {
    const targetHz = profile.pitchHz || 165
    // Map f0 → pitch multiplier (native female ~185Hz, male ~120Hz at pitch=1).
    const pitch = Math.max(0.5, Math.min(1.8, 1 + (165 - targetHz) / 130))
    const matched = profile.matchedVoiceURI
    const settings = {
      voiceURI: matched,
      rate: 0.95,
      pitch: Number(pitch.toFixed(2)),
    }
    speak(text, settings)
  })
}

/* ── Session passphrase ────────────────────────────────────────── */

const SESSION_KEY = "vaaksetu-voice-pass"

/**
 * Remember the passphrase for this tab session only (sessionStorage).
 * Unlock once on /voice-setup; every later speech uses it silently.
 */
export function rememberPassphrase(pass: string): void {
  try {
    sessionStorage.setItem(SESSION_KEY, pass)
  } catch {
    /* ignore */
  }
}

/** Get the session passphrase (null when the tab was fresh-opened). */
export function getStoredPassphrase(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY)
  } catch {
    return null
  }
}

/**
 * Central TTS entry: speaks with the cloned voice when enabled + unlocked,
 * otherwise falls back to normal native speech. Drop-in replacement for
 * `speak()` so every page can honor the cloned-voice toggle.
 */
export function speakForUser(text: string): void {
  if (!isClonedVoiceEnabled()) {
    void import("./speech").then(({ speak }) => speak(text))
    return
  }
  const pass = getStoredPassphrase()
  if (!pass) {
    // Tab re-opened: profile is locked, use pitch profile-less native voice.
    void import("./speech").then(({ speak }) => speak(text))
    return
  }
  void speakCloned(text, pass).catch(() => undefined)
}

/* ── Blob helpers ──────────────────────────────────────────────── */

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error("blob read failed"))
    reader.readAsDataURL(blob)
  })
}

function b64toBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(",")
  const mime = /:(.*?);/.exec(meta)?.[1] ?? "audio/webm"
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}
