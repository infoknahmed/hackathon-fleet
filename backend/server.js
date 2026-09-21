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
    node: 'laptop-c',
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
