/* Neon Gestão — páginas */

// ---------------- Login ----------------
const LoginPage = defineComponent({
  setup() {
    const f = reactive({ email: localStorage.getItem('neon_email') || '', senha: '', codigo: '' });
    const precisa2fa = ref(false), busy = ref(false), msg = ref('');
    async function entrar() {
      busy.value = true; msg.value = '';
      try {
        const r = await post('auth/login', f);
        if (r.precisa2fa) { precisa2fa.value = true; busy.value = false; return; }
        localStorage.setItem('neon_email', f.email);
        store.user = r.user; await carregarMeta(); carregarAsaas();
        go(store.route.query.voltar || '/', true);
      } catch (e) { msg.value = e.message; }
      busy.value = false;
    }
    return () => h('div', { class: 'login' }, [
      h('div', { class: 'login-art' }, [
        h('div', { class: 'orb', style: { width: '220px', height: '220px', right: '12%', top: '14%', background: 'radial-gradient(circle, rgba(255,140,40,.55), transparent 70%)' } }),
        h('div', { class: 'orb', style: { width: '140px', height: '140px', right: '34%', top: '42%', background: 'radial-gradient(circle, rgba(80,140,255,.45), transparent 70%)', animationDelay: '-3s' } }),
        h('img', { src: '/img/logo.png', alt: 'Neon Sistemas' }),
        h('h2', null, 'Gestão completa da Neon Sistemas, em um só lugar.'),
        h('p', null, 'Clientes, instalações, licenças, atualizações, suporte, cobranças e marketing — do computador ou do celular.'),
      ]),
      h('div', { class: 'login-form' }, h('form', { class: 'box', onSubmit: (e) => { e.preventDefault(); entrar(); } }, [
        h('h1', null, precisa2fa.value ? 'Verificação em duas etapas' : 'Entrar'),
        h('p', null, precisa2fa.value ? 'Digite o código de 6 dígitos do seu aplicativo autenticador.' : 'Use seu e-mail e senha do painel.'),
        !precisa2fa.value ? [
          h('div', { class: 'field', style: { marginBottom: '14px' } }, [h('label', null, 'E-mail'), h('input', { type: 'email', value: f.email, autocomplete: 'username', required: true, onInput: (e) => { f.email = e.target.value; } })]),
          h('div', { class: 'field', style: { marginBottom: '18px' } }, [h('label', null, 'Senha'), h('input', { type: 'password', value: f.senha, autocomplete: 'current-password', required: true, onInput: (e) => { f.senha = e.target.value; } })]),
        ] : h('div', { class: 'field', style: { marginBottom: '18px' } }, [h('label', null, 'Código'), h('input', { inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, value: f.codigo, style: { fontSize: '22px', letterSpacing: '8px', textAlign: 'center' }, onInput: (e) => { f.codigo = e.target.value.replace(/\D/g, ''); if (f.codigo.length === 6) entrar(); } })]),
        msg.value ? h('div', { class: 'callout warn', style: { marginBottom: '14px' } }, [h(Icon, { n: 'alert' }), msg.value]) : null,
        h('button', { class: 'btn primary block', style: { height: '48px' }, disabled: busy.value }, busy.value ? 'Entrando…' : 'Entrar'),
      ])),
    ]);
  },
});

// ---------------- Dashboard ----------------
const DashboardPage = defineComponent({
  setup() {
    const d = ref(null); const canvas = ref(null); let chart;
    async function load() {
      try { d.value = await get('dashboard'); store.contadores.chamados = d.value.kpis.chamados_abertos; store.contadores.lembretes = d.value.kpis.lembretes_hoje; await nextTick(); draw(); } catch (e) { erro(e); }
    }
    function draw() {
      if (!canvas.value || !window.Chart) return;
      chart && chart.destroy();
      const g = d.value.grafico;
      const css = getComputedStyle(document.documentElement);
      const muted = css.getPropertyValue('--muted').trim(), line = css.getPropertyValue('--line').trim();
      const ctx = canvas.value.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, 0, 260); grad.addColorStop(0, 'rgba(255,106,0,.45)'); grad.addColorStop(1, 'rgba(255,106,0,0)');
      const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
      chart = new Chart(ctx, {
        data: {
          labels: g.meses.map((m) => meses[Number(m.slice(5)) - 1] + '/' + m.slice(2, 4)),
          datasets: [
            { type: 'line', label: 'Recebido (R$)', data: g.receita, yAxisID: 'y', borderColor: '#ff7a1a', backgroundColor: grad, fill: true, tension: .35, pointRadius: 3, pointBackgroundColor: '#ff7a1a', borderWidth: 2.5 },
            { type: 'bar', label: 'Novos clientes', data: g.novos, yAxisID: 'y1', backgroundColor: 'rgba(56,189,248,.55)', borderRadius: 6, maxBarThickness: 22 },
          ],
        },
        options: {
          maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
          plugins: { legend: { labels: { color: muted, usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: (c) => c.datasetIndex === 0 ? ' ' + fmt.money(c.raw) : ` ${c.raw} cliente(s)` } } },
          scales: { x: { ticks: { color: muted }, grid: { display: false } }, y: { position: 'left', beginAtZero: true, ticks: { color: muted, callback: (v) => 'R$ ' + Number(v).toLocaleString('pt-BR') }, grid: { color: line } }, y1: { position: 'right', beginAtZero: true, ticks: { color: muted, precision: 0 }, grid: { display: false } } },
        },
      });
    }
    onMounted(load);
    onBeforeUnmount(() => chart && chart.destroy());
    const K = (icon, c, lbl, val, sub, href, hot) => h('a', { class: 'card kpi' + (hot ? ' hot' : ''), href, style: { '--c': c } }, [h('div', { class: 'lbl' }, [h('span', { class: 'ico' }, h(Icon, { n: icon, s: 17 })), lbl]), h('div', { class: 'val' }, val), sub ? h('div', { class: 'sub' }, sub) : null]);
    const saud = () => { const hr = new Date().getHours(); return hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite'; };
    return () => {
      const v = d.value;
      return h('div', null, [
        h('div', { class: 'page-head' }, [h('div', null, [h('h1', null, `${saud()}, ${(store.user?.nome || '').split(' ')[0]} 👋`), h('p', null, 'Resumo do seu negócio em tempo real.')]),
          h('div', { class: 'actions' }, [h('a', { class: 'btn', href: '/clientes/novo' }, [h(Icon, { n: 'plus', s: 16 }), 'Cliente']), h('a', { class: 'btn primary', href: '/chamados/novo' }, [h(Icon, { n: 'lifebuoy', s: 16 }), 'Chamado'])])]),
        !v ? h('div', { class: 'grid g4' }, [1, 2, 3, 4, 5, 6, 7, 8].map(() => h('div', { class: 'skeleton', style: { height: '112px' } }))) : [
          h('div', { class: 'grid g4' }, [
            K('users', '#22c55e', 'Clientes ativos', fmt.int(v.kpis.clientes_ativos), `${v.kpis.leads} em negociação`, '/clientes?f_status=ativo'),
            K('server', '#38bdf8', 'Instalações ativas', fmt.int(v.kpis.instalacoes_ativas), h('span', { class: 'row gap-s' }, [h('span', { class: 'pulse' + (v.kpis.online ? '' : ' off') }), `${v.kpis.online} online agora`]), '/instalacoes'),
            K('lifebuoy', '#ef4444', 'Chamados abertos', fmt.int(v.kpis.chamados_abertos), v.kpis.chamados_fora_prazo ? `${v.kpis.chamados_fora_prazo} fora do prazo` : v.kpis.chamados_urgentes ? `${v.kpis.chamados_urgentes} alta/urgente` : 'nenhum urgente', '/chamados?f_status=aberto,andamento,aguardando&sort=sla_limite', v.kpis.chamados_fora_prazo > 0),
            K('key', '#a78bfa', 'Licenças vencendo', fmt.int(v.kpis.licencas_vencendo), 'nos próximos 30 dias', '/licencas?f_status=ativa'),
            K('zap', '#ff7a1a', 'Receita mensal (licenças)', fmt.money(v.kpis.receita_mensal), 'soma das licenças ativas', '/licencas?f_status=ativa', true),
            K('money', '#f59e0b', 'A receber', fmt.money(v.kpis.a_receber), 'pendentes + atrasadas', '/cobrancas?f_status=pendente'),
            K('alert', '#ef4444', 'Em atraso', fmt.money(v.kpis.atrasado), 'cobranças vencidas', '/cobrancas?f_status=atrasado'),
            K('check', '#22c55e', 'Recebido no mês', fmt.money(v.kpis.recebido_mes), 'pagamentos confirmados', '/cobrancas?f_status=pago'),
          ]),
          h('div', { class: 'grid g3', style: { marginTop: '16px' } }, [
            h('div', { class: 'card span2' }, [h('h2', { class: 'sec' }, [h(Icon, { n: 'chart' }), 'Receita e novos clientes — 12 meses']), h('div', { class: 'chart-box' }, h('canvas', { ref: canvas }))]),
            h('div', { class: 'card pad0' }, [h('div', { class: 'card-head' }, [h(Icon, { n: 'funnel' }), h('h3', null, 'Funil de vendas'), h('div', { class: 'actions' }, h('a', { class: 'btn sm ghost', href: '/funil' }, 'Abrir'))]),
              h('div', { class: 'list' }, (ent('clientes').fields.etapa_funil.options).map((o) => {
                const r = v.funil.find((x) => x.etapa === o.value) || { n: 0, valor: 0 };
                const max = Math.max(1, ...v.funil.map((x) => x.n));
                return h('div', { class: 'li' }, [h('div', { class: 'grow' }, [h('div', { class: 'row' }, [h('span', { class: 't small' }, o.label), h('span', { class: 'muted small', style: { marginLeft: 'auto' } }, `${r.n} · ${fmt.money(r.valor)}`)]), h('div', { class: 'progress', style: { marginTop: '6px' } }, h('div', { style: { width: (r.n / max * 100) + '%', background: o.color, boxShadow: 'none' } }))])]);
              }))]),
          ]),
          h('div', { class: 'grid g3', style: { marginTop: '16px' } }, [
            Lista('Chamados em aberto', 'lifebuoy', '/chamados', v.chamados, (c) => h('a', { class: 'li', href: `/chamados/${c.id}` }, [h('div', { class: 'grow' }, [h('div', { class: 't' }, c.titulo), h('div', { class: 's row gap-s', style: { flexWrap: 'wrap' } }, [`#${c.id} · ${c.cliente} · ${fmt.ago(c.created_at)}`, c.sla_limite ? SlaTag(c) : null])]), h(Badge, { field: ent('chamados').fields.prioridade, value: c.prioridade })]), 'Nenhum chamado aberto 🎉'),
            Lista('Equipamentos que deram sinal', 'signal', '/sinais', v.sinais, (s) => h('a', { class: 'li', href: `/instalacoes/${s.id}` }, [h('span', { class: 'pulse' + (s.online ? '' : ' off') }), h('div', { class: 'grow' }, [h('div', { class: 't mono' }, s.codigo), h('div', { class: 's' }, `${s.cliente} · v${s.versao_instalada || '?'}`)]), h('span', { class: 'muted small nowrap' }, fmt.ago(s.ultimo_contato))]), 'Nenhum sinal recebido ainda.'),
            Lista('Lembretes e próximos passos', 'bell', '/agenda', v.lembretes, (l) => h('a', { class: 'li', href: `/clientes/${l.cliente_id}` }, [h('div', { class: 'grow' }, [h('div', { class: 't' }, l.proximo_passo || l.resumo), h('div', { class: 's' }, l.cliente)]), h('span', { class: 'small nowrap', style: { color: toDate(l.lembrete) < new Date() ? 'var(--red)' : 'var(--muted)' } }, fmt.dt(l.lembrete))]), 'Sem lembretes pendentes.'),
            Lista('Licenças vencendo', 'key', '/licencas', v.vencendo, (l) => h('a', { class: 'li', href: `/licencas/${l.id}` }, [h('div', { class: 'grow' }, [h('div', { class: 't' }, l.cliente), h('div', { class: 's mono' }, `${l.codigo} · ${fmt.money(l.valor_mensal)}`)]), h('span', { class: 'small nowrap', style: { color: l.vencimento < hojeISO() ? 'var(--red)' : 'var(--yellow)' } }, fmt.date(l.vencimento))]), 'Nenhuma licença vencendo.'),
            Lista('Cobranças atrasadas', 'alert', '/cobrancas?f_status=atrasado', v.atrasadas, (c) => h('div', { class: 'li' }, [h('a', { class: 'grow', href: `/cobrancas/${c.id}`, style: { color: 'inherit' } }, [h('div', { class: 't' }, c.cliente), h('div', { class: 's' }, `${c.competencia} · venceu ${fmt.date(c.vencimento)}`)]), h('b', { class: 'nowrap' }, fmt.money(c.valor)), c.whatsapp ? h('a', { class: 'btn sm icon wa', target: '_blank', href: waLink(c.whatsapp, msgCobranca(c)), title: 'Cobrar no WhatsApp' }, h(Icon, { n: 'whatsapp', s: 16 })) : null]), 'Nenhuma cobrança atrasada 👏'),
            h('div', { class: 'card' }, [h('h2', { class: 'sec' }, [h(Icon, { n: 'zap' }), 'Atalhos']), h('div', { class: 'grid g2' }, [
              ['/clientes/novo', 'users', 'Novo cliente'], ['/instalacoes/novo', 'server', 'Nova instalação'], ['/atualizacoes/novo', 'upload', 'Publicar atualização'], ['/cobrancas/novo', 'money', 'Nova cobrança'], ['/historico/novo', 'chat', 'Registrar contato'], ['/marketing', 'megaphone', 'Marketing'],
            ].map(([href, ic, t]) => h('a', { class: 'btn', href, style: { justifyContent: 'flex-start' } }, [h(Icon, { n: ic, s: 16 }), t])))]),
          ]),
        ],
      ]);
    };
  },
});
function Lista(titulo, icon, href, rows, item, vazio) {
  return h('div', { class: 'card pad0' }, [
    h('div', { class: 'card-head' }, [h(Icon, { n: icon }), h('h3', null, titulo), h('div', { class: 'actions' }, h('a', { class: 'btn sm ghost', href }, 'Ver todos'))]),
    rows.length ? h('div', { class: 'list' }, rows.map(item)) : h('div', { class: 'empty', style: { padding: '28px' } }, vazio),
  ]);
}
function msgCobranca(c) {
  const tpl = store.config.msg_cobranca || 'Olá, {cliente}! Lembrete da mensalidade {competencia} de {valor}, vencimento {vencimento}.';
  const link = c.asaas_url && !['pago', 'cancelado'].includes(c.status) ? c.asaas_url : '';
  return tpl.replace('{cliente}', c.cliente || c.nome_fantasia || '').replace('{competencia}', c.competencia || '').replace('{valor}', fmt.money(c.valor)).replace('{vencimento}', fmt.date(c.vencimento)).replace('{link}', link)
    + (link && !tpl.includes('{link}') ? `\nPague por aqui (boleto ou Pix): ${link}` : '')
    + (store.config.empresa_pix && !link ? `\nChave Pix: ${store.config.empresa_pix}` : '');
}

// ---------------- Lista genérica ----------------
const ListPage = defineComponent({
  props: { entity: String, sub: String },
  setup(p) {
    return () => {
      const e = ent(p.entity); if (!e) return null;
      return h('div', null, [
        h('div', { class: 'page-head' }, [h('div', null, [h('h1', null, e.label), p.sub ? h('p', null, p.sub) : null])]),
        h(EntityList, { entity: p.entity, key: p.entity }),
      ]);
    };
  },
});

const SUBTITULOS = {
  clientes: 'Clientes e leads. Toque em um cliente para ver tudo dele.',
  instalacoes: 'Cada sistema instalado num cliente. O ponto verde indica equipamento online.',
  licencas: 'A chave é gerada sozinha. Mensalidades são criadas automaticamente.',
  versoes: 'Só versões "Publicadas" aparecem para os equipamentos.',
  chamados: 'Atendimentos de suporte.', cobrancas: 'Mensalidades. Vencidas viram "Atrasado" sozinhas.',
  contatos: 'Ligações, visitas e demonstrações, com lembretes.', produtos: 'O código é usado pela API dos equipamentos.',
  checkins: 'Sinais enviados pelos equipamentos instalados.', usuarios: 'Quem acessa o painel.',
  depoimentos: 'Clientes satisfeitos no site neonsistemas.com. Só aparecem os marcados como "Mostrar no site" e com a autorização do cliente. Sem nenhum publicado, a seção some do site.',
};

// ---------------- Detalhe / cadastro genérico ----------------
const DetailPage = defineComponent({
  props: { entity: String, id: String },
  setup(p) {
    const row = ref(null), labels = ref({}), orig = ref(''), busy = ref(false), tab = ref('dados'), resumo = ref(null), hist = ref([]);
    const isNew = computed(() => p.id === 'novo');
    const e = computed(() => ent(p.entity));
    async function load() {
      tab.value = 'dados';
      if (isNew.value) {
        const extra = {};
        for (const [k, v] of Object.entries(store.route.query)) if (e.value.fields[k]) extra[k] = e.value.fields[k].type === 'relation' || e.value.fields[k].type === 'int' ? Number(v) : v;
        row.value = novoRegistro(p.entity, extra); labels.value = {};
        // rótulos das relações vindas da URL
        for (const [k, v] of Object.entries(extra)) if (e.value.fields[k].type === 'relation') { try { const r = await get(`${e.value.fields[k].entity}/${v}`); labels.value[k] = { [v]: r.data[ent(e.value.fields[k].entity).title] }; } catch { /* ok */ } }
        orig.value = JSON.stringify(row.value); return;
      }
      try {
        const d = await get(`${p.entity}/${p.id}`); row.value = d.data; labels.value = d.labels || {}; orig.value = JSON.stringify(row.value);
        if (p.entity === 'clientes') resumo.value = (await get(`clientes/${p.id}/resumo`)).data;
      } catch (er) { erro(er); go(linkTo(p.entity)); }
    }
    watch(() => [p.entity, p.id], load); onMounted(load);
    const dirty = computed(() => row.value && JSON.stringify(row.value) !== orig.value);
    async function salvar() {
      busy.value = true;
      try {
        const body = payload(p.entity, row.value);
        if (isNew.value) {
          const r = await post(p.entity, body);
          toast(`${e.value.singular} ${e.value.fem ? 'cadastrada' : 'cadastrado'}.`); orig.value = JSON.stringify(row.value);
          go(linkTo(p.entity, r.data.id), true);
        } else {
          const r = await patch(`${p.entity}/${p.id}`, body);
          toast('Alterações salvas.'); await load();
        }
      } catch (er) { erro(er); }
      busy.value = false;
    }
    async function excluir() {
      if (!(await confirmar(`Excluir ${e.value.singular.toLowerCase()}`, 'Essa ação não pode ser desfeita.', { ok: 'Excluir', perigo: true }))) return;
      try { await del(`${p.entity}/${p.id}`); toast('Excluído.'); go(linkTo(p.entity), true); } catch (er) {
        if (er.status === 409 && await confirmar('Apagar junto com os registros ligados?', er.message, { ok: 'Apagar tudo', perigo: true })) {
          try { await del(`${p.entity}/${p.id}?forcar=1`); toast('Excluído.'); go(linkTo(p.entity), true); } catch (e2) { erro(e2); }
        } else if (er.status !== 409) erro(er);
      }
    }
    async function carregarHist() { try { hist.value = (await get(`historico/${p.entity}/${p.id}`)).data; } catch { hist.value = []; } }
    async function acao(path, msg, body) { try { await post(path, body); toast(msg); await load(); } catch (er) { erro(er); } }

    return () => {
      const E = e.value, r = row.value;
      if (!E || !r) return h('div', null, [h('div', { class: 'skeleton', style: { height: '110px', marginBottom: '16px' } }), h('div', { class: 'skeleton', style: { height: '400px' } })]);
      const titulo = isNew.value ? `${E.fem ? 'Nova' : 'Novo'} ${E.singular.toLowerCase()}` : (r[E.title] ?? `#${r.id}`);
      const statusF = E.fields.status;
      const tabs = isNew.value ? [] : [['dados', 'Dados'], ...(p.entity === 'chamados' ? [['conversa', 'Conversa']] : []), ...(E.children || []).map((c) => [c.entity + ':' + c.fk, c.label]), ['hist', 'Histórico de alterações']];
      const form = h('div', null, [
        extras(p.entity, r, labels.value, isNew.value, acao, load),
        h('div', { class: 'card' }, h(EntityForm, { entity: p.entity, row: r, labels: labels.value, readonly: !can.write() || E.readonly })),
        can.write() && !E.readonly ? h('div', { class: 'savebar' }, [
          h('button', { class: 'btn primary', disabled: busy.value || (!dirty.value && !isNew.value), onClick: salvar, style: { minWidth: '160px' } }, [h(Icon, { n: 'check', s: 17 }), busy.value ? 'Salvando…' : isNew.value ? 'Cadastrar' : 'Salvar alterações']),
          dirty.value && !isNew.value ? h('button', { class: 'btn ghost', onClick: load }, 'Descartar') : null,
          !isNew.value && can.del() ? h('button', { class: 'btn danger', style: { marginLeft: 'auto' }, onClick: excluir }, [h(Icon, { n: 'trash', s: 16 }), h('span', { class: 'hide-m' }, 'Excluir')]) : null,
        ]) : null,
      ]);
      const [tabEnt, tabFk] = tab.value.includes(':') ? tab.value.split(':') : [];
      return h('div', null, [
        h('div', { class: 'crumb' }, [h('a', { href: linkTo(p.entity) }, E.label), h(Icon, { n: 'right', s: 14 }), h('span', null, isNew.value ? 'Novo' : `#${r.id}`)]),
        heroFor(p.entity, r, labels.value, titulo, statusF, isNew.value, resumo.value),
        tabs.length > 1 ? h('div', { class: 'tabs' }, tabs.map(([k, l]) => h('button', { class: tab.value === k ? 'on' : '', onClick: () => { tab.value = k; if (k === 'hist') carregarHist(); } }, l))) : null,
        tab.value === 'dados' ? form
          : tab.value === 'conversa' ? h(ChamadoConversa, { chamado: r, key: 'conv' + r.id })
          : tab.value === 'hist' ? h('div', { class: 'card' }, hist.value.length ? h('div', { class: 'timeline' }, hist.value.map((a) => h('div', { class: 'tl' }, [h('div', { class: 'when' }, `${fmt.dt(a.created_at)} · ${a.usuario_nome || 'Sistema'}`), h('div', null, a.resumo), a.mudancas ? h('div', { class: 'tiny muted' }, Object.entries(typeof a.mudancas === 'string' ? JSON.parse(a.mudancas) : a.mudancas).map(([k, [de, para]]) => `${E.fields[k]?.label || k}: ${de ?? '—'} → ${para ?? '—'}`).join(' · ')) : null]))) : h('div', { class: 'empty' }, 'Sem alterações registradas.'))
            : h(EntityList, { entity: tabEnt, key: tab.value, embedded: true, fixed: { [tabFk]: r.id }, newExtra: { [tabFk]: r.id, ...(tabEnt === 'cobrancas' || tabEnt === 'chamados' || tabEnt === 'contatos' ? {} : {}) }, hideNew: tabEnt === 'checkins' || (tabEnt === 'licencas' && p.entity === 'clientes') }),
      ]);
    };
  },
});

function heroFor(entity, r, labels, titulo, statusF, isNew, resumo) {
  const E = ent(entity);
  const meta = [];
  if (!isNew) {
    if (entity === 'clientes') { if (r.cidade) meta.push([h(Icon, { n: 'map', s: 14 }), ` ${r.cidade}${r.uf ? '/' + r.uf : ''}`]); if (r.contato_nome) meta.push([h(Icon, { n: 'user', s: 14 }), ' ' + r.contato_nome]); meta.push(`Último contato: ${fmt.ago(r.ultimo_contato)}`); }
    if (entity === 'chamados' && r.sla_limite) meta.push(SlaTag(r));
    if (entity === 'instalacoes') { meta.push(h('span', { class: 'row gap-s' }, [h('span', { class: 'pulse' + (r.online ? '' : ' off') }), r.online ? 'Online' : 'Offline', ` · último sinal ${fmt.ago(r.ultimo_contato)}`])); meta.push(`Cliente: ${labels.cliente_id?.[r.cliente_id] || ''}`); }
    if (r.cliente_id && entity !== 'instalacoes' && labels.cliente_id) meta.push(h('a', { href: `/clientes/${r.cliente_id}` }, labels.cliente_id[r.cliente_id]));
    if (r.created_at) meta.push(`Criado ${fmt.ago(r.created_at)}`);
  }
  const acts = [];
  if (!isNew && entity === 'clientes') {
    const wa = waLink(r.whatsapp || r.telefone);
    if (wa) acts.push(h('a', { class: 'btn wa', href: wa, target: '_blank' }, [h(Icon, { n: 'whatsapp', s: 16 }), 'WhatsApp']));
    if (r.telefone) acts.push(h('a', { class: 'btn', href: `tel:${String(r.telefone).replace(/\D/g, '')}` }, [h(Icon, { n: 'phone', s: 16 }), 'Ligar']));
    acts.push(h('a', { class: 'btn', href: `/historico/novo?cliente_id=${r.id}` }, [h(Icon, { n: 'chat', s: 16 }), 'Registrar contato']));
    acts.push(h('a', { class: 'btn primary', href: `/chamados/novo?cliente_id=${r.id}` }, [h(Icon, { n: 'lifebuoy', s: 16 }), 'Chamado']));
  }
  return h('div', null, [
    h('div', { class: 'hero' }, [
      h('div', { class: 'big-avatar' }, isNew ? h(Icon, { n: E.icon, s: 28 }) : entity === 'clientes' || entity === 'usuarios' ? fmt.initials(titulo) : h(Icon, { n: E.icon, s: 28 })),
      h('div', { class: 'grow' }, [h('h1', { class: entity === 'instalacoes' || entity === 'licencas' ? 'mono' : '' }, titulo), h('div', { class: 'meta' }, [statusF && r.status && !isNew ? h(Badge, { field: statusF, value: r.status }) : null, ...meta.map((m) => h('span', { class: 'row gap-s' }, m))])]),
      acts.length ? h('div', { class: 'actions' }, acts) : null,
    ]),
    entity === 'clientes' && resumo && !isNew ? h('div', { class: 'mini-stats' }, [
      ['Mensalidade', fmt.money(resumo.mensalidade)], ['Instalações', `${resumo.instalacoes} (${resumo.online} online)`], ['Chamados abertos', resumo.chamados_abertos],
      ['Em atraso', fmt.money(resumo.atrasado)], ['Total já pago', fmt.money(resumo.total_pago)],
    ].map(([l, v]) => h('div', { class: 'card' }, [h('div', { class: 'v', style: l === 'Em atraso' && resumo.atrasado > 0 ? { color: 'var(--red)' } : null }, v), h('div', { class: 'l' }, l)]))) : null,
  ]);
}

// Painéis extras por tipo de registro
function extras(entity, r, labels, isNew, acao, reload) {
  if (isNew) return null;
  if (entity === 'instalacoes') return h(TokenPanel, { inst: r, onChange: reload });
  if (entity === 'licencas') return h('div', { class: 'card', style: { marginBottom: '16px' } }, h('div', { class: 'row wrap' }, [
    h('div', { class: 'grow' }, [h('div', { class: 'muted small' }, 'Chave da licença'), h('div', { class: 'mono', style: { fontSize: '18px', fontWeight: 700, letterSpacing: '1px' } }, r.chave)]),
    h('button', { class: 'btn', onClick: () => copiar(r.chave, 'Chave copiada!') }, [h(Icon, { n: 'copy', s: 16 }), 'Copiar']),
    can.write() ? h('button', { class: 'btn primary', onClick: () => acao(`licencas/${r.id}/renovar`, 'Licença renovada!') }, [h(Icon, { n: 'refresh', s: 16 }), `Renovar (${optOf(ent('licencas').fields.plano, r.plano)?.label || 'período'})`]) : null,
  ]));
  if (entity === 'cobrancas') return h('div', null, [r.status !== 'pago' ? h('div', { class: 'card', style: { marginBottom: '16px' } }, h('div', { class: 'row wrap' }, [
    h('div', { class: 'grow' }, [h('div', { class: 'muted small' }, `Competência ${r.competencia} · vence ${fmt.date(r.vencimento)}`), h('div', { style: { fontSize: '24px', fontWeight: 800 } }, fmt.money(r.valor))]),
    can.write() ? h('button', { class: 'btn success', onClick: () => acao(`cobrancas/${r.id}/pagar`, 'Pagamento registrado!', { forma: r.forma || 'pix' }) }, [h(Icon, { n: 'check', s: 16 }), 'Marcar como pago']) : null,
    h(CobrarWa, { cobranca: r, cliente: labels.cliente_id?.[r.cliente_id] }),
  ])) : null, h(AsaasCobranca, { cobranca: r, onChange: reload })]);
  if (entity === 'chamados' && can.write()) return h('div', { class: 'card', style: { marginBottom: '16px' } }, h('div', { class: 'row wrap' }, [h('span', { class: 'muted small' }, 'Mudar status rápido:'),
    ...ent('chamados').fields.status.options.filter((o) => o.value !== r.status).map((o) => h('button', { class: 'chip', onClick: async () => { try { await patch(`chamados/${r.id}`, { status: o.value }); toast(`Chamado: ${o.label}`); reload(); } catch (e) { erro(e); } } }, [h('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: o.color } }), o.label]))]));
  if (entity === 'versoes') return h('div', { class: 'card', style: { marginBottom: '16px' } }, h('div', { class: 'row wrap' }, [
    h('div', { class: 'grow' }, [h('b', null, r.publicada ? '🟢 Publicada — os equipamentos já recebem esta versão.' : '⚪ Não publicada — os equipamentos ainda não veem esta versão.'), h('div', { class: 'muted small' }, `${fmt.int(r.downloads)} download(s)`)]),
    can.write() ? h('button', { class: r.publicada ? 'btn danger' : 'btn primary', onClick: async () => { try { await patch(`versoes/${r.id}`, { publicada: !r.publicada }); toast(r.publicada ? 'Versão retirada.' : 'Versão publicada!'); reload(); } catch (e) { erro(e); } } }, r.publicada ? 'Retirar publicação' : 'Publicar agora') : null,
  ]));
  if (entity === 'contatos' && r.lembrete && can.write()) return h('div', { class: 'card', style: { marginBottom: '16px' } }, h('div', { class: 'row wrap' }, [h('div', { class: 'grow' }, [h('b', null, r.concluido ? '✅ Lembrete concluído' : `🔔 Lembrete para ${fmt.dt(r.lembrete)}`), h('div', { class: 'muted small' }, r.proximo_passo || '')]),
    h('button', { class: 'btn', onClick: () => acao(`agenda/${r.id}/concluir`, r.concluido ? 'Lembrete reaberto.' : 'Lembrete concluído!', { concluido: !r.concluido }) }, r.concluido ? 'Reabrir' : 'Marcar como feito')]));
  if (entity === 'tarefas') return h('div', { class: 'card', style: { marginBottom: '16px' } }, [h('div', { class: 'row wrap' }, [
    h('div', { class: 'grow' }, [h('div', { class: 'muted small' }, `Última: ${fmt.dt(r.ultima_execucao)} · Próxima: ${fmt.dt(r.proxima_execucao)}`), h('div', { style: { color: r.ultimo_ok === 0 ? 'var(--red)' : 'inherit' } }, r.ultimo_resultado || 'Ainda não rodou.')]),
    h('button', { class: 'btn primary', onClick: async () => { try { const x = await post(`marketing/tarefas/${r.id}/rodar`); toast(x.resultado, x.ok ? 'ok' : 'err', 8000); reload(); } catch (e) { erro(e); } } }, [h(Icon, { n: 'play', s: 16 }), 'Rodar agora'])])]);
  if (entity === 'campanhas') return h(CampanhaActions, { camp: r, onChange: reload });
  return null;
}

const CobrarWa = defineComponent({
  props: { cobranca: Object, cliente: String },
  setup(p) {
    const tel = ref(null);
    onMounted(async () => { try { const c = await get(`clientes/${p.cobranca.cliente_id}`); tel.value = c.data.whatsapp || c.data.telefone; } catch { /* ok */ } });
    return () => tel.value ? h('a', { class: 'btn wa', target: '_blank', href: waLink(tel.value, msgCobranca({ ...p.cobranca, cliente: p.cliente })) }, [h(Icon, { n: 'whatsapp', s: 16 }), 'Cobrar no WhatsApp']) : null;
  },
});

// ---------------- Token do equipamento ----------------
const TokenPanel = defineComponent({
  props: { inst: Object }, emits: ['change'],
  setup(p, { emit }) {
    const novo = ref(null);
    const base = location.origin;
    async function gerar() {
      if (p.inst.tem_token && !(await confirmar('Gerar novo token?', 'O token atual para de funcionar na hora. Você vai precisar configurar o novo no equipamento.', { ok: 'Gerar novo', perigo: true }))) return;
      try { novo.value = (await post(`instalacoes/${p.inst.id}/token`)).token; emit('change'); } catch (e) { erro(e); }
    }
    async function revogar() {
      if (!(await confirmar('Bloquear este equipamento?', 'O token é apagado e o equipamento perde o acesso à API na hora.', { ok: 'Bloquear', perigo: true }))) return;
      try { await del(`instalacoes/${p.inst.id}/token`); novo.value = null; toast('Equipamento bloqueado.'); emit('change'); } catch (e) { erro(e); }
    }
    return () => h('div', { class: 'card', style: { marginBottom: '16px' } }, [
      h('h2', { class: 'sec' }, [h(Icon, { n: 'key' }), 'Acesso do equipamento à API']),
      novo.value ? h('div', { class: 'token-box stack' }, [
        h('div', { class: 'callout warn' }, [h(Icon, { n: 'alert' }), 'Copie agora: por segurança, este token não aparece de novo.']),
        h(CodeBlock, { code: novo.value }),
        h('div', { class: 'small muted' }, 'Configure no equipamento:'),
        h(CodeBlock, { code: `Endereço: ${base}\nToken: ${novo.value}\nCódigo da instalação: ${p.inst.codigo}` }),
      ]) : h('div', { class: 'row wrap' }, [
        h('div', { class: 'grow' }, p.inst.tem_token ? [h('b', null, '🔐 Token ativo'), h('div', { class: 'muted small mono' }, `${p.inst.token_prefixo}… · criado ${fmt.ago(p.inst.token_criado_em)}`)] : [h('b', null, 'Sem token'), h('div', { class: 'muted small' }, 'Gere um token para este equipamento consultar versões, baixar atualizações e enviar sinais.')]),
        can.write() ? h('button', { class: 'btn primary', onClick: gerar }, [h(Icon, { n: 'key', s: 16 }), p.inst.tem_token ? 'Gerar novo token' : 'Gerar token']) : null,
        p.inst.tem_token && can.write() ? h('button', { class: 'btn danger', onClick: revogar }, 'Bloquear') : null,
      ]),
    ]);
  },
});

// ---------------- Funil (kanban) ----------------
const FunilPage = defineComponent({
  setup() {
    const rows = ref([]); const drag = ref(null); const over = ref(null);
    async function load() { try { rows.value = (await get('funil')).data; } catch (e) { erro(e); } }
    onMounted(load);
    const etapas = computed(() => [...ent('clientes').fields.etapa_funil.options, { value: 'ganho', label: 'Ganho 🎉', color: '#22c55e' }, { value: 'perdido', label: 'Perdido', color: '#64748b' }]);
    function colOf(r) { return r.status === 'ativo' ? 'ganho' : r.status === 'perdido' ? 'perdido' : (r.etapa_funil || 'novo'); }
    async function mover(id, etapa) {
      const r = rows.value.find((x) => x.id === id); if (!r || colOf(r) === etapa) return;
      const old = { ...r };
      if (etapa === 'ganho') r.status = 'ativo'; else if (etapa === 'perdido') r.status = 'perdido'; else { r.status = 'lead'; r.etapa_funil = etapa; }
      try { await post(`funil/${id}`, { etapa }); if (etapa === 'ganho') toast(`🎉 ${r.nome_fantasia} virou cliente!`); } catch (e) { Object.assign(r, old); erro(e); }
    }
    return () => h('div', null, [
      h('div', { class: 'page-head' }, [h('div', null, [h('h1', null, 'Funil de vendas'), h('p', null, 'Arraste os cartões entre as etapas. "Ganho" transforma o lead em cliente ativo.')]), h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: '/clientes/novo?status=lead' }, [h(Icon, { n: 'plus', s: 16 }), 'Novo lead']))]),
      h('div', { class: 'kanban' }, etapas.value.map((et) => {
        const items = rows.value.filter((r) => colOf(r) === et.value);
        const soma = items.reduce((a, r) => a + Number(r.valor_estimado || 0), 0);
        return h('div', {
          class: 'col' + (over.value === et.value ? ' over' : ''), key: et.value,
          onDragover: (e) => { e.preventDefault(); over.value = et.value; }, onDragleave: () => { over.value = null; },
          onDrop: (e) => { e.preventDefault(); over.value = null; if (drag.value) mover(drag.value, et.value); drag.value = null; },
        }, [
          h('div', { class: 'col-head' }, [h('span', { style: { width: '10px', height: '10px', borderRadius: '50%', background: et.color, boxShadow: `0 0 10px ${et.color}` } }), h('b', null, et.label), h('span', { class: 'badge plain' }, items.length), h('span', { class: 'sum' }, soma ? fmt.money(soma) : '')]),
          h('div', { class: 'col-body' }, items.map((r) => h('div', {
            class: 'kcard' + (drag.value === r.id ? ' dragging' : ''), draggable: can.write(), key: r.id,
            onDragstart: () => { drag.value = r.id; }, onDragend: () => { drag.value = null; }, onClick: () => go(`/clientes/${r.id}`),
          }, [
            h('div', { class: 't' }, r.nome_fantasia), h('div', { class: 's' }, [r.cidade ? `${r.cidade}${r.uf ? '/' + r.uf : ''}` : '', r.num_suites ? ` · ${r.num_suites} suítes` : '']),
            h('div', { class: 'foot' }, [r.valor_estimado ? h('b', { style: { color: 'var(--orange2)' } }, fmt.money(r.valor_estimado)) : null, h('span', { class: 'muted', style: { marginLeft: 'auto' } }, fmt.ago(r.ultimo_contato)),
              r.whatsapp ? h('a', { class: 'btn sm icon wa', href: waLink(r.whatsapp), target: '_blank', onClick: (e) => e.stopPropagation() }, h(Icon, { n: 'whatsapp', s: 14 })) : null]),
            h('select', { class: 'input', style: { height: '34px', marginTop: '8px', fontSize: '13px', display: window.innerWidth < 980 ? 'block' : 'none' }, value: colOf(r), onClick: (e) => e.stopPropagation(), onChange: (e) => mover(r.id, e.target.value) }, etapas.value.map((o) => h('option', { value: o.value }, 'Mover para: ' + o.label))),
          ]))),
        ]);
      })),
    ]);
  },
});

// ---------------- Agenda ----------------
const AgendaPage = defineComponent({
  setup() {
    const d = ref(null);
    async function load() { try { d.value = await get('agenda'); } catch (e) { erro(e); } }
    onMounted(load);
    async function concluir(l) { try { await post(`agenda/${l.id}/concluir`, { concluido: !l.concluido }); l.concluido = !l.concluido; toast(l.concluido ? 'Feito! ✅' : 'Reaberto.'); } catch (e) { erro(e); } }
    function grupo(dt) {
      const d0 = toDate(dt); const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
      const diff = Math.floor((new Date(d0.getFullYear(), d0.getMonth(), d0.getDate()) - hoje) / 864e5);
      return diff < 0 ? 'Atrasados' : diff === 0 ? 'Hoje' : diff === 1 ? 'Amanhã' : diff < 7 ? 'Esta semana' : 'Mais adiante';
    }
    return () => {
      if (!d.value) return h('div', { class: 'skeleton', style: { height: '400px' } });
      const pend = d.value.data.filter((l) => !l.concluido);
      const grupos = {}; for (const l of pend) (grupos[grupo(l.lembrete)] ||= []).push(l);
      const ordem = ['Atrasados', 'Hoje', 'Amanhã', 'Esta semana', 'Mais adiante'];
      return h('div', null, [
        h('div', { class: 'page-head' }, [h('div', null, [h('h1', null, 'Agenda'), h('p', null, 'Lembretes de contatos, cobranças a vencer, licenças e prazos de chamados.')]), h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: '/historico/novo' }, [h(Icon, { n: 'plus', s: 16 }), 'Novo lembrete']))]),
        h('div', { class: 'grid g3' }, [
          h('div', { class: 'span2 stack' }, [
            !pend.length ? h('div', { class: 'card empty' }, [h(Icon, { n: 'check', s: 40 }), h('b', null, 'Tudo em dia!'), 'Nenhum lembrete pendente.']) : null,
            ...ordem.filter((g) => grupos[g]).map((g) => h('div', { class: 'card pad0' }, [
              h('div', { class: 'card-head' }, [h('h3', { style: { color: g === 'Atrasados' ? 'var(--red)' : null } }, g), h('span', { class: 'badge plain' }, grupos[g].length)]),
              h('div', { class: 'list' }, grupos[g].map((l) => h('div', { class: 'li' }, [
                h('button', { class: 'btn sm icon', title: 'Marcar como feito', onClick: () => concluir(l) }, h(Icon, { n: 'check', s: 15 })),
                h('a', { class: 'grow', href: `/clientes/${l.cliente_id}`, style: { color: 'inherit' } }, [h('div', { class: 't' }, l.proximo_passo || l.resumo), h('div', { class: 's' }, `${l.cliente} · ${fmt.dt(l.lembrete)}${l.usuario ? ' · ' + l.usuario : ''}`)]),
                l.whatsapp ? h('a', { class: 'btn sm icon wa', href: waLink(l.whatsapp), target: '_blank' }, h(Icon, { n: 'whatsapp', s: 15 })) : null,
                l.telefone ? h('a', { class: 'btn sm icon', href: `tel:${String(l.telefone).replace(/\D/g, '')}` }, h(Icon, { n: 'phone', s: 15 })) : null,
              ]))),
            ])),
          ]),
          h('div', { class: 'stack' }, [
            Lista('Cobranças (15 dias)', 'money', '/cobrancas', d.value.cobrancas, (c) => h('a', { class: 'li', href: `/cobrancas/${c.id}` }, [h('div', { class: 'grow' }, [h('div', { class: 't' }, c.cliente), h('div', { class: 's' }, fmt.date(c.vencimento))]), h('b', { style: { color: c.status === 'atrasado' ? 'var(--red)' : null } }, fmt.money(c.valor))]), 'Nada a vencer.'),
            Lista('Licenças (30 dias)', 'key', '/licencas', d.value.licencas, (l) => h('a', { class: 'li', href: `/licencas/${l.id}` }, [h('div', { class: 'grow' }, [h('div', { class: 't' }, l.cliente), h('div', { class: 's mono' }, l.chave)]), h('span', { class: 'small' }, fmt.date(l.vencimento))]), 'Nada vencendo.'),
            Lista('Prazos de chamados', 'lifebuoy', '/chamados', d.value.chamados, (c) => h('a', { class: 'li', href: `/chamados/${c.id}` }, [h('div', { class: 'grow' }, [h('div', { class: 't' }, c.titulo), h('div', { class: 's' }, c.cliente)]), h('span', { class: 'small', style: { color: c.prazo < hojeISO() ? 'var(--red)' : null } }, fmt.date(c.prazo))]), 'Sem prazos.'),
          ]),
        ]),
      ]);
    };
  },
});

// ---------------- Arquivos ----------------
const ArquivosPage = defineComponent({
  setup() {
    const pastas = ref([]), files = ref([]), pasta = ref(store.route.query.pasta || ''), q = ref(''), sel = ref(null), total = ref(0);
    async function load() {
      try {
        pastas.value = (await get('arquivos/pastas')).data;
        const params = new URLSearchParams({ limit: 120 }); if (pasta.value === 'meus') params.set('meus', 1); else if (pasta.value) params.set('pasta', pasta.value); if (q.value) params.set('q', q.value);
        const d = await get(`arquivos?${params}`); files.value = d.data; total.value = d.total;
      } catch (e) { erro(e); }
    }
    onMounted(load); watch(pasta, () => { setQuery({ pasta: pasta.value }); load(); });
    let t; watch(q, () => { clearTimeout(t); t = setTimeout(load, 250); });
    const isImg = (f) => /^image\//.test(f.mime || '');
    async function apagar(f) {
      if (!(await confirmar('Apagar arquivo?', f.nome, { ok: 'Apagar', perigo: true }))) return;
      try { await del(`arquivos/${f.id}`); } catch (e) { if (e.status === 409 && await confirmar('Arquivo em uso', e.message, { ok: 'Apagar mesmo assim', perigo: true })) await del(`arquivos/${f.id}?forcar=1`); else if (e.status !== 409) return erro(e); }
      sel.value = null; toast('Arquivo apagado.'); load();
    }
    const icons = { atualizacoes: 'download', chamados: 'lifebuoy', comprovantes: 'money', contratos: 'file', marketing: 'image', geral: 'folder' };
    return () => h('div', null, [
      h('div', { class: 'page-head' }, [h('div', null, [h('h1', null, 'Arquivos'), h('p', null, 'Pacotes de atualização, contratos, comprovantes, anexos e imagens. Envios de até 2 GB.')])]),
      h('div', { class: 'grid g3', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', marginBottom: '16px' } }, [
        h('div', { class: 'folder' + (!pasta.value ? ' on' : ''), onClick: () => { pasta.value = ''; } }, [h('div', { class: 'fi' }, h(Icon, { n: 'layers' })), h('div', null, [h('b', null, 'Todos os arquivos'), h('div', { class: 'tiny muted' }, `${pastas.value.reduce((a, x) => a + x.n, 0)} itens`)])]),
        ...pastas.value.map((p) => h('div', { class: 'folder' + (pasta.value === p.chave ? ' on' : ''), onClick: () => { pasta.value = p.chave; } }, [h('div', { class: 'fi' }, h(Icon, { n: icons[p.chave] || 'folder' })), h('div', null, [h('b', null, p.nome), h('div', { class: 'tiny muted' }, `${p.n} itens · ${fmt.bytes(p.bytes)}`)])])),
        h('div', { class: 'folder' + (pasta.value === 'meus' ? ' on' : ''), onClick: () => { pasta.value = 'meus'; } }, [h('div', { class: 'fi' }, h(Icon, { n: 'user' })), h('div', null, [h('b', null, 'Meus arquivos'), h('div', { class: 'tiny muted' }, 'enviados por mim')])]),
      ]),
      h('div', { class: 'card', style: { marginBottom: '16px' } }, [
        h('div', { class: 'row wrap', style: { marginBottom: can.write() ? '14px' : 0 } }, [h('div', { class: 'search grow', style: { maxWidth: '420px' } }, [h(Icon, { n: 'search', s: 16 }), h('input', { value: q.value, placeholder: 'Buscar pelo nome…', onInput: (e) => { q.value = e.target.value; } })]), h('span', { class: 'muted small' }, `${total.value} arquivo(s)`)]),
        can.write() ? h(FileField, { modelValue: null, folder: ['meus', ''].includes(pasta.value) ? 'geral' : pasta.value, onUploaded: load }) : null,
      ]),
      files.value.length ? h('div', { class: 'thumbs' }, files.value.map((f) => h('div', { class: 'thumb', onClick: () => { sel.value = f; } }, [
        h('div', { class: 'pv' }, isImg(f) ? h('img', { src: `/assets/${f.id}`, loading: 'lazy' }) : h(Icon, { n: f.pasta === 'atualizacoes' ? 'box' : 'file', s: 34, w: 1.5 })),
        h('div', { class: 'nm' }, [h('b', null, f.nome), h('span', { class: 'tiny muted' }, `${fmt.bytes(f.tamanho)} · ${fmt.ago(f.created_at)}`)]),
      ]))) : h('div', { class: 'card empty' }, [h(Icon, { n: 'folder', s: 40, w: 1.5 }), h('b', null, 'Nenhum arquivo aqui')]),
      sel.value ? h(Modal, { title: sel.value.nome, wide: true, onClose: () => { sel.value = null; } }, {
        default: () => h('div', { class: 'stack' }, [
          isImg(sel.value) ? h('img', { src: `/assets/${sel.value.id}`, style: { width: '100%', borderRadius: '12px' } }) : null,
          h('div', { class: 'grid g2' }, [['Tamanho', fmt.bytes(sel.value.tamanho)], ['Pasta', pastas.value.find((x) => x.chave === sel.value.pasta)?.nome], ['Enviado', `${fmt.dt(sel.value.created_at)} por ${sel.value.enviado_por_nome || '—'}`], ['Tipo', sel.value.mime]].map(([l, v]) => h('div', null, [h('div', { class: 'tiny muted' }, l), h('div', null, v)]))),
          sel.value.sha256 ? h('div', null, [h('div', { class: 'tiny muted' }, 'SHA-256'), h(CodeBlock, { code: sel.value.sha256 })]) : null,
        ]),
        foot: () => [can.del() ? h('button', { class: 'btn danger', style: { marginRight: 'auto' }, onClick: () => apagar(sel.value) }, [h(Icon, { n: 'trash', s: 16 }), 'Apagar']) : null, h('a', { class: 'btn', href: `/assets/${sel.value.id}`, target: '_blank' }, 'Abrir'), h('a', { class: 'btn primary', href: `/assets/${sel.value.id}?download` }, [h(Icon, { n: 'download', s: 16 }), 'Baixar'])],
      }) : null,
    ]);
  },
});

// ---------------- Atividade ----------------
const AtividadePage = defineComponent({
  setup() {
    const rows = ref([]), page = ref(1), total = ref(0);
    async function load() { try { const d = await get(`atividades?page=${page.value}&limit=50`); rows.value = d.data; total.value = d.total; } catch (e) { erro(e); } }
    onMounted(load); watch(page, load);
    const ic = { criar: 'plus', editar: 'edit', apagar: 'trash', login: 'user', login_falhou: 'alert', exportar: 'download', importar: 'upload', token: 'key', enviar: 'upload', config: 'settings', publicar: 'send', aprovar: 'check', ia: 'sparkles', backup: 'shield' };
    return () => h('div', null, [
      h('div', { class: 'page-head' }, [h('div', null, [h('h1', null, 'Registro de atividades'), h('p', null, 'Quem fez o quê e quando.')])]),
      h('div', { class: 'card pad0' }, [h('div', { class: 'list' }, rows.value.map((a) => h(a.entidade && a.entidade_id && ROTA_ENTIDADE[a.entidade] ? 'a' : 'div', { class: 'li', href: a.entidade && a.entidade_id && ROTA_ENTIDADE[a.entidade] ? linkTo(a.entidade, a.entidade_id) : null }, [
        h('span', { class: 'kpi', style: { padding: 0, border: 0, background: 'none', '--c': a.acao === 'apagar' || a.acao === 'login_falhou' ? '#ef4444' : '#ff7a1a' } }, h('span', { class: 'ico' }, h(Icon, { n: ic[a.acao] || 'activity', s: 16 }))),
        h('div', { class: 'grow' }, [h('div', { class: 't' }, a.resumo || a.acao), h('div', { class: 's' }, `${a.usuario_nome || 'Sistema'} · ${a.ip || ''}`)]),
        h('span', { class: 'muted small nowrap', title: fmt.dt(a.created_at) }, fmt.ago(a.created_at)),
      ]))),
      h('div', { class: 'pager' }, [`${total.value} registros`, h('span', { style: { marginLeft: 'auto' } }), h('button', { class: 'btn sm', disabled: page.value <= 1, onClick: () => page.value-- }, h(Icon, { n: 'left', s: 16 })), h('button', { class: 'btn sm', disabled: page.value * 50 >= total.value, onClick: () => page.value++ }, h(Icon, { n: 'right', s: 16 }))])]),
    ]);
  },
});

// ---------------- Configurações / Minha conta ----------------
const ConfigPage = defineComponent({
  setup() {
    const tab = ref(store.route.query.aba || 'conta');
    const cfg = reactive({}); const perfil = reactive({ nome: store.user?.nome }); const senha = reactive({ atual: '', nova: '', nova2: '' });
    const tfa = ref(null); const codigo = ref(''); const off = ref('');
    onMounted(async () => { try { Object.assign(cfg, (await get('config')).data); } catch { /* ok */ } });
    async function salvarCfg() { try { await post('config', cfg); store.config = { ...cfg }; toast('Configurações salvas.'); } catch (e) { erro(e); } }
    async function salvarPerfil() { try { await post('auth/perfil', perfil); store.user.nome = perfil.nome; toast('Perfil atualizado.'); } catch (e) { erro(e); } }
    async function trocarSenha() {
      if (senha.nova !== senha.nova2) return toast('As senhas novas não conferem.', 'err');
      try { await post('auth/senha', senha); toast('Senha alterada!'); senha.atual = senha.nova = senha.nova2 = ''; } catch (e) { erro(e); }
    }
    async function iniciar2fa() { try { tfa.value = await post('auth/2fa/iniciar'); } catch (e) { erro(e); } }
    async function ativar2fa() { try { await post('auth/2fa/ativar', { codigo: codigo.value }); store.user.totp_ativo = true; tfa.value = null; toast('Verificação em duas etapas ativada! 🔐'); } catch (e) { erro(e); } }
    async function desativar2fa() { try { await post('auth/2fa/desativar', { senha: off.value }); store.user.totp_ativo = false; off.value = ''; toast('2FA desativado.'); } catch (e) { erro(e); } }
    const inp = (obj, k, label, extra = {}) => h('div', { class: 'field' + (extra.full ? ' full' : '') }, [h('label', null, label), h(extra.area ? 'textarea' : 'input', { value: obj[k] ?? '', type: extra.type || 'text', rows: extra.area ? 4 : null, onInput: (e) => { obj[k] = e.target.value; } }), extra.help ? h('div', { class: 'help' }, extra.help) : null]);
    const abas = [['conta', 'Minha conta'], ['seguranca', 'Senha e 2FA'], ['alertas', 'Alertas'], ...(can.admin() ? [['empresa', 'Empresa'], ['chamados', 'Chamados'], ['asaas', 'Asaas'], ['backup', 'Backup']] : []), ['aparencia', 'Aparência']];
    return () => h('div', null, [
      h('div', { class: 'page-head' }, [h('div', null, [h('h1', null, 'Configurações')])]),
      h('div', { class: 'tabs' }, abas.map(([k, l]) => h('button', { class: tab.value === k ? 'on' : '', onClick: () => { tab.value = k; setQuery({ aba: k }); } }, l))),
      tab.value === 'conta' ? h('div', { class: 'card', style: { maxWidth: '640px' } }, [h('div', { class: 'form' }, [inp(perfil, 'nome', 'Seu nome', { full: true }), h('div', { class: 'field full' }, [h('label', null, 'E-mail'), h('input', { value: store.user.email, readonly: true })])]), h('div', { style: { marginTop: '16px' } }, h('button', { class: 'btn primary', onClick: salvarPerfil }, 'Salvar'))]) : null,
      tab.value === 'seguranca' ? h('div', { class: 'grid g2' }, [
        h('div', { class: 'card' }, [h('h2', { class: 'sec' }, [h(Icon, { n: 'lock' }), 'Trocar senha']), h('div', { class: 'form' }, [inp(senha, 'atual', 'Senha atual', { type: 'password', full: true }), inp(senha, 'nova', 'Nova senha', { type: 'password', help: 'Mínimo 8 caracteres.' }), inp(senha, 'nova2', 'Repita a nova senha', { type: 'password' })]), h('div', { style: { marginTop: '16px' } }, h('button', { class: 'btn primary', onClick: trocarSenha }, 'Trocar senha'))]),
        h('div', { class: 'card stack' }, [h('h2', { class: 'sec' }, [h(Icon, { n: 'shield' }), 'Verificação em duas etapas (2FA)']),
          store.user.totp_ativo ? [h('div', { class: 'callout ok' }, [h(Icon, { n: 'check' }), 'Ativada. Ao entrar, o painel pede o código do seu aplicativo.']), h('div', { class: 'field' }, [h('label', null, 'Para desativar, digite sua senha'), h('input', { type: 'password', value: off.value, onInput: (e) => { off.value = e.target.value; } })]), h('button', { class: 'btn danger', onClick: desativar2fa }, 'Desativar 2FA')]
            : tfa.value ? [h('p', { class: 'muted' }, '1. Abra o Google Authenticator (ou similar) e leia o QR Code. 2. Digite o código de 6 dígitos.'), h('img', { src: tfa.value.qr, style: { width: '200px', borderRadius: '12px', background: '#fff', padding: '8px' } }), h('div', { class: 'tiny muted mono' }, 'Chave manual: ' + tfa.value.segredo), h('div', { class: 'field' }, [h('label', null, 'Código'), h('input', { inputmode: 'numeric', maxlength: 6, value: codigo.value, onInput: (e) => { codigo.value = e.target.value; } })]), h('button', { class: 'btn primary', onClick: ativar2fa }, 'Ativar')]
              : [h('p', { class: 'muted' }, 'Protege sua conta mesmo que alguém descubra sua senha.'), h('button', { class: 'btn primary', onClick: iniciar2fa }, [h(Icon, { n: 'shield', s: 16 }), 'Ativar 2FA'])]]),
      ]) : null,
      tab.value === 'alertas' ? h(AlertasMeus) : null,
      tab.value === 'asaas' ? h(AsaasConfig) : null,
      tab.value === 'chamados' ? h(ChamadosConfig) : null,
      tab.value === 'empresa' ? h('div', { class: 'card', style: { maxWidth: '820px' } }, [h('div', { class: 'form' }, [
        inp(cfg, 'empresa_nome', 'Nome da empresa'), inp(cfg, 'empresa_cnpj', 'CNPJ'), inp(cfg, 'empresa_whatsapp', 'WhatsApp'), inp(cfg, 'empresa_email', 'E-mail'),
        inp(cfg, 'empresa_pix', 'Chave Pix (vai junto na mensagem de cobrança)', { full: true }),
        inp(cfg, 'msg_cobranca', 'Mensagem de cobrança no WhatsApp', { full: true, area: true, help: 'Use {cliente}, {competencia}, {valor}, {vencimento} e {link} (link da fatura do Asaas, quando houver).' }),
      ]), h('div', { style: { marginTop: '16px' } }, h('button', { class: 'btn primary', onClick: salvarCfg }, 'Salvar'))]) : null,
      tab.value === 'backup' ? h('div', { class: 'card stack', style: { maxWidth: '720px' } }, [
        h('h2', { class: 'sec' }, [h(Icon, { n: 'shield' }), 'Cópia de segurança']),
        h('p', { class: 'muted' }, 'Baixe agora uma cópia completa de todos os cadastros em JSON (sem senhas nem tokens). Os arquivos enviados ficam na hospedagem e entram no backup do hPanel.'),
        h('a', { class: 'btn primary', href: '/api/backup' }, [h(Icon, { n: 'download', s: 16 }), 'Baixar backup completo']),
        h('div', { class: 'callout' }, [h(Icon, { n: 'info' }), 'Recomendado: manter os backups automáticos ligados no hPanel → Sites → painel.neonsistemas.com → Backups.']),
      ]) : null,
      tab.value === 'aparencia' ? h('div', { class: 'card', style: { maxWidth: '520px' } }, [h('h2', { class: 'sec' }, 'Tema'), h('div', { class: 'seg' }, [['escuro', 'Escuro', 'moon'], ['claro', 'Claro', 'sun']].map(([k, l, ic]) => h('button', { class: store.tema === k ? 'on' : '', onClick: () => setTema(k) }, [h(Icon, { n: ic, s: 15 }), l])))]) : null,
    ]);
  },
});
function setTema(t) { store.tema = t; localStorage.setItem('neon_tema', t); document.documentElement.dataset.tema = t; }

// ---------------- Documentação da API ----------------
const ApiPage = defineComponent({
  setup() {
    const base = location.origin;
    const sec = (t, ...c) => h('div', { class: 'card stack' }, [h('h2', { class: 'sec' }, t), ...c]);
    return () => h('div', { class: 'stack', style: { maxWidth: '980px' } }, [
      h('div', { class: 'page-head' }, [h('div', null, [h('h1', null, 'API dos equipamentos'), h('p', null, 'Como os sistemas instalados consultam versões, baixam atualizações e avisam que estão online.')])]),
      h('div', { class: 'callout ok' }, [h(Icon, { n: 'check' }), h('div', null, ['As mesmas chamadas do painel antigo continuam funcionando: troque só o ', h('b', null, 'endereço'), ' e o ', h('b', null, 'token'), '. O token é gerado em ', h('a', { href: '/instalacoes' }, 'Instalações → abrir → Gerar token'), '.'])]),
      sec('1) Qual é a versão mais nova?', h(CodeBlock, { code: `GET ${base}/items/versoes?filter[produto][codigo][_eq]=neon-motel&filter[canal][_eq]=estavel&sort=-date_created&limit=1\nAuthorization: Bearer SEU_TOKEN` }),
        h('div', { class: 'small muted' }, 'Ou, mais simples (já diz se há atualização):'), h(CodeBlock, { code: `GET ${base}/api/v1/equipamento/versao?atual=1.0.0\nAuthorization: Bearer SEU_TOKEN` })),
      sec('2) Baixar o arquivo', h(CodeBlock, { code: `GET ${base}/assets/ID_DO_ARQUIVO?download\nAuthorization: Bearer SEU_TOKEN` }), h('div', { class: 'small muted' }, 'Aceita download retomável (cabeçalho Range) e devolve X-Checksum-SHA256.')),
      sec('3) Conferir a licença', h(CodeBlock, { code: `GET ${base}/items/licencas\nAuthorization: Bearer SEU_TOKEN` })),
      sec('4) Enviar sinal (ao ligar, após atualizar e a cada hora)', h(CodeBlock, { code: `POST ${base}/items/checkins\nAuthorization: Bearer SEU_TOKEN\nContent-Type: application/json\n\n{"codigo_instalacao":"MOTEL-PARAISO-01","versao":"1.4.0","evento":"heartbeat","mensagem":"OK"}` }), h('div', { class: 'small muted' }, 'Eventos: heartbeat (online), inicio, atualizado, erro. Atualiza sozinho o "último sinal" e a "versão instalada".')),
      sec('Exemplo completo — Windows (PowerShell)', h(CodeBlock, { code: `$Base = "${base}"\n$Token = "COLE_AQUI_O_TOKEN"\n$Atual = "1.0.0"\n$H = @{ Authorization = "Bearer $Token" }\n\n$r = Invoke-RestMethod -Uri "$Base/api/v1/equipamento/versao?atual=$Atual" -Headers $H\nif ($r.atualizacao_disponivel) {\n  $v = $r.versao\n  $dest = Join-Path $env:TEMP $v.arquivo.filename_download\n  Invoke-WebRequest -Uri "$Base/assets/$($v.arquivo.id)?download" -Headers $H -OutFile $dest\n  if ($v.sha256 -and (Get-FileHash $dest -Algorithm SHA256).Hash -ne $v.sha256.ToUpper()) { throw "Arquivo corrompido" }\n  # ... aplicar a atualização ...\n  $body = @{ versao=$v.numero; evento="atualizado" } | ConvertTo-Json\n  Invoke-RestMethod -Method Post -Uri "$Base/api/v1/equipamento/sinal" -Headers $H -ContentType "application/json" -Body $body\n}` })),
      sec('Exemplo — Linux (bash + curl)', h(CodeBlock, { code: `BASE="${base}"; TOKEN="COLE_AQUI_O_TOKEN"\ncurl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/equipamento/versao?atual=1.0.0"\ncurl -s -H "Authorization: Bearer $TOKEN" -o pacote.zip "$BASE/assets/ID_DO_ARQUIVO?download"\ncurl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\\n  -d '{"versao":"1.4.0","evento":"heartbeat"}' "$BASE/api/v1/equipamento/sinal"` })),
      sec('Problemas comuns', h('ul', { class: 'muted', style: { margin: 0, paddingLeft: '18px' } }, [h('li', null, '401: token errado ou bloqueado.'), h('li', null, '403: instalação suspensa/cancelada ou arquivo não liberado.'), h('li', null, 'Versão não aparece: confira se está Publicada, no canal certo e com o código do produto certo.')])),
    ]);
  },
});
