// Servidor del panel de reseñas.
import express from 'express';
import { db } from './db.js';
import { APP_PASSWORD, HOST, PORT, PUBLIC_DIR } from './config.js';
import { putReply } from './google.js';
import { syncAll } from './sync.js';
import { AiNotConfiguredError, analyzeComplaints, MAX_TOPIC_REVIEWS, suggestReply } from './ai.js';
import { compare, monthly, negativeReviews } from './tracking.js';

if (HOST !== '127.0.0.1' && HOST !== 'localhost' && !APP_PASSWORD) {
  console.error('Para escuchar fuera de esta máquina hay que definir APP_PASSWORD.');
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '100kb' }));

// Acceso con contraseña compartida (HTTP Basic) cuando se define APP_PASSWORD.
if (APP_PASSWORD) {
  app.use((req, res, next) => {
    const [, b64 = ''] = (req.headers.authorization || '').split(' ');
    const pass = Buffer.from(b64, 'base64').toString().split(':').slice(1).join(':');
    if (pass === APP_PASSWORD) return next();
    res.set('WWW-Authenticate', 'Basic realm="Resenas", charset="UTF-8"').status(401).send('Acceso restringido');
  });
}

app.use(express.static(PUBLIC_DIR));

const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((error) => {
    const status = error instanceof AiNotConfiguredError ? 503 : error.status || 500;
    console.error(error);
    res.status(status).json({ error: error.message });
  });

// ---------- Filtros comunes a la lista y al CSV ----------
function buildFilter(q) {
  const where = [];
  const params = [];
  const list = (v) => (v ? String(v).split(',').filter(Boolean) : []);

  const locs = list(q.loc);
  if (locs.length) {
    where.push(`r.location_id IN (${locs.map(() => '?').join(',')})`);
    params.push(...locs);
  }
  const stars = list(q.stars).map(Number).filter((n) => n >= 1 && n <= 5);
  if (stars.length) {
    where.push(`r.stars IN (${stars.map(() => '?').join(',')})`);
    params.push(...stars);
  }
  if (q.from) {
    where.push('r.create_time >= ?');
    params.push(`${q.from}T00:00:00Z`);
  }
  if (q.to) {
    where.push('r.create_time <= ?');
    params.push(`${q.to}T23:59:59Z`);
  }
  if (q.replied === 'yes') where.push('r.reply IS NOT NULL');
  if (q.replied === 'no') where.push('r.reply IS NULL');
  if (q.text === 'yes') where.push("COALESCE(r.comment, '') <> ''");
  if (q.text === 'no') where.push("COALESCE(r.comment, '') = ''");
  if (q.q) {
    where.push("(r.comment LIKE ? OR r.reviewer LIKE ? OR COALESCE(r.reply, '') LIKE ?)");
    const like = `%${q.q}%`;
    params.push(like, like, like);
  }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

const REVIEW_COLUMNS = `r.id, r.location_id, l.short AS location, r.reviewer, r.stars, r.comment,
  r.create_time, r.update_time, r.reply, r.reply_time, r.draft, r.draft_source`;

// ---------- API ----------
app.get('/api/locations', (req, res) => {
  const rows = db
    .prepare(
      `SELECT l.id, l.short, l.title, l.average, l.total, l.last_sync,
        (SELECT COUNT(*) FROM reviews r WHERE r.location_id = l.id AND r.reply IS NULL) AS pending,
        (SELECT COUNT(*) FROM reviews r WHERE r.location_id = l.id AND r.reply IS NULL AND r.stars <= 3) AS pending_low,
        (SELECT COUNT(*) FROM reviews r WHERE r.location_id = l.id AND r.create_time >= date('now', '-30 days')) AS last30,
        (SELECT ROUND(AVG(stars), 2) FROM reviews r WHERE r.location_id = l.id AND r.create_time >= date('now', '-30 days')) AS avg30
       FROM locations l ORDER BY l.short`,
    )
    .all();
  res.json(rows);
});

app.get('/api/reviews', (req, res) => {
  const { sql, params } = buildFilter(req.query);
  const pageSize = 30;
  const page = Math.max(1, Number(req.query.page) || 1);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM reviews r ${sql}`).get(...params).n;
  const rows = db
    .prepare(
      `SELECT ${REVIEW_COLUMNS} FROM reviews r JOIN locations l ON l.id = r.location_id
       ${sql} ORDER BY r.create_time DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize);
  res.json({ total, page, pageSize, reviews: rows });
});

app.get('/api/reviews.csv', (req, res) => {
  const { sql, params } = buildFilter(req.query);
  const rows = db
    .prepare(
      `SELECT ${REVIEW_COLUMNS} FROM reviews r JOIN locations l ON l.id = r.location_id
       ${sql} ORDER BY r.create_time DESC`,
    )
    .all(...params);
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['Fecha', 'Local', 'Autor', 'Estrellas', 'Reseña', 'Respuesta', 'Fecha respuesta'];
  const lines = rows.map((r) =>
    [r.create_time.slice(0, 10), r.location, r.reviewer, r.stars, r.comment, r.reply, r.reply_time?.slice(0, 10)]
      .map(cell)
      .join(';'),
  );
  res
    .set('Content-Type', 'text/csv; charset=utf-8')
    .set('Content-Disposition', `attachment; filename="resenas-${new Date().toISOString().slice(0, 10)}.csv"`)
    .send('﻿' + [header.map(cell).join(';'), ...lines].join('\r\n')); // BOM y ';' para Excel en español
});

app.post(
  '/api/sync',
  wrap(async (req, res) => {
    res.json({ results: await syncAll({ full: req.body?.full === true }) });
  }),
);

const getReview = db.prepare(`SELECT r.*, l.short, l.title FROM reviews r JOIN locations l ON l.id = r.location_id WHERE r.id = ?`);
const getSettings = db.prepare('SELECT * FROM reply_settings WHERE location_id = ?');

function reviewOr404(id) {
  const review = getReview.get(id);
  if (!review) throw Object.assign(new Error('Reseña no encontrada'), { status: 404 });
  return review;
}

app.post(
  '/api/reviews/:id/suggest',
  wrap(async (req, res) => {
    const review = reviewOr404(req.params.id);
    const text = await suggestReply(review, review, getSettings.get(review.location_id));
    db.prepare("UPDATE reviews SET draft = ?, draft_source = 'ia' WHERE id = ?").run(text, review.id);
    res.json({ draft: text });
  }),
);

app.put(
  '/api/reviews/:id/draft',
  wrap(async (req, res) => {
    reviewOr404(req.params.id);
    const text = String(req.body?.draft ?? '').trim();
    db.prepare("UPDATE reviews SET draft = ?, draft_source = CASE WHEN ? = '' THEN NULL ELSE 'manual' END WHERE id = ?").run(
      text || null,
      text,
      req.params.id,
    );
    res.json({ ok: true });
  }),
);

// Publica en Google. Solo se llama tras confirmar en la interfaz; el texto lo envía la persona.
app.post(
  '/api/reviews/:id/publish',
  wrap(async (req, res) => {
    const review = reviewOr404(req.params.id);
    const text = String(req.body?.text ?? '').trim();
    if (!text) return res.status(400).json({ error: 'La respuesta está vacía.' });
    if (text.length > 4000) return res.status(400).json({ error: 'La respuesta supera los 4.000 caracteres.' });
    const reply = await putReply(review.name, text);
    db.prepare(
      'UPDATE reviews SET reply = ?, reply_time = ?, draft = NULL, draft_source = NULL, published_by_panel = 1 WHERE id = ?',
    ).run(reply?.comment ?? text, reply?.updateTime ?? new Date().toISOString(), review.id);
    res.json({ ok: true, reply: reply?.comment ?? text });
  }),
);

app.get('/api/settings/:loc', (req, res) => {
  const s = getSettings.get(req.params.loc);
  if (!s) return res.status(404).json({ error: 'Local no encontrado' });
  res.json(s);
});

app.put('/api/settings/:loc', (req, res) => {
  if (!getSettings.get(req.params.loc)) return res.status(404).json({ error: 'Local no encontrado' });
  const b = req.body || {};
  const clean = (v, max) => String(v ?? '').trim().slice(0, max);
  db.prepare(
    'UPDATE reply_settings SET instructions = ?, signature = ?, contact_email = ?, keywords = ? WHERE location_id = ?',
  ).run(clean(b.instructions, 2000), clean(b.signature, 200), clean(b.contact_email, 200), clean(b.keywords, 1000), req.params.loc);
  res.json(getSettings.get(req.params.loc));
});

// ---------- Seguimiento por local ----------
const locationExists = db.prepare('SELECT id, short, title FROM locations WHERE id = ?');
function locationOr404(id) {
  const loc = locationExists.get(id);
  if (!loc) throw Object.assign(new Error('Local no encontrado'), { status: 404 });
  return loc;
}

app.get('/api/tracking/compare', (req, res) => res.json(compare()));

app.get(
  '/api/tracking/:loc/monthly',
  wrap(async (req, res) => {
    locationOr404(req.params.loc);
    const months = Math.min(36, Math.max(3, Number(req.query.months) || 12));
    res.json(monthly(req.params.loc, months));
  }),
);

const latestReport = db.prepare(
  'SELECT days, analyzed, available, created_at, report FROM topic_reports WHERE location_id = ? ORDER BY id DESC LIMIT 1',
);

app.get(
  '/api/tracking/:loc/topics',
  wrap(async (req, res) => {
    locationOr404(req.params.loc);
    const row = latestReport.get(req.params.loc);
    res.json(row ? { ...row, report: JSON.parse(row.report) } : null);
  }),
);

// Lanza un análisis nuevo con la IA (cuesta dinero: solo cuando la persona lo pide).
app.post(
  '/api/tracking/:loc/topics',
  wrap(async (req, res) => {
    const loc = locationOr404(req.params.loc);
    const days = [30, 90, 180, 365].includes(Number(req.body?.days)) ? Number(req.body.days) : 90;
    const all = negativeReviews(loc.id, days);
    if (all.length < 3) {
      return res.status(400).json({ error: `Solo hay ${all.length} reseñas negativas con texto en ese periodo; no da para sacar temas.` });
    }
    const sample = all.slice(0, MAX_TOPIC_REVIEWS);
    const report = await analyzeComplaints(loc.title || loc.short, sample);
    const createdAt = new Date().toISOString();
    db.prepare(
      'INSERT INTO topic_reports (location_id, days, analyzed, available, created_at, report) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(loc.id, days, sample.length, all.length, createdAt, JSON.stringify(report));
    res.json({ days, analyzed: sample.length, available: all.length, created_at: createdAt, report });
  }),
);

app.listen(PORT, HOST,() => console.log(`Panel de reseñas en http://${HOST}:${PORT}`));
