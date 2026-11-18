/* Neon Gestão — Marketing (posts, campanhas, calendário, integrações, robôs) */

const mkt = reactive({ cfg: null, modelos: null });
async function mktLoad(force) {
  if (!mkt.cfg || force) { try { const d = await get('marketing/integracoes'); mkt.cfg = d.config; mkt.integ = d; } catch { mkt.cfg = { usar_ia: true, exigir_aprovacao: true, redes_padrao: [] }; } }
  if (!mkt.modelos) { try { mkt.modelos = await get('marketing/modelos'); } catch { /* ok */ } }
}

const REDE_NOME = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn', telegram_canal: 'Canal do Telegram', telegram: 'Telegram', site: 'Site' };

// ---------------- Início do Marketing ----------------
const MarketingHome = defineComponent({
  setup() {
    const r = ref(null), prox = ref([]), criar = ref(null);
    async function load() {
      await mktLoad(true);
      try { r.value = (await get('marketing/resumo')).data; prox.value = (await get('posts?limit=8&sort=agendado_para&f_status=agendado,aguardando,aprovado')).data; } catch (e) { erro(e); }
    }
    onMounted(load);
    const K = (icon, c, l, v, href) => h('a', { class: 'card kpi', href, style: { '--c': c } }, [h('div', { class: 'lbl' }, [h('span', { class: 'ico' }, h(Icon, { n: icon, s: 17 })), l]), h('div', { class: 'val' }, v)]);
    return () => h('div', null, [
      h('div', { class: 'page-head' }, [h('div', null, [h('h1', null, 'Marketing'), h('p', null, mkt.cfg?.usar_ia ? 'Crie posts com IA ou com modelos, aprove pelo painel ou Telegram, e os robôs publicam.' : 'Modo sem IA: modelos prontos + robôs de horário.')]),
        h('div', { class: 'actions' }, [h('button', { class: 'btn', onClick: () => { criar.value = 'modelo'; } }, [h(Icon, { n: 'layers', s: 16 }), 'Criar com modelo']), mkt.cfg?.usar_ia ? h('button', { class: 'btn primary', onClick: () => { criar.value = 'ia'; } }, [h(Icon, { n: 'sparkles', s: 16 }), 'Criar com IA']) : null])]),
      r.value ? h('div', { class: 'grid g4' }, [
        K('bell', '#eab308', 'Aguardando aprovação', r.value.aguardando, '/marketing/posts?f_status=aguardando'),
        K('calendar', '#a78bfa', 'Agendados', r.value.agendados, '/marketing/calendario'),
        K('send', '#22c55e', 'Publicados (30 dias)', r.value.publicados_30d, '/marketing/posts?f_status=publicado'),
        K('alert', '#ef4444', 'Com erro', r.value.com_erro, '/marketing/posts?f_status=erro'),
      ]) : h('div', { class: 'skeleton', style: { height: '110px' } }),
      h('div', { class: 'grid g3', style: { marginTop: '16px' } }, [
        h('div', { class: 'card pad0 span2' }, [h('div', { class: 'card-head' }, [h(Icon, { n: 'clock' }), h('h3', null, 'Próximas publicações'), h('div', { class: 'actions' }, h('a', { class: 'btn sm ghost', href: '/marketing/calendario' }, 'Calendário'))]),
          prox.value.length ? h('div', { class: 'list' }, prox.value.map((p) => h('a', { class: 'li', href: `/marketing/posts/${p.id}` }, [
            p.imagem ? h('img', { src: `/assets/${p.imagem}`, style: { width: '48px', height: '48px', borderRadius: '10px', objectFit: 'cover' } }) : h('div', { class: 'avatar' }, h(Icon, { n: 'image', s: 18 })),
            h('div', { class: 'grow' }, [h('div', { class: 't' }, p.titulo), h('div', { class: 's row gap-s' }, [h(Nets, { list: p.redes }), p.agendado_para ? fmt.dt(p.agendado_para) : 'sem data'])]),
            h(Badge, { field: ent('posts').fields.status, value: p.status }),
          ]))) : h('div', { class: 'empty' }, [h(Icon, { n: 'calendar', s: 36, w: 1.5 }), h('b', null, 'Nada agendado'), 'Crie um post para começar.'])]),
        h('div', { class: 'stack' }, [
          h('div', { class: 'card' }, [h('h2', { class: 'sec' }, [h(Icon, { n: 'plug' }), 'Conexões']),
            mkt.integ ? h('div', { class: 'list' }, [...Object.entries(mkt.integ.redes).map(([k, v]) => h('a', { class: 'li', href: '/marketing/integracoes?aba=' + (k === 'telegram' ? 'telegram' : 'redes'), style: { padding: '8px 0' } }, [h('span', { class: 'net', style: { background: v.cor } }, (NET[k] || ['✈'])[0]), h('span', { class: 'grow' }, v.nome), v.ativo ? h('span', { class: 'badge', style: { '--c': '#22c55e' } }, 'ligado') : h('span', { class: 'badge plain' }, 'desligado')])),
              h('a', { class: 'li', href: '/marketing/integracoes?aba=ia', style: { padding: '8px 0' } }, [h(Icon, { n: 'sparkles' }), h('span', { class: 'grow' }, 'IAs prontas'), h('span', { class: 'badge plain' }, `${mkt.integ.ia.texto.filter((x) => x.pronto).length} texto · ${mkt.integ.ia.imagem.filter((x) => x.pronto).length} imagem`)])]) : null]),
          h('div', { class: 'card' }, [h('h2', { class: 'sec' }, [h(Icon, { n: 'zap' }), 'Atalhos']), h('div', { class: 'grid', style: { gap: '8px' } }, [
            ['/marketing/posts', 'image', 'Todos os posts'], ['/marketing/campanhas', 'megaphone', 'Campanhas'], ['/marketing/posts?f_biblioteca=1', 'book', 'Biblioteca do robô'], ['/marketing/tarefas', 'clock', 'Robôs e horários'], ['/marketing/integracoes', 'plug', 'Integrações e IAs'], ['/novidades', 'globe', 'Página de novidades do site'],
          ].map(([href, ic, t]) => h('a', { class: 'btn', href, target: href === '/novidades' ? '_blank' : null, style: { justifyContent: 'flex-start' } }, [h(Icon, { n: ic, s: 16 }), t])))]),
        ]),
      ]),
      criar.value ? h(CriarPostModal, { modo: criar.value, onClose: () => { criar.value = null; } }) : null,
    ]);
  },
});

// ---------------- Modal: criar post (IA ou modelo) ----------------
const CriarPostModal = defineComponent({
  props: { modo: String, campanha: Object }, emits: ['close'],
  setup(p, { emit }) {
    const modo = ref(p.modo);
    const f = reactive({ ideia: '', titulo: '', texto: '', hashtags: '', destaque: '', cta: 'Fale no WhatsApp', foto: null, modelo: mkt.cfg?.modelo_padrao || 'destaque', redes: [...(mkt.cfg?.redes_padrao || [])], biblioteca: false, agendado_para: null, com_imagem: true });
    const busy = ref(false), previa = ref(''); let t;
    onMounted(() => { mktLoad(); atualizar(); });
    function atualizar() {
      if (modo.value !== 'modelo') return;
      clearTimeout(t); t = setTimeout(async () => {
        try { const b = await api('marketing/modelos/previa', { method: 'POST', body: { modelo: f.modelo, foto: f.foto, dados: { titulo: f.titulo || 'Seu título aparece aqui', subtitulo: f.texto.split('\n')[0].slice(0, 140), destaque: f.destaque, cta: f.cta } } }); if (previa.value) URL.revokeObjectURL(previa.value); previa.value = URL.createObjectURL(b); } catch { /* ok */ }
      }, 350);
    }
    watch(() => [f.modelo, f.foto, f.titulo, f.texto, f.destaque, f.cta, modo.value], atualizar);
    async function criar() {
      busy.value = true;
      try {
        let post_;
        if (modo.value === 'ia') post_ = (await post('marketing/gerar-post', { ideia: f.ideia, redes: f.redes, com_imagem: f.com_imagem, campanha_id: p.campanha?.id, agendado_para: f.agendado_para })).data;
        else post_ = (await post('marketing/criar-sem-ia', { ...f, campanha_id: p.campanha?.id })).data;
        toast(post_.status === 'aguardando' ? 'Post criado e enviado para aprovação.' : 'Post criado!');
        emit('close'); go(`/marketing/posts/${post_.id}`);
      } catch (e) { erro(e); }
      busy.value = false;
    }
    const redesF = ent('posts').fields.redes;
    return () => h(Modal, { title: 'Novo post', xwide: modo.value === 'modelo', onClose: () => emit('close') }, {
      default: () => h('div', { class: 'stack' }, [
        mkt.cfg?.usar_ia ? h('div', { class: 'seg' }, [h('button', { class: modo.value === 'ia' ? 'on' : '', onClick: () => { modo.value = 'ia'; } }, [h(Icon, { n: 'sparkles', s: 15 }), 'Com IA']), h('button', { class: modo.value === 'modelo' ? 'on' : '', onClick: () => { modo.value = 'modelo'; } }, [h(Icon, { n: 'layers', s: 15 }), 'Com modelo (sem IA)'])]) : null,
        modo.value === 'ia' ? [
          h('div', { class: 'field' }, [h('label', null, 'Qual é a ideia do post?'), h('textarea', { rows: 4, value: f.ideia, placeholder: 'Ex.: Mostrar como o Painel Neon cria cenas na suíte (romântica, festa, relax) com um toque. Chamar para demonstração gratuita.', onInput: (e) => { f.ideia = e.target.value; } })]),
          h(Field, { name: 'redes', field: redesF, modelValue: f.redes, 'onUpdate:modelValue': (v) => { f.redes = v; } }),
          h('div', { class: 'form' }, [h('div', { class: 'field' }, [h('label', null, 'Imagem'), h('div', { class: 'toggle', onClick: () => { f.com_imagem = !f.com_imagem; } }, [h('span', { class: 'switch' + (f.com_imagem ? ' on' : '') }), 'Gerar imagem com IA'])]), h(Field, { name: 'agendado_para', field: { label: 'Publicar em (opcional)', type: 'datetime' }, modelValue: f.agendado_para, 'onUpdate:modelValue': (v) => { f.agendado_para = v; } })]),
          h('div', { class: 'callout' }, [h(Icon, { n: 'info' }), 'A IA escreve o texto de cada rede e a imagem. Se uma IA falhar, a próxima da fila assume sozinha.']),
        ] : h('div', { class: 'grid g2' }, [
          h('div', { class: 'stack' }, [
            h('div', { class: 'field' }, [h('label', null, 'Modelo'), h('div', { class: 'model-pick' }, Object.entries(mkt.modelos?.modelos || {}).map(([k, m]) => h('button', { type: 'button', class: f.modelo === k ? 'on' : '', onClick: () => { f.modelo = k; } }, [h('b', null, m.nome), h('span', null, m.w === m.h ? '1:1' : '9:16')])))]),
            h('div', { class: 'field' }, [h('label', null, 'Foto'), h(FileField, { modelValue: f.foto, folder: 'marketing', accept: 'image/*', 'onUpdate:modelValue': (v) => { f.foto = v; } })]),
            h('div', { class: 'field' }, [h('label', null, ['Título', h('span', { class: 'req' }, '*')]), h('input', { value: f.titulo, maxlength: 120, onInput: (e) => { f.titulo = e.target.value; } })]),
            h('div', { class: 'field' }, [h('label', null, 'Texto (a 1ª linha entra na arte; o texto todo vai na legenda)'), h('textarea', { rows: 4, value: f.texto, onInput: (e) => { f.texto = e.target.value; } })]),
            h('div', { class: 'form' }, [
              h('div', { class: 'field' }, [h('label', null, 'Destaque (ex.: 20% OFF)'), h('input', { value: f.destaque, onInput: (e) => { f.destaque = e.target.value; } })]),
              h('div', { class: 'field' }, [h('label', null, 'Botão / chamada'), h('input', { value: f.cta, onInput: (e) => { f.cta = e.target.value; } })]),
              h('div', { class: 'field full' }, [h('label', null, 'Hashtags'), h('input', { value: f.hashtags, placeholder: '#motel #automacao #neonsistemas', onInput: (e) => { f.hashtags = e.target.value; } })]),
            ]),
            h(Field, { name: 'redes', field: redesF, modelValue: f.redes, 'onUpdate:modelValue': (v) => { f.redes = v; } }),
            h('div', { class: 'form' }, [
              h(Field, { name: 'agendado_para', field: { label: 'Publicar em (pontual)', type: 'datetime' }, modelValue: f.agendado_para, 'onUpdate:modelValue': (v) => { f.agendado_para = v; } }),
              h('div', { class: 'field' }, [h('label', null, 'Ou guardar na biblioteca'), h('div', { class: 'toggle', onClick: () => { f.biblioteca = !f.biblioteca; } }, [h('span', { class: 'switch' + (f.biblioteca ? ' on' : '') }), 'O robô publica na vez dele'])]),
            ]),
          ]),
          h('div', null, [h('div', { class: 'small muted', style: { marginBottom: '8px' } }, 'Prévia da arte'), previa.value ? h('img', { src: previa.value, style: { width: '100%', borderRadius: '14px', border: '1px solid var(--line)', position: 'sticky', top: '70px' } }) : h('div', { class: 'skeleton', style: { aspectRatio: '1' } })]),
        ]),
      ]),
      foot: () => [h('button', { class: 'btn ghost', onClick: () => emit('close') }, 'Cancelar'), h('button', { class: 'btn primary', disabled: busy.value || (modo.value === 'ia' ? !f.ideia.trim() : !f.titulo.trim()), onClick: criar }, busy.value ? (modo.value === 'ia' ? 'A IA está criando… (até 1 min)' : 'Criando…') : [h(Icon, { n: modo.value === 'ia' ? 'sparkles' : 'check', s: 16 }), 'Criar post'])],
    });
  },
});

// ---------------- Lista de posts ----------------
const PostsPage = defineComponent({
  setup() {
    const criar = ref(null);
    onMounted(() => mktLoad());
    return () => h('div', null, [
      h('div', { class: 'page-head' }, [h('div', null, [h('h1', null, 'Posts'), h('p', null, 'Rascunhos, aguardando aprovação, agendados e publicados.')]),
        h('div', { class: 'actions' }, [h('button', { class: 'btn', onClick: () => { criar.value = 'modelo'; } }, [h(Icon, { n: 'layers', s: 16 }), 'Com modelo']), mkt.cfg?.usar_ia ? h('button', { class: 'btn primary', onClick: () => { criar.value = 'ia'; } }, [h(Icon, { n: 'sparkles', s: 16 }), 'Com IA']) : null])]),
      h(EntityList, { entity: 'posts', hideNew: true }),
      criar.value ? h(CriarPostModal, { modo: criar.value, onClose: () => { criar.value = null; } }) : null,
    ]);
  },
});

// ---------------- Editor de post ----------------
const PostEditor = defineComponent({
  props: { id: String },
  setup(p) {
    const row = ref(null), labels = ref({}), orig = ref(''), busy = ref(''), redeTab = ref(''), previewRede = ref('instagram');
    const arte = reactive({ modelo: 'destaque', titulo: '', subtitulo: '', destaque: '', cta: 'Fale no WhatsApp', foto: null });
    const previa = ref(''); const pedidoIa = ref('');
    let t;
    async function load() {
      await mktLoad();
      if (p.id === 'novo') { row.value = novoRegistro('posts', { redes: [...(mkt.cfg?.redes_padrao || [])], textos: {} }); orig.value = ''; return; }
      try {
        const d = await get(`posts/${p.id}`); row.value = d.data; labels.value = d.labels || {};
        if (!row.value.textos || typeof row.value.textos !== 'object') row.value.textos = {};
        orig.value = JSON.stringify(row.value);
        const a = row.value.arte || {};
        Object.assign(arte, { modelo: row.value.modelo || mkt.cfg?.modelo_padrao || 'destaque', titulo: a.titulo ?? row.value.titulo, subtitulo: a.subtitulo ?? '', destaque: a.destaque ?? '', cta: a.cta ?? 'Fale no WhatsApp', foto: a.foto ?? null });
        redeTab.value = (row.value.redes || [])[0] || '';
        previewRede.value = redeTab.value || 'instagram';
      } catch (e) { erro(e); go('/marketing/posts'); }
    }
    watch(() => p.id, load); onMounted(load);
    function previaArte() {
      clearTimeout(t); t = setTimeout(async () => {
        try { const b = await api('marketing/modelos/previa', { method: 'POST', body: { modelo: arte.modelo, foto: arte.foto, dados: { ...arte } } }); if (previa.value) URL.revokeObjectURL(previa.value); previa.value = URL.createObjectURL(b); } catch { /* ok */ }
      }, 350);
    }
    watch(() => ({ ...arte }), previaArte, { deep: true });
    const dirty = computed(() => row.value && JSON.stringify(row.value) !== orig.value);
    async function salvar(silencioso) {
      const body = payload('posts', row.value);
      if (p.id === 'novo') { const r = await post('posts', body); toast('Post criado.'); go(`/marketing/posts/${r.data.id}`, true); return false; }
      await patch(`posts/${p.id}`, body); if (!silencioso) toast('Post salvo.'); orig.value = JSON.stringify(row.value); return true;
    }
    async function run(nome, fn) { busy.value = nome; try { await fn(); } catch (e) { erro(e); } busy.value = ''; }
    const aplicarArte = () => run('arte', async () => { if (dirty.value) await salvar(true); const r = await post(`marketing/posts/${p.id}/arte`, { modelo: arte.modelo, foto: arte.foto, dados: { titulo: arte.titulo, subtitulo: arte.subtitulo, destaque: arte.destaque, cta: arte.cta } }); toast('Arte aplicada ao post!'); await load(); });
    const imagemIa = () => run('img', async () => { if (dirty.value) await salvar(true); const r = await post(`marketing/posts/${p.id}/imagem-ia`, {}); toast(`Imagem criada por ${r.provedor}.`); await load(); });
    const reescrever = () => run('ia', async () => { if (dirty.value) await salvar(true); const r = await post(`marketing/posts/${p.id}/reescrever`, { pedido: pedidoIa.value || undefined }); toast(`Textos reescritos por ${r.provedor}.`); await load(); });
    const legendas = () => run('leg', async () => { if (dirty.value) await salvar(true); await post(`marketing/posts/${p.id}/legendas`); toast('Legendas preenchidas pelos modelos.'); await load(); });
    const aprovacao = () => run('apr', async () => { if (dirty.value) await salvar(true); const r = await post(`marketing/posts/${p.id}/aprovacao`); toast(r.telegram ? 'Enviado para aprovação no Telegram 📲' : 'Marcado como aguardando aprovação (Telegram não configurado).'); await load(); });
    const aprovar = () => run('ok', async () => { if (dirty.value) await salvar(true); await post(`marketing/posts/${p.id}/aprovar`, { agendado_para: row.value.agendado_para }); toast('Aprovado! O robô publica no horário marcado.'); await load(); });
    const publicarAgora = () => run('pub', async () => {
      if (!(await confirmar('Publicar agora?', 'O post vai para todas as redes marcadas neste momento.', { ok: 'Publicar' }))) return;
      if (dirty.value) await salvar(true);
      const r = await post(`marketing/posts/${p.id}/publicar-agora`); toast(`Resultado: ${optOf(ent('posts').fields.status, r.status)?.label}`, r.status === 'publicado' ? 'ok' : 'err', 7000); await load();
    });
    const umToque = (rede) => { const txt = textoRede(rede); copiar(txt, 'Texto copiado! Agora cole na rede.'); if (row.value.imagem) window.open(`/assets/${row.value.imagem}?download`, '_blank'); const urls = { instagram: 'https://www.instagram.com/', facebook: 'https://www.facebook.com/', tiktok: 'https://www.tiktok.com/upload', youtube: 'https://studio.youtube.com/', linkedin: 'https://www.linkedin.com/feed/', telegram_canal: 'https://web.telegram.org/' }; setTimeout(() => window.open(urls[rede], '_blank'), 400); };
    function textoRede(rede) { const r = row.value; return (r.textos?.[rede] || [r.titulo, r.texto, r.hashtags].filter(Boolean).join('\n\n')); }
    return () => {
      const r = row.value; if (!r) return h('div', { class: 'skeleton', style: { height: '500px' } });
      const F = ent('posts').fields; const isNew = p.id === 'novo';
      const res = r.resultado && typeof r.resultado === 'object' ? r.resultado : {};
      const usaIa = mkt.cfg?.usar_ia;
      return h('div', null, [
        h('div', { class: 'crumb' }, [h('a', { href: '/marketing' }, 'Marketing'), h(Icon, { n: 'right', s: 14 }), h('a', { href: '/marketing/posts' }, 'Posts'), h(Icon, { n: 'right', s: 14 }), h('span', null, isNew ? 'Novo' : `#${r.id}`)]),
        h('div', { class: 'page-head' }, [h('div', { class: 'grow' }, [h('h1', null, r.titulo || 'Novo post'), h('div', { class: 'row wrap', style: { marginTop: '6px' } }, [h(Badge, { field: F.status, value: r.status }), r.agendado_para ? h('span', { class: 'muted small' }, '🕒 ' + fmt.dt(r.agendado_para)) : null, r.gerado_por_ia ? h('span', { class: 'badge', style: { '--c': '#a78bfa' } }, 'IA') : null, r.biblioteca ? h('span', { class: 'badge', style: { '--c': '#38bdf8' } }, 'Biblioteca') : null])]),
          !isNew && can.write() ? h('div', { class: 'actions' }, [
            ['rascunho', 'erro', 'parcial', 'aprovado'].includes(r.status) ? h('button', { class: 'btn', disabled: !!busy.value, onClick: aprovacao }, [h(Icon, { n: 'send', s: 16 }), 'Pedir aprovação']) : null,
            !['publicado', 'publicando'].includes(r.status) ? h('button', { class: 'btn success', disabled: !!busy.value, onClick: aprovar }, [h(Icon, { n: 'check', s: 16 }), r.agendado_para ? 'Aprovar e agendar' : 'Aprovar']) : null,
            h('button', { class: 'btn primary', disabled: !!busy.value, onClick: publicarAgora }, [h(Icon, { n: 'zap', s: 16 }), busy.value === 'pub' ? 'Publicando…' : 'Publicar agora']),
          ]) : null]),
        h('div', { class: 'grid g3' }, [
          h('div', { class: 'span2 stack' }, [
            h('div', { class: 'card' }, [h('div', { class: 'form' }, ['titulo', 'campanha_id', 'texto', 'hashtags', 'redes'].map((k) => h(Field, { key: k, name: k, field: F[k], modelValue: r[k], labels: labels.value, row: r, 'onUpdate:modelValue': (v) => { r[k] = v; } })))]),
            h('div', { class: 'card' }, [
              h('h2', { class: 'sec' }, [h(Icon, { n: 'image' }), 'Imagem do post']),
              h('div', { class: 'grid g2' }, [
                h('div', { class: 'stack' }, [
                  h('div', { class: 'field' }, [h('label', null, 'Imagem final (você pode enviar uma pronta)'), h(FileField, { modelValue: r.imagem, folder: 'marketing', accept: 'image/*', info: labels.value.__arquivos?.[r.imagem], 'onUpdate:modelValue': (v) => { r.imagem = v; } })]),
                  h('div', { class: 'field' }, [h('label', null, 'Vídeo (TikTok, Reels, YouTube)'), h(FileField, { modelValue: r.video, folder: 'marketing', accept: 'video/*', info: labels.value.__arquivos?.[r.video], 'onUpdate:modelValue': (v) => { r.video = v; } })]),
                  !isNew && usaIa ? h('button', { class: 'btn', disabled: !!busy.value, onClick: imagemIa }, [h(Icon, { n: 'sparkles', s: 16 }), busy.value === 'img' ? 'Criando imagem…' : 'Criar nova imagem com IA']) : null,
                ]),
                !isNew ? h('div', { class: 'stack' }, [
                  h('div', { class: 'small muted' }, 'Ou monte a arte com um modelo pronto:'),
                  h('div', { class: 'model-pick' }, Object.entries(mkt.modelos?.modelos || {}).map(([k, m]) => h('button', { type: 'button', class: arte.modelo === k ? 'on' : '', onClick: () => { arte.modelo = k; } }, [h('b', null, m.nome)]))),
                  h(FileField, { modelValue: arte.foto, folder: 'marketing', accept: 'image/*', 'onUpdate:modelValue': (v) => { arte.foto = v; } }),
                  ...[['titulo', 'Título na arte'], ['subtitulo', 'Texto de apoio'], ['destaque', 'Destaque (20% OFF, NOVO)'], ['cta', 'Chamada']].map(([k, l]) => h('div', { class: 'field' }, [h('label', null, l), h('input', { value: arte[k], onInput: (e) => { arte[k] = e.target.value; } })])),
                  previa.value ? h('img', { src: previa.value, style: { width: '100%', borderRadius: '12px', border: '1px solid var(--line)' } }) : null,
                  h('button', { class: 'btn primary', disabled: !!busy.value, onClick: aplicarArte }, [h(Icon, { n: 'check', s: 16 }), busy.value === 'arte' ? 'Aplicando…' : 'Usar esta arte no post']),
                ]) : h('div', { class: 'callout' }, [h(Icon, { n: 'info' }), 'Salve o post para usar os modelos de arte.']),
              ]),
            ]),
            !isNew ? h('div', { class: 'card' }, [
              h('h2', { class: 'sec' }, [h(Icon, { n: 'edit' }), 'Texto de cada rede', h('span', { style: { marginLeft: 'auto' }, class: 'row gap-s' }, [h('button', { class: 'btn sm', disabled: !!busy.value, onClick: legendas }, [h(Icon, { n: 'layers', s: 14 }), 'Preencher com modelos']), usaIa ? h('button', { class: 'btn sm', disabled: !!busy.value, onClick: reescrever }, [h(Icon, { n: 'sparkles', s: 14 }), busy.value === 'ia' ? 'Reescrevendo…' : 'Reescrever com IA']) : null])]),
              usaIa ? h('input', { class: 'input', style: { marginBottom: '12px' }, placeholder: 'Pedido para a IA (opcional): ex. "mais curto e com tom de urgência"', value: pedidoIa.value, onInput: (e) => { pedidoIa.value = e.target.value; } }) : null,
              (r.redes || []).length ? [h('div', { class: 'tabs' }, (r.redes || []).map((rd) => h('button', { class: redeTab.value === rd ? 'on' : '', onClick: () => { redeTab.value = rd; previewRede.value = rd; } }, [h(Nets, { list: [rd] }), REDE_NOME[rd]]))),
                redeTab.value ? h('div', { class: 'field' }, [h('textarea', { rows: 8, value: r.textos?.[redeTab.value] ?? '', placeholder: 'Vazio = usa o texto principal + hashtags.', onInput: (e) => { r.textos = { ...(r.textos || {}), [redeTab.value]: e.target.value }; } }), h('div', { class: 'help row' }, [`${(r.textos?.[redeTab.value] || '').length} caracteres`, h('button', { class: 'btn sm ghost', style: { marginLeft: 'auto' }, onClick: () => umToque(redeTab.value) }, [h(Icon, { n: 'send', s: 14 }), 'Publicar com 1 toque (manual)'])])]) : null]
                : h('div', { class: 'muted' }, 'Marque as redes acima.'),
            ]) : null,
            h('div', { class: 'card' }, [h('h2', { class: 'sec' }, [h(Icon, { n: 'clock' }), 'Quando publicar']), h('div', { class: 'form' }, ['agendado_para', 'publicar_site', 'biblioteca', 'status'].map((k) => h(Field, { key: k, name: k, field: F[k], modelValue: r[k], 'onUpdate:modelValue': (v) => { r[k] = v; } })))]),
            h('div', { class: 'savebar' }, [h('button', { class: 'btn primary', disabled: (!dirty.value && !isNew) || !!busy.value, onClick: () => run('save', () => salvar()) }, [h(Icon, { n: 'check', s: 17 }), isNew ? 'Criar post' : 'Salvar']), dirty.value && !isNew ? h('button', { class: 'btn ghost', onClick: load }, 'Descartar') : null,
              !isNew && can.del() ? h('button', { class: 'btn danger', style: { marginLeft: 'auto' }, onClick: async () => { if (await confirmar('Excluir post?', r.titulo, { ok: 'Excluir', perigo: true })) { try { await del(`posts/${r.id}`); go('/marketing/posts', true); } catch (e) { erro(e); } } } }, h(Icon, { n: 'trash', s: 16 })) : null]),
          ]),
          h('div', { class: 'stack' }, [
            h('div', { class: 'card', style: { position: 'sticky', top: '80px' } }, [
              h('h2', { class: 'sec' }, [h(Icon, { n: 'eye' }), 'Prévia']),
              h('div', { class: 'seg', style: { marginBottom: '12px' } }, (r.redes || []).map((rd) => h('button', { class: previewRede.value === rd ? 'on' : '', onClick: () => { previewRede.value = rd; } }, REDE_NOME[rd]))),
              h('div', { class: 'preview-post' }, [h('div', { class: 'ph' }, [h('img', { src: '/img/icon.png' }), store.config.empresa_nome || 'Neon Sistemas']), h('div', { class: 'im' }, r.imagem ? h('img', { src: `/assets/${r.imagem}` }) : 'sem imagem'), h('div', { class: 'tx' }, textoRede(previewRede.value))]),
              Object.keys(res).filter((k) => k !== 'ia' && k !== 'origem').length ? h('div', { style: { marginTop: '16px' } }, [h('div', { class: 'small muted', style: { marginBottom: '6px' } }, 'Resultado da publicação'), h('div', { class: 'list' }, Object.entries(res).filter(([k]) => !['ia', 'origem'].includes(k)).map(([k, v]) => h('div', { class: 'li', style: { padding: '8px 0' } }, [h('span', null, v.ok ? '✅' : '❌'), h('div', { class: 'grow' }, [h('div', { class: 't' }, REDE_NOME[k] || k), h('div', { class: 's', style: { whiteSpace: 'normal' } }, v.ok ? (v.ignorado ? v.motivo : (v.url ? h('a', { href: v.url, target: '_blank' }, 'ver publicação') : 'publicado')) : v.erro)])])))]) : null,
              res.ia ? h('div', { class: 'tiny dim', style: { marginTop: '10px' } }, `Criado por IA: texto ${res.ia.texto || '—'} · imagem ${res.ia.imagem || '—'}`) : null,
            ]),
          ]),
        ]),
      ]);
    };
  },
});

// ---------------- Calendário ----------------
const CalendarioPage = defineComponent({
  setup() {
    const ref0 = new Date(); const mes = ref(new Date(ref0.getFullYear(), ref0.getMonth(), 1)); const rows = ref([]);
    async function load() {
      const ini = new Date(mes.value); ini.setDate(1 - ini.getDay()); const fim = new Date(ini); fim.setDate(ini.getDate() + 41);
      const iso = (d) => d.toISOString().slice(0, 10);
      try { rows.value = (await get(`marketing/calendario?de=${iso(ini)}&ate=${iso(fim)}`)).data; } catch (e) { erro(e); }
    }
    onMounted(load); watch(mes, load);
    const cores = Object.fromEntries(ent('posts').fields.status.options.map((o) => [o.value, o.color]));
    return () => {
      const ini = new Date(mes.value); ini.setDate(1 - ini.getDay());
      const dias = Array.from({ length: 42 }, (_, i) => { const d = new Date(ini); d.setDate(ini.getDate() + i); return d; });
      const key = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const porDia = {}; for (const p of rows.value) { const d = toDate(p.agendado_para || p.publicado_em || p.created_at); (porDia[key(d)] ||= []).push(p); }
      const hoje = key(new Date());
      return h('div', null, [
        h('div', { class: 'page-head' }, [h('div', null, [h('h1', null, 'Calendário de publicações'), h('p', null, mes.value.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^./, (c) => c.toUpperCase()))]),
          h('div', { class: 'actions' }, [h('button', { class: 'btn icon', onClick: () => { mes.value = new Date(mes.value.getFullYear(), mes.value.getMonth() - 1, 1); } }, h(Icon, { n: 'left' })), h('button', { class: 'btn', onClick: () => { mes.value = new Date(ref0.getFullYear(), ref0.getMonth(), 1); } }, 'Hoje'), h('button', { class: 'btn icon', onClick: () => { mes.value = new Date(mes.value.getFullYear(), mes.value.getMonth() + 1, 1); } }, h(Icon, { n: 'right' }))])]),
        h('div', { class: 'cal' }, [...['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].map((d) => h('div', { class: 'dh' }, d)), ...dias.map((d) => h('div', { class: 'day' + (d.getMonth() !== mes.value.getMonth() ? ' out' : '') + (key(d) === hoje ? ' today' : '') }, [h('div', { class: 'num' }, d.getDate()), ...(porDia[key(d)] || []).map((p) => h('a', { class: 'ev', href: `/marketing/posts/${p.id}`, style: { '--c': cores[p.status] || '#888' }, title: p.titulo }, `${toDate(p.agendado_para || p.publicado_em || p.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} ${p.titulo}`))]))]),
        h('div', { class: 'row wrap', style: { marginTop: '12px' } }, ent('posts').fields.status.options.map((o) => h(Badge, { field: ent('posts').fields.status, value: o.value }))),
      ]);
    };
  },
});

// ---------------- Ações da campanha ----------------
const CampanhaActions = defineComponent({
  props: { camp: Object }, emits: ['change'],
  setup(p, { emit }) {
    const n = ref(5), busy = ref(false), criar = ref(null);
    onMounted(() => mktLoad());
    async function gerar() {
      busy.value = true;
      try { const r = await post(`marketing/campanhas/${p.camp.id}/gerar`, { quantidade: n.value }); toast(`${r.criados} post(s) criados${r.erros.length ? ' · ' + r.erros.length + ' erro(s): ' + r.erros[0] : ''}.`, r.erros.length ? 'err' : 'ok', 9000); emit('change'); } catch (e) { erro(e); }
      busy.value = false;
    }
    return () => h('div', { class: 'card', style: { marginBottom: '16px' } }, [
      h('div', { class: 'row wrap' }, [
        h('div', { class: 'grow' }, [h('b', null, 'Posts desta campanha'), h('div', { class: 'muted small' }, mkt.cfg?.usar_ia ? 'A IA monta a pauta, escreve, cria as imagens e distribui os horários no período da campanha.' : 'Crie posts com os modelos prontos e agende ou guarde na biblioteca.')]),
        mkt.cfg?.usar_ia ? [h('input', { class: 'input', type: 'number', min: 1, max: 20, value: n.value, style: { width: '80px' }, onInput: (e) => { n.value = Number(e.target.value); } }),
          h('button', { class: 'btn primary', disabled: busy.value, onClick: gerar }, [h(Icon, { n: 'sparkles', s: 16 }), busy.value ? 'Criando… (≈1 min por post)' : 'Gerar posts com IA'])] : null,
        h('button', { class: 'btn', onClick: () => { criar.value = 'modelo'; } }, [h(Icon, { n: 'layers', s: 16 }), 'Post com modelo']),
      ]),
      criar.value ? h(CriarPostModal, { modo: criar.value, campanha: p.camp, onClose: () => { criar.value = null; emit('change'); } }) : null,
    ]);
  },
});

// ---------------- Integrações ----------------
const IntegracoesPage = defineComponent({
  setup() {
    const aba = ref(store.route.query.aba || 'ia'); const d = ref(null); const edit = reactive({}); const busy = ref(''); const prefs = reactive({});
    async function load() {
      try {
        d.value = await get('marketing/integracoes');
        Object.assign(prefs, JSON.parse(JSON.stringify(d.value.config)));
        mkt.cfg = d.value.config; mkt.integ = d.value;
        if (!mkt.modelos) mkt.modelos = await get('marketing/modelos');
      } catch (e) { erro(e); }
    }
    onMounted(load);
    function editar(chave, cfg, ativo) { edit[chave] = { config: { ...cfg }, ativo }; }
    async function salvarRede(rede) { busy.value = rede; try { await post(`marketing/integracoes/rede/${rede}`, edit[rede]); toast('Integração salva.'); delete edit[rede]; await load(); } catch (e) { erro(e); } busy.value = ''; }
    async function testarRede(rede) { busy.value = 't' + rede; try { const r = await post(`marketing/integracoes/rede/${rede}/testar`); toast(r.mensagem, r.ok ? 'ok' : 'err', 8000); await load(); } catch (e) { erro(e); } busy.value = ''; }
    async function salvarIa(tipo, id) { busy.value = id; try { await post('marketing/integracoes/ia', { tipo, id, ...edit[tipo + id] }); toast('IA salva.'); delete edit[tipo + id]; await load(); } catch (e) { erro(e); } busy.value = ''; }
    async function testarIa(tipo, id) { busy.value = 't' + tipo + id; try { const r = await post('marketing/integracoes/ia/testar', { tipo, id }); toast(`${r.ok ? '✅' : '❌'} ${r.mensagem} (${r.segundos.toFixed(1)}s)`, r.ok ? 'ok' : 'err', 9000); if (r.preview) window.open(`/assets/${r.preview}`, '_blank'); await load(); } catch (e) { erro(e); } busy.value = ''; }
    async function toggleIa(tipo, it) { try { await post('marketing/integracoes/ia', { tipo, id: it.id, ativo: !it.ativo, config: it.config }); await load(); } catch (e) { erro(e); } }
    async function mover(tipo, i, dir) {
      const ordem = d.value.ia[tipo].map((x) => x.id); const j = i + dir; if (j < 0 || j >= ordem.length) return;
      [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
      try { await post('marketing/integracoes/ia', { ordem: { [tipo]: ordem } }); await load(); } catch (e) { erro(e); }
    }
    async function salvarPrefs() { try { await post('marketing/config', prefs); toast('Preferências salvas.'); await load(); } catch (e) { erro(e); } }

    function cfgFields(chave, campos, cfgAtual, ativoAtual) {
      const ed = edit[chave];
      return h('div', { class: 'form', style: { marginTop: '12px' } }, Object.entries(campos).map(([k, l]) => h('div', { class: 'field' + (k.includes('token') || k === 'chats_autorizados' ? ' full' : '') }, [h('label', null, l),
        h('input', { value: ed ? ed.config[k] ?? '' : cfgAtual[k] ?? '', readonly: !ed, class: /token|key|secret/i.test(k) ? 'mono' : '', autocomplete: 'off', onFocus: () => { if (!edit[chave]) editar(chave, cfgAtual, ativoAtual); }, onInput: (e) => { edit[chave].config[k] = e.target.value; } })])));
    }
    const tabsDef = [['ia', 'IAs (texto e imagem)', 'sparkles'], ['redes', 'Redes sociais', 'globe'], ['telegram', 'Telegram', 'send'], ['prefs', 'Preferências e modelos', 'settings'], ['robos', 'Robôs', 'bot']];
    return () => {
      if (!d.value) return h('div', { class: 'skeleton', style: { height: '400px' } });
      const D = d.value;
      return h('div', null, [
        h('div', { class: 'page-head' }, [h('div', null, [h('h1', null, 'Integrações'), h('p', null, 'Cole as credenciais e pronto. Chaves ficam guardadas no servidor e aparecem mascaradas.')])]),
        !D.public_url ? h('div', { class: 'callout warn', style: { marginBottom: '16px' } }, [h(Icon, { n: 'alert' }), 'Falta definir PUBLIC_URL no servidor (endereço público do painel). Sem ela as redes não conseguem buscar as imagens.']) : null,
        h('div', { class: 'tabs' }, tabsDef.map(([k, l, ic]) => h('button', { class: aba.value === k ? 'on' : '', onClick: () => { aba.value = k; setQuery({ aba: k }); } }, [h(Icon, { n: ic, s: 15 }), l]))),

        aba.value === 'ia' ? h('div', { class: 'stack' }, [
          !prefs.usar_ia ? h('div', { class: 'callout warn' }, [h(Icon, { n: 'alert' }), 'A IA está desligada nas Preferências. Os modelos prontos continuam funcionando.']) : null,
          h('div', { class: 'callout' }, [h(Icon, { n: 'info' }), 'Roteamento: o sistema tenta de cima para baixo. Se uma IA falhar (erro, limite ou sem saldo), a próxima assume sozinha. Use as setas para mudar a ordem.']),
          ...['texto', 'imagem'].map((tipo) => h('div', { class: 'card pad0' }, [
            h('div', { class: 'card-head' }, [h(Icon, { n: tipo === 'texto' ? 'edit' : 'image' }), h('h3', null, tipo === 'texto' ? 'IAs de texto (legendas e campanhas)' : 'IAs de imagem')]),
            ...D.ia[tipo].map((it, i) => {
              const ch = tipo + it.id; const ed = edit[ch];
              return h('div', { class: 'provider' + (it.pronto ? ' ready' : ''), style: { flexWrap: 'wrap' } }, [
                h('div', { class: 'ord' }, i + 1),
                h('div', { class: 'grow' }, [h('div', { class: 'row wrap gap-s' }, [h('b', null, it.nome), h('span', { class: 'badge plain', style: { fontSize: '11.5px' } }, it.custo)]), h('div', { class: 'tiny muted' }, [it.pronto ? '✅ pronta' : it.ativo ? '⚠️ falta a chave' : 'desligada', it.ultimo ? ' · último teste: ' + it.ultimo : '', ' · ', h('a', { href: it.site, target: '_blank' }, 'pegar chave')])]),
                h('div', { class: 'row gap-s' }, [
                  h('button', { class: 'btn sm icon ghost', disabled: i === 0, onClick: () => mover(tipo, i, -1), title: 'Subir' }, h(Icon, { n: 'up', s: 15 })),
                  h('button', { class: 'btn sm icon ghost', disabled: i === D.ia[tipo].length - 1, onClick: () => mover(tipo, i, 1), title: 'Descer' }, h(Icon, { n: 'down', s: 15 })),
                  h('div', { class: 'toggle', style: { height: '34px', padding: '0 8px' }, onClick: () => toggleIa(tipo, it) }, h('span', { class: 'switch' + (it.ativo ? ' on' : '') })),
                  h('button', { class: 'btn sm', onClick: () => { if (ed) delete edit[ch]; else editar(ch, it.config, it.ativo); } }, ed ? 'Fechar' : 'Configurar'),
                  it.pronto ? h('button', { class: 'btn sm', disabled: !!busy.value, onClick: () => testarIa(tipo, it.id) }, busy.value === 't' + ch ? 'Testando…' : 'Testar') : null,
                ]),
                ed ? h('div', { style: { width: '100%' } }, [cfgFields(ch, it.campos, it.config, it.ativo), h('div', { class: 'row', style: { marginTop: '12px' } }, [h('div', { class: 'toggle', onClick: () => { ed.ativo = !ed.ativo; } }, [h('span', { class: 'switch' + (ed.ativo ? ' on' : '') }), 'Ligada']), h('button', { class: 'btn primary', disabled: busy.value === it.id, onClick: () => salvarIa(tipo, it.id) }, 'Salvar')])]) : null,
              ]);
            }),
          ])),
        ]) : null,

        aba.value === 'redes' || aba.value === 'telegram' ? h('div', { class: 'grid g2' }, Object.entries(D.redes).filter(([k]) => (aba.value === 'telegram') === (k === 'telegram')).map(([k, v]) => {
          const ed = edit[k];
          return h('div', { class: 'card stack' + (aba.value === 'telegram' ? ' span2' : '') }, [
            h('div', { class: 'row' }, [h('span', { class: 'net', style: { background: v.cor, width: '34px', height: '34px', fontSize: '15px', borderRadius: '10px' } }, (NET[k] || ['✈'])[0]), h('div', { class: 'grow' }, [h('b', null, v.nome), h('div', { class: 'tiny muted' }, v.ultimo_status || 'nunca testado')]), v.ativo ? h('span', { class: 'badge', style: { '--c': '#22c55e' } }, 'ligado') : h('span', { class: 'badge plain' }, 'desligado')]),
            h('details', null, [h('summary', { class: 'small', style: { cursor: 'pointer', color: 'var(--orange2)' } }, 'Passo a passo para conseguir as credenciais'), h('ol', { class: 'small muted', style: { paddingLeft: '18px' } }, v.ajuda.map((a) => h('li', { style: { marginTop: '4px' } }, a)))]),
            cfgFields(k, v.campos, v.config, v.ativo),
            k === 'telegram' && v.ativo ? h('div', { class: 'callout ok' }, [h(Icon, { n: 'send' }), h('div', null, ['Comandos: ', h('code', null, '/post'), ', ', h('code', null, '/campanha'), ', ', h('code', null, '/fila'), ', ', h('code', null, '/status'), '. Mande ', h('code', null, '/start'), ' para o robô para descobrir o seu ID de chat.'])]) : null,
            h('div', { class: 'row wrap' }, [
              h('div', { class: 'toggle', onClick: () => { if (!edit[k]) editar(k, v.config, v.ativo); edit[k].ativo = !edit[k].ativo; } }, [h('span', { class: 'switch' + ((ed ? ed.ativo : v.ativo) ? ' on' : '') }), 'Ligada']),
              ed ? h('button', { class: 'btn primary', disabled: busy.value === k, onClick: () => salvarRede(k) }, 'Salvar') : null,
              h('button', { class: 'btn', disabled: !!busy.value || !!ed, onClick: () => testarRede(k) }, busy.value === 't' + k ? 'Testando…' : k === 'telegram' ? 'Conectar robô' : 'Testar conexão'),
            ]),
          ]);
        })) : null,

        aba.value === 'prefs' ? h('div', { class: 'grid g2' }, [
          h('div', { class: 'card stack' }, [
            h('h2', { class: 'sec' }, 'Como o Marketing trabalha'),
            h('div', { class: 'toggle', onClick: () => { prefs.usar_ia = !prefs.usar_ia; } }, [h('span', { class: 'switch' + (prefs.usar_ia ? ' on' : '') }), h('div', null, [h('b', null, 'Usar IA'), h('div', { class: 'tiny muted' }, 'Desligado: só modelos prontos, sem nenhum custo.')])]),
            h('div', { class: 'toggle', onClick: () => { prefs.exigir_aprovacao = !prefs.exigir_aprovacao; } }, [h('span', { class: 'switch' + (prefs.exigir_aprovacao ? ' on' : '') }), h('div', null, [h('b', null, 'Exigir aprovação antes de publicar'), h('div', { class: 'tiny muted' }, 'Posts novos chegam no Telegram com os botões.')])]),
            h(Field, { name: 'redes', field: { ...ent('posts').fields.redes, label: 'Redes padrão dos posts novos' }, modelValue: prefs.redes_padrao, 'onUpdate:modelValue': (v) => { prefs.redes_padrao = v; } }),
            h('div', { class: 'field' }, [h('label', null, 'Modelo de arte padrão'), h('select', { value: prefs.modelo_padrao, onChange: (e) => { prefs.modelo_padrao = e.target.value; } }, Object.entries(mkt.modelos?.modelos || {}).map(([k, m]) => h('option', { value: k }, m.nome)))]),
            h('div', { class: 'field' }, [h('label', null, 'Rodapé das artes'), h('input', { value: prefs.rodape, onInput: (e) => { prefs.rodape = e.target.value; } }), h('div', { class: 'help' }, 'Deixe vazio para não mostrar.')]),
            h('div', { class: 'field' }, [h('label', null, 'Sobre a empresa (a IA usa isso)'), h('textarea', { rows: 5, value: prefs.sobre, onInput: (e) => { prefs.sobre = e.target.value; } })]),
            h('div', { class: 'field' }, [h('label', null, 'Estilo das imagens de IA'), h('textarea', { rows: 3, value: prefs.estilo_imagem, onInput: (e) => { prefs.estilo_imagem = e.target.value; } })]),
          ]),
          h('div', { class: 'card stack' }, [
            h('h2', { class: 'sec' }, 'Modelos de legenda (sem IA)'),
            h('div', { class: 'tiny muted' }, 'Campos: {titulo} {texto} {hashtags} {whatsapp} {whatsapp_link} {site} {empresa}'),
            ...Object.keys(prefs.legendas || {}).map((r) => h('div', { class: 'field' }, [h('label', null, REDE_NOME[r] || r), h('textarea', { rows: 4, class: 'mono', value: prefs.legendas[r], onInput: (e) => { prefs.legendas[r] = e.target.value; } })])),
          ]),
          h('div', { class: 'span2 savebar' }, h('button', { class: 'btn primary', onClick: salvarPrefs }, [h(Icon, { n: 'check', s: 16 }), 'Salvar preferências'])),
        ]) : null,

        aba.value === 'robos' ? h('div', { class: 'stack', style: { maxWidth: '900px' } }, [
          h('div', { class: 'card stack' }, [h('h2', { class: 'sec' }, [h(Icon, { n: 'bot' }), 'Como os robôs funcionam']),
            h('ul', { class: 'muted', style: { margin: 0, paddingLeft: '18px' } }, [
              h('li', null, [h('b', null, 'Pontual: '), 'um post aprovado com data e hora é publicado sozinho no horário.']),
              h('li', null, [h('b', null, 'Programado: '), 'posts guardados na Biblioteca são publicados um por vez nos dias e horários da tarefa "Publicar o próximo post da biblioteca".']),
              h('li', null, [h('b', null, 'IA agendada: '), 'a tarefa "Criar posts com IA" gera novos posts para uma campanha (e manda para aprovação).']),
            ]),
            h('a', { class: 'btn primary', href: '/marketing/tarefas', style: { alignSelf: 'flex-start' } }, [h(Icon, { n: 'clock', s: 16 }), 'Ver e criar tarefas agendadas'])]),
          h('div', { class: 'card stack' }, [h('h2', { class: 'sec' }, [h(Icon, { n: 'zap' }), 'Manter os robôs sempre acordados']),
            h('p', { class: 'muted', style: { margin: 0 } }, 'Na hospedagem, o painel "dorme" quando ninguém acessa. Para os horários nunca atrasarem, crie no hPanel → Avançado → Cron Jobs um cron "a cada 5 minutos" com o comando:'),
            h(CodeBlock, { code: `curl -s ${D.public_url || location.origin}/publico/cron/SUA_CRON_KEY` }),
            h('div', { class: 'tiny muted' }, 'A CRON_KEY é definida nas variáveis do servidor.')]),
        ]) : null,
      ]);
    };
  },
});
