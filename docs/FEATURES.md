# VaakSetu Features

Every feature, where to find it, and how to test it. Live app:
[vaaksetu.vercel.app](https://vaaksetu.vercel.app)

## Core (HT-02)

| # | Feature | Where | How to test |
|---|---|---|---|
| 1 | **Speech → Text** | `/conversation` (right panel) | Hold the mic button, speak, release — transcript + confidence badge appear |
| 2 | **Text → Speech** | `/conversation`, `/user`, `/sign` | Type a message and send — it is spoken aloud; or use `/speech` |
| 3 | **Sign Language → Text/Speech** | `/sign` | Allow camera, hold a static gesture (e.g. open palm = Stop) ~0.8s — it's accepted with a beep |
| 4 | **Text → Sign Language** | `/text-to-sign` | Type "Hello, how are you?" → Play signs — avatar animates with word captions |
| 5 | **Real-time two-way conversation** | `/conversation` in two devices/tabs | Send a pictogram message on one device; guardian dashboard receives it live |
| 6 | **20+ sign gestures** | `/sign` | Demo gallery lists all gestures when camera is denied; try fist (Yes), thumb-up (OK), pinky (Help) |
| 7 | **Dynamic gesture recognition** | `/sign` | Wave hello, nod palm for "Come here", rotate palm for "More" |
| 8 | **Phrase building** | `/sign` | Detect a gesture → "Add to sentence" → repeat → "Speak sentence + Send" |
| 9 | **Multi-language voice** | `/conversation` language selector | Switch to हिन्दी/ಕನ್ನಡ/తెలుగు/தமிழ் and send — spoken in that language (romanized fallback if no voice installed) |
| 10 | **Conversation history** | `/history` | Previous sessions listed; per-user filter + clear |
| 11 | **Guardian dashboard** | `/guardian` | Live feed of messages, emergency highlights, demo mode toggle |
| 12 | **Admin analytics** | `/admin` | Totals, emergencies, active users, confidence averages, 7-day timeline chart |
| 13 | **Database viewer** | `/database` | Raw table view of persisted messages + replies |
| 14 | **Accessible UI** | everywhere | Screen-reader live regions, keyboard: `⌘K`/`Ctrl+K` command palette, `Ctrl+Shift+T` training panel on `/sign` |
| 15 | **Noise handling** | `/conversation` | Speak with a fan/fan noise nearby — VAD dot shows VOICE vs noise; noisy-env warning appears; silent finals are dropped |
| 16 | **Confidence indication** | `/conversation`, `/sign` | ASR confidence badge colors (>80% green); hold-confidence ring on `/sign` |
| 17 | **Offline PWA** | anywhere | Load once, go offline (DevTools → Network → Offline) — app shell + cached model assets still work; messages queue and sync on reconnect |
| 18 | **Low-confidence correction** | `/conversation` | Transcript under 50% confidence shows "Did you mean?" alternatives; corrections train the predictor |

## Advanced (v2.0)

| # | Feature | Where | How to test |
|---|---|---|---|
| 19 | **Animated 2D SVG avatar (100+ poses)** | `/text-to-sign`, `/avatar-talk`, `/conversation` | Play any sentence — IK-rigged arms, jointed fingers, blinking, breathing, facial expressions per word |
| 20 | **Fingerspelling fallback** | `/text-to-sign` | Type a word without a sign (e.g. "vaaksetu") — avatar spells letter-by-letter with a "spelling" caption |
| 21 | **On-device intent prediction (LLM)** | `/user` | Tap 3 pictograms — layer 1 rules answer instantly; with WebGPU the 🧠 badge shows WebLLM refining the sentence (weights cached in IndexedDB after first download) |
| 22 | **Offline speech-to-text (Whisper)** | `/speech` | Load the offline model once; disable network; record — transcription runs fully on-device |
| 23 | **Offline text-to-speech (SpeechT5)** | `/speech` | Same as above for TTS when no native voice exists |
| 24 | **Voice cloning** | `/voice-setup` | Record the 3 prompt sentences (≥2s each), set a passphrase (≥6 chars) → profile saved AES-GCM encrypted in IndexedDB; preview speaks in your pitch |
| 25 | **Cloned voice playback** | anywhere TTS is used | Enable "Use my cloned voice" in `/voices` — avatar speech uses your pitch-matched voice (server XTTS-v2 when `REPLICATE_API_TOKEN` is configured) |
| 26 | **Continuous ISL recognition** | `/sign` → toggle "Continuous ON" | Sign a sequence (e.g. wave hello, then "come") — 2s-window segments accumulate as sentence chips |
| 27 | **Bidirectional avatar conversation** | `/avatar-talk` | Left: hold mic, speak, send → avatar signs. Right: start camera, sign, Send → avatar speaks. Bottom: shared chat history with timestamps |
| 28 | **Avatar emotion engine** | `/avatar-talk` | Send "I love you" (positive → smile) vs "I need help" (negative → concerned brow) — facial expression follows sentiment |
| 29 | **Avatar state machine** | `/avatar-talk` | Watch the status pill: Idle → Listening (mic/camera) → Signing → Speaking, with matching head/body motion per state |
| 30 | **Group mode (QR rooms)** | `/avatar-talk` → Group | Toggle Group → QR + join URL appears; open the URL in a second device — turns relay both ways across the room, participant count updates |
| 31 | **ISL training data collector** | `backend`: `npm run collect-isl` → :8077 | Record labeled sign samples per phrase → JSONL export for training the ONNX classifier |

## Quick sanity route

The fastest 60-second tour: `/text-to-sign` (type → avatar signs) → `/sign`
(camera → gesture recognition) → `/avatar-talk` (both directions at once).
