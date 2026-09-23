/**
 * AvatarPlayer — Phase 1D.
 *
 * Takes a sentence, converts it to a sign sequence (lib/avatar/sequencer),
 * and animates SigningAvatar through it with spring-smoothed transitions.
 * Includes play/pause/replay, speed control, current-word caption and
 * progress bar. Pausing freezes the current pose mid-sequence.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion } from "motion/react"
import { Pause, Play, RotateCcw } from "lucide-react"
import { SigningAvatar } from "./SigningAvatar"
import type { AvatarMode } from "./SigningAvatar"
import { sentenceToSignSequence } from "../../lib/avatar/sequencer"
import type { SignSequence, SignLanguage } from "../../lib/avatar/sequencer"
import type { SignPose, Expression } from "../../lib/avatar/poses"
import { NEUTRAL_POSE, listeningPose } from "../../lib/avatar/poses"
import { COLORS, FONT, RADIUS } from "../../theme"

export interface AvatarPlayerProps {
  /** Sentence to sign. */
  text: string
  /** Auto-play whenever `text` changes. */
  autoPlay?: boolean
  /** Language hint for the sequencer. */
  lang?: SignLanguage
  size?: number
  /** Fire when the sequence finishes. */
  onComplete?: () => void
  /** Hide the control row (mini contexts). */
  compact?: boolean
  /** Override the expression of every pose (sentiment-driven moods). */
  expression?: Expression | null
  /** When idle: direction the avatar faces (eye contact with speaker). */
  idleFacing?: "left" | "right"
}

interface RuntimeStep {
  pose: SignPose
  token: string
  fingerspelled: boolean
  word?: string
}

export function AvatarPlayer({
  text,
  autoPlay = true,
  lang = "en",
  size = 320,
  onComplete,
  compact = false,
  expression = null,
  idleFacing = "left",
}: AvatarPlayerProps) {
  const seq: SignSequence = useMemo(() => sentenceToSignSequence(text, lang), [text, lang])
  const steps: RuntimeStep[] = useMemo(
    () => seq.steps.map((s) => ({ pose: s.pose, token: s.token, fingerspelled: s.fingerspelled, word: s.word })),
    [seq],
  )

  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(autoPlay && steps.length > 0)
  const [speed, setSpeed] = useState(1)
  const [runId, setRunId] = useState(0)
  const completedRef = useRef(false)
  const timerRef = useRef<number | null>(null)

  // Reset whenever the text (or a replay) changes.
  useEffect(() => {
    setIndex(0)
    completedRef.current = false
    setPlaying(autoPlay && steps.length > 0)
  }, [text, runId, autoPlay, steps.length])

  // Playback clock: advance index by each pose's duration / speed.
  useEffect(() => {
    if (!playing) return
    if (steps.length === 0) {
      onComplete?.()
      return
    }
    if (index >= steps.length) {
      if (!completedRef.current) {
        completedRef.current = true
        onComplete?.()
      }
      setPlaying(false)
      setIndex(steps.length) // hold final rest pose
      return
    }
    const dur = Math.max(160, steps[index].pose.duration / speed)
    timerRef.current = window.setTimeout(() => setIndex((i) => i + 1), dur)
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current)
    }
  }, [playing, index, steps, speed, onComplete])

  const replay = useCallback(() => {
    setRunId((r) => r + 1)
    setIndex(0)
    completedRef.current = false
    setPlaying(true)
  }, [])

  const toggle = useCallback(() => {
    if (index >= steps.length && steps.length > 0) {
      replay()
      return
    }
    setPlaying((p) => !p)
  }, [index, steps.length, replay])

  const current = index < steps.length ? steps[index] : steps.length > 0 ? steps[steps.length - 1] : null
  const progress = steps.length > 0 ? Math.min(index / steps.length, 1) : 0
  const fingerspelledWord = current?.fingerspelled ? current.word : undefined
  const mode: AvatarMode = playing ? "signing" : "listening"

  // Expression override (sentiment) + idle eye-contact pose.
  const renderPose: SignPose = current
    ? { ...current.pose, expression: expression ?? current.pose.expression }
    : listeningPose(idleFacing)

  const captionWord = current?.token && current.token.length > 0 ? current.token : null

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, fontFamily: FONT }}>
      <div style={{ position: "relative", lineHeight: 0 }}>
        <SigningAvatar pose={renderPose} mode={mode} size={size} ariaLabel={text ? `Avatar signing: ${text}` : "Signing avatar idle"} />
      </div>

      {/* Current word caption */}
      <div style={{ minHeight: compact ? 22 : 30, textAlign: "center" }} role="status" aria-live="polite">
        {captionWord ? (
          <motion.span
            key={`${runId}-${index}`}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            style={{
              display: "inline-block",
              fontSize: compact ? 14 : 18,
              fontWeight: 900,
              letterSpacing: 1.2,
              textTransform: fingerspelledWord ? "none" : "uppercase",
              color: fingerspelledWord ? COLORS.textDim : COLORS.accentBright,
            }}
          >
            {fingerspelledWord ? (
              <>
                <span style={{ color: COLORS.accentBright }}>{captionWord.toUpperCase()}</span>
                <span style={{ fontWeight: 600 }}> · spelling “{fingerspelledWord}”</span>
              </>
            ) : (
              captionWord
            )}
          </motion.span>
        ) : null}
      </div>

      {/* Progress bar */}
      {!compact && (
        <div
          role="progressbar"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Sign sequence progress"
          style={{ width: Math.min(size, 340), height: 5, borderRadius: RADIUS.pill, background: "rgba(148,163,184,0.22)", overflow: "hidden" }}
        >
          <div style={{ width: `${progress * 100}%`, height: "100%", background: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.violet})`, transition: "width 0.25s ease" }} />
        </div>
      )}

      {/* Controls */}
      {!compact && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          <button
            type="button"
            onClick={toggle}
            className="btn-gradient"
            aria-label={playing ? "Pause signing" : index >= steps.length ? "Replay signing" : "Play signing"}
            style={{ minHeight: 44, padding: "0 18px", display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14 }}
          >
            {playing ? <Pause size={16} aria-hidden="true" /> : index >= steps.length ? <RotateCcw size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
            {playing ? "Pause" : index >= steps.length ? "Replay" : "Play"}
          </button>
          <button type="button" onClick={replay} className="btn-ghost" aria-label="Replay from the start" style={{ minHeight: 44, padding: "0 14px", display: "inline-flex", alignItems: "center", gap: 7, fontSize: 14 }}>
            <RotateCcw size={15} aria-hidden="true" /> Restart
          </button>
          <label htmlFor="avatar-speed" style={{ fontSize: 13, fontWeight: 700, color: COLORS.textDim }}>
            Speed
          </label>
          <input
            id="avatar-speed"
            type="range"
            min={0.5}
            max={2}
            step={0.5}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            style={{ width: 100, accentColor: COLORS.accent, minHeight: 44 }}
          />
          <span style={{ fontSize: 13, fontWeight: 800, color: COLORS.textDim, fontVariantNumeric: "tabular-nums" }}>{speed}×</span>
        </div>
      )}
    </div>
  )
}

export default AvatarPlayer
