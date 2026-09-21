const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'vaaksetu.db'));
db.pragma('journal_mode = WAL');

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
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);
`);

const insertStmt = db.prepare(`
  INSERT INTO messages (id, timestamp, user_id, role, content, confidence, lang, emergency, created_at)
  VALUES (@id, @timestamp, @user_id, @role, @content, @confidence, @lang, @emergency, @created_at)
`);
const recentStmt = db.prepare(`SELECT * FROM messages ORDER BY created_at DESC LIMIT ?`);
const countStmt  = db.prepare(`SELECT COUNT(*) as n FROM messages`);

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
  };
}

module.exports = {
  insertMessage(msg) {
    insertStmt.run({
      id: msg.id,
      timestamp: msg.timestamp,
      user_id: msg.userId,
      role: msg.role,
      content: msg.content,
      confidence: msg.confidence ?? 0,
      lang: msg.lang ?? 'en',
      emergency: msg.emergency ? 1 : 0,
      created_at: Date.now(),
    });
    return msg;
  },
  getRecentMessages(limit = 50) {
    return recentStmt.all(limit).map(rowToMessage);
  },
  getMessageCount() {
    return countStmt.get().n;
  },
};
