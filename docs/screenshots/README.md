# VaakSetu — Launch Screenshot Guide

How to capture the 7 portfolio screenshots for VaakSetu v2.0.0. All shots run on
the live deployment — no local setup needed.

**Setup before shooting:**

- Browser: Chrome or Edge (best speech + WebGPU support), window at **1600×1000** or 16:10
- Zoom to **100%**, hide bookmarks bar for clean chrome
- Grant mic + camera permissions beforehand so no permission popups appear
- Where a demo state is needed (transcript, chips, history), generate it first and
  screenshot *after* — never mid-animation

Save files in this folder (`docs/screenshots/`) with the exact names below —
the root `README.md` gallery links to them.

---

## Required screenshots

| # | Filename | What to capture | URL to visit |
|---|---|---|---|
| 1 | `landing.png` | Landing page with the **"The Bridge of Voice"** hero: headline, subtitle, live-demo badges, and the role-selection cards (User / Guardian / Admin). Scroll so the full hero + role cards are in frame. | https://vaaksetu.vercel.app/ |
| 2 | `avatar-talk.png` | The 3-column **bidirectional interpreter**: left = Hearing panel (mic + transcript), center = the avatar mid-sign with the status pill showing **Signing…**, right = Deaf panel (camera preview + detected sign). Bottom chat history with 2–3 messages. | https://vaaksetu.vercel.app/avatar-talk |
| 3 | `user-dashboard.png` | Pictogram grid with tiles populated; tap 3 pictograms so the **AI prediction** bar (🧠 WebLLM sentence suggestion) appears above the grid. Show a sent message bubble with confidence badge. | https://vaaksetu.vercel.app/user |
| 4 | `sign-language.png` | Camera preview with **MediaPipe hand-landmark overlay** on your hand, recognized gesture + confidence ring visible, and the Continuous-mode sentence chips if possible. Face + hand fully inside frame. | https://vaaksetu.vercel.app/sign |
| 5 | `voice-setup.png` | The voice cloning wizard: 3-step flow visible — record prompt sentences with at least one sample's level meter active, and the encrypted-profile "Ready" state (passphrase set, profile saved to IndexedDB). | https://vaaksetu.vercel.app/voice-setup |
| 6 | `database-viewer.png` | Live DB rows: table view with several persisted messages + guardian replies, timestamps and confidence columns visible (send a few messages first so the table isn't empty). | https://vaaksetu.vercel.app/database |
| 7 | `text-to-sign.png` *(bonus — used in the README gallery)* | Typed sentence ("Hello, how are you?") with the avatar mid-playback, word caption + progress bar under the stage. | https://vaaksetu.vercel.app/text-to-sign |

---

## Capture checklist

- [ ] All 7 PNGs saved with exact filenames (lowercase, hyphens)
- [ ] No personal data visible (use the demo mode on `/guardian`, generic pictogram sentences)
- [ ] Avatar screenshots taken **mid-pose** — not at rest
- [ ] Camera screenshots: good lighting, plain background, hand fully in frame
- [ ] Each image < 500 KB (compress with `npx @squoosh/cli --mozjpeg {file}` if larger)
- [ ] Images referenced correctly by the gallery in the root `README.md`

## Regenerating the gallery

The root `README.md` screenshots table references these files directly:

```markdown
| ![Landing](docs/screenshots/landing.png) | ![Avatar Talk](docs/screenshots/avatar-talk.png) |
```

Keep filenames stable so links never break.
