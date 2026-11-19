/* Neon Gestão — estrutura do aplicativo e rotas */

async function carregarMeta() {
  const m = await get('meta'); store.meta = m;
  try { store.config = (await get('config')).data; } catch { /* ok */ }
}

const MENU = [
  { t: 'Principal', items: [['/', 'home', 'Início'], ['/clientes', 'users', 'Clientes'], ['/funil', 'funnel', 'Funil de vendas'], ['/agenda', 'calendar', 'Agenda', 'lembretes'], ['/relatorios', 'chart', 'Relatórios']] },
  { t: 'Operação', items: [['/instalacoes', 'server', 'Instalações'], ['/licencas', 'key', 'Licenças e contratos'], ['/atualizacoes', 'download', 'Atualizações'], ['/chamados', 'lifebuoy', 'Chamados', 'chamados'], ['/sinais', 'signal', 'Sinais dos equipamentos']] },
  { t: 'Financeiro', items: [['/cobrancas', 'money', 'Cobranças'], ['/historico', 'chat', 'Histórico de contatos']] },
  { t: 'Marketing', items: [['/marketing', 'megaphone', 'Visão geral'], ['/marketing/posts', 'image', 'Posts'], ['/marketing/calendario', 'calendar', 'Calendário'], ['/marketing/campanhas', 'star', 'Campanhas'], ['/depoimentos', 'sparkles', 'Depoimentos do site'], ['/marketing/integracoes', 'plug', 'Integrações e IAs']] },
  { t: 'Sistema', items: [['/arquivos', 'folder', 'Arquivos'], ['/produtos', 'box', 'Produtos'], ['/equipe', 'user', 'Equipe', null, 'admin'], ['/marketing/tarefas', 'clock', 'Robôs e tarefas', null, 'admin'], ['/atividade', 'activity', 'Atividade', null, 'admin'], ['/api', 'code', 'API dos equipamentos'], ['/configuracoes', 'settings', 'Configurações'], ['/ajuda', 'help', 'Ajuda']] },
];

// Ajuda: abre o manual já na parte que explica a tela atual
const AJUDA_TELA = {
  '': 'inicio', clientes: 'clientes', funil: 'funil', agenda: 'agenda', relatorios: 'relatorios', instalacoes: 'instalacoes', licencas: 'licencas',
  atualizacoes: 'atualizacoes', chamados: 'chamados', sinais: 'sinais', cobrancas: 'cobrancas', historico: 'contatos', produtos: 'produtos',
  arquivos: 'arquivos', equipe: 'equipe', atividade: 'atividade', api: 'api', depoimentos: 'depoimentos', marketing: 'mkt-visao',
  'marketing/posts': 'post-editor', 'marketing/calendario': 'calendario', 'marketing/campanhas': 'campanhas', 'marketing/tarefas': 'robos', 'marketing/integracoes': 'integracoes',
};
const AJUDA_ABA = {
  configuracoes: { conta: 'cfg-conta', seguranca: 'cfg-seguranca', alertas: 'alertas', empresa: 'cfg-empresa', chamados: 'cfg-chamados', asaas: 'asaas', backup: 'cfg-backup', aparencia: 'cfg-aparencia' },
  'marketing/integracoes': { ia: 'ias', redes: 'redes', telegram: 'telegram-robo', prefs: 'prefs-mkt', robos: 'robos' },
};
function ajudaLink() {
  const partes = store.route.path.split('/').filter(Boolean);
  const dois = partes.slice(0, 2).join('/');
  const chave = AJUDA_TELA[dois] || AJUDA_ABA[dois] ? dois : (partes[0] || '');
  const aba = store.route.query.aba;
  const ancora = (AJUDA_ABA[chave] && AJUDA_ABA[chave][aba || (chave === 'configuracoes' ? 'conta' : 'ia')]) || AJUDA_TELA[chave] || (chave === 'configuracoes' ? 'configuracoes' : '');
  if (partes[0] === 'chamados' && partes[1]) return '/ajuda#conversa';
  if (partes[0] === 'cobrancas' && partes[1] && store.asaas?.ativo) return '/ajuda#asaas';
  return '/ajuda' + (ancora ? '#' + ancora : '');
}

function ativo(href) {
  const p = store.route.path;
  if (href === '/') return p === '/';
  if (href === '/marketing') return p === '/marketing';
  return p === href || p.startsWith(href + '/');
}

// Resolve a rota atual para um componente
function resolver() {
  const p = store.route.path;
  const parts = p.split('/').filter(Boolean);
  const simples = { '': DashboardPage, relatorios: RelatoriosPage, funil: FunilPage, agenda: AgendaPage, arquivos: ArquivosPage, atividade: AtividadePage, configuracoes: ConfigPage, api: ApiPage };
  if (parts.length === 0) return [DashboardPage, {}];
  if (parts[0] === 'marketing') {
    if (parts.length === 1) return [MarketingHome, {}];
    if (parts[1] === 'posts') return parts[2] ? [PostEditor, { id: parts[2], key: parts[2] }] : [PostsPage, {}];
    if (parts[1] === 'calendario') return [CalendarioPage, {}];
    if (parts[1] === 'integracoes') return [IntegracoesPage, {}];
    if (parts[1] === 'campanhas') return parts[2] ? [DetailPage, { entity: 'campanhas', id: parts[2], key: 'c' + parts[2] }] : [ListPage, { entity: 'campanhas', sub: 'Agrupe posts por objetivo e período.', key: 'lc' }];
    if (parts[1] === 'tarefas') return parts[2] ? [DetailPage, { entity: 'tarefas', id: parts[2], key: 't' + parts[2] }] : [ListPage, { entity: 'tarefas', sub: 'Robôs que rodam sozinhos nos dias e horários definidos (horário de Brasília).', key: 'lt' }];
  }
  if (simples[parts[0]] && parts.length === 1) return [simples[parts[0]], {}];
  const entity = ENTIDADE_ROTA[parts[0]];
  if (entity) return parts[1] ? [DetailPage, { entity, id: parts[1], key: entity + parts[1] }] : [ListPage, { entity, sub: SUBTITULOS[entity], key: 'l' + entity }];
  return [{ render: () => h('div', { class: 'card empty' }, [h(Icon, { n: 'alert', s: 40 }), h('b', null, 'Página não encontrada'), h('a', { href: '/' }, 'Voltar ao início')]) }, {}];
}

// ---------------- Busca global ----------------
const BuscaGlobal = defineComponent({
  setup() {
    const q = ref(''), res = ref([]), open = ref(false), sel = ref(0), inp = ref(null); let t;
    watch(q, () => { clearTimeout(t); t = setTimeout(async () => { if (q.value.length < 2) { res.value = []; return; } try { res.value = (await get(`busca?q=${encodeURIComponent(q.value)}`)).data; sel.value = 0; open.value = true; } catch { /* ok */ } }, 200); });
    const atalho = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inp.value?.focus(); } };
    onMounted(() => document.addEventListener('keydown', atalho)); onBeforeUnmount(() => document.removeEventListener('keydown', atalho));
    function abrir(r) { open.value = false; q.value = ''; go(linkTo(r.entity, r.id)); }
    const nomes = { clientes: 'Cliente', instalacoes: 'Instalação', licencas: 'Licença', chamados: 'Chamado', produtos: 'Produto' };
    return () => h('div', { class: 'search' }, [
      h(Icon, { n: 'search', s: 17 }),
      h('input', { ref: inp, value: q.value, placeholder: 'Buscar clientes, instalações, chamados…', onInput: (e) => { q.value = e.target.value; }, onFocus: () => { open.value = true; }, onBlur: () => setTimeout(() => { open.value = false; }, 180),
        onKeydown: (e) => { if (e.key === 'ArrowDown') { sel.value = Math.min(sel.value + 1, res.value.length - 1); e.preventDefault(); } if (e.key === 'ArrowUp') { sel.value = Math.max(0, sel.value - 1); e.preventDefault(); } if (e.key === 'Enter' && res.value[sel.value]) abrir(res.value[sel.value]); if (e.key === 'Escape') inp.value.blur(); } }),
      h('kbd', { class: 'hide-m' }, 'Ctrl K'),
      open.value && res.value.length ? h('div', { class: 'search-results' }, res.value.map((r, i) => h('a', { class: i === sel.value ? 'sel' : '', href: linkTo(r.entity, r.id), onMousedown: (e) => { e.preventDefault(); abrir(r); } }, [h(Icon, { n: ent(r.entity)?.icon || 'file', s: 16 }), h('div', { class: 'grow' }, [h('div', null, r.titulo), h('small', null, `${nomes[r.entity] || ''} ${r.sub ? '· ' + r.sub : ''}`)])]))) : null,
    ]);
  },
});

// ---------------- Layout ----------------
const Layout = defineComponent({
  setup() {
    const buscaMobile = ref(false);
    async function sair() { try { await post('auth/logout'); } catch { /* ok */ } store.user = null; go('/entrar'); }
    const fabDestino = computed(() => {
      const p = store.route.path;
      if (p.startsWith('/marketing')) return '/marketing/posts?criar=1';
      const ent_ = ENTIDADE_ROTA[p.split('/')[1]];
      if (ent_ && !ent(ent_)?.readonly && p.split('/').length === 2) return `/${p.split('/')[1]}/novo`;
      return '/clientes/novo';
    });
    return () => {
      const [Comp, props] = resolver();
      const u = store.user;
      return h('div', { class: 'app' }, [
        h('div', { class: 'drawer-bg' + (store.menuAberto ? ' open' : ''), onClick: () => { store.menuAberto = false; } }),
        h('aside', { class: 'side' + (store.menuAberto ? ' open' : '') }, [
          h('a', { class: 'brand', href: '/' }, [h('img', { src: '/img/logo.png', alt: 'Neon Sistemas' })]),
          h('nav', { class: 'nav' }, MENU.map((g) => [h('h6', null, g.t), ...g.items.filter((it) => it[4] !== 'admin' || can.admin()).map(([href, ic, label, cnt]) => h('a', { href: href === '/ajuda' ? ajudaLink() : href, target: href === '/ajuda' ? '_blank' : null, rel: href === '/ajuda' ? 'noopener' : null, class: ativo(href) ? 'on' : '' }, [h(Icon, { n: ic }), label, cnt && store.contadores[cnt] ? h('span', { class: 'count' }, store.contadores[cnt]) : null]))])),
          h('div', { class: 'side-foot' }, h('div', { class: 'me', onClick: () => go('/configuracoes') }, [h('div', { class: 'avatar' }, fmt.initials(u.nome)), h('div', { class: 'grow' }, [h('b', null, u.nome), h('span', null, optOf(ent('usuarios').fields.funcao, u.funcao)?.label)]), h('button', { class: 'btn ghost sm icon', title: 'Sair', onClick: (e) => { e.stopPropagation(); sair(); } }, h(Icon, { n: 'logout', s: 16 }))])),
        ]),
        h('div', { class: 'main' }, [
          h('header', { class: 'top' }, [
            h('button', { class: 'icon-btn show-m', style: { display: window.innerWidth <= 980 ? 'grid' : 'none' }, onClick: () => { store.menuAberto = true; } }, h(Icon, { n: 'menu' })),
            h('img', { class: 'mobile-logo', src: '/img/logo.png', alt: '', style: { display: buscaMobile.value ? 'none' : null } }),
            h('div', { class: window.innerWidth <= 980 && !buscaMobile.value ? 'search collapsed' : 'grow', style: { maxWidth: '520px' } }, h(BuscaGlobal)),
            h('div', { class: 'top-actions' }, [
              window.innerWidth <= 980 ? h('button', { class: 'icon-btn', onClick: () => { buscaMobile.value = !buscaMobile.value; } }, h(Icon, { n: buscaMobile.value ? 'x' : 'search' })) : null,
              h('a', { class: 'icon-btn', href: ajudaLink(), target: '_blank', rel: 'noopener', title: 'Ajuda: abre o manual nesta tela', 'aria-label': 'Ajuda' }, h(Icon, { n: 'help' })),
              h('button', { class: 'icon-btn', title: 'Tema', onClick: () => setTema(store.tema === 'escuro' ? 'claro' : 'escuro') }, h(Icon, { n: store.tema === 'escuro' ? 'sun' : 'moon' })),
              h('a', { class: 'icon-btn', href: '/agenda', title: 'Lembretes' }, [h(Icon, { n: 'bell' }), store.contadores.lembretes ? h('span', { class: 'dot' }) : null]),
            ]),
          ]),
          h('main', { class: 'content' }, h(Comp, props)),
        ]),
        h('nav', { class: 'bottom-nav' }, [
          ...[['/', 'home', 'Início'], ['/clientes', 'users', 'Clientes'], ['/chamados', 'lifebuoy', 'Chamados', 'chamados'], ['/marketing', 'megaphone', 'Marketing']].map(([href, ic, l, cnt]) => h('a', { href, class: (href === '/marketing' ? store.route.path.startsWith('/marketing') : ativo(href)) ? 'on' : '' }, [h(Icon, { n: ic, s: 22 }), l, cnt && store.contadores[cnt] ? h('span', { class: 'count' }, store.contadores[cnt]) : null])),
          h('button', { onClick: () => { store.menuAberto = true; } }, [h(Icon, { n: 'menu', s: 22 }), 'Mais']),
        ]),
        can.write() && !/\/(novo|\d+)$/.test(store.route.path) && !store.route.path.startsWith('/configuracoes') ? h('a', { class: 'fab', href: fabDestino.value, 'aria-label': 'Novo' }, h(Icon, { n: 'plus', s: 26 })) : null,
      ]);
    };
  },
});

// ---------------- Raiz ----------------
const Root = defineComponent({
  setup() {
    const pronto = ref(false);
    onMounted(async () => {
      parseRoute();
      try {
        const me = await get('auth/me'); store.user = me.user;
        if (store.user) { await carregarMeta(); sincronizarPush(); carregarAsaas(); get('dashboard').then((d) => { store.contadores.chamados = d.kpis.chamados_abertos; store.contadores.lembretes = d.kpis.lembretes_hoje; }).catch(() => {}); }
      } catch { store.user = null; }
      if (!store.user && store.route.path !== '/entrar') go('/entrar?voltar=' + encodeURIComponent(location.pathname), true);
      if (store.user && store.route.path === '/entrar') go('/', true);
      pronto.value = true;
      document.getElementById('boot')?.remove();
    });
    // Abre o modal de criação quando a URL pede (?criar=1)
    watch(() => store.route.query.criar, (v) => { if (v && store.route.path === '/marketing/posts') { setQuery({ criar: '' }); store.modal = { tipo: 'criarPost' }; } });
    window.addEventListener('resize', () => { store._w = window.innerWidth; });
    return () => {
      store._w; // re-render ao girar a tela
      if (!pronto.value) return null;
      const m = store.modal;
      return h('div', null, [
        store.user && store.meta && store.route.path !== '/entrar' ? h(Layout) : h(LoginPage),
        m && m.tipo === 'confirm' ? h(Modal, { title: m.titulo, onClose: () => { m.resolve(false); store.modal = null; } }, {
          default: () => h('p', { style: { margin: 0, whiteSpace: 'pre-line' } }, m.texto),
          foot: () => [h('button', { class: 'btn ghost', onClick: () => { m.resolve(false); store.modal = null; } }, 'Cancelar'), h('button', { class: m.perigo ? 'btn danger' : 'btn primary', onClick: () => { m.resolve(true); store.modal = null; } }, m.ok)],
        }) : null,
        m && m.tipo === 'criarPost' ? h(CriarPostModal, { modo: mkt.cfg?.usar_ia === false ? 'modelo' : 'ia', onClose: () => { store.modal = null; } }) : null,
        h('div', { class: 'toasts' }, store.toasts.map((t) => h('div', { class: 'toast ' + t.tipo, key: t.id }, [h(Icon, { n: t.tipo === 'err' ? 'alert' : 'check' }), h('div', null, t.msg)]))),
      ]);
    };
  },
});

createApp(Root).mount('#app');
