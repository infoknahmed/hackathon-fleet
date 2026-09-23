/**
 * UI sound effects — synthesized with Web Audio (no audio files, works
 * offline). Every effect respects the a11y "sound effects" setting.
 */

const MUTE_KEY = "vaaksetu-sfx-muted"
let ctx: AudioContext | null = null
let muted: boolean | null = null

export function isSfxMuted(): boolean {
  if (muted === null) {
    try {
      muted = localStorage.getItem(MUTE_KEY) === "1"
    } catch {
      muted = false
    }
  }
  return muted
}

export function setSfxMuted(m: boolean): void {
  muted = m
  try {
    localStorage.setItem(MUTE_KEY, m ? "1" : "0")
  } catch {
    /* ignore */
  }
}

function getCtx(): AudioContext | null {
  if (isSfxMuted()) return null
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    if (ctx.state === "suspended") void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(
  freq: number,
  durationMs: number,
  opts: { type?: OscillatorType; gain?: number; delayMs?: number; slideTo?: number } = {},
): void {
  const audio = getCtx()
  if (!audio) return
  const t0 = audio.currentTime + (opts.delayMs ?? 0) / 1000
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.type = opts.type ?? "sine"
  osc.frequency.setValueAtTime(freq, t0)
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + durationMs / 1000)
  const g = opts.gain ?? 0.08
  gain.gain.setValueAtTime(g, t0)
  gain.gain.exponentialRampToValueAtTime(0.0008, t0 + durationMs / 1000)
  osc.connect(gain).connect(audio.destination)
  osc.start(t0)
  osc.stop(t0 + durationMs / 1000 + 0.02)
}

/** Subtle click on pictogram tap / button press. */
export function playTap(): void {
  tone(720, 55, { type: "triangle", gain: 0.05 })
}

/** Two-note ascending chime on success (send, detect, sync). */
export function playSuccess(): void {
  tone(660, 120, { gain: 0.07 })
  tone(990, 160, { gain: 0.07, delayMs: 110 })
}

/** Soft low buzz on errors. */
export function playError(): void {
  tone(180, 200, { type: "sawtooth", gain: 0.05 })
}

/** Urgent rising alarm pattern — used ONLY for emergencies. */
export function playAlarm(): void {
  for (let i = 0; i < 3; i++) {
    tone(880, 140, { type: "square", gain: 0.09, delayMs: i * 240, slideTo: 1240 })
  }
}
