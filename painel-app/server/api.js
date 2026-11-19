// Rotas especiais do painel: dashboard, busca, agenda, funil, token de equipamento, atividade, configurações e backup.
const express = require('express');
const { q, one } = require('./db');
const { ENTITIES } = require('./entities');
const { requireUser, requireAdmin, canWrite } = require('./auth');
const { deviceToken, sha256, audit, todaySql, nowSql, wrap, HttpError } = require('./util');
const { runAutomations } = require('./automations');

const router = express.Router();
router.use(requireUser);

// ---------------- Dashboard ----------------
router.get('/dashboard', wrap(async (req, res) => {
  const hoje = todaySql();
  // Indicadores numa única consulta; listas em paralelo
  const kpiRow = one(`SELECT
    (SELECT COUNT(*) FROM clientes WHERE status='ativo') clientes_ativos,
    (SELECT COUNT(*) FROM clientes WHERE status IN ('lead','negociacao')) leads,
    (SELECT COUNT(*) FROM instalacoes WHERE status='ativa') instalacoes_ativas,
    (SELECT COUNT(*) FROM instalacoes WHERE status='ativa' AND ultimo_contato > UTC_TIMESTAMP() - INTERVAL 2 HOUR) online,
    (SELECT COUNT(*) FROM chamados WHERE status IN ('aberto','andamento','aguardando')) chamados_abertos,
    (SELECT COUNT(*) FROM chamados WHERE status IN ('aberto','andamento','aguardando') AND prioridade IN ('alta','urgente')) chamados_urgentes,
    (SELECT COALESCE(SUM(valor_mensal),0) FROM licencas WHERE status='ativa') receita_mensal,
    (SELECT COALESCE(SUM(valor),0) FROM cobrancas WHERE status IN ('pendente','atrasado')) a_receber,
    (SELECT COALESCE(SUM(valor),0) FROM cobrancas WHERE status='atrasado') atrasado,
    (SELECT COALESCE(SUM(valor),0) FROM cobrancas WHERE status='pago' AND DATE_FORMAT(pago_em,'%Y-%m')=?) recebido_mes,
    (SELECT COUNT(*) FROM licencas WHERE status='ativa' AND vencimento BETWEEN ? AND DATE_ADD(?, INTERVAL 30 DAY)) licencas_vencendo,
    (SELECT COUNT(*) FROM contatos WHERE concluido=0 AND lembrete IS NOT NULL AND lembrete <= ?) lembretes_hoje`,
  [hoje.slice(0, 7), hoje, hoje, hoje + ' 23:59:59']);
  const [kr, chamados, sinais, vencendo, atrasadas, novos, receita, funil, lembretes] = await Promise.all([
    kpiRow,
    q(`SELECT c.id, c.titulo, c.prioridade, c.status, c.created_at, cl.nome_fantasia cliente
    FROM chamados c JOIN clientes cl ON cl.id=c.cliente_id WHERE c.status IN ('aberto','andamento','aguardando')
    ORDER BY FIELD(c.prioridade,'urgente','alta','media','baixa'), c.created_at DESC LIMIT 8`),
    q(`SELECT i.id, i.codigo, i.versao_instalada, i.ultimo_contato, cl.nome_fantasia cliente,
    (i.ultimo_contato > UTC_TIMESTAMP() - INTERVAL 2 HOUR) online,
    (SELECT evento FROM checkins WHERE instalacao_id=i.id ORDER BY id DESC LIMIT 1) evento
    FROM instalacoes i JOIN clientes cl ON cl.id=i.cliente_id WHERE i.ultimo_contato IS NOT NULL ORDER BY i.ultimo_contato DESC LIMIT 8`),
    q(`SELECT l.id, l.chave, l.vencimento, l.valor_mensal, i.codigo, cl.nome_fantasia cliente
    FROM licencas l JOIN instalacoes i ON i.id=l.instalacao_id JOIN clientes cl ON cl.id=i.cliente_id
    WHERE l.status='ativa' AND l.vencimento <= DATE_ADD(?, INTERVAL 30 DAY) ORDER BY l.vencimento LIMIT 8`, [hoje]),
    q(`SELECT cb.id, cb.competencia, cb.valor, cb.vencimento, cl.nome_fantasia cliente, cl.whatsapp
    FROM cobrancas cb JOIN clientes cl ON cl.id=cb.cliente_id WHERE cb.status='atrasado' ORDER BY cb.vencimento LIMIT 8`),
    q(`SELECT DATE_FORMAT(created_at,'%Y-%m') mes, COUNT(*) n FROM clientes
    WHERE created_at >= DATE_SUB(DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m-01'), INTERVAL 11 MONTH) GROUP BY mes`),
    q(`SELECT DATE_FORMAT(pago_em,'%Y-%m') mes, SUM(valor) total FROM cobrancas
    WHERE status='pago' AND pago_em >= DATE_SUB(DATE_FORMAT(?, '%Y-%m-01'), INTERVAL 11 MONTH) GROUP BY mes`, [hoje]),
    q("SELECT etapa_funil etapa, COUNT(*) n, COALESCE(SUM(valor_estimado),0) valor FROM clientes WHERE status IN ('lead','negociacao') GROUP BY etapa_funil"),
    q(`SELECT ct.id, ct.proximo_passo, ct.resumo, ct.lembrete, ct.cliente_id, cl.nome_fantasia cliente, cl.whatsapp
    FROM contatos ct JOIN clientes cl ON cl.id=ct.cliente_id WHERE ct.concluido=0 AND ct.lembrete IS NOT NULL
    ORDER BY ct.lembrete LIMIT 8`),
  ]);
  const kpis = Object.fromEntries(Object.entries(kr).map(([k, v]) => [k, Number(v || 0)]));
  const meses = [];
  const base = new Date(hoje + 'T12:00:00Z');
  for (let i = 11; i >= 0; i--) { const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1)); meses.push(d.toISOString().slice(0, 7)); }
  const map = (rows, k) => Object.fromEntries(rows.map((r) => [r.mes, Number(r[k])]));
  const nm = map(novos, 'n'), rm = map(receita, 'total');
  res.json({
    kpis, chamados, sinais, vencendo, atrasadas, funil, lembretes,
    grafico: { meses, novos: meses.map((m) => nm[m] || 0), receita: meses.map((m) => rm[m] || 0) },
  });
}));

// ---------------- Busca global ----------------
router.get('/busca', wrap(async (req, res) => {
  const t = String(req.query.q || '').trim();
  if (t.length < 2) return res.json({ data: [] });
  const like = `%${t}%`;
  const out = [];
  const add = (rows, entity, sub) => rows.forEach((r) => out.push({ entity, id: r.id, titulo: r.titulo, sub: r[sub] || '' }));
  add(await q('SELECT id, nome_fantasia titulo, cidade FROM clientes WHERE nome_fantasia LIKE ? OR razao_social LIKE ? OR cnpj LIKE ? OR contato_nome LIKE ? OR whatsapp LIKE ? LIMIT 6', [like, like, like, like, like]), 'clientes', 'cidade');
  add(await q('SELECT id, codigo titulo, versao_instalada FROM instalacoes WHERE codigo LIKE ? OR ip LIKE ? LIMIT 5', [like, like]), 'instalacoes', 'versao_instalada');
  add(await q('SELECT id, chave titulo, plano FROM licencas WHERE chave LIKE ? LIMIT 4', [like]), 'licencas', 'plano');
  add(await q('SELECT id, titulo, status FROM chamados WHERE titulo LIKE ? OR id = ? LIMIT 5', [like, Number(t) || 0]), 'chamados', 'status');
  add(await q('SELECT id, nome titulo, codigo FROM produtos WHERE nome LIKE ? OR codigo LIKE ? LIMIT 3', [like, like]), 'produtos', 'codigo');
  res.json({ data: out });
}));

// ---------------- Funil (kanban) ----------------
router.get('/funil', wrap(async (req, res) => {
  const rows = await q(`SELECT c.id, c.nome_fantasia, c.cidade, c.uf, c.status, c.etapa_funil, c.valor_estimado, c.whatsapp, c.ultimo_contato, c.num_suites,
      u.nome responsavel FROM clientes c LEFT JOIN usuarios u ON u.id=c.responsavel_id
      WHERE c.status IN ('lead','negociacao') OR (c.status IN ('ativo','perdido') AND c.updated_at > UTC_TIMESTAMP() - INTERVAL 30 DAY AND c.etapa_funil IS NOT NULL)
      ORDER BY c.updated_at DESC LIMIT 500`);
  res.json({ data: rows });
}));

router.post('/funil/:id', wrap(async (req, res) => {
  if (!canWrite(req.user)) throw new HttpError(403, 'Sem permissão.');
  const id = Number(req.params.id);
  const etapa = String(req.body.etapa || '');
  const old = await one('SELECT * FROM clientes WHERE id=?', [id]);
  if (!old) throw new HttpError(404, 'Cliente não encontrado.');
  if (etapa === 'ganho') {
    await q("UPDATE clientes SET status='ativo', cliente_desde=COALESCE(cliente_desde, ?) WHERE id=?", [todaySql(), id]);
  } else if (etapa === 'perdido') {
    await q("UPDATE clientes SET status='perdido' WHERE id=?", [id]);
  } else {
    const valid = ENTITIES.clientes.fields.etapa_funil.options.map((o) => o.value);
    if (!valid.includes(etapa)) throw new HttpError(400, 'Etapa inválida.');
    const status = ['novo', 'qualificado'].includes(etapa) ? 'lead' : 'negociacao';
    await q('UPDATE clientes SET etapa_funil=?, status=? WHERE id=?', [etapa, status, id]);
  }
  await audit(req, 'editar', 'clientes', id, `Funil: ${old.nome_fantasia} → ${etapa}`);
  res.json({ ok: true });
}));

// ---------------- Agenda (lembretes) ----------------
router.get('/agenda', wrap(async (req, res) => {
  const rows = await q(`SELECT ct.*, cl.nome_fantasia cliente, cl.whatsapp, cl.telefone, u.nome usuario
    FROM contatos ct JOIN clientes cl ON cl.id=ct.cliente_id LEFT JOIN usuarios u ON u.id=ct.usuario_id
    WHERE ct.lembrete IS NOT NULL AND (ct.concluido=0 OR ct.lembrete > UTC_TIMESTAMP() - INTERVAL 7 DAY)
    ORDER BY ct.concluido, ct.lembrete LIMIT 300`);
  const extras = {
    cobrancas: await q(`SELECT cb.id, cb.vencimento, cb.valor, cb.status, cl.nome_fantasia cliente FROM cobrancas cb JOIN clientes cl ON cl.id=cb.cliente_id
      WHERE cb.status IN ('pendente','atrasado') AND cb.vencimento <= DATE_ADD(?, INTERVAL 15 DAY) ORDER BY cb.vencimento LIMIT 100`, [todaySql()]),
    licencas: await q(`SELECT l.id, l.vencimento, l.chave, cl.nome_fantasia cliente FROM licencas l JOIN clientes cl ON cl.id=l.cliente_id
      WHERE l.status='ativa' AND l.vencimento <= DATE_ADD(?, INTERVAL 30 DAY) ORDER BY l.vencimento LIMIT 100`, [todaySql()]),
    chamados: await q(`SELECT c.id, c.prazo, c.titulo, c.prioridade, cl.nome_fantasia cliente FROM chamados c JOIN clientes cl ON cl.id=c.cliente_id
      WHERE c.prazo IS NOT NULL AND c.status IN ('aberto','andamento','aguardando') ORDER BY c.prazo LIMIT 100`),
  };
  res.json({ data: rows, ...extras });
}));

router.post('/agenda/:id/concluir', wrap(async (req, res) => {
  if (!canWrite(req.user)) throw new HttpError(403, 'Sem permissão.');
  await q('UPDATE contatos SET concluido=? WHERE id=?', [req.body.concluido === false ? 0 : 1, Number(req.params.id)]);
  res.json({ ok: true });
}));

// ---------------- Ações rápidas ----------------
router.post('/cobrancas/:id/pagar', wrap(async (req, res) => {
  if (!canWrite(req.user)) throw new HttpError(403, 'Sem permissão.');
  const id = Number(req.params.id);
  const c = await one('SELECT * FROM cobrancas WHERE id=?', [id]);
  if (!c) throw new HttpError(404, 'Cobrança não encontrada.');
  const forma = req.body.forma || c.forma || 'pix';
  await q("UPDATE cobrancas SET status='pago', pago_em=?, forma=?, comprovante=COALESCE(?, comprovante) WHERE id=?",
    [req.body.pago_em || todaySql(), forma, req.body.comprovante || null, id]);
  await audit(req, 'editar', 'cobrancas', id, `Cobrança ${c.competencia} marcada como paga`);
  res.json({ ok: true });
}));

router.post('/licencas/:id/renovar', wrap(async (req, res) => {
  if (!canWrite(req.user)) throw new HttpError(403, 'Sem permissão.');
  const id = Number(req.params.id);
  const l = await one('SELECT * FROM licencas WHERE id=?', [id]);
  if (!l) throw new HttpError(404, 'Licença não encontrada.');
  const meses = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 }[l.plano] || Number(req.body.meses) || 12;
  const base = l.vencimento && l.vencimento > todaySql() ? l.vencimento : todaySql();
  await q("UPDATE licencas SET vencimento=DATE_ADD(?, INTERVAL ? MONTH), status='ativa' WHERE id=?", [base, meses, id]);
  await audit(req, 'editar', 'licencas', id, `Licença ${l.chave} renovada por ${meses} mês(es)`);
  res.json({ ok: true });
}));

router.post('/instalacoes/:id/token', wrap(async (req, res) => {
  if (!canWrite(req.user)) throw new HttpError(403, 'Sem permissão.');
  const id = Number(req.params.id);
  const inst = await one('SELECT * FROM instalacoes WHERE id=?', [id]);
  if (!inst) throw new HttpError(404, 'Instalação não encontrada.');
  const token = deviceToken();
  await q('UPDATE instalacoes SET token_hash=?, token_prefixo=?, token_criado_em=? WHERE id=?', [sha256(token), token.slice(0, 10), nowSql(), id]);
  await audit(req, 'token', 'instalacoes', id, `Gerou novo token para ${inst.codigo}`);
  res.json({ token, codigo: inst.codigo });
}));

router.delete('/instalacoes/:id/token', wrap(async (req, res) => {
  if (!canWrite(req.user)) throw new HttpError(403, 'Sem permissão.');
  const id = Number(req.params.id);
  await q('UPDATE instalacoes SET token_hash=NULL, token_prefixo=NULL, token_criado_em=NULL WHERE id=?', [id]);
  await audit(req, 'token', 'instalacoes', id, 'Revogou o token do equipamento');
  res.json({ ok: true });
}));

// Resumo da ficha do cliente
router.get('/clientes/:id/resumo', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const r = await one(`SELECT
    (SELECT COUNT(*) FROM instalacoes WHERE cliente_id=?) instalacoes,
    (SELECT COUNT(*) FROM instalacoes WHERE cliente_id=? AND ultimo_contato > UTC_TIMESTAMP() - INTERVAL 2 HOUR) online,
    (SELECT COALESCE(SUM(valor_mensal),0) FROM licencas WHERE cliente_id=? AND status='ativa') mensalidade,
    (SELECT COUNT(*) FROM chamados WHERE cliente_id=? AND status IN ('aberto','andamento','aguardando')) chamados_abertos,
    (SELECT COALESCE(SUM(valor),0) FROM cobrancas WHERE cliente_id=? AND status='atrasado') atrasado,
    (SELECT COALESCE(SUM(valor),0) FROM cobrancas WHERE cliente_id=? AND status='pago') total_pago`, [id, id, id, id, id, id]);
  res.json({ data: r });
}));

// ---------------- Atividade ----------------
router.get('/atividades', requireAdmin, wrap(async (req, res) => {
  const where = []; const params = [];
  if (req.query.entidade) { where.push('entidade=?'); params.push(req.query.entidade); }
  if (req.query.entidade_id) { where.push('entidade_id=?'); params.push(String(req.query.entidade_id)); }
  if (req.query.usuario_id) { where.push('usuario_id=?'); params.push(Number(req.query.usuario_id)); }
  if (req.query.acao) { where.push('acao=?'); params.push(req.query.acao); }
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const rows = await q(`SELECT * FROM atividades ${w} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
  const [{ n }] = await q(`SELECT COUNT(*) n FROM atividades ${w}`, params);
  res.json({ data: rows, total: n });
}));

// Histórico de um registro (visível para toda a equipe)
router.get('/historico/:entidade/:id', wrap(async (req, res) => {
  const rows = await q('SELECT id, usuario_nome, acao, resumo, mudancas, created_at FROM atividades WHERE entidade=? AND entidade_id=? ORDER BY id DESC LIMIT 50', [req.params.entidade, String(req.params.id)]);
  res.json({ data: rows });
}));

// ---------------- Configurações ----------------
const CONFIG_KEYS = ['empresa_nome', 'empresa_cnpj', 'empresa_whatsapp', 'empresa_email', 'empresa_pix', 'msg_cobranca', 'offline_horas'];

router.get('/config', wrap(async (req, res) => {
  const rows = await q('SELECT chave, valor FROM configuracoes');
  const cfg = Object.fromEntries(rows.map((r) => [r.chave, r.valor]));
  res.json({ data: cfg });
}));

router.post('/config', requireAdmin, wrap(async (req, res) => {
  for (const k of CONFIG_KEYS) {
    if (req.body[k] === undefined) continue;
    await q('INSERT INTO configuracoes (chave, valor) VALUES (?,?) ON DUPLICATE KEY UPDATE valor=VALUES(valor)', [k, String(req.body[k]).slice(0, 2000)]);
  }
  await audit(req, 'config', 'configuracoes', null, 'Alterou as configurações');
  res.json({ ok: true });
}));

// Backup completo em JSON (sem senhas nem tokens)
const BACKUP_EXTRA = []; // tabelas novas se registram aqui

router.get('/backup', requireAdmin, wrap(async (req, res) => {
  const out = { gerado_em: new Date().toISOString(), sistema: 'Neon Gestão', tabelas: {} };
  for (const t of ['produtos', 'clientes', 'instalacoes', 'licencas', 'versoes', 'chamados', 'cobrancas', 'contatos', 'arquivos', 'configuracoes', 'campanhas', 'posts', 'depoimentos', 'tarefas', ...BACKUP_EXTRA]) {
    out.tabelas[t] = await q(`SELECT * FROM ${t}`);
  }
  out.tabelas.instalacoes.forEach((r) => delete r.token_hash);
  out.tabelas.usuarios = (await q('SELECT id, nome, email, funcao, ativo, created_at FROM usuarios'));
  await audit(req, 'backup', null, null, 'Baixou backup completo');
  res.setHeader('Content-Disposition', `attachment; filename="neon-gestao-backup-${todaySql()}.json"`);
  res.json(out);
}));

router.post('/automacoes/rodar', requireAdmin, wrap(async (req, res) => {
  res.json({ data: await runAutomations() });
}));

module.exports = { router, BACKUP_EXTRA };
