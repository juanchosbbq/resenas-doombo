// Vista "Seguimiento": comparativa entre locales, evolución mensual y temas de las quejas.
import { mountDateRange } from './daterange.js';

const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (n, d = 0) =>
  n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (r) => (r == null ? '—' : `${num(r * 100)} %`);
const hours = (h) => (h == null ? '—' : h < 48 ? `${num(h)} h` : `${num(h / 24, 1)} días`);
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const monthLabel = (ym, withYear = false) => {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]}${withYear ? ` ${String(y).slice(2)}` : ''}`;
};
const monthLong = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

let toastTimer;
function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast${isError ? ' error' : ''}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), isError ? 7000 : 3500);
}

const state = { compare: [], loc: null, monthly: [], loaded: false };

// ---------- Navegación entre vistas ----------
function showView() {
  const view = location.hash === '#seguimiento' ? 'seguimiento' : 'resenas';
  $('#view-resenas').hidden = view !== 'resenas';
  $('#view-seguimiento').hidden = view !== 'seguimiento';
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-current', t.dataset.view === view ? 'page' : 'false'));
  if (view === 'seguimiento' && !state.loaded) loadTracking();
  else if (view === 'seguimiento') renderCharts();
  if (view === 'seguimiento') loadUsage().catch((e) => toast(e.message, true));
}
window.addEventListener('hashchange', showView);

// ---------- Comparativa ----------
const compareDates = mountDateRange($('#c-dates'), {
  preset: '30',
  onChange: () => loadCompare().catch((e) => toast(e.message, true)),
});

function delta(now, before) {
  if (!before) return '';
  const d = now - before.count;
  if (d === 0) return '<span class="delta">igual que el periodo anterior</span>';
  return `<span class="delta">${d > 0 ? '+' : '−'}${num(Math.abs(d))} vs periodo anterior</span>`;
}

async function loadCompare() {
  const { from, to, prevFrom, prevTo, label } = compareDates.range();
  const q = new URLSearchParams();
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  if (prevFrom && prevTo) {
    q.set('prevFrom', prevFrom);
    q.set('prevTo', prevTo);
  }
  const data = await api(`/api/tracking/compare?${q}`);
  state.compare = data.locations;
  state.compareRange = data.range;
  $('#compare-kicker').textContent = `Comparativa · ${label}`;
  renderCompare();
}

function renderCompare() {
  const prev = state.compareRange?.prev;
  const prevNote = prev
    ? `Se compara con el periodo del ${new Date(prev.from).toLocaleDateString('es-ES')} al ${new Date(Date.parse(prev.to) - 1).toLocaleDateString('es-ES')}.`
    : '';
  $('#compare-prev').textContent = prevNote;
  const rows = state.compare
    .map(
      (l) => `<tr data-loc="${l.id}" class="${l.id === state.loc ? 'is-selected' : ''}" tabindex="0">
        <th scope="row">${esc(l.short)}</th>
        <td class="n big">${num(l.googleAverage, 1)}</td>
        <td class="n">${num(l.period.count)}${delta(l.period.count, l.prev)}</td>
        <td class="n">${num(l.period.avg, 2)}</td>
        <td class="n">${num(l.period.neg)}</td>
        <td class="n">${pct(l.period.replyRate)}</td>
        <td class="n">${hours(l.period.medianHours)}</td>
        <td class="n">${l.pending ? `<span class="pill ${l.pendingLow ? 'pill-bad' : 'pill-warn'}">${num(l.pending)}</span>` : '<span class="pill pill-good">0</span>'}</td>
        <td class="n">${num(l.pendingLow)}</td>
      </tr>`,
    )
    .join('');
  $('#compare-table').innerHTML = `
    <thead><tr>
      <th scope="col">Local</th>
      <th scope="col" class="n">Nota en Google</th>
      <th scope="col" class="n">Reseñas</th>
      <th scope="col" class="n">Media del periodo</th>
      <th scope="col" class="n">De 1–3★</th>
      <th scope="col" class="n">Respondidas</th>
      <th scope="col" class="n">Tiempo de respuesta (mediana)</th>
      <th scope="col" class="n">Sin responder (total)</th>
      <th scope="col" class="n">… de 1–3★</th>
    </tr></thead><tbody>${rows}</tbody>`;
}

function renderLocChips() {
  $('#t-loc').innerHTML = state.compare
    .map((l) => `<button class="chip" data-tloc="${l.id}" aria-pressed="${l.id === state.loc}">${esc(l.short)}</button>`)
    .join('');
}

// ---------- Gráficos (SVG, sin librerías) ----------
const COLORS = { neg: '#B61829', pos: '#BDBDBD', line: '#B61829', line2: '#000000', grid: '#D6D6D6', axis: '#555555' };
const PAD = { top: 16, right: 44, bottom: 28, left: 46 };

function frame(el, height = 200) {
  const width = Math.max(260, el.clientWidth);
  return { width, height, w: width - PAD.left - PAD.right, h: height - PAD.top - PAD.bottom };
}

function niceMax(v) {
  if (v <= 5) return 5;
  const step = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / step) * step;
}

function axisY(f, ticks, y, fmt) {
  return ticks
    .map(
      (t) => `<line x1="${PAD.left}" x2="${PAD.left + f.w}" y1="${y(t)}" y2="${y(t)}" stroke="${COLORS.grid}" stroke-width="1"/>
      <text x="${PAD.left - 6}" y="${y(t)}" dy="0.32em" text-anchor="end" class="axis">${fmt(t)}</text>`,
    )
    .join('');
}

function axisX(f, data, x) {
  // El año solo en enero (o en el primer mes si no hay enero), para que las etiquetas no choquen.
  const hasJan = data.some((d) => d.month.endsWith('-01'));
  const narrow = f.w / data.length < 34;
  return data
    .map((d, i) => {
      const show = !narrow || i % 2 === 0;
      const withYear = d.month.endsWith('-01') || (!hasJan && i === 0);
      return show
        ? `<text x="${x(i)}" y="${PAD.top + f.h + 18}" text-anchor="middle" class="axis">${monthLabel(d.month, withYear)}</text>`
        : '';
    })
    .join('');
}

// Columna apilada: 4–5★ abajo en gris, 1–3★ arriba en rojo; extremo superior redondeado 4px.
function columnPath(x, yTop, width, height, roundTop) {
  if (height <= 0) return '';
  const r = roundTop ? Math.min(4, height, width / 2) : 0;
  const yb = yTop + height;
  return `M${x},${yb} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + width - r} Q${x + width},${yTop} ${x + width},${yTop + r} V${yb} Z`;
}

function volumeChart(el, data) {
  const f = frame(el);
  const max = niceMax(Math.max(1, ...data.map((d) => d.count)));
  const y = (v) => PAD.top + f.h - (v / max) * f.h;
  const band = f.w / data.length;
  const bw = Math.min(24, band * 0.6);
  const x = (i) => PAD.left + band * i + band / 2;
  const ticks = [0, max / 2, max].map((t) => Math.round(t));
  const GAP = 2;

  const bars = data
    .map((d, i) => {
      if (!d.count) return '';
      const x0 = x(i) - bw / 2;
      const hPos = (d.pos / max) * f.h;
      const hNeg = (d.neg / max) * f.h;
      const posTop = PAD.top + f.h - hPos;
      const negH = Math.max(0, hNeg - (d.pos && d.neg ? GAP : 0));
      const pos = d.pos ? `<path fill="${COLORS.pos}" d="${columnPath(x0, posTop, bw, hPos, !d.neg)}"/>` : '';
      const neg = d.neg
        ? `<path fill="${COLORS.neg}" d="${columnPath(x0, posTop - (d.pos ? GAP : 0) - negH, bw, negH, true)}"/>`
        : '';
      return pos + neg;
    })
    .join('');

  const hits = data
    .map((d, i) => `<rect class="hit" x="${PAD.left + band * i}" y="${PAD.top}" width="${band}" height="${f.h}" data-i="${i}"/>`)
    .join('');

  el.innerHTML = `<svg width="${f.width}" height="${f.height}" role="img" aria-label="Reseñas al mes, separadas en 1–3 estrellas y 4–5 estrellas">
    ${axisY(f, ticks, y, (t) => num(t))}${axisX(f, data, x)}${bars}${hits}</svg>`;
  bindTip(el, data, (d) =>
    `<strong>${monthLong(d.month)}</strong><br>${num(d.count)} reseñas<br><span class="key key-neg"></span>${num(d.neg)} de 1–3★<br><span class="key key-pos"></span>${num(d.pos)} de 4–5★`,
  );
}

function lineChart(el, data, { value, min, max, ticks, fmt, color, label, tip }) {
  const f = frame(el);
  const y = (v) => PAD.top + f.h - ((v - min) / (max - min)) * f.h;
  const band = f.w / data.length;
  const x = (i) => PAD.left + band * i + band / 2;

  // Tramos continuos: un mes sin reseñas corta la línea en vez de inventar un valor.
  const segments = [];
  let current = [];
  data.forEach((d, i) => {
    const v = value(d);
    if (v == null) {
      if (current.length) segments.push(current);
      current = [];
    } else current.push([x(i), y(v)]);
  });
  if (current.length) segments.push(current);

  const lines = segments
    .map((s) => `<polyline fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${s.map((p) => p.join(',')).join(' ')}"/>`)
    .join('');
  const dots = data
    .map((d, i) => (value(d) == null ? '' : `<circle cx="${x(i)}" cy="${y(value(d))}" r="4" fill="${color}" stroke="#fff" stroke-width="2"/>`))
    .join('');
  const lastIdx = data.map(value).findLastIndex((v) => v != null);
  const endLabel =
    lastIdx >= 0
      ? `<text x="${x(lastIdx) + 9}" y="${y(value(data[lastIdx]))}" dy="0.32em" text-anchor="start" class="end-label">${fmt(value(data[lastIdx]))}</text>`
      : '';
  const hits = data
    .map((d, i) => `<rect class="hit" x="${PAD.left + band * i}" y="${PAD.top}" width="${band}" height="${f.h}" data-i="${i}"/>`)
    .join('');

  el.innerHTML = `<svg width="${f.width}" height="${f.height}" role="img" aria-label="${esc(label)}">
    ${axisY(f, ticks, y, fmt)}${axisX(f, data, x)}<line class="crosshair" x1="0" x2="0" y1="${PAD.top}" y2="${PAD.top + f.h}" stroke="${COLORS.axis}" stroke-width="1" visibility="hidden"/>
    ${lines}${dots}${endLabel}${hits}</svg>`;
  bindTip(el, data, tip, (i) => x(i));
}

function bindTip(el, data, html, crossX) {
  const tip = $('#chart-tip');
  const svg = el.querySelector('svg');
  const cross = svg.querySelector('.crosshair');
  svg.addEventListener('pointermove', (ev) => {
    const hit = ev.target.closest('.hit');
    if (!hit) return;
    const i = Number(hit.dataset.i);
    tip.innerHTML = html(data[i]);
    tip.hidden = false;
    const pad = 14;
    const r = tip.getBoundingClientRect();
    let left = ev.clientX + pad;
    if (left + r.width > window.innerWidth - 8) left = ev.clientX - r.width - pad;
    tip.style.left = `${left + window.scrollX}px`;
    tip.style.top = `${ev.clientY + window.scrollY - r.height - pad}px`;
    if (cross && crossX) {
      cross.setAttribute('x1', crossX(i));
      cross.setAttribute('x2', crossX(i));
      cross.setAttribute('visibility', 'visible');
    }
  });
  svg.addEventListener('pointerleave', () => {
    tip.hidden = true;
    cross?.setAttribute('visibility', 'hidden');
  });
}

function renderCharts() {
  const data = state.monthly;
  if (!data.length || $('#view-seguimiento').hidden) return;
  volumeChart($('#chart-volume'), data);

  const avgs = data.map((d) => d.avg).filter((v) => v != null);
  const floor = Math.max(1, Math.min(4, Math.floor((Math.min(...avgs, 5) - 0.25) * 2) / 2));
  const rTicks = [];
  for (let t = floor; t <= 5.0001; t += floor <= 3 ? 1 : 0.5) rTicks.push(t);
  lineChart($('#chart-rating'), data, {
    value: (d) => d.avg,
    min: floor,
    max: 5,
    ticks: rTicks,
    fmt: (v) => num(v, 1),
    color: COLORS.line,
    label: 'Nota media de las reseñas de cada mes',
    tip: (d) => `<strong>${monthLong(d.month)}</strong><br>Nota media ${num(d.avg, 2)}<br>${num(d.count)} reseñas`,
  });
  lineChart($('#chart-replies'), data, {
    value: (d) => (d.count ? d.replyRate * 100 : null),
    min: 0,
    max: 100,
    ticks: [0, 50, 100],
    fmt: (v) => `${num(v)} %`,
    color: COLORS.line2,
    label: 'Porcentaje de reseñas respondidas de cada mes',
    tip: (d) => `<strong>${monthLong(d.month)}</strong><br>${num(d.replied)} de ${num(d.count)} respondidas<br>Respuesta en ${hours(d.medianHours)} (mediana)`,
  });

  $('#monthly-table').innerHTML = `<thead><tr>
      <th scope="col">Mes</th><th scope="col" class="n">Reseñas</th><th scope="col" class="n">De 1–3★</th>
      <th scope="col" class="n">Nota media</th><th scope="col" class="n">Respondidas</th><th scope="col" class="n">Tiempo de respuesta</th>
    </tr></thead><tbody>${data
      .map(
        (d) => `<tr><th scope="row">${monthLong(d.month)}</th><td class="n">${num(d.count)}</td><td class="n">${num(d.neg)}</td>
        <td class="n">${num(d.avg, 2)}</td><td class="n">${pct(d.replyRate)}</td><td class="n">${hours(d.medianHours)}</td></tr>`,
      )
      .join('')}</tbody>`;
}

// ---------- Temas de las quejas ----------
function renderTopics(r) {
  const box = $('#topics-result');
  if (!r) {
    $('#topics-meta').textContent = '';
    box.innerHTML = '<p class="muted">Aún no hay ningún análisis de este local. Cada análisis usa la IA y tiene un pequeño coste.</p>';
    return;
  }
  const when = new Date(r.created_at).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
  $('#topics-meta').textContent =
    `Análisis del ${when} · ${r.days} días · ${r.analyzed} reseñas de 1–3★ con texto` +
    (r.available > r.analyzed ? ` (las ${r.analyzed} más recientes de ${r.available})` : '') +
    (r.report.costUsd != null ? ` · coste estimado ${usd(r.report.costUsd)}` : '');
  box.innerHTML = `<p class="topics-summary">${esc(r.report.resumen)}</p>
    <ol class="topics">${r.report.temas
      .map(
        (t) => `<li class="topic">
        <div class="topic-head"><span class="topic-count">${num(t.cuenta)}</span><span class="topic-name">${esc(t.nombre)}</span></div>
        <p>${esc(t.descripcion)}</p>
        <p class="topic-action"><strong>Qué probar:</strong> ${esc(t.sugerencia)}</p>
        ${t.ejemplos
          .map((e) => `<blockquote><span class="muted">${'★'.repeat(e.estrellas)} · ${e.fecha}</span><br>${esc(e.texto.length > 280 ? `${e.texto.slice(0, 280)}…` : e.texto)}</blockquote>`)
          .join('')}
      </li>`,
      )
      .join('')}</ol>`;
}

// ---------- Gasto de la IA ----------
const usd = (v) => {
  if (v == null) return '—';
  // Por debajo de 10 céntimos se lee mejor en céntimos (p. ej. "1,08 cént. $" en vez de "0,01 $").
  if (v > 0 && v < 0.1) return `${(v * 100).toLocaleString('es-ES', { maximumFractionDigits: 2 })} cént. $`;
  return `${v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
};

async function loadUsage() {
  const u = await api('/api/ai-usage');
  const tile = (label, value, sub = '') =>
    `<div class="stat"><span class="stat-label">${label}</span><span class="stat-value">${value}</span>${sub ? `<span class="stat-sub">${sub}</span>` : ''}</div>`;
  const m = u.month;
  $('#usage-box').innerHTML = `
    <div class="stats">
      ${tile('Este mes', usd(m.cost), `${num(m.replies || 0)} ${m.replies === 1 ? 'respuesta sugerida' : 'respuestas sugeridas'} · ${num(m.analyses || 0)} análisis`)}
      ${tile('Coste medio por respuesta', usd(u.avgReply), u.avgReply == null ? 'aún sin datos' : '')}
      ${tile('Coste medio por análisis', usd(u.avgTopics), u.avgTopics == null ? 'aún sin datos' : '')}
      ${tile('Total desde el inicio', usd(u.total.cost), `${num(u.total.calls)} ${u.total.calls === 1 ? 'llamada' : 'llamadas'} a la IA`)}
    </div>
    ${
      u.byLocation.length
        ? `<p class="muted">Este mes por local: ${u.byLocation.map((l) => `${esc(l.location || 'Sin local')} ${usd(l.cost)}`).join(' · ')}</p>`
        : ''
    }
    ${u.total.unpriced ? `<p class="muted">${num(u.total.unpriced)} llamadas usaron un modelo sin tarifa conocida y no suman al coste.</p>` : ''}`;
}
document.addEventListener('resenas:ai-used', () => {
  if (!$('#view-seguimiento').hidden) loadUsage().catch(() => {});
});

// ---------- Carga ----------
async function selectLocation(id) {
  state.loc = id;
  renderCompare();
  renderLocChips();
  const [monthlyData, topics] = await Promise.all([
    api(`/api/tracking/${id}/monthly?months=12`),
    api(`/api/tracking/${id}/topics`),
  ]);
  state.monthly = monthlyData;
  renderCharts();
  renderTopics(topics);
}

async function loadTracking() {
  try {
    await loadCompare();
    state.loaded = true;
    // Por defecto, el local con más reseñas negativas sin responder.
    const first = [...state.compare].sort((a, b) => b.pendingLow - a.pendingLow)[0];
    await selectLocation(state.loc ?? first.id);
  } catch (e) {
    toast(e.message, true);
  }
}

document.addEventListener('click', (ev) => {
  const row = ev.target.closest('#compare-table tbody tr');
  const chip = ev.target.closest('[data-tloc]');
  const id = row?.dataset.loc || chip?.dataset.tloc;
  if (id && id !== state.loc) selectLocation(id).catch((e) => toast(e.message, true));
});
document.addEventListener('keydown', (ev) => {
  const row = ev.target.closest?.('#compare-table tbody tr');
  if (row && (ev.key === 'Enter' || ev.key === ' ')) {
    ev.preventDefault();
    selectLocation(row.dataset.loc).catch((e) => toast(e.message, true));
  }
});

$('#btn-topics').addEventListener('click', async (ev) => {
  const btn = ev.currentTarget;
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Analizando…';
  try {
    const r = await api(`/api/tracking/${state.loc}/topics`, { method: 'POST', body: { days: Number($('#t-days').value) } });
    renderTopics(r);
    toast(`Análisis listo · coste estimado ${usd(r.report.costUsd)}.`);
    loadUsage().catch(() => {});
  } catch (e) {
    toast(e.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderCharts, 150);
});

// Al actualizar desde Google en la otra vista, la comparativa se recalcula la próxima vez.
document.addEventListener('resenas:synced', () => (state.loaded = false));

showView();
