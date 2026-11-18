// Base de datos local (SQLite integrado en Node, sin dependencias nativas).
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DB_PATH, LOCATIONS } from './config.js';

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS locations (
    id            TEXT PRIMARY KEY,
    short         TEXT NOT NULL,
    title         TEXT,
    average       REAL,
    total         INTEGER,
    last_sync     TEXT
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id            TEXT PRIMARY KEY,          -- reviewId de Google
    name          TEXT NOT NULL,             -- accounts/../locations/../reviews/..
    location_id   TEXT NOT NULL REFERENCES locations(id),
    reviewer      TEXT,
    stars         INTEGER NOT NULL,
    comment       TEXT,                      -- texto original (sin la traducción de Google)
    create_time   TEXT NOT NULL,
    update_time   TEXT NOT NULL,
    reply         TEXT,
    reply_time    TEXT,
    draft         TEXT,                      -- borrador pendiente de revisar (nunca se publica solo)
    draft_source  TEXT,                      -- 'ia' o 'manual'
    published_by_panel INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS reviews_loc_time ON reviews(location_id, create_time DESC);

  CREATE TABLE IF NOT EXISTS reply_settings (
    location_id   TEXT PRIMARY KEY REFERENCES locations(id),
    instructions  TEXT DEFAULT '',
    signature     TEXT DEFAULT '',
    contact_email TEXT DEFAULT '',
    keywords      TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS topic_reports (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    location_id   TEXT NOT NULL REFERENCES locations(id),
    days          INTEGER NOT NULL,
    analyzed      INTEGER NOT NULL,          -- reseñas enviadas a la IA
    available     INTEGER NOT NULL,          -- reseñas negativas con texto en el periodo
    created_at    TEXT NOT NULL,
    report        TEXT NOT NULL              -- JSON con resumen y temas
  );
`);

const upsertLoc = db.prepare(
  `INSERT INTO locations (id, short) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET short = excluded.short`,
);
const ensureSettings = db.prepare(`INSERT OR IGNORE INTO reply_settings (location_id) VALUES (?)`);
for (const l of LOCATIONS) {
  upsertLoc.run(l.id, l.short);
  ensureSettings.run(l.id);
}
