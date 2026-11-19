/* Neon Gestão — Relatórios por período (financeiro, inadimplência, clientes e chamados) */

function periodoPreset(k) {
  const hoje = hojeISO(); const [y, m] = hoje.split('-').map(Number); const p = (n) => String(n).padStart(2, '0');
  const ultimo = (yy, mm) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  if (k === 'mes') return [`${y}-${p(m)}-01`, hoje];
  if (k === 'anterior') { const yy = m === 1 ? y - 1 : y, mm = m === 1 ? 12 : m - 1; return [`${yy}-${p(mm)}-01`, `${yy}-${p(mm)}-${ultimo(yy, mm)}`]; }
  if (k === '3m') { const d = new Date(Date.UTC(y, m - 3, 1)); return [d.toISOString().slice(0, 10), hoje]; }
  if (k === '12m') { const d = new Date(Date.UTC(y, m - 12, 1)); return [d.toISOString().slice(0, 10), hoje]; }
  if (k === 'ano') return [`${y}-01-01`, hoje];
  return [`${y}-${p(m)}-01`, hoje];
}

function baixarCsv(nome, cab, linhas) {
  const esc = (v) => { const s = v == null ? '' : String(v); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const txt = '﻿' + [cab, ...linhas].map((l) => l.map(esc).join(';')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' })); a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const moneyCsv = (v) => Number(v || 0).toFixed(2).replace('.', ',');
const FORMA_NOME = { pix: 'Pix', boleto: 'Boleto', transferencia: 'Transferência', cartao: 'Cartão', dinheiro: 'Dinheiro' };
const PRIO_NOME = { urgente: 'Urgente', alta: 'Alta', media: 'Média', baixa: 'Baixa' };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const RelatoriosPage = defineComponent({
  setup() {
    const q0 = store.route.query;
    const per = reactive({ preset: q0.p || (q0.de ? '' : 'mes'), de: q0.de || periodoPreset('mes')[0], ate: q0.ate || periodoPreset('mes')[1] });
    if (per.preset) [per.de, per.ate] = periodoPreset(per.preset);
    const d = ref(null); const carregando = ref(false); const canvas = ref(null); let chart;
    async function load() {
      carregando.value = true; setQuery({ p: per.preset || '', de: per.preset ? '' : per.de, ate: per.preset ? '' : per.ate });
      try { d.value = await get(`relatorios?de=${per.de}&ate=${per.ate}`); await nextTick(); desenhar(); } catch (e) { erro(e); }
      carregando.value = false;
    }
    function desenhar() {
      if (!canvas.value || !window.Chart || !d.value) return;
      chart && chart.destroy();
      const css = getComputedStyle(document.documentElement); const muted = css.getPropertyValue('--muted').trim(), line = css.getPropertyValue('--line').trim();
      const pm = d.value.financeiro.por_mes;
      chart = new Chart(canvas.value.getContext('2d'), {
        type: 'bar',
        data: { labels: pm.map((x) => MESES[Number(x.mes.slice(5)) - 1] + '/' + x.mes.slice(2, 4)), datasets: [{ label: 'Recebido', data: pm.map((x) => x.recebido), backgroundColor: '#ff7a1a', borderRadius: 6, maxBarThickness: 38 }] },
        options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ' ' + fmt.money(c.raw) } } },
          scales: { x: { ticks: { color: muted }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: muted, callback: (v) => 'R$ ' + Number(v).toLocaleString('pt-BR') }, grid: { color: line } } } },
      });
    }
    onMounted(() => { if (window.Chart) load(); else window.addEventListener('load', load, { once: true }); setTimeout(() => { if (!d.value) load(); }, 600); });
    onBeforeUnmount(() => chart && chart.destroy());
    const escolher = (k) => { per.preset = k; [per.de, per.ate] = periodoPreset(k); load(); };

    const K = (lbl, val, sub, cor) => h('div', { class: 'card kpi', style: { '--c': cor || '#ff7a1a' } }, [h('div', { class: 'lbl' }, lbl), h('div', { class: 'val' }, val), sub ? h('div', { class: 'sub' }, sub) : null]);
    const sec = (icone, titulo, acoes, corpo) => h('div', { class: 'card pad0 rel-sec' }, [h('div', { class: 'card-head' }, [h(Icon, { n: icone }), h('h3', null, titulo), acoes ? h('div', { class: 'actions no-print' }, acoes) : null]), corpo]);
    const csvBtn = (fn) => h('button', { class: 'btn sm ghost', onClick: fn }, [h(Icon, { n: 'download', s: 14 }), 'CSV']);
    const barras = (itens, rotulo, valor, fmtV) => { const max = Math.max(1, ...itens.map(valor)); return h('div', { class: 'list' }, itens.map((x) => h('div', { class: 'li' }, [h('div', { class: 'grow' }, [h('div', { class: 'row' }, [h('span', { class: 't small' }, rotulo(x)), h('span', { class: 'small', style: { marginLeft: 'auto', fontWeight: 700 } }, fmtV(x))]), h('div', { class: 'progress', style: { marginTop: '6px' } }, h('div', { style: { width: (valor(x) / max * 100) + '%' } }))])]))); };
    const vazio = (t) => h('div', { class: 'empty', style: { padding: '24px' } }, t);
    const nomeArq = (n) => `${n}-${per.de}-a-${per.ate}.csv`;

    return () => {
      const v = d.value;
      return h('div', { class: 'relatorios' }, [
        h('div', { class: 'page-head' }, [h('div', null, [h('h1', null, 'Relatórios'), h('p', null, v ? `De ${fmt.date(v.periodo.de)} a ${fmt.date(v.periodo.ate)}` : 'Números do negócio por período.')]),
          h('div', { class: 'actions no-print' }, h('button', { class: 'btn', onClick: () => window.print() }, [h(Icon, { n: 'download', s: 16 }), 'Imprimir / PDF']))]),
        h('div', { class: 'card no-print', style: { marginBottom: '16px' } }, h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '10px' } }, [
          ...[['mes', 'Este mês'], ['anterior', 'Mês passado'], ['3m', '3 meses'], ['12m', '12 meses'], ['ano', 'Este ano']].map(([k, l]) => h('button', { class: 'chip' + (per.preset === k ? ' on' : ''), onClick: () => escolher(k) }, l)),
          h('div', { class: 'row gap-s', style: { marginLeft: 'auto', flexWrap: 'wrap' } }, [
            h('input', { class: 'input', type: 'date', value: per.de, 'aria-label': 'De', onChange: (e) => { per.de = e.target.value; per.preset = ''; }, style: { width: '160px' } }),
            h('span', { class: 'muted' }, 'até'),
            h('input', { class: 'input', type: 'date', value: per.ate, 'aria-label': 'Até', onChange: (e) => { per.ate = e.target.value; per.preset = ''; }, style: { width: '160px' } }),
            h('button', { class: 'btn primary', disabled: carregando.value, onClick: load }, carregando.value ? 'Carregando…' : 'Ver'),
          ]),
        ])),
        !v ? h('div', { class: 'grid g4' }, [1, 2, 3, 4].map(() => h('div', { class: 'skeleton', style: { height: '112px' } }))) : [
          h('h2', { class: 'rel-h' }, 'Financeiro'),
          h('div', { class: 'grid g4' }, [
            K('Recebido no período', fmt.money(v.financeiro.recebido), `${v.financeiro.recebido_n} pagamento(s)`, '#22c55e'),
            K('Faturado (vencimentos no período)', fmt.money(v.financeiro.faturado), `${fmt.money(v.financeiro.em_aberto)} ainda em aberto`, '#38bdf8'),
            K('Inadimplência do período', String(v.financeiro.inadimplencia).replace('.', ',') + '%', `${fmt.money(v.financeiro.atrasado_periodo)} atrasado`, v.financeiro.inadimplencia > 10 ? '#ef4444' : '#f59e0b'),
            K('Receita mensal recorrente', fmt.money(v.financeiro.mrr), `${v.financeiro.licencas_ativas} licença(s) · ticket ${fmt.money(v.financeiro.ticket_medio)}`, '#ff7a1a'),
          ]),
          h('div', { class: 'grid g3', style: { marginTop: '16px' } }, [
            h('div', { class: 'card span2' }, [h('h2', { class: 'sec' }, [h(Icon, { n: 'chart' }), 'Recebido por mês']), h('div', { class: 'chart-box' }, h('canvas', { ref: canvas, 'aria-label': 'Gráfico do valor recebido por mês' }))]),
            sec('box', 'Por produto', [csvBtn(() => baixarCsv(nomeArq('receita-por-produto'), ['Produto', 'Recebido', 'Pagamentos'], v.financeiro.por_produto.map((x) => [x.produto, moneyCsv(x.total), x.n])))],
              v.financeiro.por_produto.length ? barras(v.financeiro.por_produto, (x) => x.produto, (x) => x.total, (x) => fmt.money(x.total)) : vazio('Nenhum pagamento no período.')),
          ]),
          h('div', { class: 'grid g2', style: { marginTop: '16px' } }, [
            sec('alert', `Inadimplentes agora (${fmt.money(v.financeiro.atrasado_total)})`, [csvBtn(() => baixarCsv(nomeArq('inadimplentes'), ['Cliente', 'Cobranças', 'Total', 'Mais antiga', 'WhatsApp'], v.inadimplentes.map((x) => [x.cliente, x.n, moneyCsv(x.total), fmt.date(x.mais_antiga), x.whatsapp || ''])))],
              v.inadimplentes.length ? h('div', { class: 'list' }, v.inadimplentes.map((x) => h('div', { class: 'li' }, [
                h('a', { class: 'grow', href: `/clientes/${x.id}`, style: { color: 'inherit' } }, [h('div', { class: 't' }, x.cliente), h('div', { class: 's' }, `${x.n} cobrança(s) · desde ${fmt.date(x.mais_antiga)}`)]),
                h('b', { class: 'nowrap', style: { color: 'var(--red)' } }, fmt.money(x.total)),
                x.whatsapp ? h('a', { class: 'btn sm icon wa no-print', target: '_blank', href: waLink(x.whatsapp, `Olá! Tudo bem? Consta em aberto ${x.n > 1 ? x.n + ' mensalidades' : '1 mensalidade'} no total de ${fmt.money(x.total)}. Podemos regularizar?`), title: 'Cobrar no WhatsApp' }, h(Icon, { n: 'whatsapp', s: 16 })) : null,
              ]))) : vazio('Ninguém em atraso 👏')),
            sec('money', 'Formas de pagamento', null, v.financeiro.por_forma.length ? barras(v.financeiro.por_forma, (x) => `${FORMA_NOME[x.forma] || x.forma} (${x.n})`, (x) => x.total, (x) => fmt.money(x.total)) : vazio('Nenhum pagamento no período.')),
          ]),
          v.financeiro.atraso_medio_dias != null ? h('p', { class: 'muted small' }, `Em média, os pagamentos do período chegaram ${v.financeiro.atraso_medio_dias > 0 ? String(v.financeiro.atraso_medio_dias).replace('.', ',') + ' dia(s) depois' : 'até'} do vencimento.`) : null,

          h('h2', { class: 'rel-h' }, 'Clientes'),
          h('div', { class: 'grid g4' }, [
            K('Clientes ativos', fmt.int(v.clientes.ativos), 'hoje', '#22c55e'),
            K('Novos no período', fmt.int(v.clientes.novos), 'pela data "cliente desde"', '#38bdf8'),
            K('Saídas no período', fmt.int(v.clientes.saidas), `cancelamento ${String(v.clientes.churn).replace('.', ',')}%`, v.clientes.saidas ? '#ef4444' : '#94a3b8'),
            K('Receita perdida', fmt.money(v.clientes.mrr_perdido), `${v.clientes.licencas_canceladas.length} licença(s) cancelada(s)/suspensa(s)`, '#f59e0b'),
          ]),
          h('div', { class: 'grid g2', style: { marginTop: '16px' } }, [
            sec('users', 'Entraram', [csvBtn(() => baixarCsv(nomeArq('clientes-novos'), ['Cliente', 'Cidade', 'UF', 'Origem', 'Cliente desde'], v.clientes.lista_novos.map((x) => [x.nome_fantasia, x.cidade || '', x.uf || '', x.origem || '', fmt.date(x.cliente_desde)])))],
              v.clientes.lista_novos.length ? h('div', { class: 'list' }, v.clientes.lista_novos.map((x) => h('a', { class: 'li', href: `/clientes/${x.id}` }, [h('div', { class: 'grow' }, [h('div', { class: 't' }, x.nome_fantasia), h('div', { class: 's' }, [x.cidade, x.uf].filter(Boolean).join('/') || '—')]), h('span', { class: 'muted small nowrap' }, fmt.date(x.cliente_desde))]))) : vazio('Nenhum cliente novo no período.')),
            sec('logout', 'Saíram', [csvBtn(() => baixarCsv(nomeArq('clientes-saidas'), ['Cliente', 'Novo status', 'Quando'], v.clientes.lista_saidas.map((x) => [x.nome_fantasia, x.novo_status, fmt.dt(x.created_at)])))],
              v.clientes.lista_saidas.length ? h('div', { class: 'list' }, v.clientes.lista_saidas.map((x) => h('a', { class: 'li', href: `/clientes/${x.id}` }, [h('div', { class: 'grow' }, [h('div', { class: 't' }, x.nome_fantasia), h('div', { class: 's' }, x.novo_status)]), h('span', { class: 'muted small nowrap' }, fmt.date(String(x.created_at).slice(0, 10)))]))) : vazio('Nenhuma saída no período 🎉')),
          ]),

          h('h2', { class: 'rel-h' }, 'Suporte'),
          h('div', { class: 'grid g4' }, [
            K('Chamados abertos no período', fmt.int(v.chamados.abertos), `${v.chamados.resolvidos} resolvido(s)`, '#38bdf8'),
            K('Resolvidos no prazo', v.chamados.no_prazo_pct == null ? '—' : String(v.chamados.no_prazo_pct).replace('.', ',') + '%', 'dos que tinham prazo', v.chamados.no_prazo_pct != null && v.chamados.no_prazo_pct < 80 ? '#ef4444' : '#22c55e'),
            K('Tempo médio de solução', v.chamados.media_horas == null ? '—' : String(v.chamados.media_horas).replace('.', ',') + ' h', 'da abertura à resolução', '#a78bfa'),
            K('Mais urgentes', fmt.int((v.chamados.por_prioridade.find((x) => x.prioridade === 'urgente')?.n || 0) + (v.chamados.por_prioridade.find((x) => x.prioridade === 'alta')?.n || 0)), 'alta + urgente', '#f59e0b'),
          ]),
          h('div', { class: 'grid g2', style: { marginTop: '16px' } }, [
            sec('lifebuoy', 'Por prioridade', null, v.chamados.por_prioridade.length ? barras(['urgente', 'alta', 'media', 'baixa'].map((k) => v.chamados.por_prioridade.find((x) => x.prioridade === k)).filter(Boolean), (x) => `${PRIO_NOME[x.prioridade] || x.prioridade}${x.media_horas != null ? ` · média ${String(x.media_horas).replace('.', ',')} h` : ''}`, (x) => x.n, (x) => fmt.int(x.n)) : vazio('Nenhum chamado no período.')),
            sec('users', 'Clientes com mais chamados', [csvBtn(() => baixarCsv(nomeArq('chamados-por-cliente'), ['Cliente', 'Chamados'], v.chamados.top_clientes.map((x) => [x.cliente, x.n])))],
              v.chamados.top_clientes.length ? barras(v.chamados.top_clientes, (x) => x.cliente, (x) => x.n, (x) => fmt.int(x.n)) : vazio('Nenhum chamado no período.')),
          ]),
        ],
      ]);
    };
  },
});
