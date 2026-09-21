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
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

function makeMessage(body) {
  return {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    userId: body.userId || 'anon',
    role: body.role || 'user',
    content: body.content || '',
    confidence: body.confidence ?? 0,
    lang: body.lang || 'en',
    emergency: !!body.emergency,
  };
}

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    messageCount: db.getMessageCount(),
    node: 'laptop-c',
    service: 'vaaksetu-backend',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/messages', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 500);
  res.json(db.getRecentMessages(limit));
});

app.post('/api/messages', (req, res) => {
  const msg = makeMessage(req.body || {});
  db.insertMessage(msg);
  io.emit('message:new', msg);
  res.status(201).json(msg);
});

app.get('/health', (req, res) => res.redirect('/api/health'));
app.get('/sentences', (req, res) => res.json(db.getRecentMessages(100)));

io.on('connection', (socket) => {
  console.log('client connected', socket.id);
  socket.emit('messages:history', db.getRecentMessages(50));

  socket.on('message:send', (data) => {
    const msg = makeMessage(data || {});
    db.insertMessage(msg);
    io.emit('message:new', msg);
  });

  socket.on('disconnect', () => {
    console.log('client disconnected', socket.id);
  });
});

const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDist));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'not found' });
  res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
    if (err) res.status(200).send('<h2>API Server Running. Frontend dist not built yet.</h2>');
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('VaakSetu API listening on port ' + PORT);
});
