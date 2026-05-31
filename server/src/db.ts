import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/jamstream.db');

let db: SqlJsDatabase;

export async function initDb(): Promise<SqlJsDatabase> {
  if (db) return db;

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT 'Untitled',
      username TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS songs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT 'Untitled',
      data TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  saveDb();
  console.log(`[db] initialized at ${DB_PATH}`);
  return db;
}

export function getDb(): SqlJsDatabase {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

export function saveDb() {
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('[db] save error:', err);
  }
}
