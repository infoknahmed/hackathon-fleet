// VaakSetu database layer — powered by node:sqlite (built into Node >= 22.5).
// No native compilation required (works out of the box on Windows).

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'vaaksetu.db'));
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    confidence INTEGER DEFAULT 0,
    lang TEXT DEFAULT 'en',
    emergency INTEGER DEFAULT 0,
    delivered INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS replies (
    id TEXT PRIMARY KEY,
    message_id TEXT,
    user_id TEXT NOT NULL,
    text TEXT NOT NULL,
    guardian_id TEXT DEFAULT 'guardian',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);
  CREATE INDEX IF NOT EXISTS idx_messages_user_created ON messages(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(role);
  CREATE INDEX IF NOT EXISTS idx_replies_user_created ON replies(user_id, created_at DESC);
`);

// Migration: older databases may predate the `delivered` column.
try {
  db.prepare('SELECT delivered FROM messages LIMIT 1').get();
} catch {
  db.exec('ALTER TABLE messages ADD COLUMN delivered INTEGER DEFAULT 0;');
  console.log('[db] migrated: added messages.delivered column');
}

const insertMsgStmt = db.prepare(`
  INSERT INTO messages (id, timestamp, user_id, role, content, confidence, lang, emergency, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO NOTHING
`);
const insertReplyStmt = db.prepare(`
  INSERT INTO replies (id, message_id, user_id, text, guardian_id, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

function rowToMessage(r) {
  return {
    id: r.id,
    timestamp: r.timestamp,
    userId: r.user_id,
    role: r.role,
    content: r.content,
    confidence: r.confidence,
    lang: r.lang,
    emergency: !!r.emergency,
    delivered: !!r.delivered,
  };
}

function rowToReply(r) {
  return {
    id: r.id,
    messageId: r.message_id,
    userId: r.user_id,
    text: r.text,
    guardianId: r.guardian_id,
    createdAt: r.created_at,
  };
}

module.exports = {
  insertMessage(msg, createdAt) {
    insertMsgStmt.run(
      msg.id,
      msg.timestamp,
      msg.userId ?? 'anon',
      msg.role ?? 'user',
      msg.content ?? '',
      msg.confidence ?? 0,
      msg.lang ?? 'en',
      msg.emergency ? 1 : 0,
      createdAt ?? Date.now(),
    );
    return msg;
  },

  getRecentMessages(limit = 50, userId) {
    const rows = userId
      ? db.prepare('SELECT * FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit)
      : db.prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT ?').all(limit);
    return rows.map(rowToMessage);
  },

  getMessageById(id) {
    const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
    return row ? rowToMessage(row) : null;
  },

  markDelivered(id) {
    const info = db.prepare('UPDATE messages SET delivered = 1 WHERE id = ?').run(id);
    return info.changes > 0;
  },

  deleteMessages(userId) {
    const info = db.prepare('DELETE FROM messages WHERE user_id = ?').run(userId);
    return info.changes;
  },

  insertReply(reply, createdAt) {
    insertReplyStmt.run(
      reply.id,
      reply.messageId ?? null,
      reply.userId ?? 'anon',
      reply.text ?? '',
      reply.guardianId ?? 'guardian',
      createdAt ?? Date.now(),
    );
    return reply;
  },

  getReplies(userId, limit = 50) {
    const rows = userId
      ? db.prepare('SELECT * FROM replies WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit)
      : db.prepare('SELECT * FROM replies ORDER BY created_at DESC LIMIT ?').all(limit);
    return rows.map(rowToReply);
  },

  getMessageCount() {
    return db.prepare('SELECT COUNT(*) AS n FROM messages').get().n;
  },

  getStats(days = 7) {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const total = db.prepare('SELECT COUNT(*) AS n FROM messages').get().n;
    const emergencies = db
      .prepare('SELECT COUNT(*) AS n FROM messages WHERE emergency = 1 AND created_at >= ?')
      .get(since).n;
    const users = db
      .prepare('SELECT COUNT(DISTINCT user_id) AS n FROM messages WHERE created_at >= ?')
      .get(since).n;
    const avgLatency = db
      .prepare('SELECT AVG(confidence) AS avg FROM messages WHERE created_at >= ?')
      .get(since).avg;
    const moods = db
      .prepare(
        `SELECT role AS name, COUNT(*) AS value FROM messages
         WHERE created_at >= ? GROUP BY role ORDER BY value DESC`,
      )
      .all(since);
    return {
      totalMessages: total,
      emergencies,
      activeUsers: users,
      avgConfidence: avgLatency ? Math.round(avgLatency) : 0,
      byRole: moods,
    };
  },

  getTimeline(days = 7) {
    const since = Date.now() - days * 24 * 60 * 60 * 1000;
    const rows = db
      .prepare(
        `SELECT date(created_at / 1000, 'unixepoch') AS day, COUNT(*) AS count
         FROM messages WHERE created_at >= ? GROUP BY day ORDER BY day ASC`,
      )
      .all(since);
    // Fill gaps so the chart always has `days` points.
    const points = [];
    const byDay = new Map(rows.map((r) => [r.day, r.count]));
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      points.push({ day: key, count: byDay.get(key) ?? 0 });
    }
    return points;
  },
};
