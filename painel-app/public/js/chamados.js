/* Neon Gestão — chamados: prazo (SLA), conversa e configuração */

// "vence em 3 h", "estourou há 2 h", "no prazo"
function slaInfo(r) {
  if (!r || !r.sla_limite) return null;
  const lim = toDate(r.sla_limite).getTime();
  const aberto = ['aberto', 'andamento', 'aguardando'].includes(r.status);
  const dur = (ms) => { const m = Math.abs(ms) / 60000; if (m < 60) return `${Math.max(1, Math.round(m))} min`; if (m < 48 * 60) return `${Math.round(m / 60)} h`; return `${Math.round(m / 1440)} dias`; };
  if (aberto) {
    const falta = lim - Date.now();
    if (falta < 0) return { cor: 'var(--red)', txt: `estourou há ${dur(falta)}`, icone: 'alert' };
    return { cor: falta < 4 * 3600e3 ? 'var(--yellow)' : 'var(--muted)', txt: `vence em ${dur(falta)}`, icone: 'clock' };
  }
  if (!r.resolvido_em) return null;
  return toDate(r.resolvido_em).getTime() <= lim ? { cor: 'var(--green)', txt: 'resolvido no prazo', icone: 'check' } : { cor: 'var(--muted)', txt: 'resolvido fora do prazo', icone: 'clock' };
}
function SlaTag(r) { const s = slaInfo(r); return s ? h('span', { class: 'row gap-s nowrap', style: { color: s.cor, fontWeight: 600, fontSize: '13px' }, title: 'Prazo: ' + fmt.dt(r.sla_limite) }, [h(Icon, { n: s.icone, s: 14 }), s.txt]) : h('span', { class: 'dim' }, '—'); }

const ChamadoConversa = defineComponent({
  props: { chamado: Object }, emits: ['change'],
  setup(p, { emit }) {
    const itens = ref(null); const texto = ref(''); const enviar = ref(false); const ocupado = ref(false);
    async function load() { try { itens.value = (await get(`chamados/${p.chamado.id}/conversa`)).data; } catch (e) { erro(e); itens.value = []; } }
    onMounted(load);
    async function comentar() {
      if (!texto.value.trim()) return;
      ocupado.value = true;
      try {
        const r = await post(`chamados/${p.chamado.id}/comentarios`, { texto: texto.value, enviar_cliente: enviar.value });
        if (enviar.value) toast(r.data.enviado_cliente ? 'Comentário salvo e enviado ao cliente.' : `Comentário salvo, mas não foi enviado: ${r.data.envio_status}`, r.data.enviado_cliente ? 'ok' : 'err', 7000);
        else toast('Comentário salvo.');
        texto.value = ''; enviar.value = false; await load(); emit('change');
      } catch (e) { erro(e); }
      ocupado.value = false;
    }
    async function apagar(c) {
      if (!(await confirmar('Apagar comentário?', 'Ele some da conversa. E-mails já enviados ao cliente não voltam.', { ok: 'Apagar', perigo: true }))) return;
      try { await del(`chamados/comentarios/${c.id}`); await load(); } catch (e) { erro(e); }
    }
    return () => h('div', { class: 'stack' }, [
      can.write() ? h('div', { class: 'card stack' }, [
        h('div', { class: 'field' }, h('textarea', { rows: 3, 'aria-label': 'Comentário', placeholder: 'Escreva uma atualização, o que foi feito ou uma pergunta…', value: texto.value, onInput: (e) => { texto.value = e.target.value; } })),
        h('div', { class: 'row gap-s', style: { flexWrap: 'wrap' } }, [
          h('label', { class: 'row gap-s', style: { cursor: 'pointer', userSelect: 'none' } }, [h('input', { type: 'checkbox', checked: enviar.value, onChange: (e) => { enviar.value = e.target.checked; }, style: { width: '18px', height: '18px', accentColor: 'var(--orange)' } }), h('span', null, 'Enviar também para o cliente por e-mail')]),
          h('button', { class: 'btn primary', style: { marginLeft: 'auto' }, disabled: ocupado.value || !texto.value.trim(), onClick: comentar }, [h(Icon, { n: enviar.value ? 'send' : 'chat', s: 16 }), ocupado.value ? 'Salvando…' : enviar.value ? 'Salvar e enviar' : 'Salvar comentário']),
        ]),
      ]) : null,
      h('div', { class: 'card' }, !itens.value ? h('div', { class: 'skeleton', style: { height: '120px' } })
        : !itens.value.length ? h('div', { class: 'empty' }, 'Nada registrado ainda.')
          : h('div', { class: 'timeline' }, [...itens.value].reverse().map((i) => h('div', { class: 'tl' }, [
            h('div', { class: 'when row gap-s', style: { flexWrap: 'wrap' } }, [
              `${fmt.dt(i.created_at)} · ${i.usuario_nome || 'Sistema'}`,
              i.tipo === 'comentario' && i.enviado_cliente ? h('span', { class: 'badge', style: { '--c': '#22c55e' } }, 'enviado ao cliente') : null,
              i.tipo === 'comentario' && (i.usuario_id === store.user.id || can.admin()) ? h('button', { class: 'btn ghost sm icon', title: 'Apagar', onClick: () => apagar(i), style: { marginLeft: 'auto' } }, h(Icon, { n: 'trash', s: 14 })) : null,
            ]),
            i.tipo === 'comentario' ? h('div', { style: { whiteSpace: 'pre-line' } }, i.texto)
              : h('div', { class: i.tipo === 'evento' ? 'muted small' : 'small' }, [i.tipo === 'sistema' ? '✉️ ' : '', i.texto, i.envio_status ? h('span', { class: 'muted' }, ` — ${i.envio_status}`) : null]),
          ])))),
    ]);
  },
});

const ChamadosConfig = defineComponent({
  setup() {
    const f = reactive({ sla: {} }); const ok = ref(false); const ind = ref(null);
    onMounted(async () => { try { Object.assign(f, await get('chamados-config')); ind.value = await get('chamados-sla'); ok.value = true; } catch (e) { erro(e); } });
    async function salvar() { try { await post('chamados-config', { sla: f.sla, email_abertura: f.email_abertura, email_resolucao: f.email_resolucao }); toast('Configuração dos chamados salva.'); } catch (e) { erro(e); } }
    const sw = (k, on, off) => h('div', { class: 'toggle', onClick: () => { f[k] = !f[k]; } }, [h('span', { class: 'switch' + (f[k] ? ' on' : '') }), h('span', null, f[k] ? on : off)]);
    const prios = [['urgente', 'Urgente', '#ef4444'], ['alta', 'Alta', '#f59e0b'], ['media', 'Média', '#38bdf8'], ['baixa', 'Baixa', '#94a3b8']];
    return () => !ok.value ? h('div', { class: 'skeleton', style: { height: '240px' } }) : h('div', { class: 'stack', style: { maxWidth: '900px' } }, [
      ind.value ? h('div', { class: 'mini-stats' }, [
        ['Fora do prazo agora', ind.value.estourados, ind.value.estourados ? 'var(--red)' : null], ['Vencem em até 4 h', ind.value.vencendo, ind.value.vencendo ? 'var(--yellow)' : null],
        ['Resolvidos (30 dias)', ind.value.resolvidos], ['No prazo (30 dias)', ind.value.resolvidos ? Math.round(ind.value.no_prazo / ind.value.resolvidos * 100) + '%' : '—'],
        ['Tempo médio', ind.value.media_horas == null ? '—' : String(ind.value.media_horas).replace('.', ',') + ' h'],
      ].map(([l, v, c]) => h('div', { class: 'card' }, [h('div', { class: 'v', style: c ? { color: c } : null }, v), h('div', { class: 'l' }, l)]))) : null,
      h('div', { class: 'grid g2' }, [
        h('div', { class: 'card stack' }, [h('h2', { class: 'sec' }, [h(Icon, { n: 'clock' }), 'Prazo de atendimento (SLA)']),
          h('p', { class: 'muted small', style: { margin: 0 } }, 'Horas corridas, contadas da abertura do chamado. Quando o prazo estoura, a equipe recebe um alerta.'),
          h('div', { class: 'form' }, prios.map(([k, l, c]) => h('div', { class: 'field' }, [h('label', { class: 'row gap-s' }, [h('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: c } }), l + ' (horas)']), h('input', { inputmode: 'numeric', value: f.sla[k], onInput: (e) => { f.sla[k] = e.target.value; } })]))),
        ]),
        h('div', { class: 'card stack' }, [h('h2', { class: 'sec' }, [h(Icon, { n: 'mail' }), 'E-mails para o cliente']),
          h('p', { class: 'muted small', style: { margin: 0 } }, 'Vão para o e-mail do cadastro do cliente, saindo da caixa de avisos (Configurações → Alertas).'),
          sw('email_abertura', 'Avisar o cliente quando o chamado é aberto', 'Não avisar na abertura'),
          sw('email_resolucao', 'Avisar o cliente quando o chamado é resolvido (com a solução)', 'Não avisar na resolução'),
          h('div', { class: 'small muted' }, 'Na aba "Conversa" do chamado você também pode mandar atualizações ao cliente.'),
        ]),
      ]),
      h('div', null, h('button', { class: 'btn primary', onClick: salvar }, 'Salvar')),
    ]);
  },
});
