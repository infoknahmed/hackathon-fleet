/**
 * Mic metering + noise gate for speech recognition.
 *
 * - Live input level (0..1) for the 5-bar meter.
 * - Adaptive noise floor: tracks the quietest observed level; SNR is the
 *   ratio of current level to that floor. Speech is considered active only
 *   above a SNR threshold (simple energy VAD) — recognition results that
 *   arrive while speechActive===false are treated as noise and dropped.
 * - "Noisy environment" fires when the noise floor itself stays high.
 */

export interface NoiseGateOptions {
  onLevel?: (level: number) => void
  onNoisyChange?: (noisy: boolean) => void
  onSpeechChange?: (speaking: boolean) => void
  /** Level above which the environment counts as noisy (0..1). */
  noisyLevel?: number
  /** ms the noisy level must persist before the banner shows. */
  noisyMs?: number
  /** SNR ratio above which we consider speech present. */
  snrSpeech?: number
}

export interface NoiseGate {
  /** Last speech-active verdict — gate recognition results on this. */
  speechActive: () => boolean
  /** Current SNR estimate (level / adaptive noise floor). */
  snr: () => number
  stop: () => void
}

export async function startNoiseGate(opts: NoiseGateOptions = {}): Promise<NoiseGate | null> {
  const {
    onLevel,
    onNoisyChange,
    onSpeechChange,
    noisyLevel = 0.45,
    noisyMs = 2000,
    snrSpeech = 2.2,
  } = opts

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) {
      stream.getTracks().forEach((t) => t.stop())
      return null
    }
    const ctx = new Ctor()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.5
    ctx.createMediaStreamSource(stream).connect(analyser)
    const buf = new Uint8Array(analyser.fftSize)

    let noiseFloor = 0.05 // starts conservative, adapts downward slowly
    let lastSnr = 1
    const currentSnrOf = (floor: number) => (floor > 0.001 ? lastSnr : 1)
    let raf = 0
    let loudSince: number | null = null
    let noisyShown = false
    let speaking = false
    let speechCooldown = 0
    let stopped = false

    const loop = () => {
      if (stopped) return
      analyser.getByteTimeDomainData(buf)
      let peak = 0
      for (let i = 0; i < buf.length; i++) {
        const dev = Math.abs(buf[i] - 128)
        if (dev > peak) peak = dev
      }
      const level = Math.min(1, peak / 128)
      onLevel?.(level)

      const now = performance.now()

      // Adaptive noise floor: rises fast when quiet, falls slowly.
      if (level < noiseFloor) {
        noiseFloor = noiseFloor * 0.7 + level * 0.3
      } else {
        noiseFloor = noiseFloor * 0.995 + level * 0.005
      }
      const currentSnr = noiseFloor > 0.001 ? level / noiseFloor : 1
      lastSnr = currentSnr

      // Energy VAD with a short hangover so word gaps don't flicker.
      const isSpeech = currentSnr >= snrSpeech && level > 0.06
      if (isSpeech) speechCooldown = now + 350
      const speechNow = now < speechCooldown
      if (speechNow !== speaking) {
        speaking = speechNow
        onSpeechChange?.(speaking)
      }

      // Noisy-environment detection: sustained high absolute level.
      if (level > noisyLevel) {
        if (loudSince === null) loudSince = now
        else if (now - loudSince > noisyMs && !noisyShown) {
          noisyShown = true
          onNoisyChange?.(true)
        }
      } else {
        loudSince = null
        if (noisyShown && level < noisyLevel * 0.6) {
          noisyShown = false
          onNoisyChange?.(false)
        }
      }

      raf = requestAnimationFrame(loop)
    }
    loop()

    return {
      speechActive: () => speaking,
      snr: () => (noiseFloor > 0.001 ? currentSnrOf(noiseFloor) : 1),
      stop: () => {
        stopped = true
        cancelAnimationFrame(raf)
        stream.getTracks().forEach((t) => t.stop())
        void ctx.close().catch(() => undefined)
      },
    }
  } catch {
    return null // mic denied — caller degrades gracefully
  }
}
