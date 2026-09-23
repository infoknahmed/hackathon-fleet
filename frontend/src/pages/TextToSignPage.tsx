import { useCallback, useMemo, useState } from "react"
import type { CSSProperties } from "react"
import { motion } from "motion/react"
import { Hand, Download, Info } from "lucide-react"
import { SignAvatar } from "../components/SignAvatar"
import { POSE_LIBRARY_SIZE, hasWordSign } from "../lib/signPoses"
import { COLORS, FONT, RADIUS, SHADOW, TAP_MIN } from "../theme"
import TopNav from "../components/TopNav"

/**
 * /text-to-sign — standalone Text → Sign player.
 * Shows the animated avatar, the written text below, progress dots,
 * speed + auto-repeat controls, and a GIF download (WebM fallback).
 */
export default function TextToSignPage() {
  const [input, setInput] = useState("hello please help me")
  const [played, setPlayed] = useState<string>("")
  const [repeat] = useState(false)
  const [speed] = useState(1)
  const [capturing, setCapturing] = useState(false)

  const words = useMemo(
    () =>
      input
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.replace(/[^a-z0-9]/g, "").length > 0),
    [input],
  )
  const unknownWords = words.filter((w) => !hasWordSign(w) && !/^\d+$/.test(w) && w.length > 1)

  const handlePlay = useCallback(() => {
    setPlayed(input)
  }, [input])

  /** Download the current sign sequence as a GIF using gif.js-quality
   * fallback: capture frames from an offscreen render into an animated
   * WebM (widely supported) — browsers cannot encode GIF natively, so we
   * produce a shareable .webm clip. */
  const handleDownload = async () => {
    if (!played || capturing) return
    setCapturing(true)
    try {
      const streamTarget = document.querySelector<HTMLDivElement>("[data-sign-stage]")
      if (!streamTarget) throw new Error("stage missing")
      // Prefer MediaRecorder (WebM) — universal, no external libs.
      const canvas = document.createElement("canvas")
      canvas.width = 320
      canvas.height = 320
      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("canvas unavailable")
      const stream = canvas.captureStream(10)
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8") ? "video/webm" : "video/webm"
      const recorder = new MediaRecorder(stream, { mimeType })
      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
      const done = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve()
      })
      recorder.start()
      // Render 4 seconds of the playing avatar into the canvas.
      const svgEl = streamTarget.querySelector("svg")
      const durationMs = 4000
      const started = performance.now()
      await new Promise<void>((resolve) => {
        const draw = () => {
          if (!ctx) return
          ctx.fillStyle = "#0A1929"
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          if (svgEl) {
            const xml = new XMLSerializer().serializeToString(svgEl)
            const img = new Image()
            img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
            img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(xml)))}`
          }
          if (performance.now() - started < durationMs) requestAnimationFrame(draw)
          else resolve()
        }
        draw()
      })
      recorder.stop()
      await done
      const blob = new Blob(chunks, { type: "video/webm" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `vaaksetu-sign-${Date.now()}.webm`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // Silent-fail guard: tell the user instead.
      window.alert("Could not record the animation in this browser — try Chrome or Edge.")
    } finally {
      setCapturing(false)
    }
  }

  const cardStyle: CSSProperties = {
    background: "rgba(30, 41, 59, 0.55)",
    backdropFilter: "blur(20px) saturate(150%)",
    WebkitBackdropFilter: "blur(20px) saturate(150%)",
    border: `1px solid ${COLORS.borderGlass}`,
    borderRadius: RADIUS.lg,
    padding: 20,
    boxShadow: SHADOW.md,
  }

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: FONT, padding: "0 16px 60px", maxWidth: 860, margin: "0 auto" }}>
      <TopNav />
      <motion.main initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 12 }}>
        <header>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, display: "flex", alignItems: "center", gap: 10 }}>
            <Hand size={26} aria-hidden="true" /> Text → Sign
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 15, color: COLORS.textDim }}>
            {POSE_LIBRARY_SIZE} poses: word signs, numbers, and the full fingerspelling alphabet.
          </p>
        </header>

        {/* Input */}
        <div style={cardStyle}>
          <label htmlFor="tts-input" style={{ display: "block", fontSize: 16, fontWeight: 800, marginBottom: 8 }}>
            Text to sign
          </label>
          <textarea
            id="tts-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={2}
            style={{ width: "100%", minHeight: 72, background: "rgba(10, 25, 41, 0.6)", color: COLORS.text, border: `1px solid ${COLORS.borderGlass}`, borderRadius: RADIUS.md, padding: "12px 14px", fontSize: 17, fontFamily: FONT, resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
            <button type="button" onClick={handlePlay} className="btn-gradient" style={{ minHeight: TAP_MIN, padding: "0 22px", fontSize: 16 }}>
              ▶ Play signs
            </button>
            <button type="button" onClick={handleDownload} disabled={!played || capturing} className="btn-ghost" aria-label="Download the sign animation as a video clip" style={{ minHeight: TAP_MIN, display: "inline-flex", alignItems: "center", gap: 8, padding: "0 16px", fontSize: 14 }}>
              <Download size={16} aria-hidden="true" /> {capturing ? "Recording…" : "Download clip"}
            </button>
          </div>
          {unknownWords.length > 0 && (
            <p style={{ margin: "10px 0 0", fontSize: 13, color: COLORS.warning, display: "flex", alignItems: "center", gap: 6 }}>
              <Info size={14} aria-hidden="true" />
              No direct sign for: {unknownWords.join(", ")} — fingerspelling will be used.
            </p>
          )}
        </div>

        {/* Avatar stage */}
        <div style={{ ...cardStyle, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }} data-sign-stage>
          {played ? (
            <>
              <SignAvatar text={played} size={220} speed={speed} repeat={repeat} controls />
              <p style={{ margin: "8px 0 0", fontSize: 18, fontWeight: 700, textAlign: "center", color: COLORS.text }}>
                “{played}”
              </p>
            </>
          ) : (
            <div style={{ minHeight: 260, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.textDim, fontSize: 15, textAlign: "center" }}>
              Enter text above and press “Play signs” to watch the animated sequence.
            </div>
          )}
        </div>
      </motion.main>
    </div>
  )
}
