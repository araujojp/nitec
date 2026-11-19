/* Neon Gestão — componentes reutilizáveis */

const Badge = defineComponent({
  props: { field: Object, value: null, label: String, color: String },
  setup(p) {
    return () => {
      const o = p.field ? optOf(p.field, p.value) : null;
      const text = p.label || o?.label || p.value;
      if (text == null || text === '') return h('span', { class: 'dim' }, '—');
      const c = p.color || o?.color;
      return h('span', { class: 'badge' + (c ? '' : ' plain'), style: c ? { '--c': c } : null }, text);
    };
  },
});

const NET = { instagram: ['IG', '#E1306C'], facebook: ['f', '#1877F2'], tiktok: ['♪', '#111'], youtube: ['▶', '#FF0000'], linkedin: ['in', '#0A66C2'], telegram_canal: ['✈', '#26A5E4'], site: ['www', '#ff6a00'] };
const Nets = defineComponent({
  props: { list: Array },
  setup(p) { return () => h('span', { class: 'row gap-s' }, (p.list || []).map((n) => h('span', { class: 'net', title: n, style: { background: (NET[n] || ['', '#555'])[1], width: n === 'site' ? '30px' : null } }, (NET[n] || [n])[0]))); },
});

// Valor formatado de uma célula
function cellValue(e, key, row, labels) {
  const f = e.fields[key];
  const v = row[key];
  if (key === 'id') return h('span', { class: 'dim mono' }, '#' + v);
  if (key === 'created_at') return h('span', { class: 'muted', title: fmt.dt(v) }, fmt.ago(v));
  if (key === 'sla_limite') return SlaTag(row);
  if (!f) return v ?? '—';
  if (v == null || v === '') return h('span', { class: 'dim' }, '—');
  switch (f.type) {
    case 'select': return h(Badge, { field: f, value: v });
    case 'relation': return labels?.[key]?.[v] ?? `#${v}`;
    case 'money': return h('span', { class: 'nowrap' }, fmt.money(v));
    case 'date': {
      const atrasado = (key === 'vencimento' && v < hojeISO() && !['pago', 'cancelado', 'cancelada'].includes(row.status));
      return h('span', { class: 'nowrap', style: atrasado ? { color: 'var(--red)', fontWeight: 600 } : null }, fmt.date(v));
    }
    case 'datetime': {
      if (key === 'ultimo_contato' && e.key === 'instalacoes') return h('span', { class: 'row gap-s nowrap' }, [h('span', { class: 'pulse' + (row.online ? '' : ' off') }), fmt.ago(v)]);
      return h('span', { class: 'nowrap', title: fmt.dt(v) }, key === 'agendado_para' || key === 'lembrete' ? fmt.dt(v) : fmt.ago(v));
    }
    case 'bool': return v ? h('span', { style: { color: 'var(--green)' } }, h(Icon, { n: 'check' })) : h('span', { class: 'dim' }, '—');
    case 'multiselect': return h(Nets, { list: v });
    case 'file': return labels?.__arquivos?.[v]?.nome || 'arquivo';
    case 'text': if (f.mask === 'phone') return fmt.phone(v); return String(v);
    default: return String(v);
  }
}

// ---------------- Seleção de relação (com busca) ----------------
const RelationSelect = defineComponent({
  props: { entity: String, modelValue: null, label: String, filter: Object, placeholder: String, disabled: Boolean },
  emits: ['update:modelValue', 'pick'],
  setup(p, { emit }) {
    const open = ref(false), q = ref(''), opts = ref([]), cur = ref(p.label || ''), sel = ref(0);
    let t;
    async function load() {
      const params = new URLSearchParams({ q: q.value, ...(p.filter || {}) });
      try { opts.value = (await get(`${p.entity}/opcoes?${params}`)).data; } catch (e) { opts.value = []; }
    }
    watch(() => p.label, (v) => { cur.value = v || ''; });
    watch(() => p.modelValue, (v) => { if (!v) cur.value = ''; });
    function focus() { open.value = true; q.value = ''; load(); }
    function input(ev) { q.value = ev.target.value; cur.value = ev.target.value; clearTimeout(t); t = setTimeout(load, 200); open.value = true; }
    function pick(o) { emit('update:modelValue', o.id); emit('pick', o); cur.value = o.label; open.value = false; }
    function blur() { setTimeout(() => { open.value = false; if (!p.modelValue) cur.value = ''; else if (p.label) cur.value = p.label; }, 180); }
    function key(ev) {
      if (ev.key === 'ArrowDown') { sel.value = Math.min(sel.value + 1, opts.value.length - 1); ev.preventDefault(); }
      if (ev.key === 'ArrowUp') { sel.value = Math.max(sel.value - 1, 0); ev.preventDefault(); }
      if (ev.key === 'Enter' && opts.value[sel.value]) { pick(opts.value[sel.value]); ev.preventDefault(); }
    }
    return () => h('div', { class: 'rel' }, [
      h('input', { class: 'input', value: cur.value, placeholder: p.placeholder || 'Buscar…', onFocus: focus, onInput: input, onBlur: blur, onKeydown: key, disabled: p.disabled, autocomplete: 'off' }),
      p.modelValue && !p.disabled ? h('button', { type: 'button', class: 'btn ghost sm icon clear', onClick: () => { emit('update:modelValue', null); cur.value = ''; } }, h(Icon, { n: 'x', s: 15 })) : null,
      open.value ? h('div', { class: 'opts' }, opts.value.length ? opts.value.map((o, i) => h('div', { class: i === sel.value ? 'sel' : '', onMousedown: (e) => { e.preventDefault(); pick(o); } }, o.label)) : [h('div', { class: 'dim' }, 'Nada encontrado')]) : null,
    ]);
  },
});

// ---------------- Arquivo (envio em partes com progresso) ----------------
const FileField = defineComponent({
  props: { modelValue: null, folder: String, info: Object, accept: String, multiple: Boolean },
  emits: ['update:modelValue', 'uploaded'],
  setup(p, { emit }) {
    const prog = ref(null), nome = ref(''), drag = ref(false), inp = ref(null);
    const local = ref(p.info || null);
    watch(() => p.info, (v) => { local.value = v || null; });
    async function send(files) {
      for (const file of files) {
        nome.value = file.name; prog.value = 0;
        try {
          const r = await uploadFile(file, p.folder || 'geral', (x) => { prog.value = x; });
          local.value = { id: r.id, nome: file.name, tamanho: file.size, sha256: r.sha256, mime: file.type };
          emit('update:modelValue', r.id); emit('uploaded', local.value);
          toast(`Arquivo enviado: ${file.name}`);
        } catch (e) { erro(e); }
        prog.value = null;
      }
    }
    const isImg = computed(() => /^image\//.test(local.value?.mime || '') || /\.(png|jpe?g|webp|gif)$/i.test(local.value?.nome || ''));
    return () => h('div', null, [
      p.modelValue && local.value && prog.value == null ? h('div', { class: 'file-chip' }, [
        isImg.value ? h('img', { src: `/assets/${p.modelValue}` }) : h(Icon, { n: 'file', s: 26 }),
        h('div', { class: 'grow' }, [h('b', null, local.value.nome), h('span', { class: 'tiny muted' }, [fmt.bytes(local.value.tamanho), local.value.sha256 ? ' · SHA-256 ' + local.value.sha256.slice(0, 12) + '…' : ''])]),
        h('a', { class: 'btn sm icon ghost', href: `/assets/${p.modelValue}?download`, title: 'Baixar' }, h(Icon, { n: 'download', s: 16 })),
        h('button', { type: 'button', class: 'btn sm icon ghost', title: 'Trocar', onClick: () => inp.value.click() }, h(Icon, { n: 'refresh', s: 16 })),
        h('button', { type: 'button', class: 'btn sm icon ghost', title: 'Remover', onClick: () => { emit('update:modelValue', null); local.value = null; } }, h(Icon, { n: 'x', s: 16 })),
      ]) : h('div', {
        class: 'upload' + (drag.value ? ' drag' : ''), onClick: () => prog.value == null && inp.value.click(),
        onDragover: (e) => { e.preventDefault(); drag.value = true; }, onDragleave: () => { drag.value = false; },
        onDrop: (e) => { e.preventDefault(); drag.value = false; send([...e.dataTransfer.files]); },
      }, prog.value != null ? [h('div', { class: 'small' }, `Enviando ${nome.value}… ${Math.round(prog.value * 100)}%`), h('div', { class: 'progress' }, h('div', { style: { width: (prog.value * 100) + '%' } }))]
        : [h(Icon, { n: 'upload', s: 22 }), h('div', { class: 'small', style: { marginTop: '6px' } }, [h('b', { style: { color: 'var(--text)' } }, 'Toque para escolher'), ' ou arraste o arquivo aqui']), h('div', { class: 'tiny dim' }, 'Até 2 GB · continua de onde parou se a internet cair')]),
      h('input', { type: 'file', ref: inp, accept: p.accept, style: { display: 'none' }, onChange: (e) => { send([...e.target.files]); e.target.value = ''; } }),
    ]);
  },
});

const FilesField = defineComponent({
  props: { modelValue: Array, folder: String, infos: Object },
  emits: ['update:modelValue'],
  setup(p, { emit }) {
    const extra = reactive({});
    return () => {
      const list = p.modelValue || [];
      return h('div', { class: 'stack' }, [
        ...list.map((id) => {
          const i = extra[id] || p.infos?.[id] || { nome: 'arquivo' };
          return h('div', { class: 'file-chip' }, [
            /^image\//.test(i.mime || '') ? h('img', { src: `/assets/${id}` }) : h(Icon, { n: 'file', s: 24 }),
            h('div', { class: 'grow' }, [h('b', null, i.nome), h('span', { class: 'tiny muted' }, fmt.bytes(i.tamanho))]),
            h('a', { class: 'btn sm icon ghost', href: `/assets/${id}`, target: '_blank' }, h(Icon, { n: 'eye', s: 16 })),
            h('button', { type: 'button', class: 'btn sm icon ghost', onClick: () => emit('update:modelValue', list.filter((x) => x !== id)) }, h(Icon, { n: 'x', s: 16 })),
          ]);
        }),
        h(FileField, { modelValue: null, folder: p.folder, onUploaded: (info) => { extra[info.id] = info; emit('update:modelValue', [...list, info.id]); } }),
      ]);
    };
  },
});

// ---------------- Campo genérico ----------------
const Field = defineComponent({
  props: { name: String, field: Object, modelValue: null, row: Object, labels: Object, readonly: Boolean },
  emits: ['update:modelValue', 'set'],
  setup(p, { emit }) {
    const up = (v) => emit('update:modelValue', v);
    async function cep(v) {
      const d = String(v || '').replace(/\D/g, '');
      if (d.length !== 8) return;
      try {
        const r = await fetch(`https://viacep.com.br/ws/${d}/json/`).then((x) => x.json());
        if (r.erro) return toast('CEP não encontrado.', 'err');
        emit('set', { endereco: r.logradouro, bairro: r.bairro, cidade: r.localidade, uf: r.uf });
        toast('Endereço preenchido pelo CEP.');
      } catch { /* sem internet */ }
    }
    return () => {
      const f = p.field, v = p.modelValue, ro = p.readonly || f.readonly;
      let input;
      switch (f.type) {
        case 'textarea': input = h('textarea', { value: v ?? '', rows: f.rows || 3, readonly: ro, onInput: (e) => up(e.target.value) }); break;
        case 'select':
          input = (f.options.length <= 6 && !ro)
            ? h('div', { class: 'seg' }, [...f.options.map((o) => h('button', { type: 'button', class: v === o.value ? 'on' : '', style: o.color ? { '--c': o.color } : null, onClick: () => up(v === o.value && !f.required ? null : o.value) }, [o.color ? h('span', { class: 'd' }) : null, o.label]))])
            : h('select', { value: v ?? '', disabled: ro, onChange: (e) => up(e.target.value || null) }, [h('option', { value: '' }, 'Selecione…'), ...f.options.map((o) => h('option', { value: o.value }, o.label))]);
          break;
        case 'multiselect': {
          const arr = Array.isArray(v) ? v : [];
          input = h('div', { class: 'seg' }, f.options.map((o) => h('button', { type: 'button', class: arr.includes(o.value) ? 'on' : '', onClick: () => up(arr.includes(o.value) ? arr.filter((x) => x !== o.value) : [...arr, o.value]) }, [NET[o.value] ? h('span', { class: 'net', style: { background: NET[o.value][1], width: o.value === 'site' ? '30px' : null } }, NET[o.value][0]) : null, o.label])));
          break;
        }
        case 'bool': input = h('div', { class: 'toggle', onClick: () => !ro && up(v ? 0 : 1) }, [h('span', { class: 'switch' + (v ? ' on' : '') }), h('span', null, v ? 'Sim' : 'Não')]); break;
        case 'relation': input = h(RelationSelect, { entity: f.entity, modelValue: v, label: p.labels?.[p.name]?.[v], disabled: ro, filter: f.dependsOn && p.row?.[f.dependsOn] ? { [f.dependsOn]: p.row[f.dependsOn] } : null, 'onUpdate:modelValue': up, onPick: (o) => { if (!p.labels) return; p.labels[p.name] = { ...(p.labels[p.name] || {}), [o.id]: o.label }; emit('set', { __pick: { name: p.name, o } }); } }); break;
        case 'file': input = h(FileField, { modelValue: v, folder: f.folder, info: p.labels?.__arquivos?.[v], 'onUpdate:modelValue': up, onUploaded: (i) => { if (p.labels) { p.labels.__arquivos = { ...(p.labels.__arquivos || {}), [i.id]: i }; } emit('set', { __upload: { name: p.name, info: i } }); } }); break;
        case 'files': input = h(FilesField, { modelValue: v || [], folder: f.folder, infos: p.labels?.__arquivos, 'onUpdate:modelValue': up }); break;
        case 'money': input = h('input', { type: 'text', inputmode: 'decimal', value: v == null ? '' : (typeof v === 'number' ? v.toFixed(2).replace('.', ',') : v), readonly: ro, placeholder: '0,00', onInput: (e) => up(e.target.value) }); break;
        case 'int': input = h('input', { type: 'number', inputmode: 'numeric', value: v ?? '', readonly: ro, min: f.min, max: f.max, onInput: (e) => up(e.target.value) }); break;
        case 'date': input = h('input', { type: 'date', value: v ? String(v).slice(0, 10) : '', readonly: ro, onInput: (e) => up(e.target.value) }); break;
        case 'month': input = h('input', { type: 'month', value: v || '', readonly: ro, onInput: (e) => up(e.target.value) }); break;
        case 'datetime': input = ro ? h('input', { value: v ? fmt.dt(v) : '—', readonly: true }) : h('input', { type: 'datetime-local', value: toLocalInput(v), onInput: (e) => up(fromLocalInput(e.target.value)) }); break;
        case 'email': input = h('input', { type: 'email', value: v ?? '', readonly: ro, autocomplete: 'off', onInput: (e) => up(e.target.value) }); break;
        case 'password': input = h('input', { type: 'password', value: v ?? '', autocomplete: 'new-password', placeholder: '••••••••', onInput: (e) => up(e.target.value) }); break;
        case 'json': input = h('textarea', { class: 'mono', rows: 4, readonly: ro, value: v == null ? '' : (typeof v === 'string' ? v : JSON.stringify(v, null, 2)), onInput: (e) => up(e.target.value) }); break;
        case 'cron': input = h('div', null, [h('input', { value: v ?? '', class: 'mono', placeholder: '*/5 * * * *', onInput: (e) => up(e.target.value) }), h('div', { class: 'seg', style: { marginTop: '8px' } }, CRON_PRESETS.map(([l, c]) => h('button', { type: 'button', class: v === c ? 'on' : '', onClick: () => up(c) }, l)))]); break;
        default: {
          const m = f.mask && masks[f.mask];
          input = h('input', {
            type: f.mask === 'phone' ? 'tel' : 'text', inputmode: f.mask ? 'numeric' : null, value: v ?? '', readonly: ro, maxlength: f.max,
            onInput: (e) => { let val = e.target.value; if (m) { val = m(val); e.target.value = val; } if (f.upper) { val = val.toUpperCase(); e.target.value = val; } up(val); if (f.mask === 'cep') cep(val); },
          });
        }
      }
      return h('div', { class: 'field' + (f.full || ['textarea', 'files', 'multiselect', 'json', 'cron'].includes(f.type) ? ' full' : '') }, [
        h('label', null, [f.label, f.required && !ro ? h('span', { class: 'req' }, '*') : null]),
        input,
        f.help ? h('div', { class: 'help' }, f.help) : null,
      ]);
    };
  },
});
const CRON_PRESETS = [['A cada 2 min', '*/2 * * * *'], ['A cada hora', '0 * * * *'], ['Todo dia 9h', '0 9 * * *'], ['Seg/Qua/Sex 18h', '0 18 * * 1,3,5'], ['Seg a sex 8h30', '30 8 * * 1-5'], ['Toda segunda 9h', '0 9 * * 1'], ['Dia 1 às 8h', '0 8 1 * *']];

// ---------------- Formulário de uma entidade ----------------
const EntityForm = defineComponent({
  props: { entity: String, row: Object, labels: Object, readonly: Boolean },
  setup(p) {
    return () => {
      const e = ent(p.entity);
      if (!e) return null;
      return h('div', null, e.sections.map((s) => {
        const fields = s.fields.filter((k) => e.fields[k] && !e.fields[k].hidden && !(e.fields[k].readonly && !p.row.id && !p.row[k]));
        if (!fields.length) return null;
        return h('div', { class: 'form-sec' }, [
          e.sections.length > 1 ? h('h3', null, s.title) : null,
          h('div', { class: 'form' }, fields.map((k) => h(Field, {
            key: k, name: k, field: e.fields[k], modelValue: p.row[k], row: p.row, labels: p.labels, readonly: p.readonly,
            'onUpdate:modelValue': (v) => { p.row[k] = v; },
            onSet: (obj) => { for (const [kk, vv] of Object.entries(obj)) if (!kk.startsWith('__')) p.row[kk] = vv; if (obj.__upload && p.entity === 'versoes' && obj.__upload.info.sha256) p.row.sha256 = obj.__upload.info.sha256; if (obj.__pick && p.entity === 'licencas' && obj.__pick.name === 'instalacao_id' && !p.row.valor_mensal) { /* preço padrão vem do produto */ } },
          }))),
        ]);
      }));
    };
  },
});

// Valores padrão para um novo registro
function novoRegistro(entity, extra = {}) {
  const e = ent(entity); const r = {};
  for (const [k, f] of Object.entries(e.fields)) {
    if (f.default === undefined || f.readonly) continue;
    r[k] = f.default === 'now' ? new Date().toISOString() : f.default === 'me' ? store.user?.id : f.default;
  }
  return Object.assign(r, extra);
}

// Prepara os dados para enviar ao servidor
function payload(entity, row) {
  const e = ent(entity); const out = {};
  for (const [k, f] of Object.entries(e.fields)) {
    if (f.readonly) continue;
    if (row[k] === undefined) continue;
    let v = row[k];
    if (f.type === 'json' && typeof v === 'string' && v.trim()) { try { v = JSON.parse(v); } catch { throw new Error(`${f.label}: JSON inválido.`); } }
    out[k] = v;
  }
  return out;
}

// ---------------- Lista de uma entidade ----------------
const EntityList = defineComponent({
  props: { entity: String, fixed: Object, embedded: Boolean, columns: Array, newExtra: Object, title: String, hideNew: Boolean, limit: { type: Number, default: 30 } },
  setup(p) {
    const e = computed(() => ent(p.entity));
    const rows = ref([]), labels = ref({}), total = ref(0), loading = ref(true);
    const st = reactive({ q: p.embedded ? '' : (store.route.query.q || ''), sort: '', page: 1, filtros: {} });
    if (!p.embedded) for (const [k, v] of Object.entries(store.route.query)) if (k.startsWith('f_') || k.startsWith('de_') || k.startsWith('ate_')) st.filtros[k] = v;
    let t;
    async function load() {
      loading.value = true;
      const params = new URLSearchParams({ page: st.page, limit: p.limit, ...(st.q ? { q: st.q } : {}), ...(st.sort ? { sort: st.sort } : {}) });
      for (const [k, v] of Object.entries({ ...st.filtros, ...(p.fixed || {}) })) if (v !== '' && v != null) params.set(k.startsWith('f_') || k.startsWith('de_') || k.startsWith('ate_') ? k : 'f_' + k, v);
      try { const d = await get(`${p.entity}?${params}`); rows.value = d.data; labels.value = d.labels; total.value = d.total; } catch (er) { erro(er); }
      loading.value = false;
    }
    watch(() => [st.sort, st.page, JSON.stringify(st.filtros)], load);
    watch(() => st.q, () => { clearTimeout(t); t = setTimeout(() => { st.page = 1; load(); if (!p.embedded) setQuery({ q: st.q }); }, 280); });
    watch(() => p.entity, () => { st.filtros = {}; st.page = 1; st.q = ''; load(); });
    onMounted(load);
    const cols = computed(() => p.columns || e.value.list);
    function sortBy(k) { st.sort = st.sort === k ? '-' + k : st.sort === '-' + k ? '' : k; }
    function toggleFilter(k, v) {
      const key = 'f_' + k;
      if (st.filtros[key] === v) delete st.filtros[key]; else st.filtros[key] = v;
      st.page = 1; if (!p.embedded) setQuery({ [key]: st.filtros[key] || '' });
    }
    function exportar() {
      const params = new URLSearchParams({ ...(st.q ? { q: st.q } : {}) });
      for (const [k, v] of Object.entries({ ...st.filtros, ...(p.fixed || {}) })) params.set(k.startsWith('f_') ? k : 'f_' + k, v);
      location.href = `/api/${p.entity}/exportar?${params}`;
    }
    const inp = ref(null);
    async function importar(ev) {
      const file = ev.target.files[0]; ev.target.value = ''; if (!file) return;
      const text = await file.text();
      const rowsCsv = parseCSV(text);
      if (!rowsCsv.length) return toast('Planilha vazia.', 'err');
      if (!(await confirmar('Importar planilha', `Importar ${rowsCsv.length} linha(s) em ${e.value.label}? A primeira linha deve ter os nomes das colunas (iguais aos do formulário).`, { ok: 'Importar' }))) return;
      try { const r = await post(`${p.entity}/importar`, { rows: rowsCsv }); toast(`${r.importados} registro(s) importados.` + (r.erros.length ? ` ${r.erros.length} com erro (ex.: linha ${r.erros[0].linha}: ${r.erros[0].erro})` : ''), r.erros.length ? 'err' : 'ok', 9000); load(); } catch (er) { erro(er); }
    }
    function abrir(r) { go(linkTo(p.entity, r.id)); }
    function novo() {
      const q = new URLSearchParams(p.newExtra || {}).toString();
      go(linkTo(p.entity, 'novo') + (q ? '?' + q : ''));
    }
    const selFilters = computed(() => (p.embedded ? [] : (e.value.filters || []).filter((k) => e.value.fields[k]?.type === 'select' || e.value.fields[k]?.type === 'bool')));
    return () => {
      const E = e.value; if (!E) return null;
      const pages = Math.max(1, Math.ceil(total.value / p.limit));
      const titleKey = E.title;
      return h('div', { class: 'card pad0' }, [
        h('div', { class: 'toolbar' }, [
          h('div', { class: 'search' }, [h(Icon, { n: 'search', s: 16 }), h('input', { value: st.q, placeholder: `Buscar em ${E.label.toLowerCase()}…`, onInput: (ev) => { st.q = ev.target.value; } })]),
          h('span', { class: 'muted small' }, `${fmt.int(total.value)} registro${total.value === 1 ? '' : 's'}`),
          h('div', { style: { marginLeft: 'auto' }, class: 'row gap-s' }, [
            !p.embedded ? h('button', { class: 'btn sm ghost', onClick: exportar, title: 'Exportar para Excel (CSV)' }, [h(Icon, { n: 'download', s: 16 }), h('span', { class: 'hide-m' }, 'Exportar')]) : null,
            !p.embedded && can.write() && !E.readonly && E.key !== 'usuarios' ? h('button', { class: 'btn sm ghost', onClick: () => inp.value.click(), title: 'Importar planilha CSV' }, [h(Icon, { n: 'upload', s: 16 }), h('span', { class: 'hide-m' }, 'Importar')]) : null,
            h('input', { type: 'file', accept: '.csv,text/csv', ref: inp, style: { display: 'none' }, onChange: importar }),
            can.write() && !E.readonly && !p.hideNew ? h('button', { class: 'btn sm primary', onClick: novo }, [h(Icon, { n: 'plus', s: 16 }), p.embedded ? 'Adicionar' : 'Novo']) : null,
          ]),
        ]),
        selFilters.value.length ? h('div', { class: 'filters' }, selFilters.value.flatMap((k) => {
          const f = E.fields[k];
          const opts = f.type === 'bool' ? [{ value: '1', label: f.label }] : f.options;
          return opts.map((o) => h('button', { class: 'chip' + (st.filtros['f_' + k] === o.value ? ' on' : ''), onClick: () => toggleFilter(k, o.value) }, [o.color ? h('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: o.color } }) : null, o.label]));
        })) : null,
        loading.value && !rows.value.length ? h('div', { style: { padding: '18px' } }, [1, 2, 3, 4].map(() => h('div', { class: 'skeleton', style: { height: '38px', marginBottom: '10px' } })))
          : !rows.value.length ? h('div', { class: 'empty' }, [h(Icon, { n: E.icon, s: 40, w: 1.5 }), h('b', null, st.q || Object.keys(st.filtros).length ? 'Nada encontrado' : `Nenhum registro em ${E.label.toLowerCase()}`), h('div', null, st.q ? 'Tente outra busca.' : can.write() && !E.readonly ? 'Clique em "Novo" para cadastrar.' : '')])
            : [
              h('div', { class: 'tbl-wrap has-cards' }, h('table', { class: 'tbl' }, [
                h('thead', null, h('tr', null, cols.value.map((k) => h('th', { onClick: () => sortBy(k) }, [k === 'id' ? '#' : k === 'created_at' ? 'Criado' : E.fields[k]?.label || k, st.sort === k ? ' ↑' : st.sort === '-' + k ? ' ↓' : ''])))),
                h('tbody', null, rows.value.map((r) => h('tr', { key: r.id, onClick: () => abrir(r) }, cols.value.map((k, i) => h('td', { class: i === 0 ? 'first' : '' }, cellValue(E, k, r, labels.value)))))),
              ])),
              h('div', { class: 'cards-list' }, rows.value.map((r) => h('a', { class: 'citem', href: linkTo(p.entity, r.id), key: r.id }, [
                h('div', { class: 'l1' }, [h('b', null, cellValue(E, cols.value[0], r, labels.value)), ...cols.value.slice(1).filter((k) => E.fields[k]?.type === 'select').slice(0, 1).map((k) => cellValue(E, k, r, labels.value))]),
                h('div', { class: 'l2' }, cols.value.slice(1).filter((k) => E.fields[k]?.type !== 'select').slice(0, 3).map((k) => h('span', null, cellValue(E, k, r, labels.value)))),
              ]))),
              pages > 1 ? h('div', { class: 'pager' }, [`Página ${st.page} de ${pages}`, h('span', { style: { marginLeft: 'auto' } }),
                h('button', { class: 'btn sm', disabled: st.page <= 1, onClick: () => st.page-- }, h(Icon, { n: 'left', s: 16 })),
                h('button', { class: 'btn sm', disabled: st.page >= pages, onClick: () => st.page++ }, h(Icon, { n: 'right', s: 16 }))]) : null,
            ],
      ]);
    };
  },
});

// CSV simples (aceita ; ou , como separador)
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const sep = (text.split('\n')[0].match(/;/g) || []).length >= (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; continue; }
    if (c === '"') q = true; else if (c === sep) { row.push(cur); cur = ''; } else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const head = rows.shift() || [];
  return rows.filter((r) => r.some((x) => x.trim())).map((r) => Object.fromEntries(head.map((hd, i) => [hd.trim(), r[i] ?? ''])));
}

// ---------------- Modal ----------------
const Modal = defineComponent({
  props: { title: String, wide: Boolean, xwide: Boolean },
  emits: ['close'],
  setup(p, { slots, emit }) {
    const esc = (e) => { if (e.key === 'Escape') emit('close'); };
    onMounted(() => document.addEventListener('keydown', esc));
    onBeforeUnmount(() => document.removeEventListener('keydown', esc));
    return () => h('div', { class: 'overlay', onMousedown: (e) => { if (e.target === e.currentTarget) emit('close'); } }, h('div', { class: 'modal' + (p.wide ? ' wide' : '') + (p.xwide ? ' xwide' : '') }, [
      h('div', { class: 'modal-head' }, [h('h3', null, p.title), h('button', { class: 'btn ghost icon x', onClick: () => emit('close') }, h(Icon, { n: 'x' }))]),
      h('div', { class: 'modal-body' }, slots.default && slots.default()),
      slots.foot ? h('div', { class: 'modal-foot' }, slots.foot()) : null,
    ]));
  },
});

const CodeBlock = defineComponent({
  props: { code: String },
  setup(p) { return () => h('div', { class: 'code' }, [h('button', { class: 'btn sm copy', onClick: () => copiar(p.code) }, [h(Icon, { n: 'copy', s: 14 }), 'Copiar']), p.code]); },
});
