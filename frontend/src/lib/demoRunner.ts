/**
 * Scripted demo auto-play for VaakSetu.
 * Pushes a realistic sequence of messages over the same BroadcastChannel the
 * live app uses, so judges see a full scenario without live interaction.
 */
import { sendMessage } from "./messageBus"

let timers: number[] = []

function schedule(delayMs: number, fn: () => void): void {
  timers.push(window.setTimeout(fn, delayMs))
}

export function startDemo(): void {
  stopDemo()

  schedule(3000, () => {
    sendMessage({
      type: "message",
      text: "I want water",
      pictograms: [{ id: "water", label: "Water", emoji: "💧" }],
      confidence: 92,
      timestamp: Date.now(),
      mood: "Neutral",
    })
  })

  schedule(8000, () => {
    sendMessage({
      type: "message",
      text: "I have a headache",
      pictograms: [
        { id: "pain", label: "Pain", emoji: "🤕" },
        { id: "head", label: "Head", emoji: "🧠" },
        { id: "strong", label: "Strong", emoji: "💪" },
      ],
      confidence: 88,
      timestamp: Date.now(),
      mood: "Distressed",
    })
  })

  schedule(13000, () => {
    sendMessage({ type: "mood", mood: "pain", timestamp: Date.now() })
  })

  schedule(18000, () => {
    sendMessage({ type: "reply", text: "Coming in 2 minutes", timestamp: Date.now() })
  })

  schedule(23000, () => {
    sendMessage({
      type: "message",
      text: "EMERGENCY - Please help",
      pictograms: [],
      confidence: 100,
      timestamp: Date.now(),
      mood: "Urgent",
      emergency: true,
    })
  })

  schedule(30000, () => {
    sendMessage({ type: "reply", text: "Demo complete", timestamp: Date.now() })
  })
}

export function stopDemo(): void {
  for (const timer of timers) window.clearTimeout(timer)
  timers = []
}
