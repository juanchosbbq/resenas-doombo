// Registro de lo que gasta la IA. El coste es una estimación con las tarifas públicas de la API
// (dólares por millón de tokens); la factura real está en console.anthropic.com.
import { db } from './db.js';

// input, output, lectura de caché, escritura de caché (5 min = 1,25 × input)
const PRICES = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
  'claude-fable-5-2': { input: 8, output: 40, cacheRead: 0.2 },
};

db.exec(`
  CREATE TABLE IF NOT EXISTS ai_usage (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at    TEXT NOT NULL,
    kind          TEXT NOT NULL,             -- 'reply' (respuesta sugerida) o 'topics' (análisis de quejas)
    location_id   TEXT,
    model         TEXT,
    input_tokens  INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd      REAL                       -- NULL si el modelo no está en la tabla de precios
  );
`);

function priceOf(model) {
  // Admite también identificadores con sufijo (p. ej. de una plataforma o una versión fechada).
  const key = Object.keys(PRICES).find((k) => model === k || model?.startsWith(`${k}-`) || model?.endsWith(k));
  return key ? PRICES[key] : null;
}

function costOf(model, u) {
  const p = priceOf(model);
  if (!p) return null;
  return (
    ((u.input_tokens || 0) * p.input +
      (u.output_tokens || 0) * p.output +
      (u.cache_read_input_tokens || 0) * p.cacheRead +
      (u.cache_creation_input_tokens || 0) * p.input * 1.25) /
    1e6
  );
}

const insert = db.prepare(`INSERT INTO ai_usage
  (created_at, kind, location_id, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

// Guarda el uso de una respuesta de la API y devuelve su coste estimado en dólares.
// Si la petición pasó a otro modelo por una negativa, `usage.iterations` trae el detalle de cada tramo.
export function recordUsage({ kind, locationId }, response) {
  const usage = response.usage || {};
  const parts =
    Array.isArray(usage.iterations) && usage.iterations.some((it) => it.input_tokens != null)
      ? usage.iterations.map((it) => ({ model: it.model || response.model, u: it }))
      : [{ model: response.model, u: usage }];

  let total = 0;
  let unknown = false;
  const sum = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  for (const { model, u } of parts) {
    const c = costOf(model, u);
    if (c == null) unknown = true;
    else total += c;
    for (const k of Object.keys(sum)) sum[k] += u[k] || 0;
  }
  const cost = unknown ? null : total;
  insert.run(
    new Date().toISOString(),
    kind,
    locationId ?? null,
    response.model ?? null,
    sum.input_tokens,
    sum.output_tokens,
    sum.cache_read_input_tokens,
    sum.cache_creation_input_tokens,
    cost,
  );
  return cost;
}

export function usageSummary() {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const agg = (where, params = []) =>
    db
      .prepare(
        `SELECT COUNT(*) AS calls, COALESCE(SUM(cost_usd), 0) AS cost,
           SUM(kind = 'reply') AS replies, SUM(kind = 'topics') AS analyses,
           COALESCE(SUM(input_tokens), 0) AS input_tokens, COALESCE(SUM(output_tokens), 0) AS output_tokens,
           SUM(cost_usd IS NULL) AS unpriced
         FROM ai_usage ${where}`,
      )
      .get(...params);
  const avg = db
    .prepare(`SELECT kind, AVG(cost_usd) AS avg FROM ai_usage WHERE cost_usd IS NOT NULL GROUP BY kind`)
    .all();
  const byLocation = db
    .prepare(
      `SELECT l.short AS location, COUNT(u.id) AS calls, COALESCE(SUM(u.cost_usd), 0) AS cost
       FROM ai_usage u LEFT JOIN locations l ON l.id = u.location_id
       WHERE u.created_at >= ? GROUP BY u.location_id ORDER BY cost DESC`,
    )
    .all(monthStart);
  return {
    month: agg('WHERE created_at >= ?', [monthStart]),
    total: agg(''),
    avgReply: avg.find((a) => a.kind === 'reply')?.avg ?? null,
    avgTopics: avg.find((a) => a.kind === 'topics')?.avg ?? null,
    byLocation,
  };
}
