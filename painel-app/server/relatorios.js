// Relatórios por período: financeiro, inadimplência, receita por produto, clientes (entradas e saídas) e chamados.
const express = require('express');
const { q } = require('./db');
const { requireUser } = require('./auth');
const { wrap, HttpError, todaySql } = require('./util');

const router = express.Router();
router.use(requireUser);

const dataOk = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const num = (v) => Number(v || 0);

function meses(de, ate) {
  const out = []; let [y, m] = de.slice(0, 7).split('-').map(Number); const [y2, m2] = ate.slice(0, 7).split('-').map(Number);
  while (y < y2 || (y === y2 && m <= m2)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } if (out.length > 60) break; }
  return out;
}

async function relatorio(de, ate) {
  const hoje = todaySql();
  const fimDia = ate + ' 23:59:59';
  // As datas de criação e as do registro de atividades ficam em UTC; o período é em Brasília (UTC-3)
  const deUtc = new Date(Date.parse(de + 'T03:00:00Z')).toISOString().slice(0, 19).replace('T', ' ');
  const ateUtc = new Date(Date.parse(ate + 'T03:00:00Z') + 86400e3 - 1000).toISOString().slice(0, 19).replace('T', ' ');

  const [fin, porMes, porProduto, porForma, inad, cliIn, cliOut, licOut, ch, chPrio, chTop, mrr] = await Promise.all([
    q(`SELECT
      (SELECT COALESCE(SUM(valor),0) FROM cobrancas WHERE status='pago' AND pago_em BETWEEN ? AND ?) recebido,
      (SELECT COUNT(*) FROM cobrancas WHERE status='pago' AND pago_em BETWEEN ? AND ?) recebido_n,
      (SELECT COALESCE(SUM(valor),0) FROM cobrancas WHERE status<>'cancelado' AND vencimento BETWEEN ? AND ?) faturado,
      (SELECT COALESCE(SUM(valor),0) FROM cobrancas WHERE status IN ('pendente','atrasado') AND vencimento BETWEEN ? AND ?) em_aberto,
      (SELECT COALESCE(SUM(valor),0) FROM cobrancas WHERE status<>'cancelado' AND vencimento BETWEEN ? AND LEAST(?, ?)) vencido_total,
      (SELECT COALESCE(SUM(valor),0) FROM cobrancas WHERE status='atrasado' AND vencimento BETWEEN ? AND ?) atrasado_periodo,
      (SELECT COALESCE(SUM(valor),0) FROM cobrancas WHERE status='atrasado') atrasado_total,
      (SELECT AVG(DATEDIFF(pago_em, vencimento)) FROM cobrancas WHERE status='pago' AND pago_em BETWEEN ? AND ?) atraso_medio_dias`,
    [de, ate, de, ate, de, ate, de, ate, de, ate, hoje, de, ate, de, ate]),
    q(`SELECT DATE_FORMAT(pago_em,'%Y-%m') mes, SUM(valor) recebido FROM cobrancas WHERE status='pago' AND pago_em BETWEEN ? AND ? GROUP BY mes`, [de, ate]),
    q(`SELECT COALESCE(p.nome, 'Avulsas (sem licença)') produto, SUM(cb.valor) total, COUNT(*) n FROM cobrancas cb
      LEFT JOIN licencas l ON l.id=cb.licenca_id LEFT JOIN instalacoes i ON i.id=l.instalacao_id LEFT JOIN produtos p ON p.id=i.produto_id
      WHERE cb.status='pago' AND cb.pago_em BETWEEN ? AND ? GROUP BY produto ORDER BY total DESC`, [de, ate]),
    q(`SELECT COALESCE(forma,'não informada') forma, SUM(valor) total, COUNT(*) n FROM cobrancas WHERE status='pago' AND pago_em BETWEEN ? AND ? GROUP BY forma ORDER BY total DESC`, [de, ate]),
    q(`SELECT c.id, c.nome_fantasia cliente, c.whatsapp, COUNT(*) n, SUM(cb.valor) total, MIN(cb.vencimento) mais_antiga
      FROM cobrancas cb JOIN clientes c ON c.id=cb.cliente_id WHERE cb.status='atrasado' GROUP BY c.id ORDER BY total DESC LIMIT 50`),
    q(`SELECT id, nome_fantasia, cidade, uf, origem, cliente_desde FROM clientes WHERE cliente_desde BETWEEN ? AND ? ORDER BY cliente_desde DESC LIMIT 200`, [de, ate]),
    q(`SELECT a.entidade_id id, c.nome_fantasia, a.created_at, JSON_UNQUOTE(JSON_EXTRACT(a.mudancas,'$.status[1]')) novo_status
      FROM atividades a JOIN clientes c ON c.id=a.entidade_id
      WHERE a.entidade='clientes' AND a.created_at BETWEEN ? AND ? AND JSON_UNQUOTE(JSON_EXTRACT(a.mudancas,'$.status[1]')) IN ('cancelado','perdido','suspenso')
      ORDER BY a.created_at DESC LIMIT 200`, [deUtc, ateUtc]),
    q(`SELECT a.entidade_id id, l.chave, c.nome_fantasia, l.valor_mensal, a.created_at FROM atividades a JOIN licencas l ON l.id=a.entidade_id LEFT JOIN clientes c ON c.id=l.cliente_id
      WHERE a.entidade='licencas' AND a.created_at BETWEEN ? AND ? AND JSON_UNQUOTE(JSON_EXTRACT(a.mudancas,'$.status[1]')) IN ('cancelada','suspensa')
      ORDER BY a.created_at DESC LIMIT 200`, [deUtc, ateUtc]),
    q(`SELECT COUNT(*) abertos,
      SUM(resolvido_em IS NOT NULL) resolvidos,
      SUM(resolvido_em IS NOT NULL AND sla_limite IS NOT NULL AND resolvido_em <= sla_limite) no_prazo,
      SUM(resolvido_em IS NOT NULL AND sla_limite IS NOT NULL) com_prazo,
      AVG(CASE WHEN resolvido_em IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, created_at, resolvido_em) END) media_min
      FROM chamados WHERE created_at BETWEEN ? AND ?`, [deUtc, ateUtc]),
    q(`SELECT prioridade, COUNT(*) n, AVG(CASE WHEN resolvido_em IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, created_at, resolvido_em) END) media_min
      FROM chamados WHERE created_at BETWEEN ? AND ? GROUP BY prioridade`, [deUtc, ateUtc]),
    q(`SELECT c.id, c.nome_fantasia cliente, COUNT(*) n FROM chamados ch JOIN clientes c ON c.id=ch.cliente_id WHERE ch.created_at BETWEEN ? AND ?
      GROUP BY c.id ORDER BY n DESC LIMIT 10`, [deUtc, ateUtc]),
    q(`SELECT COALESCE(SUM(valor_mensal),0) mrr, COUNT(*) n, (SELECT COUNT(*) FROM clientes WHERE status='ativo') clientes_ativos FROM licencas WHERE status='ativa'`),
  ]);

  const f = fin[0];
  const ms = meses(de, ate); const pm = Object.fromEntries(porMes.map((r) => [r.mes, num(r.recebido)]));
  const c = ch[0];
  const ativos = num(mrr[0].clientes_ativos);
  const saidas = new Set(cliOut.filter((x) => x.novo_status === 'cancelado' || x.novo_status === 'perdido').map((x) => x.id)).size;
  return {
    periodo: { de, ate },
    financeiro: {
      recebido: num(f.recebido), recebido_n: num(f.recebido_n), faturado: num(f.faturado), em_aberto: num(f.em_aberto),
      atrasado_periodo: num(f.atrasado_periodo), atrasado_total: num(f.atrasado_total),
      inadimplencia: num(f.vencido_total) ? Math.round(num(f.atrasado_periodo) / num(f.vencido_total) * 1000) / 10 : 0,
      atraso_medio_dias: f.atraso_medio_dias == null ? null : Math.round(Number(f.atraso_medio_dias) * 10) / 10,
      mrr: num(mrr[0].mrr), licencas_ativas: num(mrr[0].n), ticket_medio: ativos ? Math.round(num(mrr[0].mrr) / ativos * 100) / 100 : 0,
      por_mes: ms.map((m) => ({ mes: m, recebido: pm[m] || 0 })),
      por_produto: porProduto.map((r) => ({ produto: r.produto, total: num(r.total), n: num(r.n) })),
      por_forma: porForma.map((r) => ({ forma: r.forma, total: num(r.total), n: num(r.n) })),
    },
    inadimplentes: inad.map((r) => ({ ...r, n: num(r.n), total: num(r.total) })),
    clientes: {
      ativos, novos: cliIn.length, saidas, churn: ativos + saidas ? Math.round(saidas / (ativos + saidas) * 1000) / 10 : 0,
      lista_novos: cliIn, lista_saidas: cliOut,
      licencas_canceladas: licOut.map((r) => ({ ...r, valor_mensal: num(r.valor_mensal) })),
      mrr_perdido: licOut.reduce((s, r) => s + num(r.valor_mensal), 0),
    },
    chamados: {
      abertos: num(c.abertos), resolvidos: num(c.resolvidos),
      no_prazo_pct: num(c.com_prazo) ? Math.round(num(c.no_prazo) / num(c.com_prazo) * 1000) / 10 : null,
      media_horas: c.media_min == null ? null : Math.round(Number(c.media_min) / 6) / 10,
      por_prioridade: chPrio.map((r) => ({ prioridade: r.prioridade, n: num(r.n), media_horas: r.media_min == null ? null : Math.round(Number(r.media_min) / 6) / 10 })),
      top_clientes: chTop.map((r) => ({ ...r, n: num(r.n) })),
    },
  };
}

router.get('/relatorios', wrap(async (req, res) => {
  const hoje = todaySql();
  const de = dataOk(req.query.de) ? req.query.de : hoje.slice(0, 8) + '01';
  const ate = dataOk(req.query.ate) ? req.query.ate : hoje;
  if (de > ate) throw new HttpError(400, 'A data inicial é depois da final.');
  if ((Date.parse(ate) - Date.parse(de)) / 864e5 > 366 * 5) throw new HttpError(400, 'Escolha um período de até 5 anos.');
  res.json(await relatorio(de, ate));
}));

module.exports = { router, relatorio };
