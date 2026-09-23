# Changelog

All notable changes to VaakSetu are documented here.

## v2.0.0 — 2026-09-24

### Phase 5: Bidirectional Avatar Conversation (`47cf3c6`)
- **NEW** `/avatar-talk` route — three-panel interpreter layout:
  - Hearing panel: hold-to-talk mic (webkitSpeechRecognition), live transcript,
    language selector (English/हिन्दी/ಕನ್ನಡ/తెలుగు/தமிழ்), send button.
  - Avatar panel: large central `SigningAvatar` with status indicator
    (Listening… / Signing… / Speaking… / Idle).
  - Deaf panel: camera preview + continuous ISL detection (2s-window recognizer),
    detected sign + confidence badge, send-to-chat.
- **NEW** Avatar state machine on `SigningAvatar`: `idle | listening | signing | speaking`
  (`state` prop) plus `emotion` prop (`neutral | positive | negative`) parsed from
  sentence sentiment — smiles on positive text, concern on negative, raised brows and
  nodding while listening, vowel-shaped mouth + speech-rhythm bob while speaking.
- **NEW** Group mode: session rooms `avatar-room:<uuid>` via Socket.IO, QR-code join
  link, participant count, bidirectional turn relay between all devices.
- **NEW** Shared chat history panel — hearing messages right-aligned cyan, deaf
  messages left-aligned green, timestamps, confidence, auto-scroll.
- Deaf-side sends use the cloned voice when enabled (Phase 3), else native TTS.
- Dev proxy now forwards `/socket.io` (with `ws`) to the backend for two-tab testing.

### Phase 4: Continuous ISL (`c6dcfc2`)
- 60-frame rolling window (~2s) continuous recognition on `/sign` with a Continuous
  mode toggle, sentence chips, speak + send actions.
- `backend/scripts/collect-isl-data.js` — volunteer training-data collector producing
  JSONL for the ONNX classifier.

### Phase 3: Voice Cloning (`8076be1`)
- `/voice-setup` three-step wizard (record → process → ready).
- Encrypted voice-sample vault in IndexedDB (PBKDF2 + AES-GCM, passphrase-derived).
- Synthesis chain: XTTS-v2 server clone → local pitch-matched native TTS fallback.

### Phase 2: On-Device AI (`9a94197`)
- Two-layer intent prediction: instant rule templates + WebLLM (Qwen2.5-0.5B,
  WebGPU, worker-hosted, IndexedDB-cached).
- Offline speech: Whisper-tiny STT + SpeechT5 TTS via Transformers.js in a worker,
  behind graceful Web Speech fallbacks.

### Phase 1: Avatar System (`13f3000`)
- Parametric 2D SVG signing avatar with IK arms, 5-finger hands, 10 facial
  expressions, idle breathing/blink life.
- 100+ pose library: fingerspelling alphabet, numbers, 60+ word signs, 20 phrases.
- Sentence → sign sequencer with longest-phrase matching and fingerspelling fallback.
- `/text-to-sign` player with progress, speed, replay, and WebM clip export.
