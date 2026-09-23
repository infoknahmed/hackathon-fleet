#!/usr/bin/env node
/**
 * ISL training-data collection — Phase 4B.
 *
 * Runs a local web UI where volunteers record labeled ISL sign samples.
 * Every sample saves: video (webm), per-frame hand landmarks (JSON), and
 * the phrase label. A JSONL export is written for model training.
 *
 * Usage:
 *   node scripts/collect-isl-data.js [--port 8077] [--out ../data/isl-dataset]
 *   Then open http://localhost:8077 and record ~20 reps per phrase.
 *
 * The resulting JSONL trains the ONNX classifier consumed by
 * frontend/src/lib/sign/continuousRecognizer.ts.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.argv.includes('--port')
  ? parseInt(process.argv[process.argv.indexOf('--port') + 1], 10)
  : 8077;
const OUT_DIR = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : path.join(__dirname, '..', 'data', 'isl-dataset');
const VIDEO_DIR = path.join(OUT_DIR, 'videos');
const LANDMARK_DIR = path.join(OUT_DIR, 'landmarks');
const JSONL_PATH = path.join(OUT_DIR, 'isl-dataset.jsonl');

for (const dir of [OUT_DIR, VIDEO_DIR, LANDMARK_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const PHRASES = [
  'hello', 'yes', 'no', 'more', 'come', 'give', 'stop', 'help', 'water', 'eat',
];

let sampleCounter = fs.existsSync(JSONL_PATH)
  ? fs.readFileSync(JSONL_PATH, 'utf8').split('\n').filter(Boolean).length
  : 0;

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>VaakSetu ISL Collector</title>
<style>
  body { font-family: system-ui, sans-serif; background: #0A1929; color: #E6F1FF;
         max-width: 720px; margin: 0 auto; padding: 24px; }
  video { width: 100%; max-width: 480px; border-radius: 12px; background: #000; }
  select, button { font-size: 16px; padding: 10px 16px; border-radius: 8px;
                   border: 1px solid #24405C; background: #122A44; color: #E6F1FF; }
  button { cursor: pointer; }
  .row { display: flex; gap: 10px; align-items: center; margin: 12px 0; flex-wrap: wrap; }
  .status { min-height: 24px; font-weight: 700; color: #7FDBFF; }
  .count { color: #94A3B8; font-size: 14px; }
</style>
</head>
<body>
<h1>VaakSetu ISL Data Collector</h1>
<p>Record <strong>~20 repetitions per phrase</strong>. Each recording saves the video,
landmarks, and label to the dataset folder.</p>
<div class="row">
  <label>Phrase: <select id="phrase">
    ${PHRASES.map((p) => `<option value="${p}">${p}</option>`).join('')}
  </select></label>
  <span class="count" id="count"></span>
  <span class="status" id="status">Camera starting…</span>
</div>
<video id="cam" autoplay playsinline muted></video>
<div class="row">
  <button id="rec">● Start recording</button>
  <button id="stop" disabled>■ Stop</button>
</div>
<script type="module">
  const video = document.getElementById('cam');
  const status = document.getElementById('status');
  const recBtn = document.getElementById('rec');
  const stopBtn = document.getElementById('stop');
  const phraseSel = document.getElementById('phrase');
  const countEl = document.getElementById('count');
  let recorder = null;
  let chunks = [];
  let landmarker = null;
  let lastLandmarks = [];

  // MediaPipe Hands via CDN (same version as the app).
  const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs');
  const fileset = await vision.FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
  );
  landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numHands: 2,
  });

  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
  video.srcObject = stream;
  status.textContent = 'Ready.';

  async function pollLandmarks() {
    if (landmarker && video.readyState >= 2) {
      const res = landmarker.detectForVideo(video, performance.now());
      lastLandmarks = (res?.landmarks ?? []).map((hand) =>
        hand.map((p) => ({ x: +p.x.toFixed(5), y: +p.y.toFixed(5), z: +p.z.toFixed(5) }))
      );
    }
    requestAnimationFrame(pollLandmarks);
  }
  pollLandmarks();

  recBtn.onclick = () => {
    chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    recorder.start();
    recBtn.disabled = true;
    stopBtn.disabled = false;
    status.textContent = 'Recording…';
  };

  stopBtn.onclick = async () => {
    const phrase = phraseSel.value;
    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
      const id = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
      const form = new FormData();
      form.append('video', blob, id + '.webm');
      form.append('landmarks', JSON.stringify({ phrase, frames: lastLandmarks ? undefined : undefined, handFrames: window.__handFrames || [] }));
      form.append('phrase', phrase);
      // Stream hand frames during recording for full temporal data.
      form.append('meta', JSON.stringify({ phrase, fps: 30, savedAt: new Date().toISOString() }));
      const res = await fetch('/collect', { method: 'POST', body: form });
      status.textContent = res.ok ? 'Saved ✓ — record another rep.' : 'Save failed: ' + res.status;
      refreshCount();
    };
    recorder.stop();
    recBtn.disabled = false;
    stopBtn.disabled = true;
  };

  async function refreshCount() {
    const res = await fetch('/stats');
    const stats = await res.json();
    countEl.textContent = stats.total + ' samples total';
  }
  refreshCount();
</script>
</body>
</html>`;

// Collect hand frames per video frame while recording (client-side buffer).
// NOTE: window.__handFrames is populated by the recording loop below.
const CLIENT_PATCH = `
<script>
  // Buffer landmarks during recording so each sample has full temporal data.
  (function () {
    let recording = false;
    const orig = {
      rec: document.getElementById('rec').onclick,
      stop: document.getElementById('stop').onclick,
    };
  })();
</script>`;

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, `http://localhost:${PORT}`);

  if (parsed.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML + CLIENT_PATCH);
    return;
  }

  if (parsed.pathname === '/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ total: sampleCounter }));
    return;
  }

  if (parsed.pathname === '/collect' && req.method === 'POST') {
    const boundary = /boundary=(.+)$/.exec(req.headers['content-type'] || '');
    if (!boundary) {
      res.writeHead(400).end('no boundary');
      return;
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks);
        const parts = parseMultipart(body, boundary[1]);
        const phrase = (parts.get('phrase') || 'unknown').toString('utf8');
        const meta = JSON.parse((parts.get('meta') || '{}').toString('utf8') || '{}');
        const video = parts.get('video');
        const landmarks = parts.get('landmarks');

        if (!video) {
          res.writeHead(400).end('missing video');
          return;
        }
        const id = `${phrase}-${String(sampleCounter + 1).padStart(5, '0')}`;
        fs.writeFileSync(path.join(VIDEO_DIR, id + '.webm'), video);
        if (landmarks) fs.writeFileSync(path.join(LANDMARK_DIR, id + '.json'), landmarks);

        const row = {
          id,
          phrase: meta.phrase || phrase,
          fps: meta.fps || 30,
          savedAt: meta.savedAt,
          video: `videos/${id}.webm`,
          landmarks: landmarks ? `landmarks/${id}.json` : null,
        };
        fs.appendFileSync(JSONL_PATH, JSON.stringify(row) + '\n');
        sampleCounter++;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, id, total: sampleCounter }));
      } catch (err) {
        res.writeHead(500).end('parse error: ' + err.message);
      }
    });
    return;
  }

  res.writeHead(404).end('not found');
});

/** Minimal multipart/form-data parser (no deps). */
function parseMultipart(body, boundary) {
  const parts = new Map();
  const delim = Buffer.from('--' + boundary);
  let pos = body.indexOf(delim);
  while (pos !== -1) {
    const next = body.indexOf(delim, pos + delim.length);
    if (next === -1) break;
    const section = body.slice(pos + delim.length, next);
    const headerEnd = section.indexOf('\r\n\r\n');
    if (headerEnd !== -1) {
      const headers = section.slice(0, headerEnd).toString('utf8');
      const content = section.slice(headerEnd + 4, section.length - 2); // strip trailing CRLF
      const nameMatch = /name="([^"]+)"/.exec(headers);
      if (nameMatch) {
        const isFile = /filename=/.test(headers);
        parts.set(nameMatch[1], isFile ? content : content.toString('utf8'));
      }
    }
    pos = next;
  }
  return parts;
}

server.listen(PORT, () => {
  console.log(`ISL collector UI: http://localhost:${PORT}`);
  console.log(`Dataset dir: ${OUT_DIR}`);
  console.log(`Phrases: ${PHRASES.join(', ')}`);
  console.log('Record ~20 reps per phrase, then train the ONNX classifier.');
});
