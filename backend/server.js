// VaakSetu API — Express + Socket.IO + SQLite (node:sqlite, no native deps).
const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const PORT = process.env.PORT_BACKEND || process.env.PORT || 3001;
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
});

function makeMessage(body) {
  const ts = body.timestamp ? new Date(body.timestamp) : new Date();
  return {
    id: body.id || uuidv4(),
    timestamp: ts.toISOString(),
    userId: body.userId || body.user_id || 'anon',
    role: body.role || body.type || 'user',
    content: body.content || body.text || '',
    confidence: body.confidence ?? 0,
    lang: body.lang || 'en',
    emergency: !!body.emergency,
  };
}

/* ── REST API ─────────────────────────────────────────────── */

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    messageCount: db.getMessageCount(),
    service: 'vaaksetu-backend',
    timestamp: new Date().toISOString(),
  });
});

// List messages (optionally filtered by user).
app.get('/api/messages', (req, res) => {
  const lim = Math.min(parseInt(req.query.limit, 10) || 50, 500);
  const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
  res.json(db.getRecentMessages(lim, userId));
});

// Ingest + broadcast.
app.post('/api/messages', (req, res) => {
  const msg = makeMessage(req.body || {});
  db.insertMessage(msg);
  io.emit('message:new', msg);
  res.status(201).json(msg);
});

// Socket relays for typing indicators + delivery/read receipts.
io.on('connection', (socket) => {
  socket.on('typing', (payload) => {
    if (payload && typeof payload.who === 'string') {
      io.emit('typing', { who: String(payload.who).slice(0, 40), typing: !!payload.typing });
    }
  });

  socket.on('message:delivered', (payload) => {
    if (payload && typeof payload.id === 'string') {
      db.markDelivered(payload.id);
      io.emit('message:status', { id: payload.id, status: 'delivered' });
    }
  });

  socket.on('message:read', (payload) => {
    if (payload && typeof payload.id === 'string') {
      db.markDelivered(payload.id);
      io.emit('message:status', { id: payload.id, status: 'read' });
    }
  });
});

// Delete a user's messages.
app.delete('/api/messages', (req, res) => {
  const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
  if (!userId) return res.status(400).json({ error: 'userId query param required' });
  const deleted = db.deleteMessages(userId);
  io.emit('messages:cleared', { userId });
  res.json({ deleted });
});

// Mark a message delivered.
app.patch('/api/messages/:id/delivered', (req, res) => {
  const ok = db.markDelivered(req.params.id);
  if (!ok) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true, id: req.params.id });
});

// Create a guardian reply (also broadcast for real-time UIs).
app.post('/api/replies', (req, res) => {
  const body = req.body || {};
  const reply = {
    id: uuidv4(),
    messageId: body.messageId ?? null,
    userId: body.userId || 'anon',
    text: body.text || '',
    guardianId: body.guardianId || 'guardian',
  };
  db.insertReply(reply);
  io.emit('reply:new', {
    id: reply.id,
    type: 'reply',
    text: reply.text,
    timestamp: new Date().toISOString(),
  });
  res.status(201).json(reply);
});

// List replies for a user.
app.get('/api/replies/:userId', (req, res) => {
  const lim = Math.min(parseInt(req.query.limit, 10) || 50, 500);
  res.json(db.getReplies(req.params.userId, lim));
});

/* ── Voice cloning (Phase 3) ─────────────────────────────── */

// Coqui XTTS-v2 clone via Replicate when REPLICATE_API_TOKEN is set.
// Without it, responds 501 + fallback:true so the client transparently
// uses its local pitch-matched TTS instead of breaking.
app.post('/api/tts/voice-clone', async (req, res) => {
  try {
    const text = String(req.body?.text || '').slice(0, 500);
    const samples = Array.isArray(req.body?.samples) ? req.body.samples : [];
    if (!text.trim()) return res.status(400).json({ error: 'text required' });
    if (samples.length < 1) return res.status(400).json({ error: 'at least 1 voice sample required' });

    const token = process.env.REPLICATE_API_TOKEN;
    if (!token) {
      return res.status(501).json({
        error: 'voice cloning not configured on this deployment',
        fallback: 'local-pitch',
      });
    }

    // Fire-and-forget with timeout — Render free tier has limited CPU.    // Timeout for the whole provider round-trip (Render free tier CPU).
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const createRes = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
          Authorization: `Token ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'wait=20',
        },
        body: JSON.stringify({
          version: 'lucataco/xtts-v2',
          input: {
            text,
            language: 'en',
            audio: samples[0], // data URI of the first voice sample
          },
        }),
        signal: controller.signal,
      });
      const created = await createRes.json();
      const outputUrl = created.output;
      if (!outputUrl) {
        // Replicate accepted the job but didn't finish within the wait window.
        return res.status(202).json({ error: 'clone still processing', fallback: 'local-pitch' });
      }
      const audioRes = await fetch(outputUrl, { signal: controller.signal });
      clearTimeout(timeout);
      const audioBuf = Buffer.from(await audioRes.arrayBuffer());
      res.set('Content-Type', 'audio/mpeg');
      return res.send(audioBuf);
    } catch (err) {
      clearTimeout(timeout);
      return res.status(502).json({ error: 'clone provider error', fallback: 'local-pitch' });
    }
  } catch (err) {
    return res.status(500).json({ error: 'voice clone failed' });
  }
});

/* ── Admin analytics ─────────────────────────────────────── */

app.get('/api/admin/stats', (req, res) => {
  const days = Math.min(parseInt(req.query.days, 10) || 7, 90);
  res.json(db.getStats(days));
});

app.get('/api/admin/timeline', (req, res) => {
  const days = Math.min(parseInt(req.query.days, 10) || 7, 90);
  res.json(db.getTimeline(days));
});

/* ── Static frontend ─────────────────────────────────────── */

app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'not found' });
  res.sendFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'), (err) => {
    if (err) res.status(200).send('<h2>API Server Running. Frontend dist not built yet.</h2>');
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('VaakSetu API listening on port ' + PORT);
});
