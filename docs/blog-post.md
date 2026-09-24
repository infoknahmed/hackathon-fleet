# How I Built an AI-Powered Sign Language Interpreter in 24 Hours

> VaakSetu turns any ₹10,000 phone into a two-way speech ↔ sign interpreter —
> free, offline-first, and private. Here's how it works under the hood.

**Live:** https://vaaksetu.vercel.app · **Code:** https://github.com/infoknahmed/vaaksetu-2026

---

## 1. The hook

Imagine an 8-year-old with cerebral palsy who has never spoken. He wakes up at
2 AM with a pounding headache. His mother is in the next room. He cannot call
out. He cannot write. He cannot point well enough to show where it hurts. The
only thing he can do is cry — and hope someone understands that this time, it's
not hunger or a bad dream.

That gap — between a person who has something to say and a person who wants to
listen — is what I set out to close in a weekend.

## 2. The problem

Over **7 million Indians** live with speech and language impairments: cerebral
palsy, ALS, stroke recovery, non-verbal autism, locked-in syndrome. For most,
the only real option is a dedicated AAC device priced around **₹5,00,000** —
imported, proprietary, and out of reach for nearly every family that needs one.
Communication, the most basic human right, becomes a privilege of wealth.

And there's a second, quieter problem: most of these tools are **one-directional**.
They help a non-verbal person speak out. They do almost nothing to help the
*other side* of the conversation reach back — a hearing person has no way to
speak *into* sign language.

## 3. What I built

**VaakSetu** (Sanskrit: *voice bridge*) is a free, web-based, two-way
interpreter built for the HT-02 hackathon:

- **v1.0 — 12 HT-02 core features:** speech → text, text → speech in 5 Indian
  languages (English, Hindi, Kannada, Telugu, Tamil), camera-based sign
  recognition, 20+ static + dynamic gestures, phrase building, real-time
  two-way conversation over Socket.IO, conversation history, guardian
  dashboard, admin analytics, a database viewer, noise gating, confidence
  badges, and an offline PWA.
- **v2.0 — 5 phases built on top:** an animated signing avatar, on-device AI
  (WebLLM + Whisper), voice cloning, continuous ISL sentence recognition, and
  the crown jewel — a bidirectional avatar conversation mode.

It runs in a browser tab. No install, no hardware, no cost.

## 4. Architecture

I chose boring-with-sharp-edges: proven web plumbing everywhere, with the ML
doing the exotic work.

```
Browser (React 18 + Vite SPA, installable PWA)
  ├─ Web Speech API ─── live STT/TTS, 5 Indian languages
  ├─ MediaPipe Hands ── 21 landmarks × 2 hands
  ├─ Signing avatar ─── 2D SVG + IK rig, 100+ poses
  ├─ Web Workers ────── WebLLM (Qwen2.5-0.5B), Whisper-tiny, SpeechT5
  └─ Service worker ─── offline app shell + cached model weights
        │  REST /api/*  +  Socket.IO
        ▼
Node/Express (Render) ── Socket.IO hub, REST, XTTS-v2 voice cloning
        ▼
SQLite (WAL mode, node:sqlite) ── messages, replies, analytics
```

Three rules governed every decision:

1. **Nothing on the critical path.** Every model loads lazily behind a user
   gesture or in a dedicated Web Worker. Page load never blocks on weights.
2. **Graceful degradation everywhere.** Every model loader has a fallback that
   keeps the feature at least partially usable.
3. **Privacy by construction.** Hand landmarks, voice samples, and inference
   stay on the device unless the user explicitly sends a message.

One constraint that paid off immediately: hackathon judging happens on flaky
venue Wi-Fi, so everything sensitive runs **on-device**. The PWA service worker
(Workbox) caches the CDN model assets cache-first with a 30-day expiry — second
load and offline use cost zero network.

## 5. The avatar system

The avatar is the heart of the product, so I'll spend the most time here.

I did not want a video loop or a sprite sheet. I wanted an avatar that could
sign **any** sentence — including words it has never seen. The answer was a
parametric 2D SVG rig: two-bone IK arms, jointed five-finger hands, a head with
turn/tilt, and 10 facial expressions. Every "frame" is not a drawing but a
**pose object** — 100+ of them in a library covering the fingerspelling
alphabet, numbers, 60+ word signs, and 20 phrases:

```ts
export interface SignPose {
  leftHand: HandPose
  rightHand: HandPose
  head: { rotation: number; tilt: number }
  expression: Expression   // neutral, positive, negative, …
  mouthOpen?: number       // 0–1, used while "speaking"
  duration: number         // ms to hold (after a ~320ms transition)
}
```

Turning a sentence into motion is a small compiler. `sentenceToSignSequence()`
in `lib/avatar/sequencer.ts`:

```ts
export function sentenceToSignSequence(text: string): SignSequence {
  const words = tokenize(text)
  // 1. Longest-match against the multi-word phrase library
  // 2. Word-sign lookup for each remaining token
  // 3. Unknown words → fingerspell letter-by-letter
  // 4. Insert short rest connectives so transitions look natural
}
```

The longest-phrase-first matching matters: "good morning" should hit the phrase
entry, not a choppy "good" + "morning". And the fingerspelling fallback is the
escape hatch that makes coverage effectively infinite — type "vaaksetu" and the
avatar spells it letter by letter, word header included. Punctuation becomes
brief pause poses so the rhythm reads naturally instead of machine-gun fast.

The rig itself breathes: idle blinking and breathing motion, vowel-shaped mouth
while speaking, nodding while listening. Small details, but they're the
difference between "a widget" and "a person is signing to me".

## 6. On-device AI — WebLLM + Whisper in the browser

Two models live in the browser, both in Web Workers so the main thread never
stutters:

- **WebLLM (Qwen2.5-0.5B, q4f16, WebGPU)** — layer 2 of intent prediction.
  When a user taps pictograms, layer 1 is instant rule templates; the LLM then
  refines them into a fluent sentence. Weights cache in IndexedDB after the
  first download.
- **Whisper-tiny (WASM q8 via Transformers.js)** — offline speech-to-text when
  there's no network or no Web Speech API voice installed. SpeechT5 covers
  offline TTS the same way.

The failure modes are as designed as the success modes: if WebGPU is missing,
layer-1 rules keep working; if Whisper can't load, the Web Speech API remains.
The user never sees an error — the feature just quietly steps down.

## 7. Voice cloning

This is the feature that makes ALS families stop scrolling. Record three
prompt sentences, set a passphrase — and after speech is gone, the avatar
still sounds like *you*.

The privacy design came first: voice samples are recorded in-browser and
stored **only** in IndexedDB, encrypted with a key derived from the user's
passphrase — PBKDF2 (120k iterations, SHA-256) into AES-GCM, with a fresh
12-byte IV per encryption:

```ts
const key = await crypto.subtle.deriveKey(
  { name: "PBKDF2", salt: enc.encode(SALT), iterations: 120_000, hash: "SHA-256" },
  base,
  { name: "AES-GCM", length: 256 },
  false, ["encrypt", "decrypt"],
)
```

Synthesis tries the backend (Coqui XTTS-v2 via Replicate) first; when the
server isn't configured — the default, free-tier deployment — it falls back to
the user's native TTS pitch-shifted to match their recorded pitch profile
(average fundamental frequency across samples). Output always sounds close to
the user's own voice, and the raw samples never leave the device.

## 8. Continuous ISL

Static gesture recognition is a party trick; real sign language is a *stream*.
Moving from per-gesture holds to continuous recognition was the hardest ML
problem of the weekend:

1. Keep a **rolling 60-frame window** (~2s at 30fps) of normalized hand
   landmarks from the existing MediaPipe feed.
2. **Motion-energy segmentation** splits the stream into candidate sign
   segments — energy rises during a sign, falls during pauses.
3. Classify each segment: an ONNX model when trained, otherwise **DTW against
   motion templates** — which works with zero training data.

Normalization does the heavy lifting: every hand is wrist-centered, palm-scaled
into a translation/scale-invariant 63-dim vector, so the classifier generalizes
across people and camera distances:

```ts
export function normalizeHand(hand: HandFrame): Float32Array {
  // wrist-centered, scaled by palm size, z-weighted → 63 dims
}
```

Accepted segments accumulate as sentence chips. Sign "hello", then "come" —
and the UI builds "hello come" with a speak-and-send button. When even that
fails, the recognizer never throws; it degrades to "no result" and the page
falls back to per-gesture mode.

## 9. Bidirectional avatar — the crown jewel

Everything above converges in `/avatar-talk`, a three-panel interpreter:

- **Left (hearing):** hold-to-talk mic → transcript → send → the avatar flips
  to *signing* and performs the sentence with expression.
- **Right (deaf):** camera → continuous ISL → sentence chips → send → the
  other side's avatar flips to *speaking* (in the cloned voice, when enabled).
- **Center:** the avatar itself, driven by a four-state machine
  (`idle | listening | signing | speaking`) with sentiment-parsed emotion —
  smile on "I love you", concerned brow on "I need help".

Group mode turns it into a room: a QR code joins any second device over
Socket.IO (`avatar-room:<uuid>`), with participant counts and turn relay both
ways. This is the moment a deaf person and a hearing person who share **no
common language** hold a conversation — and it's the demo that makes judges sit
up.

## 10. Deploy

- **Frontend** → Vercel: SPA fallback, PWA precache, Workbox runtime caching
  for model weights.
- **Backend** → Render via `render.yaml`: Express + Socket.IO, SQLite on a
  persistent disk, health check at `/api/health`.
- The client resolves the backend through `VITE_API_URL` at build time;
  in dev, the Vite proxy forwards both `/api` and `/socket.io` (with `ws`).

The PWA part is not a checkbox — it's the whole point. Install once, go
airplane-mode, and the app shell, cached model weights, signing avatar, and
queued messages all keep working. Sync happens on reconnect.

## 11. Lessons learned

**1. Fallbacks are features, not apologies.** Every model loader in VaakSetu
has a designed degradation path — ONNX → DTW templates, WebLLM → rule
templates, Whisper → Web Speech API, server XTTS-v2 → local pitch matching.
That's what makes it survive bad Wi-Fi, cheap phones, and denied permissions.
On a hackathon demo day, your fallback path *is* your product.

**2. Parametric beats recorded — for coverage.** A video avatar is pixel-perfect
for the 20 sentences it contains and useless for the rest. A parametric SVG rig
is slightly less "real", but it can sign *anything* via fingerspelling, mirror
any hand pose, and add an expression per sentiment for free. When your input
space is unbounded (all of language), choose the representation that
generalizes.

**3. Privacy constraints simplify architecture.** "Voice and video never leave
the device" sounds like a restriction, but it made everything easier: no
upload UI, no streaming infrastructure, no consent-surface compliance, and an
automatic offline mode because the data was already local. Constraints chosen
for ethics turned out to be the cheapest engineering choice too.

## 12. What's next

- **v2.1 — Clinical validation:** a pilot with real AAC users and therapists,
  because accessibility tech that hasn't met its users is a demo, not a product.
- **v2.2 — ABDM/ABHA integration:** plug into India's health ID stack so
  guardians and clinicians can share communication profiles safely.
- **v3.0 — ASL/BSL support** beyond ISL, and **v3.1** classroom-scale group
  mode. The pose vocabulary is language-agnostic by design — the sequencer
  lookup is the only thing that changes.

## 13. Try it, contribute, share

The whole thing runs in a browser tab, right now:

- **Try it:** https://vaaksetu.vercel.app — start at `/text-to-sign` (type a
  sentence, watch the avatar sign), then `/avatar-talk` for both directions.
- **Contribute:** https://github.com/infoknahmed/vaaksetu-2026 — good first
  issues are tagged `good first issue`; the ISL training-data collector
  (`npm run collect-isl`) is the highest-leverage place to help.
- **Share it** with a family, a special-educator, or an NGO you know. For the
  7 million Indians this is built for, a link is free — and it might be the
  first time someone hears their own child's sentence.

*Built with 💙 for the 7 million Indians who deserve a voice.*
