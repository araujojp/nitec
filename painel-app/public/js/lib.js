/* Neon Gestão — utilidades compartilhadas (API, formatação, ícones, rotas, avisos) */
const { createApp, reactive, ref, computed, watch, onMounted, onBeforeUnmount, nextTick, h, defineComponent } = Vue;

// ---------------- Estado global ----------------
const store = reactive({
  user: null, meta: null, config: {}, route: { path: '/', params: {}, query: {} },
  toasts: [], modal: null, menuAberto: false, tema: localStorage.getItem('neon_tema') || 'escuro', contadores: {},
});
document.documentElement.dataset.tema = store.tema;

// ---------------- API ----------------
async function api(path, opts = {}) {
  const o = { method: opts.method || 'GET', headers: { ...(opts.headers || {}) }, credentials: 'same-origin' };
  if (opts.body !== undefined && !(opts.body instanceof Blob) && !(opts.body instanceof ArrayBuffer)) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(opts.body); }
  else if (opts.body !== undefined) o.body = opts.body;
  const r = await fetch(path.startsWith('/') ? path : '/api/' + path, o);
  if (r.status === 401 && !path.includes('/auth/')) { store.user = null; go('/entrar'); throw new Error('Sessão expirada. Entre novamente.'); }
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : await r.blob();
  if (!r.ok) { const e = new Error((data && (data.erro || data.errors?.[0]?.message)) || `Erro ${r.status}`); e.status = r.status; e.data = data; throw e; }
  return data;
}
const get = (p) => api(p);
const post = (p, body) => api(p, { method: 'POST', body: body || {} });
const patch = (p, body) => api(p, { method: 'PATCH', body });
const del = (p) => api(p, { method: 'DELETE' });

// ---------------- Avisos ----------------
function toast(msg, tipo = 'ok', ms = 3800) {
  const t = { id: Math.random(), msg, tipo };
  store.toasts.push(t);
  setTimeout(() => { const i = store.toasts.indexOf(t); if (i >= 0) store.toasts.splice(i, 1); }, ms);
}
const erro = (e) => toast(e.message || String(e), 'err', 6500);

function confirmar(titulo, texto, { ok = 'Confirmar', perigo = false } = {}) {
  return new Promise((resolve) => { store.modal = { tipo: 'confirm', titulo, texto, ok, perigo, resolve }; });
}

// ---------------- Rotas ----------------
function parseRoute() {
  const u = new URL(location.href);
  store.route = { path: u.pathname.replace(/\/+$/, '') || '/', query: Object.fromEntries(u.searchParams), params: {} };
}
function go(path, replace) {
  if (path === location.pathname + location.search) return;
  history[replace ? 'replaceState' : 'pushState']({}, '', path);
  parseRoute(); store.menuAberto = false; window.scrollTo(0, 0);
}
window.addEventListener('popstate', parseRoute);
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a || a.target === '_blank' || a.hasAttribute('download') || e.ctrlKey || e.metaKey || e.shiftKey) return;
  const href = a.getAttribute('href');
  if (!href.startsWith('/') || href.startsWith('/ajuda') || href.startsWith('/assets/') || href.startsWith('/api/') || href.startsWith('/publico/') || href.startsWith('/novidades')) return;
  e.preventDefault(); go(href);
});
function setQuery(q) {
  const u = new URL(location.href);
  for (const [k, v] of Object.entries(q)) { if (v === '' || v == null) u.searchParams.delete(k); else u.searchParams.set(k, v); }
  history.replaceState({}, '', u.pathname + u.search); parseRoute();
}

// ---------------- Formatação ----------------
const fmt = {
  money: (v) => v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
  int: (v) => v == null ? '—' : Number(v).toLocaleString('pt-BR'),
  date: (v) => { if (!v) return '—'; const [y, m, d] = String(v).slice(0, 10).split('-'); return `${d}/${m}/${y}`; },
  // DATETIME do banco (UTC) → horário de Brasília
  dt: (v) => { if (!v) return '—'; const d = toDate(v); return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); },
  ago: (v) => {
    if (!v) return 'nunca'; const s = (Date.now() - toDate(v).getTime()) / 1000;
    if (s < 0) { const f = -s; if (f < 3600) return `em ${Math.round(f / 60)} min`; if (f < 86400) return `em ${Math.round(f / 3600)} h`; return `em ${Math.round(f / 86400)} dias`; }
    if (s < 60) return 'agora'; if (s < 3600) return `há ${Math.floor(s / 60)} min`; if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
    if (s < 30 * 86400) return `há ${Math.floor(s / 86400)} dia${s >= 172800 ? 's' : ''}`; return fmt.date(v);
  },
  bytes: (n) => { n = Number(n || 0); if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(0) + ' KB'; if (n < 1073741824) return (n / 1048576).toFixed(1).replace('.', ',') + ' MB'; return (n / 1073741824).toFixed(2).replace('.', ',') + ' GB'; },
  phone: (v) => { const d = String(v || '').replace(/\D/g, ''); if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`; if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`; return v || ''; },
  initials: (s) => String(s || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase(),
};
function toDate(v) { if (v instanceof Date) return v; const s = String(v); return new Date(s.includes('T') ? s : s.replace(' ', 'T') + 'Z'); }
// valor para <input type=datetime-local> no horário local
function toLocalInput(v) { if (!v) return ''; const d = toDate(v); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
function fromLocalInput(v) { return v ? new Date(v).toISOString() : null; }
function hojeISO() { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
function waLink(num, texto) { const d = String(num || '').replace(/\D/g, ''); if (!d) return null; return `https://wa.me/${d.length <= 11 ? '55' + d : d}${texto ? '?text=' + encodeURIComponent(texto) : ''}`; }

// ---------------- Máscaras ----------------
const masks = {
  phone(v) { const d = v.replace(/\D/g, '').slice(0, 11); if (d.length <= 2) return d; if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`; if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`; return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`; },
  cep(v) { const d = v.replace(/\D/g, '').slice(0, 8); return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; },
  cpfcnpj(v) {
    const d = v.replace(/\D/g, '').slice(0, 14);
    if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
  },
};

// ---------------- Ícones (traço, 24x24) ----------------
const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  server: 'M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01',
  key: 'M15.5 7.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0zM12 11v10M12 17h3M12 14h2',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  lifebuoy: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.9 4.9l4.3 4.3M14.8 14.8l4.3 4.3M14.8 9.2l4.3-4.3M4.9 19.1l4.3-4.3',
  money: 'M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 12h.01M18 12h.01',
  chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  box: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  signal: 'M2 20h.01M7 20v-4M12 20v-8M17 20V8M22 4v16',
  plus: 'M12 5v14M5 12h14', x: 'M18 6 6 18M6 6l12 12', check: 'M20 6 9 17l-5-5',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  menu: 'M3 6h18M3 12h18M3 18h18', more: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  left: 'M15 18l-6-6 6-6', right: 'M9 18l6-6-6-6', down: 'M6 9l6 6 6-6',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z', trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  folder: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
  chart: 'M3 3v18h18M7 15l4-4 3 3 6-6', funnel: 'M22 3H2l8 9.46V19l4 2v-8.54z', calendar: 'M3 5h18v16H3zM16 3v4M8 3v4M3 10h18',
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z',
  whatsapp: 'M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1',
  mail: 'M4 4h16v16H4zM22 6l-10 7L2 6', map: 'M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  copy: 'M9 9h13v13H9zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  refresh: 'M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.8-3.4L23 10M1 14l4.7 4.4A9 9 0 0 0 20.5 15',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', lock: 'M5 11h14v10H5zM8 11V7a4 4 0 1 1 8 0v4',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2', zap: 'M13 2 3 14h9l-1 8 10-12h-9z', star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z', eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  code: 'M16 18l6-6-6-6M8 6l-6 6 6 6', link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2', alert: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01', help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01', filter: 'M3 6h18M7 12h10M10 18h4',
  megaphone: 'M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1zM16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14',
  image: 'M3 3h18v18H3zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
  sparkles: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9zM5 2l.6 1.4L7 4l-1.4.6L5 6l-.6-1.4L3 4l1.4-.6z',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z', plug: 'M12 22v-5M9 8V2M15 8V2M18 8v5a6 6 0 0 1-12 0V8z', bot: 'M12 8V4H8M4 8h16v12H4zM2 14h2M20 14h2M15 13v2M9 13v2',
  play: 'M5 3l14 9-14 9z', pause: 'M6 4h4v16H6zM14 4h4v16h-4z', layers: 'M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  wand: 'M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M15 9h.01M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5',
  grip: 'M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01', up: 'M18 15l-6-6-6 6',
};
const Icon = defineComponent({
  props: { n: String, s: { type: [Number, String], default: 18 }, w: { type: [Number, String], default: 2 } },
  setup(p) {
    return () => h('svg', { width: p.s, height: p.s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': p.w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
      [h('path', { d: ICONS[p.n] || ICONS.info })]);
  },
});

// ---------------- Envio de arquivos em partes (até 2 GB, retomável) ----------------
async function uploadFile(file, pasta, onProgress) {
  const ini = await post('arquivos/iniciar', { nome: file.name, tamanho: file.size, mime: file.type || 'application/octet-stream', pasta });
  if (ini.completo) return ini;
  let offset = ini.recebido || 0;
  const parte = ini.parte || 8 * 1024 * 1024;
  let tentativas = 0;
  while (offset < file.size) {
    const chunk = file.slice(offset, offset + parte);
    try {
      const r = await fetch(`/api/arquivos/${ini.id}/parte?offset=${offset}`, { method: 'PUT', body: chunk, headers: { 'Content-Type': 'application/octet-stream' }, credentials: 'same-origin' });
      const d = await r.json();
      if (r.status === 409) { offset = d.recebido; continue; }
      if (!r.ok) throw new Error(d.erro || 'Falha no envio');
      offset = d.recebido; tentativas = 0;
      onProgress && onProgress(offset / file.size);
      if (d.completo) return d;
    } catch (e) {
      if (++tentativas > 8) throw new Error('A conexão caiu várias vezes. Tente de novo: o envio continua de onde parou.');
      await new Promise((r) => setTimeout(r, 1500 * tentativas));
      try { const st = await get(`arquivos/${ini.id}/status`); offset = st.recebido; } catch { /* tenta de novo */ }
    }
  }
  const st = await get(`arquivos/${ini.id}/status`);
  return { id: ini.id, ...st, nome: file.name, tamanho: file.size };
}

function copiar(texto, msg = 'Copiado!') {
  (navigator.clipboard ? navigator.clipboard.writeText(texto) : Promise.reject()).then(() => toast(msg)).catch(() => {
    const t = document.createElement('textarea'); t.value = texto; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); toast(msg);
  });
}

// Opções de um campo select
function optOf(field, v) { return (field?.options || []).find((o) => o.value === v); }
function ent(name) { return store.meta?.entities?.[name]; }
const ROTA_ENTIDADE = { clientes: 'clientes', instalacoes: 'instalacoes', licencas: 'licencas', versoes: 'atualizacoes', chamados: 'chamados', cobrancas: 'cobrancas', contatos: 'historico', produtos: 'produtos', checkins: 'sinais', usuarios: 'equipe', campanhas: 'marketing/campanhas', posts: 'marketing/posts', tarefas: 'marketing/tarefas', depoimentos: 'depoimentos' };
const ENTIDADE_ROTA = Object.fromEntries(Object.entries(ROTA_ENTIDADE).map(([k, v]) => [v, k]));
const linkTo = (entity, id) => `/${ROTA_ENTIDADE[entity] || entity}${id ? '/' + id : ''}`;
const can = {
  write: () => ['admin', 'equipe'].includes(store.user?.funcao),
  del: () => store.user?.funcao === 'admin',
  admin: () => store.user?.funcao === 'admin',
};
