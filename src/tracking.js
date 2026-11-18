// Indicadores de seguimiento por local, calculados sobre las reseñas sincronizadas.
import { db } from './db.js';

const DAY = 24 * 3600 * 1000;

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Horas entre la reseña y la respuesta. Google da la fecha de la última edición de la
// respuesta, así que es aproximado (una respuesta editada después parece más tardía).
function responseHours(r) {
  if (!r.reply_time) return null;
  const h = (Date.parse(r.reply_time) - Date.parse(r.create_time)) / 3600000;
  return h >= 0 ? h : null;
}

function summarize(rows) {
  const n = rows.length;
  const replied = rows.filter((r) => r.reply != null);
  const hours = replied.map(responseHours).filter((h) => h != null);
  return {
    count: n,
    avg: n ? rows.reduce((s, r) => s + r.stars, 0) / n : null,
    neg: rows.filter((r) => r.stars <= 3).length,
    pos: rows.filter((r) => r.stars >= 4).length,
    replied: replied.length,
    replyRate: n ? replied.length / n : null,
    medianHours: median(hours),
  };
}

const byLocationSince = db.prepare(
  'SELECT stars, reply, reply_time, create_time FROM reviews WHERE location_id = ? AND create_time >= ?',
);

export function compare() {
  const now = Date.now();
  const iso = (days) => new Date(now - days * DAY).toISOString();
  const locations = db.prepare('SELECT id, short, average, total, last_sync FROM locations ORDER BY short').all();
  return locations.map((l) => {
    const d30 = summarize(byLocationSince.all(l.id, iso(30)));
    const d90 = summarize(byLocationSince.all(l.id, iso(90)));
    const prev30 = summarize(
      db
        .prepare(
          'SELECT stars, reply, reply_time, create_time FROM reviews WHERE location_id = ? AND create_time >= ? AND create_time < ?',
        )
        .all(l.id, iso(60), iso(30)),
    );
    const pending = db
      .prepare(
        `SELECT COUNT(*) AS total, SUM(stars <= 3) AS low FROM reviews WHERE location_id = ? AND reply IS NULL`,
      )
      .get(l.id);
    return {
      id: l.id,
      short: l.short,
      googleAverage: l.average,
      googleTotal: l.total,
      d30,
      prev30,
      d90,
      pending: pending.total,
      pendingLow: pending.low ?? 0,
    };
  });
}

export function monthly(locationId, months = 12) {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCMonth(start.getUTCMonth() - (months - 1));
  const rows = byLocationSince.all(locationId, start.toISOString());

  const buckets = new Map();
  for (let i = 0; i < months; i++) {
    const d = new Date(start);
    d.setUTCMonth(start.getUTCMonth() + i);
    buckets.set(d.toISOString().slice(0, 7), []);
  }
  for (const r of rows) buckets.get(r.create_time.slice(0, 7))?.push(r);

  return [...buckets].map(([month, list]) => ({ month, ...summarize(list) }));
}

// Reseñas negativas con texto de un periodo, para el análisis de temas.
export function negativeReviews(locationId, days) {
  return db
    .prepare(
      `SELECT id, stars, comment, create_time FROM reviews
       WHERE location_id = ? AND stars <= 3 AND COALESCE(comment, '') <> '' AND create_time >= ?
       ORDER BY create_time DESC`,
    )
    .all(locationId, new Date(Date.now() - days * DAY).toISOString());
}
