// Panel de reseñas: interfaz en JavaScript sin framework.
const $ = (sel) => document.querySelector(sel);
const state = {
  locations: [],
  loc: new Set(),
  stars: new Set(),
  page: 1,
};

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const fmtNum = (n, d = 0) => (n == null ? '—' : Number(n).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }));
const starsHtml = (n) => `<span class="stars" aria-label="${n} de 5 estrellas">${'★'.repeat(n)}<span class="off">${'★'.repeat(5 - n)}</span></span>`;

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
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

// ---------- Filtros ----------
function dateRange() {
  const p = $('#f-period').value;
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  if (p === 'all') return {};
  if (p === 'custom') return { from: $('#f-from').value, to: $('#f-to').value };
  if (p === 'month') return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)) };
  const from = new Date(today);
  from.setDate(from.getDate() - Number(p));
  return { from: iso(from) };
}

function queryString(extra = {}) {
  const q = new URLSearchParams();
  if (state.loc.size) q.set('loc', [...state.loc].join(','));
  if (state.stars.size) q.set('stars', [...state.stars].join(','));
  const { from, to } = dateRange();
  if (from) q.set('from', from);
  if (to) q.set('to', to);
  for (const id of ['replied', 'text', 'q']) {
    const v = $(`#f-${id}`).value.trim();
    if (v) q.set(id, v);
  }
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  return q.toString();
}

function renderChips() {
  $('#f-loc').innerHTML =
    `<button class="chip" data-loc="" aria-pressed="${state.loc.size === 0}">Todos los locales</button>` +
    state.locations
      .map((l) => `<button class="chip" data-loc="${l.id}" aria-pressed="${state.loc.has(l.id)}">${esc(l.short)}</button>`)
      .join('');
  $('#f-stars').innerHTML = [5, 4, 3, 2, 1]
    .map((n) => `<button class="chip" data-star="${n}" aria-pressed="${state.stars.has(n)}">${n}★</button>`)
    .join('');
}

// ---------- Tarjetas por local ----------
function renderCards() {
  $('#loc-cards').innerHTML = state.locations
    .map((l) => {
      const pending = l.pending
        ? `<span class="pill ${l.pending_low ? 'pill-bad' : 'pill-warn'}">${fmtNum(l.pending)} sin responder${l.pending_low ? ` · ${l.pending_low} de ≤3★` : ''}</span>`
        : '<span class="pill pill-good">Todo respondido</span>';
      return `<button class="card" data-card="${l.id}" aria-pressed="${state.loc.has(l.id)}">
        <div class="card-head"><span class="card-name">${esc(l.short)}</span>${settingsLink(l)}</div>
        <div class="card-rating">${fmtNum(l.average, 1)} <small>★ · ${fmtNum(l.total)} reseñas</small></div>
        <div class="card-stats"><span>Últimos 30 días: ${fmtNum(l.last30)} (media ${fmtNum(l.avg30, 1)})</span></div>
        <div class="card-stats">${pending}</div>
      </button>`;
    })
    .join('');
  const last = state.locations.map((l) => l.last_sync).filter(Boolean).sort().at(0);
  $('#sync-info').textContent = last
    ? `Última actualización desde Google: ${new Date(last).toLocaleString('es-ES')}`
    : 'Aún no se ha actualizado desde Google';
}
const settingsLink = (l) => `<span class="link-btn" role="button" tabindex="0" data-settings="${l.id}">Ajustes</span>`;

async function loadLocations() {
  state.locations = await api('/api/locations');
  renderCards();
  renderChips();
}

// ---------- Lista de reseñas ----------
function reviewHtml(r) {
  const text = r.comment
    ? `<p class="review-text">${esc(r.comment)}</p>`
    : '<p class="review-text empty">Sin texto, solo estrellas</p>';
  const status = r.reply
    ? `<span class="pill pill-good">Respondida ${fmtDate(r.reply_time)}</span>`
    : r.draft
      ? `<span class="pill pill-neutral">Borrador${r.draft_source === 'ia' ? ' de la IA' : ''}</span>`
      : '<span class="pill pill-bad">Sin responder</span>';

  const body = r.reply
    ? `<div class="reply"><div class="reply-label">Respuesta publicada</div>${esc(r.reply)}</div>
       <div class="editor-actions" style="margin-top:8px"><button class="link-btn" data-edit="${r.id}">Editar respuesta</button></div>
       <div class="editor" data-editor="${r.id}" hidden>${editorHtml(r, r.reply)}</div>`
    : `<div class="editor" data-editor="${r.id}">${editorHtml(r, r.draft || '')}</div>`;

  return `<article class="review${r.stars <= 3 ? ' is-low' : ''}" data-review="${r.id}">
    <div class="review-head">
      ${starsHtml(r.stars)}
      <span class="author">${esc(r.reviewer)}</span>
      <span class="muted">· ${esc(r.location)} · ${fmtDate(r.create_time)}</span>
      <span class="right">${status}</span>
    </div>
    ${text}
    ${body}
  </article>`;
}

function editorHtml(r, value) {
  return `<textarea rows="4" placeholder="Escribe la respuesta o pide una sugerencia" data-text="${r.id}">${esc(value)}</textarea>
    <div class="editor-actions">
      <button class="btn" data-suggest="${r.id}">☆ Sugerir respuesta</button>
      <button class="btn btn-ghost" data-save="${r.id}">Guardar borrador</button>
      <button class="btn btn-primary" data-publish="${r.id}">Publicar en Google…</button>
      <span class="note">La sugerencia es un borrador: revísala antes de publicar.</span>
    </div>`;
}

let currentReviews = [];
async function loadReviews() {
  const list = $('#review-list');
  list.setAttribute('aria-busy', 'true');
  try {
    const data = await api(`/api/reviews?${queryString({ page: state.page })}`);
    currentReviews = data.reviews;
    $('#result-count').textContent = `${fmtNum(data.total)} reseñas`;
    list.innerHTML = data.reviews.length
      ? data.reviews.map(reviewHtml).join('')
      : '<div class="empty-state">No hay reseñas con estos filtros.</div>';
    const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
    $('#pager').innerHTML =
      pages > 1
        ? `<button class="btn" data-page="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''}>← Anteriores</button>
           <span class="muted">Página ${state.page} de ${pages}</span>
           <button class="btn" data-page="${state.page + 1}" ${state.page >= pages ? 'disabled' : ''}>Siguientes →</button>`
        : '';
  } catch (e) {
    list.innerHTML = `<div class="empty-state">No se pudieron cargar las reseñas: ${esc(e.message)}</div>`;
  } finally {
    list.removeAttribute('aria-busy');
  }
}

const refresh = () => {
  state.page = 1;
  loadReviews();
};

// ---------- Acciones ----------
async function withBusy(btn, fn) {
  btn.disabled = true;
  const label = btn.textContent;
  try {
    await fn();
  } catch (e) {
    toast(e.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

async function publish(id, btn) {
  const text = document.querySelector(`[data-text="${id}"]`).value.trim();
  if (!text) return toast('Escribe la respuesta antes de publicar.', true);
  const r = currentReviews.find((x) => x.id === id);
  $('#publish-target').textContent = `${r.reviewer} · ${r.stars}★ · ${r.location}`;
  $('#publish-text').textContent = text;
  const dlg = $('#dlg-publish');
  dlg.returnValue = '';
  dlg.showModal();
  dlg.addEventListener(
    'close',
    () => {
      if (dlg.returnValue !== 'ok') return;
      withBusy(btn, async () => {
        btn.textContent = 'Publicando…';
        await api(`/api/reviews/${id}/publish`, { method: 'POST', body: { text } });
        toast('Respuesta publicada en Google.');
        await Promise.all([loadReviews(), loadLocations()]);
      });
    },
    { once: true },
  );
}

async function openSettings(locId) {
  const s = await api(`/api/settings/${locId}`);
  const form = $('#settings-form');
  for (const k of ['instructions', 'contact_email', 'keywords', 'signature']) form.elements[k].value = s[k] || '';
  $('#settings-loc').textContent = state.locations.find((l) => l.id === locId)?.short || '';
  const dlg = $('#dlg-settings');
  dlg.returnValue = '';
  dlg.showModal();
  dlg.addEventListener(
    'close',
    async () => {
      if (dlg.returnValue !== 'ok') return;
      const body = Object.fromEntries(['instructions', 'contact_email', 'keywords', 'signature'].map((k) => [k, form.elements[k].value]));
      try {
        await api(`/api/settings/${locId}`, { method: 'PUT', body });
        toast('Ajustes guardados.');
      } catch (e) {
        toast(e.message, true);
      }
    },
    { once: true },
  );
}

document.addEventListener('click', (ev) => {
  const t = ev.target.closest('button, [data-settings]');
  if (!t) return;

  if (t.dataset.settings) {
    ev.stopPropagation();
    return openSettings(t.dataset.settings);
  }
  if (t.dataset.card || t.dataset.loc !== undefined) {
    const id = t.dataset.card ?? t.dataset.loc;
    if (!id) state.loc.clear();
    else if (state.loc.has(id)) state.loc.delete(id);
    else state.loc.add(id);
    renderCards();
    renderChips();
    return refresh();
  }
  if (t.dataset.star) {
    const n = Number(t.dataset.star);
    state.stars.has(n) ? state.stars.delete(n) : state.stars.add(n);
    renderChips();
    return refresh();
  }
  if (t.dataset.page) {
    state.page = Number(t.dataset.page);
    loadReviews();
    return window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  if (t.dataset.edit) {
    document.querySelector(`[data-editor="${t.dataset.edit}"]`).hidden = false;
    t.hidden = true;
    return;
  }
  if (t.dataset.suggest) {
    const id = t.dataset.suggest;
    return withBusy(t, async () => {
      t.textContent = 'Redactando…';
      const { draft } = await api(`/api/reviews/${id}/suggest`, { method: 'POST' });
      document.querySelector(`[data-text="${id}"]`).value = draft;
      toast('Sugerencia lista. Revísala antes de publicar.');
    });
  }
  if (t.dataset.save) {
    const id = t.dataset.save;
    return withBusy(t, async () => {
      const draft = document.querySelector(`[data-text="${id}"]`).value;
      await api(`/api/reviews/${id}/draft`, { method: 'PUT', body: { draft } });
      toast('Borrador guardado.');
    });
  }
  if (t.dataset.publish) return publish(t.dataset.publish, t);
});

$('#btn-sync').addEventListener('click', (ev) =>
  withBusy(ev.currentTarget, async () => {
    ev.currentTarget.textContent = 'Actualizando…';
    const { results } = await api('/api/sync', { method: 'POST', body: {} });
    toast(`Actualizado: ${results.map((r) => `${r.location} ${r.read}`).join(' · ')} reseñas revisadas.`);
    document.dispatchEvent(new Event('resenas:synced'));
    await Promise.all([loadLocations(), loadReviews()]);
  }),
);

$('#btn-csv').addEventListener('click', (ev) => {
  ev.preventDefault();
  window.location.href = `/api/reviews.csv?${queryString()}`;
});

$('#f-period').addEventListener('change', () => {
  $('#custom-dates').hidden = $('#f-period').value !== 'custom';
  refresh();
});
for (const id of ['#f-from', '#f-to', '#f-replied', '#f-text']) $(id).addEventListener('change', refresh);
let searchTimer;
$('#f-q').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(refresh, 300);
});

await loadLocations();
await loadReviews();
