# VaakSetu — Bridge of Voice

VaakSetu is an accessibility platform connecting deaf, mute, and non-verbal users with
hearing people — a two-way bridge: **voice → sign avatar** and **signs → voice**, with
an on-device AI core that keeps everything private and offline-capable.

## Phases Completed

- **Phase 1: Avatar System** (commit `13f3000`) — parametric 2D SVG signing avatar
  (two-bone IK arms, jointed fingers, facial expressions, breathing/blink idle life),
  100+ pose library (fingerspelling alphabet, numbers, 60+ word signs, phrases),
  sentence → sign sequencer with fingerspelling fallback, `/text-to-sign` player with
  clip export.
- **Phase 2: On-Device AI** (commit `9a94197`) — two-layer intent prediction
  (instant rules + WebLLM Qwen2.5-0.5B via WebGPU in a worker, weights cached in
  IndexedDB) and offline speech (Whisper-tiny STT + SpeechT5 TTS in a worker) with
  graceful degradation.
- **Phase 3: Voice Cloning** (commit `8076be1`) — record 3 samples in-browser,
  AES-GCM-encrypted storage in IndexedDB, XTTS-v2 server clone when configured with
  automatic local pitch-matched TTS fallback, `/voice-setup` wizard.
- **Phase 4: Continuous ISL** (commit `c6dcfc2`) — 2-second rolling-window continuous
  sign recognition (motion-energy segmentation → ONNX model or DTW against motion
  templates), sentence chips on `/sign`, and a volunteer data-collection tool
  (`backend/scripts/collect-isl-data.js`) for training the model.
- **Phase 5: Bidirectional Avatar** (commit `47cf3c6`) — `/avatar-talk` three-panel
  interpreter: hearing person speaks → avatar signs; deaf person signs (continuous
  ISL) → avatar speaks (cloned voice when enabled). Avatar state machine
  (idle / listening / signing / speaking) with emotion-aware facial expressions,
  shared chat history, and group mode with QR-code join rooms via Socket.IO.

## Architecture

```
frontend/  React 18 + Vite + TypeScript, motion, Tailwind-free glass design system
           PWA (vite-plugin-pwa) with runtime caching for AI models
backend/   Express + Socket.IO + SQLite (node:sqlite, zero native deps)
           Render-deployable (render.yaml)
```

## Run

```bash
# Backend (terminal 1)
cd backend && npm install && npm start        # :3001

# Frontend (terminal 2)
cd frontend && npm install && npm run dev     # :5173, /api + /socket.io proxied
```

### Key routes

| Route | Purpose |
|---|---|
| `/user` | Pictogram AAC dashboard with on-device intent prediction |
| `/conversation` | Two-panel pictogram ↔ voice conversation |
| `/avatar-talk` | Bidirectional avatar conversation (1-on-1 or group via QR) |
| `/sign` | Camera-based ISL recognition (static, dynamic, continuous) |
| `/text-to-sign` | Text → signing avatar player |
| `/voice-setup` | Voice cloning wizard |
| `/speech` | Offline STT/TTS playground |

### Build

```bash
cd frontend && npm run build   # outputs dist/ + PWA service worker
```
