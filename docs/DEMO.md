# VaakSetu — 90-Second Demo Script

For judges, investors, and demo days. Everything runs on the live deployment —
no setup needed. Rehearse once with mic permissions granted.

## Setup (before the clock starts)

- Open **https://vaaksetu.vercel.app/avatar-talk** on a laptop (or projector)
- Open the same URL on a phone, scan the Group-mode QR (or same URL)
- Chrome/Edge recommended for best speech recognition
- Fallback ready: `/text-to-sign` needs no mic at all

---

## 0:00–0:15 — The Problem

> "Seven million Indians can't speak. The devices that give them a voice
> cost five lakh rupees. VaakSetu turns any ten-thousand-rupee phone into a
> full communication system — free."

**On screen:** land on the role-selection page, then click **Avatar Talk**.

## 0:15–0:35 — Direction 1: Hearing → Deaf

> "A hearing person just... talks."

- Hold the mic on the laptop, say clearly: **"Hello, do you need help?"**
- Release → transcript appears → sentence broadcasts to the room
- The avatar flips to **SIGNING** and signs the sentence with expressions

> "No sign-language interpreter needed. The avatar is the interpreter."

## 0:35–0:55 — Direction 2: Deaf → Hearing

> "Now the reply — without saying a word."

- On the phone: **Start camera**, wave **hello**, then sign **"come"** /
  **"more"** (2-second continuous recognition accumulates chips)
- Tap **Send** → the laptop's avatar flips to **SPEAKING** and says it aloud

> "Sign language in, speech out. Both directions, one bridge."

## 0:55–1:15 — The Differentiator: On-Device AI + Voice Cloning

> "Everything private runs on the device."

- Open `/text-to-sign` in a second tab: type **"I love you, thank you"** →
  avatar signs **and smiles** (sentiment drives the face)
- Open `/voice-setup` (or show `/voices`): "Three recorded sentences become an
  encrypted voice clone — after ALS takes your speech, your avatar still
  sounds like *you*."

## 1:15–1:30 — Close

> "Works offline as a PWA. In five Indian languages. On a ₹10k phone.
> We're not building an app — we're building the missing bridge between
> two communities."

**End on `/avatar-talk` with the avatar idle-breathing in center.**

---

## 🛟 Failure Recovery

| If this breaks | Do this |
|---|---|
| Mic permission denied | Use `/text-to-sign` — type the sentence instead |
| Speech recognition mishears | Click Send after editing the transcript; or say a stock phrase ("hello how are you") |
| Camera denied on phone | Use the phone as the *hearing* side; laptop camera for signing |
| Venue noise | The noise gate filters it — mention it as a feature, don't fight it |
| Wi-Fi drops | PWA keeps running; note "fully offline-capable" and switch to `/text-to-sign` |
| Sign not recognized | Sign bigger/slower within frame; static gestures (open palm = Stop) are the most reliable |

## ⏱️ Timing cheatsheet

| Time | Screen | Say |
|---|---|---|
| 0:00 | Role selection | Problem: 7M people, ₹5L devices |
| 0:15 | `/avatar-talk` laptop | Speak → avatar signs |
| 0:35 | `/avatar-talk` phone | Sign → avatar speaks |
| 0:55 | `/text-to-sign` + `/voice-setup` | Emotion face + voice cloning |
| 1:15 | `/avatar-talk` | Offline · 5 languages · free |
