// Selector de periodo: presets (hoy, últimos 7 días, mes actual…) y fechas exactas "desde / hasta".
// Las fechas se interpretan en la hora local del navegador (Madrid): un día va de 00:00 a 24:00 locales.

export const PRESETS = [
  ['today', 'Hoy'],
  ['yesterday', 'Ayer'],
  ['7', 'Últimos 7 días'],
  ['30', 'Últimos 30 días'],
  ['90', 'Últimos 90 días'],
  ['month', 'Mes actual'],
  ['prevmonth', 'Mes anterior'],
  ['year', 'Año actual'],
  ['all', 'Todo'],
  ['custom', 'Personalizado'],
];

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const fmt = (s) =>
  parseYmd(s).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

// Fechas (YYYY-MM-DD, ambas incluidas) de un preset. "Últimos 7 días" incluye hoy.
export function presetDates(preset, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case 'today':
      return { from: ymd(today), to: ymd(today) };
    case 'yesterday':
      return { from: ymd(addDays(today, -1)), to: ymd(addDays(today, -1)) };
    case 'month':
      return { from: ymd(new Date(today.getFullYear(), today.getMonth(), 1)), to: ymd(today) };
    case 'prevmonth':
      return {
        from: ymd(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        to: ymd(new Date(today.getFullYear(), today.getMonth(), 0)),
      };
    case 'year':
      return { from: ymd(new Date(today.getFullYear(), 0, 1)), to: ymd(today) };
    case 'all':
      return { from: '', to: '' };
    default: {
      const days = Number(preset);
      return Number.isFinite(days) ? { from: ymd(addDays(today, -(days - 1))), to: ymd(today) } : null;
    }
  }
}

// Periodo con el que comparar: el mes o año anterior equivalente para esos presets
// (1–22 nov → 1–22 oct; octubre → septiembre) y, para el resto, la misma duración justo antes.
export function previousDates(preset, from, to) {
  if (!from || !to) return null;
  const f = parseYmd(from);
  const t = parseYmd(to);
  const lastDay = (y, m) => new Date(y, m + 1, 0).getDate();
  if (preset === 'month' || preset === 'prevmonth') {
    const y = f.getFullYear();
    const m = f.getMonth() - 1;
    const pf = new Date(y, m, 1);
    const pt = new Date(pf.getFullYear(), pf.getMonth(), Math.min(t.getDate(), lastDay(pf.getFullYear(), pf.getMonth())));
    return { from: ymd(pf), to: ymd(pt) };
  }
  if (preset === 'year') {
    const y = f.getFullYear() - 1;
    return { from: ymd(new Date(y, 0, 1)), to: ymd(new Date(y, t.getMonth(), Math.min(t.getDate(), lastDay(y, t.getMonth())))) };
  }
  const days = Math.round((t - f) / 86400000) + 1;
  return { from: ymd(addDays(f, -days)), to: ymd(addDays(f, -1)) };
}

let seq = 0;

export function mountDateRange(root, { preset = '30', presets = PRESETS, onChange = () => {} } = {}) {
  const id = `dr${++seq}`;
  root.classList.add('date-range');
  root.innerHTML = `
    <label>Periodo
      <select id="${id}-preset">${presets.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
    </label>
    <label>Desde <input type="date" id="${id}-from"></label>
    <label>Hasta <input type="date" id="${id}-to"></label>`;
  const sel = root.querySelector(`#${id}-preset`);
  const from = root.querySelector(`#${id}-from`);
  const to = root.querySelector(`#${id}-to`);
  const today = ymd(new Date());
  from.max = today;
  to.max = today;

  function applyPreset(p) {
    const d = presetDates(p);
    if (!d) return;
    from.value = d.from;
    to.value = d.to;
    to.min = from.value || '';
    from.max = to.value || today;
  }

  sel.value = preset;
  applyPreset(preset);

  sel.addEventListener('change', () => {
    applyPreset(sel.value);
    onChange();
  });
  for (const input of [from, to]) {
    input.addEventListener('change', () => {
      // Si alguien pone el "hasta" antes del "desde", se intercambian en lugar de dar un periodo vacío.
      if (from.value && to.value && from.value > to.value) [from.value, to.value] = [to.value, from.value];
      to.min = from.value || '';
      from.max = to.value || today;
      // Si las fechas coinciden con un preset, se muestra ese preset; si no, "Personalizado".
      const match = presets.find(([v]) => {
        const d = presetDates(v);
        return d && d.from === from.value && d.to === to.value;
      });
      sel.value = match ? match[0] : 'custom';
      onChange();
    });
  }

  return {
    // Límites como instantes ISO: desde las 00:00 locales del primer día hasta las 00:00 del día siguiente al último.
    range() {
      const prev = previousDates(sel.value, from.value, to.value);
      return {
        from: from.value ? parseYmd(from.value).toISOString() : null,
        to: to.value ? addDays(parseYmd(to.value), 1).toISOString() : null,
        prevFrom: prev ? parseYmd(prev.from).toISOString() : null,
        prevTo: prev ? addDays(parseYmd(prev.to), 1).toISOString() : null,
        label: this.label(),
      };
    },
    label() {
      if (sel.value !== 'custom') return presets.find(([v]) => v === sel.value)?.[1] || '';
      if (from.value && to.value) return from.value === to.value ? fmt(from.value) : `${fmt(from.value)} – ${fmt(to.value)}`;
      if (from.value) return `desde el ${fmt(from.value)}`;
      if (to.value) return `hasta el ${fmt(to.value)}`;
      return 'Todo';
    },
  };
}
