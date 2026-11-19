// Chamados: prazo de atendimento (SLA) por prioridade, conversa (linha do tempo) e e-mails para o cliente.
const express = require('express');
const { q, one } = require('./db');
const { requireUser, requireAdmin, canWrite } = require('./auth');
const { wrap, HttpError, audit, nowSql } = require('./util');

const ABERTOS = ['aberto', 'andamento', 'aguardando'];
const SLA_PADRAO = { urgente: 4, alta: 8, media: 24, baixa: 72 };
const PRIO = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente' };
const STATUS = { aberto: 'Aberto', andamento: 'Em andamento', aguardando: 'Aguardando cliente', resolvido: 'Resolvido', fechado: 'Fechado' };

async function migrate() {
  const cols = [['chamados', 'sla_limite', 'DATETIME NULL']];
  for (const [t, c, def] of cols) {
    const ex = await q('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?', [t, c]);
    if (!ex.length) await q(`ALTER TABLE \`${t}\` ADD COLUMN \`${c}\` ${def}`);
  }
  await q(`CREATE TABLE IF NOT EXISTS chamado_comentarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    chamado_id INT NOT NULL,
    usuario_id INT NULL,
    usuario_nome VARCHAR(120) NULL,
    texto TEXT NOT NULL,
    enviado_cliente TINYINT(1) NOT NULL DEFAULT 0,
    envio_status VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX (chamado_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const padroes = { sla_urgente: '4', sla_alta: '8', sla_media: '24', sla_baixa: '72', chamado_email_abertura: '1', chamado_email_resolucao: '1' };
  for (const [k, v] of Object.entries(padroes)) await q('INSERT IGNORE INTO configuracoes (chave, valor) VALUES (?,?)', [k, v]);
  // Chamados em aberto que ainda não têm prazo recebem o prazo pela regra atual
  const c = await cfg();
  for (const [p, horas] of Object.entries(c.sla)) {
    await q(`UPDATE chamados SET sla_limite = created_at + INTERVAL ? HOUR WHERE sla_limite IS NULL AND prioridade=? AND status IN ('aberto','andamento','aguardando')`, [horas, p]);
  }
}

async function cfg() {
  const rows = await q("SELECT chave, valor FROM configuracoes WHERE chave LIKE 'sla\\_%' OR chave LIKE 'chamado\\_email\\_%' OR chave IN ('empresa_nome','empresa_email','empresa_whatsapp')");
  const m = Object.fromEntries(rows.map((r) => [r.chave, r.valor]));
  const sla = {};
  for (const [p, d] of Object.entries(SLA_PADRAO)) { const n = Number(m['sla_' + p]); sla[p] = Number.isFinite(n) && n > 0 ? Math.min(n, 24 * 60) : d; }
  return {
    sla, email_abertura: m.chamado_email_abertura !== '0', email_resolucao: m.chamado_email_resolucao !== '0',
    empresa: m.empresa_nome || 'Neon Sistemas', empresa_email: m.empresa_email || '', empresa_whatsapp: m.empresa_whatsapp || '',
  };
}

function somaHoras(baseSql, horas) {
  const d = baseSql ? new Date(String(baseSql).replace(' ', 'T') + 'Z') : new Date();
  return new Date(d.getTime() + horas * 3600e3).toISOString().slice(0, 19).replace('T', ' ');
}

// Chamado pelo hook "before" do CRUD: define/recalcula o prazo
async function definirSla(data, old) {
  const prio = data.prioridade ?? old?.prioridade ?? 'media';
  const st = data.status ?? old?.status ?? 'aberto';
  const c = await cfg();
  if (!old) { data.sla_limite = somaHoras(null, c.sla[prio] ?? 24); return; }
  // Prioridade mudou com o chamado aberto: prazo conta a partir da abertura
  if (data.prioridade && data.prioridade !== old.prioridade && ABERTOS.includes(st)) data.sla_limite = somaHoras(old.created_at, c.sla[prio] ?? 24);
  // Reaberto depois de resolvido: novo prazo a partir de agora
  if (ABERTOS.includes(st) && old && !ABERTOS.includes(old.status)) data.sla_limite = somaHoras(null, c.sla[prio] ?? 24);
}

// ---------- E-mails para o cliente ----------
const esc = (s) => String(s ?? '').replace(/[<&>"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));
const dtBr = (sql) => (sql ? new Date(String(sql).replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

function emailCliente(c, { titulo, saudacao, corpo, rodape }) {
  const wa = String(c.empresa_whatsapp || '').replace(/\D/g, '');
  return `<!doctype html><html><body style="margin:0;background:#f3f5f9;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#1d2433">
<div style="max-width:580px;margin:0 auto;padding:24px 16px"><div style="background:#fff;border-radius:14px;padding:26px;border-top:4px solid #ff7a1a">
<div style="font-size:13px;color:#7a8499;font-weight:600">${esc(c.empresa)} · Suporte</div>
<h1 style="font-size:21px;margin:8px 0 16px">${esc(titulo)}</h1>
<p style="font-size:15px;line-height:1.6;margin:0 0 12px">${esc(saudacao)}</p>
<div style="font-size:15px;line-height:1.6">${corpo}</div>
${rodape ? `<p style="font-size:14px;line-height:1.6;color:#4a5468;margin:18px 0 0">${rodape}</p>` : ''}
${wa ? `<a href="https://wa.me/55${wa}" style="display:inline-block;margin-top:20px;background:#25d366;color:#fff;text-decoration:none;font-weight:700;padding:11px 20px;border-radius:10px">Falar com o suporte no WhatsApp</a>` : ''}
</div><div style="font-size:12px;color:#8a93a6;text-align:center;margin-top:14px">${esc(c.empresa)}${c.empresa_email ? ' · responda este e-mail ou escreva para ' + esc(c.empresa_email) : ''}</div></div></body></html>`;
}

async function enviarAoCliente(ch, tipo, extra = {}) {
  const al = require('./alertas');
  const c = await cfg();
  const cli = await one('SELECT nome_fantasia, contato_nome, email FROM clientes WHERE id=?', [ch.cliente_id]);
  if (!cli?.email) return 'cliente sem e-mail';
  if (process.env.NEON_TESTE !== '1' && !(await al.emailCfg()).pronto) return 'e-mail de avisos não configurado';
  const nome = (cli.contato_nome || cli.nome_fantasia || '').split(' ')[0];
  const saud = `Olá${nome ? ', ' + nome : ''}!`;
  let assunto, html, texto;
  if (tipo === 'abertura') {
    assunto = `Recebemos seu chamado #${ch.id}: ${ch.titulo}`;
    const prazo = ch.sla_limite ? `Nosso prazo de atendimento é até <b>${esc(dtBr(ch.sla_limite))}</b>.` : '';
    html = emailCliente(c, { titulo: `Chamado #${ch.id} aberto`, saudacao: saud, corpo: `<p style="margin:0 0 10px">Registramos o seu chamado e nossa equipe já foi avisada.</p><div style="background:#f6f7fb;border-radius:10px;padding:14px 16px"><b>${esc(ch.titulo)}</b>${ch.descricao ? `<div style="color:#4a5468;margin-top:6px;white-space:pre-line">${esc(String(ch.descricao).slice(0, 1500))}</div>` : ''}</div>`, rodape: prazo + ' Se precisar acrescentar algo, é só responder este e-mail.' });
    texto = `${saud}\n\nRegistramos o seu chamado #${ch.id}: ${ch.titulo}.${ch.sla_limite ? `\nPrazo de atendimento: até ${dtBr(ch.sla_limite)}.` : ''}\n\n${c.empresa}`;
  } else if (tipo === 'resolucao') {
    assunto = `Chamado #${ch.id} resolvido: ${ch.titulo}`;
    html = emailCliente(c, { titulo: `Chamado #${ch.id} resolvido ✅`, saudacao: saud, corpo: `<p style="margin:0 0 10px">Concluímos o atendimento do chamado <b>${esc(ch.titulo)}</b>.</p>${ch.solucao ? `<div style="background:#f1fbf4;border-radius:10px;padding:14px 16px"><b>O que foi feito</b><div style="color:#2c4a36;margin-top:6px;white-space:pre-line">${esc(String(ch.solucao).slice(0, 2000))}</div></div>` : ''}`, rodape: 'Se o problema voltar ou algo não ficou certo, responda este e-mail que reabrimos o chamado.' });
    texto = `${saud}\n\nConcluímos o atendimento do chamado #${ch.id}: ${ch.titulo}.${ch.solucao ? `\n\nO que foi feito:\n${ch.solucao}` : ''}\n\n${c.empresa}`;
  } else {
    assunto = `Atualização do chamado #${ch.id}: ${ch.titulo}`;
    html = emailCliente(c, { titulo: `Novidade no chamado #${ch.id}`, saudacao: saud, corpo: `<div style="white-space:pre-line">${esc(extra.texto)}</div>`, rodape: `Status atual: <b>${esc(STATUS[ch.status] || ch.status)}</b>. Para responder, é só responder este e-mail.` });
    texto = `${saud}\n\n${extra.texto}\n\nStatus: ${STATUS[ch.status] || ch.status}\n${c.empresa}`;
  }
  await al.enviarEmailCru({ para: cli.email, assunto, html, texto, responderPara: c.empresa_email || undefined });
  return 'enviado para ' + cli.email;
}

// Hook "after" do CRUD: e-mails automáticos de abertura e resolução
async function aposSalvar(row, old) {
  try {
    const al = require('./alertas');
    const c = await cfg();
    let r = null;
    if (!old && c.email_abertura && (await al.primeiraVez(`cliente:chamado:${row.id}:abertura`))) r = ['abertura', await enviarAoCliente(row, 'abertura')];
    if (old && row.status === 'resolvido' && old.status !== 'resolvido' && c.email_resolucao && (await al.primeiraVez(`cliente:chamado:${row.id}:resolvido:${row.resolvido_em}`))) r = ['resolucao', await enviarAoCliente(row, 'resolucao')];
    if (r) {
      await q('INSERT INTO chamado_comentarios (chamado_id, usuario_nome, texto, enviado_cliente, envio_status) VALUES (?,?,?,?,?)',
        [row.id, 'Sistema', r[0] === 'abertura' ? 'E-mail de abertura para o cliente' : 'E-mail de resolução para o cliente', r[1].startsWith('enviado') ? 1 : 0, r[1]]);
    }
  } catch (e) {
    await q('INSERT INTO chamado_comentarios (chamado_id, usuario_nome, texto, enviado_cliente, envio_status) VALUES (?,?,?,0,?)', [row.id, 'Sistema', 'E-mail para o cliente', 'falhou: ' + String(e.message).slice(0, 200)]).catch(() => {});
    console.error('chamado e-mail cliente:', e.message);
  }
}

// ---------- Rotas ----------
const router = express.Router();
router.use(requireUser);

// Conversa: comentários + mudanças registradas, em ordem
router.get('/chamados/:id/conversa', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const ch = await one('SELECT id, created_at, status, sla_limite, resolvido_em FROM chamados WHERE id=?', [id]);
  if (!ch) throw new HttpError(404, 'Chamado não encontrado.');
  const coms = await q('SELECT id, usuario_id, usuario_nome, texto, enviado_cliente, envio_status, created_at FROM chamado_comentarios WHERE chamado_id=? ORDER BY id', [id]);
  const ativ = await q("SELECT id, usuario_nome, acao, resumo, mudancas, created_at FROM atividades WHERE entidade='chamados' AND entidade_id=? ORDER BY id", [String(id)]);
  const itens = [
    ...coms.map((c) => ({ tipo: c.usuario_nome === 'Sistema' && !c.usuario_id ? 'sistema' : 'comentario', ...c })),
    ...ativ.map((a) => {
      let m = a.mudancas; if (typeof m === 'string') { try { m = JSON.parse(m); } catch { m = null; } }
      const partes = [];
      if (a.acao === 'criar') partes.push('Abriu o chamado');
      if (m?.status) partes.push(`Status: ${STATUS[m.status[0]] || m.status[0] || '—'} → ${STATUS[m.status[1]] || m.status[1]}`);
      if (m?.prioridade) partes.push(`Prioridade: ${PRIO[m.prioridade[0]] || '—'} → ${PRIO[m.prioridade[1]] || m.prioridade[1]}`);
      if (m?.responsavel_id) partes.push('Mudou o responsável');
      if (m?.solucao) partes.push('Registrou a solução');
      if (!partes.length) return null;
      return { tipo: 'evento', id: 'a' + a.id, usuario_nome: a.usuario_nome, texto: partes.join(' · '), created_at: a.created_at };
    }).filter(Boolean),
  ].map((x, i) => ({ ...x, _o: (x.texto === 'Abriu o chamado' ? 0 : 1), _i: i }))
    .sort((a, b) => a._o - b._o || String(a.created_at).localeCompare(String(b.created_at)) || a._i - b._i)
    .map(({ _o, _i, ...x }) => x); // eslint-disable-line no-unused-vars
  res.json({ data: itens, sla_limite: ch.sla_limite });
}));

router.post('/chamados/:id/comentarios', wrap(async (req, res) => {
  if (!canWrite(req.user)) throw new HttpError(403, 'Sem permissão.');
  const id = Number(req.params.id);
  const ch = await one('SELECT * FROM chamados WHERE id=?', [id]);
  if (!ch) throw new HttpError(404, 'Chamado não encontrado.');
  const texto = String(req.body.texto || '').trim();
  if (!texto) throw new HttpError(400, 'Escreva o comentário.');
  let envio = null, enviado = 0;
  if (req.body.enviar_cliente) {
    try { envio = await enviarAoCliente(ch, 'comentario', { texto }); enviado = envio.startsWith('enviado') ? 1 : 0; } catch (e) { envio = 'falhou: ' + e.message; }
  }
  const r = await q('INSERT INTO chamado_comentarios (chamado_id, usuario_id, usuario_nome, texto, enviado_cliente, envio_status) VALUES (?,?,?,?,?,?)',
    [id, req.user.id, req.user.nome, texto.slice(0, 8000), enviado, envio]);
  await q('UPDATE chamados SET updated_at=? WHERE id=?', [nowSql(), id]);
  await audit(req, 'comentar', 'chamados', id, `Comentou no chamado #${id}${enviado ? ' (enviado ao cliente)' : ''}`);
  res.status(201).json({ data: { id: r.insertId, enviado_cliente: enviado, envio_status: envio } });
}));

router.delete('/chamados/comentarios/:cid', wrap(async (req, res) => {
  const c = await one('SELECT * FROM chamado_comentarios WHERE id=?', [Number(req.params.cid)]);
  if (!c) throw new HttpError(404, 'Comentário não encontrado.');
  if (c.usuario_id !== req.user.id && req.user.funcao !== 'admin') throw new HttpError(403, 'Só quem escreveu (ou um administrador) pode apagar.');
  await q('DELETE FROM chamado_comentarios WHERE id=?', [c.id]);
  res.json({ ok: true });
}));

router.get('/chamados-config', wrap(async (req, res) => res.json(await cfg())));

router.post('/chamados-config', requireAdmin, wrap(async (req, res) => {
  const b = req.body || {}; const set = {};
  for (const p of Object.keys(SLA_PADRAO)) if (b.sla?.[p] !== undefined) { const n = Number(String(b.sla[p]).replace(',', '.')); if (!(n > 0 && n <= 1440)) throw new HttpError(400, `Prazo da prioridade ${PRIO[p]}: informe horas entre 1 e 1440.`); set['sla_' + p] = String(n); }
  if (b.email_abertura !== undefined) set.chamado_email_abertura = b.email_abertura ? '1' : '0';
  if (b.email_resolucao !== undefined) set.chamado_email_resolucao = b.email_resolucao ? '1' : '0';
  for (const [k, v] of Object.entries(set)) await q('INSERT INTO configuracoes (chave, valor) VALUES (?,?) ON DUPLICATE KEY UPDATE valor=VALUES(valor)', [k, v]);
  await audit(req, 'config', 'configuracoes', 'chamados', 'Alterou prazos e e-mails dos chamados');
  res.json({ ok: true });
}));

// Indicadores de SLA (para o painel inicial e relatórios)
async function indicadores(dias = 30) {
  const [r] = await q(`SELECT
    SUM(status IN ('aberto','andamento','aguardando') AND sla_limite < UTC_TIMESTAMP()) estourados,
    SUM(status IN ('aberto','andamento','aguardando') AND sla_limite BETWEEN UTC_TIMESTAMP() AND UTC_TIMESTAMP() + INTERVAL 4 HOUR) vencendo,
    SUM(resolvido_em IS NOT NULL AND resolvido_em >= UTC_TIMESTAMP() - INTERVAL ? DAY) resolvidos,
    SUM(resolvido_em IS NOT NULL AND resolvido_em >= UTC_TIMESTAMP() - INTERVAL ? DAY AND sla_limite IS NOT NULL AND resolvido_em <= sla_limite) no_prazo,
    AVG(CASE WHEN resolvido_em >= UTC_TIMESTAMP() - INTERVAL ? DAY THEN TIMESTAMPDIFF(MINUTE, created_at, resolvido_em) END) media_min
    FROM chamados`, [dias, dias, dias]);
  return { estourados: Number(r.estourados || 0), vencendo: Number(r.vencendo || 0), resolvidos: Number(r.resolvidos || 0), no_prazo: Number(r.no_prazo || 0), media_horas: r.media_min == null ? null : Math.round(Number(r.media_min) / 6) / 10 };
}
router.get('/chamados-sla', wrap(async (req, res) => res.json(await indicadores(Number(req.query.dias) || 30))));

module.exports = { router, migrate, definirSla, aposSalvar, indicadores, cfg };
