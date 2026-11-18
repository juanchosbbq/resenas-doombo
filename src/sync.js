// Copia las reseñas de Google a la base de datos local.
import { db } from './db.js';
import { LOCATIONS } from './config.js';
import { getAccountName, getLocationTitle, listReviews } from './google.js';

const STARS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
const MARGIN_MS = 7 * 24 * 3600 * 1000; // en incremental, re-leemos una semana por si hubo cambios

// Google devuelve "(Translated by Google) <traducción>\n\n(Original)\n<texto>" cuando la reseña
// no está en el idioma de la cuenta. Guardamos solo el original.
export function originalText(comment) {
  if (!comment) return null;
  const m = comment.match(/\(Original\)\s*([\s\S]+)$/);
  return (m ? m[1] : comment).trim();
}

const upsert = db.prepare(`
  INSERT INTO reviews (id, name, location_id, reviewer, stars, comment, create_time, update_time, reply, reply_time)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name, reviewer = excluded.reviewer, stars = excluded.stars,
    comment = excluded.comment, update_time = excluded.update_time,
    reply = excluded.reply, reply_time = excluded.reply_time,
    -- si ya hay respuesta publicada, el borrador deja de tener sentido
    draft = CASE WHEN excluded.reply IS NOT NULL THEN NULL ELSE reviews.draft END,
    draft_source = CASE WHEN excluded.reply IS NOT NULL THEN NULL ELSE reviews.draft_source END
`);

let running = null;

export function syncAll({ full = false } = {}) {
  // Evita dos sincronizaciones a la vez: la segunda espera a la primera.
  running ??= doSync(full).finally(() => (running = null));
  return running;
}

async function doSync(full) {
  const account = await getAccountName();
  const results = [];
  for (const loc of LOCATIONS) {
    const row = db.prepare('SELECT last_sync, title FROM locations WHERE id = ?').get(loc.id);
    const since = !full && row?.last_sync ? Date.parse(row.last_sync) - MARGIN_MS : null;
    const startedAt = new Date().toISOString();
    let count = 0;

    const summary = await listReviews(account, loc.id, (reviews) => {
      db.exec('BEGIN');
      for (const r of reviews) {
        upsert.run(
          r.reviewId,
          r.name,
          loc.id,
          r.reviewer?.isAnonymous ? 'Anónimo' : r.reviewer?.displayName || 'Anónimo',
          STARS[r.starRating] ?? 0,
          originalText(r.comment),
          r.createTime,
          r.updateTime,
          r.reviewReply?.comment ?? null,
          r.reviewReply?.updateTime ?? null,
        );
        count++;
      }
      db.exec('COMMIT');
      if (since === null || !reviews.length) return true;
      return Date.parse(reviews.at(-1).updateTime) > since; // seguir solo si quedan recientes
    });

    const title = row?.title || (await getLocationTitle(loc.id));
    db.prepare('UPDATE locations SET title = ?, average = ?, total = ?, last_sync = ? WHERE id = ?').run(
      title,
      summary?.averageRating ?? null,
      summary?.totalReviewCount ?? null,
      startedAt,
      loc.id,
    );
    results.push({ location: loc.short, read: count, total: summary?.totalReviewCount ?? 0 });
  }
  return results;
}
