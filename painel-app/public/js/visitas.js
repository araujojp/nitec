/* Neon Gestão — Visitas do site (relatório por e-mail de cada visita ao neonsistemas.com) */
const VisitasPage = defineComponent({
  setup() {
    const d = ref(null), cfg = reactive({}), filtro = ref(store.route.query.filtro || ''), page = ref(1), busy = ref('');
    async function load() {
      try { d.value = await get(`visitas?filtro=${filtro.value}&page=${page.value}`); } catch (e) { erro(e); }
    }
    async function loadCfg() { try { Object.assign(cfg, await get('visitas/config')); } catch (e) { erro(e); } }
    onMounted(() => { load(); loadCfg(); });
    watch([filtro, page], () => { setQuery({ filtro: filtro.value }); load(); });
    async function salvar() { busy.value = 's'; try { await post('visitas/config', cfg); toast('Configuração salva.'); await loadCfg(); } catch (e) { erro(e); } busy.value = ''; }
    async function reenviar(v) { busy.value = 'e' + v.id; try { const r = await post(`visitas/${v.id}/enviar`); toast('Relatório enviado para ' + r.para.join(', ')); } catch (e) { erro(e); } busy.value = ''; }
    const sw = (k, on, off) => h('div', { class: 'toggle', onClick: () => { cfg[k] = !cfg[k]; } }, [h('span', { class: 'switch' + (cfg[k] ? ' on' : '') }), h('span', null, cfg[k] ? on : off)]);
    const dur = (ms) => { const s = Math.round(ms / 1000); return s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min` : `${Math.floor(s / 3600)} h ${Math.floor(s / 60) % 60} min`; };
    return () => {
      const v = d.value;
      return h('div', null, [
        h('div', { class: 'page-head' }, [h('div', null, [h('h1', null, 'Visitas do site'), h('p', null, 'Cada visita ao neonsistemas.com: de onde veio, localização provável, aparelho e tudo o que fez. Um relatório de cada visita vai por e-mail.')])]),
        cfg.email !== undefined && !cfg.email_pronto ? h('div', { class: 'callout warn', style: { marginBottom: '16px' } }, [h(Icon, { n: 'alert' }), h('div', null, ['Os e-mails ainda não saem: falta a senha do e-mail de avisos em ', h('a', { href: '/configuracoes?aba=alertas' }, 'Configurações → Alertas'), '. As visitas já estão sendo registradas aqui.'])]) : null,
        v ? h('div', { class: 'grid g3' }, [
          h('div', { class: 'card kpi', style: { '--c': '#38bdf8' } }, [h('div', { class: 'lbl' }, 'Visitas hoje'), h('div', { class: 'val' }, fmt.int(v.hoje.visitas))]),
          h('div', { class: 'card kpi', style: { '--c': '#ff7a1a' } }, [h('div', { class: 'lbl' }, 'Formulários enviados hoje'), h('div', { class: 'val' }, fmt.int(v.hoje.formularios))]),
          h('div', { class: 'card kpi', style: { '--c': '#22c55e' } }, [h('div', { class: 'lbl' }, 'Cliques no WhatsApp hoje'), h('div', { class: 'val' }, fmt.int(v.hoje.whatsapp))]),
        ]) : h('div', { class: 'skeleton', style: { height: '100px' } }),
        h('div', { class: 'card pad0', style: { marginTop: '16px' } }, [
          h('div', { class: 'filters' }, [['', 'Todas'], ['contato', 'Com formulário ou WhatsApp'], ['voltaram', 'Visitantes que voltaram'], ['robos', 'Robôs e servidores']].map(([k, l]) => h('button', { class: 'chip' + (filtro.value === k ? ' on' : ''), onClick: () => { filtro.value = k; page.value = 1; } }, l))),
          !v ? null : !v.data.length ? h('div', { class: 'empty' }, [h(Icon, { n: 'globe', s: 40, w: 1.5 }), h('b', null, 'Nenhuma visita registrada ainda'), 'Assim que alguém abrir o site, ela aparece aqui.']) : [
            h('div', { class: 'list' }, v.data.map((x) => h('div', { class: 'li', style: { flexWrap: 'wrap', rowGap: '6px' } }, [
              h('a', { class: 'grow', href: `/api/visitas/${x.id}/relatorio`, target: '_blank', rel: 'noopener', style: { color: 'inherit', minWidth: '240px' } }, [
                h('div', { class: 't row gap-s', style: { flexWrap: 'wrap' } }, [`${x.local} · ${x.aparelho}`,
                  x.formulario === 2 ? h('span', { class: 'badge', style: { '--c': '#ff7a1a' } }, 'enviou formulário') : x.formulario === 1 ? h('span', { class: 'badge', style: { '--c': '#f59e0b' } }, 'começou o formulário') : null,
                  x.whatsapp ? h('span', { class: 'badge', style: { '--c': '#22c55e' } }, 'WhatsApp') : null, x.robo ? h('span', { class: 'badge plain' }, 'robô/servidor') : null]),
                h('div', { class: 's' }, `${fmt.dt(x.inicio)} · ${x.origem} · ${x.paginas || 1} pág. · ${dur(x.duracao_ms)} · IP ${x.ip || '—'}${x.provedor ? ' (' + x.provedor + ')' : ''}`),
              ]),
              h('span', { class: 'small muted nowrap', title: 'Situação do e-mail' }, x.email === 'enviado' ? '✉️ enviado' : x.email ? x.email.split(':')[0] : 'aguardando o fim da visita'),
              h('button', { class: 'btn sm ghost', disabled: busy.value === 'e' + x.id, onClick: () => reenviar(x), title: 'Mandar este relatório por e-mail' }, [h(Icon, { n: 'mail', s: 14 }), 'Enviar']),
            ]))),
            v.total > 50 ? h('div', { class: 'pager' }, [`${v.total} visitas`, h('span', { style: { marginLeft: 'auto' } }), h('button', { class: 'btn sm', disabled: page.value <= 1, onClick: () => page.value-- }, h(Icon, { n: 'left', s: 16 })), h('button', { class: 'btn sm', disabled: page.value * 50 >= v.total, onClick: () => page.value++ }, h(Icon, { n: 'right', s: 16 }))]) : null,
          ],
        ]),
        cfg.email !== undefined ? h('div', { class: 'card stack', style: { marginTop: '16px', maxWidth: '760px' } }, [
          h('h2', { class: 'sec' }, [h(Icon, { n: 'mail' }), 'Relatório por e-mail']),
          sw('ativo', 'Registro de visitas ligado', 'Registro de visitas desligado (nada é gravado nem enviado)'),
          h('div', { class: 'field' }, [h('label', { for: 'vis-email' }, 'Quem recebe (separe por vírgula)'), h('input', { id: 'vis-email', value: cfg.email, onInput: (e) => { cfg.email = e.target.value; } })]),
          h('div', { class: 'field' }, [h('label', null, 'Quais visitas viram e-mail'), h('div', { class: 'seg' }, [['todas', 'Todas'], ['interacao', 'Só com interação (clique, formulário ou mais de 30 s)']].map(([k, l]) => h('button', { class: cfg.modo === k ? 'on' : '', onClick: () => { cfg.modo = k; } }, l)))]),
          sw('imediato', 'Avisar na hora: chegada, formulário, WhatsApp e calculadora', 'Só o relatório completo no fim da visita'),
          sw('robos', 'Mandar também visitas de robôs e servidores', 'Não mandar visitas de robôs e servidores'),
          sw('resumo', 'Resumo do dia por e-mail', 'Sem resumo do dia'),
          cfg.resumo ? h('div', { class: 'field', style: { maxWidth: '260px' } }, [h('label', { for: 'vis-hora' }, 'Hora do resumo (Brasília)'), h('input', { id: 'vis-hora', inputmode: 'numeric', value: cfg.resumo_hora, onInput: (e) => { cfg.resumo_hora = e.target.value; } })]) : null,
          h('div', { class: 'small muted' }, 'Avisos na hora: quando alguém entra no site e a cada ação importante. O relatório completo, com todos os cliques, chega logo que a pessoa fecha o site (ou 5 minutos depois da última atividade). Os dados ficam guardados por 12 meses.'),
          h('div', null, h('button', { class: 'btn primary', disabled: busy.value === 's', onClick: salvar }, 'Salvar')),
        ]) : null,
      ]);
    };
  },
});
