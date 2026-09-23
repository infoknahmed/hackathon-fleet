import { useCallback, useEffect, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { motion } from "motion/react"
import { Mic, Square, Check, Lock, Play, RotateCcw, ShieldCheck, ArrowRight } from "lucide-react"
import {
  startRecording,
  saveVoiceProfile,
  pitchMatchedSpeak,
  isClonedVoiceEnabled,
  setClonedVoiceEnabled,
  rememberPassphrase,
} from "../lib/voiceClone"
import type { VoiceProfile } from "../lib/voiceClone"
import { COLORS, FONT, RADIUS, SHADOW, TAP_MIN } from "../theme"
import TopNav from "../components/TopNav"
import { announce } from "../lib/a11y"
import { playSuccess, playError } from "../lib/soundEffects"

/**
 * /voice-setup — Phase 3A wizard.
 * Step 1: record 3 short sentences (each ~5s, re-recordable).
 * Step 2: processing — waveform + progress while analyzing pitch and
 *         encrypting samples into IndexedDB with the user's passphrase.
 * Step 3: your voice is ready — preview + finish.
 */

const SCRIPTS = [
  "The blue sky over the harbour turns gold at sunset.",
  "I need water, my medicine, and a warm blanket, please.",
  "Seven friends walked quickly past forty green trees.",
]

const STEPS = ["Record", "Processing", "Ready"] as const

function cardStyle(): CSSProperties {
  return {
    background: "rgba(30, 41, 59, 0.55)",
    backdropFilter: "blur(20px) saturate(150%)",
    WebkitBackdropFilter: "blur(20px) saturate(150%)",
    border: `1px solid ${COLORS.borderGlass}`,
    borderRadius: RADIUS.lg,
    padding: 20,
    boxShadow: SHADOW.md,
  }
}

export default function VoiceSetupPage() {
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [passphrase, setPassphrase] = useState("")
  const [current, setCurrent] = useState(0)
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [samples, setSamples] = useState<(Blob | null)[]>([null, null, null])
  const [progress, setProgress] = useState(0)
  const [profile, setProfile] = useState<VoiceProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(() => isClonedVoiceEnabled())

  const recorderRef = useRef<{ stop: () => Promise<{ blob: Blob; durationSec: number }> } | null>(null)
  const rafRef = useRef<number | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const startedAtRef = useRef(0)

  // Live mic level + timer while recording.
  const tick = useCallback(() => {
    setElapsed((performance.now() - startedAtRef.current) / 1000)
    if (rafRef.current != null) rafRef.current = requestAnimationFrame(tick)
  }, [])

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      void audioCtxRef.current?.close().catch(() => undefined)
    }
  }, [])

  const startOne = async (index: number) => {
    setError(null)
    try {
      const handle = await startRecording()
      recorderRef.current = handle
      startedAtRef.current = performance.now()
      setRecording(true)
      setCurrent(index)
      announce(`Recording sentence ${index + 1}`)
      // Mic meter.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null)
      if (stream) {
        stream.getTracks().forEach((t) => t.stop()) // recorder already has its own stream
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start recording")
      playError()
    }
  }

  const stopOne = async () => {
    if (!recorderRef.current) return
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    setRecording(false)
    try {
      const rec = await recorderRef.current.stop()
      if (rec.durationSec < 1.5) {
        setError("Too short — hold for at least 2 seconds.")
        playError()
        return
      }
      setSamples((prev) => {
        const next = [...prev]
        next[current] = rec.blob
        return next
      })
      playSuccess()
      announce(`Sentence ${current + 1} recorded`)
      // Auto-advance to the next unrecorded sentence.
      const nextIdx = samples.findIndex((s, i) => i !== current && !s)
      if (nextIdx >= 0) setCurrent(nextIdx)
    } catch {
      setError("Recording failed — try again.")
      playError()
    }
  }

  const allRecorded = samples.every((s) => s !== null)
  const canProcess = allRecorded && passphrase.length >= 6

  /** Step 2: analyze pitch + encrypt + persist, then move to step 3. */
  const process = async () => {
    setStep(1)
    setProgress(8)
    try {
      const blobs = samples.filter((s): s is Blob => s !== null)
      setProgress(25)
      const prof = await saveVoiceProfile(blobs, passphrase)
      rememberPassphrase(passphrase)
      setProgress(75)
      // Simulated finalize tick so the processing UI is perceivable.
      await new Promise((r) => window.setTimeout(r, 500))
      setProgress(100)
      setProfile(prof)
      setClonedVoiceEnabled(true)
      setEnabled(true)
      setStep(2)
      playSuccess()
      announce("Your voice profile is ready")
    } catch {
      setError("Processing failed — check your passphrase and try again.")
      setStep(0)
      playError()
    }
  }

  const preview = () => {
    if (!profile) return
    pitchMatchedSpeak("Hello, this is how I will sound when I speak for you.", profile)
  }

  const done = () => {
    setClonedVoiceEnabled(enabled)
    window.location.href = "/voices"
  }

  const stepper = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }} aria-hidden="true">
      {STEPS.map((label, i) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 900,
              background: i <= step ? COLORS.accent : "rgba(148,163,184,0.2)",
              color: i <= step ? "#04121F" : COLORS.textDim,
            }}
          >
            {i < step ? <Check size={15} /> : i + 1}
          </span>
          <span style={{ fontSize: 13, fontWeight: 800, color: i <= step ? COLORS.text : COLORS.textDim }}>{label}</span>
          {i < STEPS.length - 1 && <span style={{ width: 26, height: 2, background: COLORS.borderGlass }} />}
        </div>
      ))}
    </div>
  )

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: FONT, padding: "0 16px 60px", maxWidth: 760, margin: "0 auto" }}>
      <TopNav />
      <motion.main initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 12 }}>
        <header>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900 }}>Preserve your voice</h1>
          <p style={{ margin: "4px 0 0", fontSize: 15, color: COLORS.textDim }}>
            Record three short sentences. VaakSetu builds a private voice profile so the app can
            speak in <strong>your</strong> voice — stored encrypted on this device only.
          </p>
        </header>

        {stepper}

        {error && (
          <p role="alert" style={{ margin: 0, fontSize: 14, fontWeight: 700, color: COLORS.danger }}>
            {error}
          </p>
        )}

        {/* STEP 1 — Record */}
        {step === 0 && (
          <>
            <div style={cardStyle()}>
              <label htmlFor="vp-pass" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 800, marginBottom: 8 }}>
                <Lock size={16} aria-hidden="true" /> Encryption passphrase (min 6 characters)
              </label>
              <input
                id="vp-pass"
                type="password"
                value={passphrase}
                minLength={6}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Used to encrypt your voice on this device"
                aria-describedby="vp-pass-help"
                style={{ width: "100%", minHeight: TAP_MIN, background: "rgba(10, 25, 41, 0.6)", color: COLORS.text, border: `1px solid ${COLORS.borderGlass}`, borderRadius: RADIUS.md, padding: "10px 14px", fontSize: 16, fontFamily: FONT }}
              />
              <p id="vp-pass-help" style={{ margin: "8px 0 0", fontSize: 12.5, color: COLORS.textDim, display: "flex", alignItems: "center", gap: 6 }}>
                <ShieldCheck size={14} aria-hidden="true" />
                AES-GCM encrypted in your browser's IndexedDB. Never uploaded without your action.
              </p>
            </div>

            <div style={{ ...cardStyle(), display: "flex", flexDirection: "column", gap: 14 }}>
              {SCRIPTS.map((script, i) => {
                const done2 = samples[i] !== null
                const active = recording && current === i
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span
                      aria-hidden="true"
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: "50%",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 900,
                        fontSize: 14,
                        background: done2 ? COLORS.success : active ? COLORS.danger : "rgba(148,163,184,0.2)",
                        color: done2 || active ? "#04121F" : COLORS.textDim,
                        flexShrink: 0,
                      }}
                    >
                      {done2 ? <Check size={16} /> : i + 1}
                    </span>
                    <p style={{ margin: 0, flex: 1, minWidth: 220, fontSize: 16, fontWeight: 600, lineHeight: 1.45 }}>
                      “{script}”
                    </p>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.94 }}
                      onClick={() => (active ? void stopOne() : void startOne(i))}
                      aria-label={active ? `Stop recording sentence ${i + 1}` : done2 ? `Re-record sentence ${i + 1}` : `Record sentence ${i + 1}`}
                      aria-pressed={active}
                      style={{
                        width: 58,
                        height: 58,
                        borderRadius: "50%",
                        border: "none",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        background: active ? `radial-gradient(circle at 30% 30%, #F87171, ${COLORS.danger})` : done2 ? `linear-gradient(135deg, ${COLORS.success}, #0E7A54)` : `linear-gradient(135deg, ${COLORS.accentBright}, ${COLORS.accentDeep})`,
                        color: "#04121F",
                        boxShadow: SHADOW.accentGlow,
                      }}
                    >
                      {active ? <Square size={22} aria-hidden="true" /> : done2 ? <RotateCcw size={20} aria-hidden="true" /> : <Mic size={22} aria-hidden="true" />}
                    </motion.button>
                    {active && (
                      <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.danger, fontVariantNumeric: "tabular-nums", minWidth: 48 }}>
                        {elapsed.toFixed(1)}s
                      </span>
                    )}
                  </div>
                )
              })}
              {recording && (
                <div aria-hidden="true" style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 34 }}>
                  {Array.from({ length: 24 }).map((_, i) => (
                    <motion.span
                      key={i}
                      animate={{ height: 6 + ((i * 7919) % 26) * 0.9 }}
                      transition={{ duration: 0.14 }}
                      style={{ width: 5, borderRadius: 2, background: COLORS.accent, opacity: 0.7, display: "inline-block" }}
                    />
                  ))}
                </div>
              )}
            </div>

            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => void process()}
              disabled={!canProcess}
              className="btn-gradient"
              style={{ minHeight: TAP_MIN + 8, padding: "0 26px", fontSize: 17, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 10, alignSelf: "flex-start", opacity: canProcess ? 1 : 0.5 }}
            >
              {allRecorded ? "Build my voice profile" : `Record all ${3 - samples.filter((s) => s !== null).length} remaining`} <ArrowRight size={18} aria-hidden="true" />
            </motion.button>
          </>
        )}

        {/* STEP 2 — Processing */}
        {step === 1 && (
          <div style={{ ...cardStyle(), display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: 36 }}>
            <div aria-hidden="true" style={{ display: "flex", gap: 5, alignItems: "flex-end", height: 60 }}>
              {Array.from({ length: 20 }).map((_, i) => (
                <motion.span
                  key={i}
                  animate={{ height: [8, 14 + ((i * 104729) % 42), 8] }}
                  transition={{ repeat: Infinity, duration: 0.8 + (i % 5) * 0.12, ease: "easeInOut" }}
                  style={{ width: 7, borderRadius: 3, background: `linear-gradient(180deg, ${COLORS.accent}, ${COLORS.violet})`, display: "inline-block" }}
                />
              ))}
            </div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Analyzing your voice…</h2>
            <p style={{ margin: 0, fontSize: 14, color: COLORS.textDim }}>Pitch fingerprint + AES-GCM encryption on-device</p>
            <div
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Processing progress"
              style={{ width: "100%", maxWidth: 380, height: 8, borderRadius: RADIUS.pill, background: "rgba(148,163,184,0.2)", overflow: "hidden" }}
            >
              <div style={{ width: `${progress}%`, height: "100%", background: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.violet})`, transition: "width 0.4s ease" }} />
            </div>
          </div>
        )}

        {/* STEP 3 — Ready */}
        {step === 2 && profile && (
          <div style={{ ...cardStyle(), display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: 32, textAlign: "center" }}>
            <motion.span
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 18 }}
              style={{ width: 74, height: 74, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: COLORS.successSoft, border: `2px solid ${COLORS.success}`, color: COLORS.success }}
            >
              <Check size={38} aria-hidden="true" />
            </motion.span>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Your voice is ready 🎙️</h2>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", justifyContent: "center", fontSize: 14, color: COLORS.textDim }}>
              <span>Pitch: <strong style={{ color: COLORS.text }}>{profile.pitchHz} Hz</strong></span>
              <span>Samples: <strong style={{ color: COLORS.text }}>{profile.sampleCount}</strong></span>
              <span>Match quality: <strong style={{ color: COLORS.text }}>{profile.quality}%</strong></span>
            </div>
            <button type="button" onClick={preview} className="btn-ghost" style={{ minHeight: TAP_MIN, padding: "0 20px", display: "inline-flex", alignItems: "center", gap: 8, fontSize: 15 }}>
              <Play size={17} aria-hidden="true" /> Preview my voice
            </button>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} style={{ width: 20, height: 20, accentColor: COLORS.accent }} />
              Use my cloned voice for all speech
            </label>
            <motion.button type="button" whileTap={{ scale: 0.97 }} onClick={done} className="btn-gradient" style={{ minHeight: TAP_MIN + 6, padding: "0 28px", fontSize: 17, fontWeight: 800 }}>
              Save & finish
            </motion.button>
          </div>
        )}
      </motion.main>
    </div>
  )
}
