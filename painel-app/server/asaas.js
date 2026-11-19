// Integração com o Asaas: boleto/Pix das cobranças e baixa automática do pagamento.
// Começa no ambiente de testes (sandbox). Desligado, nada muda: a cobrança continua manual.
const crypto = require('crypto');
const express = require('express');
const { q, one, getPool } = require('./db');
const { requireUser, requireAdmin, canWrite } = require('./auth');
const { wrap, HttpError, audit, todaySql } = require('./util');

const TESTE = process.env.NEON_TESTE === '1';
const URLS = { sandbox: 'https://api-sandbox.asaas.com/v3', producao: 'https://api.asaas.com/v3' };
const FORMAS = { PIX: 'pix', BOLETO: 'boleto', CREDIT_CARD: 'cartao', DEBIT_CARD: 'cartao', TRANSFER: 'transferencia', DEPOSIT: 'transferencia', UNDEFINED: null };
const PAGO = ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED_IN_CASH'];
const STATUS_PAGO = ['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'];

// ---------- Banco ----------
const COLUMNS = [
  ['clientes', 'asaas_id', 'VARCHAR(40) NULL'],
  ['cobrancas', 'asaas_id', 'VARCHAR(40) NULL'],
  ['cobrancas', 'asaas_url', 'VARCHAR(255) NULL'],
  ['cobrancas', 'asaas_boleto_url', 'VARCHAR(255) NULL'],
  ['cobrancas', 'asaas_status', 'VARCHAR(30) NULL'],
  ['cobrancas', 'asaas_erro', 'VARCHAR(500) NULL'],
];
async function migrate() {
  for (const [t, c, def] of COLUMNS) {
    const ex = await q('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?', [t, c]);
    if (!ex.length) await q(`ALTER TABLE \`${t}\` ADD COLUMN \`${c}\` ${def}`);
  }
  await q(`CREATE TABLE IF NOT EXISTS asaas_eventos (
    id VARCHAR(80) PRIMARY KEY,
    evento VARCHAR(60) NOT NULL,
    pagamento VARCHAR(40) NULL,
    cobranca_id INT NULL,
    resultado VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const idx = await q("SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cobrancas' AND INDEX_NAME='asaas_id'");
  if (!idx.length) await q('ALTER TABLE cobrancas ADD INDEX asaas_id (asaas_id)');
}

function parseJ(v, d) { if (typeof v === 'string') { try { return JSON.parse(v); } catch { return d; } } return v ?? d; }

async function cfg() {
  const r = await one("SELECT ativo, config FROM integracoes WHERE rede='asaas'");
  const c = parseJ(r?.config, {}) || {};
  return {
    ativo: !!r?.ativo, ambiente: c.ambiente === 'producao' ? 'producao' : 'sandbox', api_key: c.api_key || '',
    webhook_token: c.webhook_token || '', webhook_id: c.webhook_id || null, webhook_url: c.webhook_url || null,
    tipo: ['UNDEFINED', 'BOLETO', 'PIX'].includes(c.tipo) ? c.tipo : 'UNDEFINED',
    automatico: c.automatico !== false, notificar_cliente: c.notificar_cliente !== false,
    multa: Number(c.multa) || 0, juros: Number(c.juros) || 0, ativado_em: c.ativado_em || null, conta: c.conta || null,
  };
}
async function salvarCfg(novo, ativo) {
  const r = await one("SELECT ativo, config FROM integracoes WHERE rede='asaas'");
  const atual = parseJ(r?.config, {}) || {};
  const final = { ...atual, ...novo };
  await q("INSERT INTO integracoes (rede, ativo, config) VALUES ('asaas',?,?) ON DUPLICATE KEY UPDATE ativo=VALUES(ativo), config=VALUES(config)",
    [ativo === undefined ? (r?.ativo ? 1 : 0) : (ativo ? 1 : 0), JSON.stringify(final)]);
}

// ---------- Cliente HTTP ----------
async function chamar(c, metodo, caminho, corpo) {
  if (!c.api_key) throw new HttpError(400, 'Informe a chave de API do Asaas em Configurações → Asaas.');
  const base = process.env.ASAAS_URL_TESTE || URLS[c.ambiente];
  const r = await fetch(base + caminho, {
    method: metodo, signal: AbortSignal.timeout(20000),
    headers: { access_token: c.api_key, 'Content-Type': 'application/json', 'User-Agent': 'NeonGestao' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const txt = await r.text(); let j; try { j = JSON.parse(txt); } catch { j = { raw: txt }; }
  if (!r.ok) {
    const msg = j.errors?.map((e) => e.description).join(' ') || (r.status === 401 ? 'Chave de API inválida.' : `Erro ${r.status} no Asaas.`);
    throw new HttpError(r.status >= 500 ? 502 : 400, 'Asaas: ' + msg);
  }
  return j;
}

const so = (v) => String(v || '').replace(/\D/g, '');

async function garantirCliente(c, clienteId) {
  const cli = await one('SELECT * FROM clientes WHERE id=?', [clienteId]);
  if (!cli) throw new HttpError(404, 'Cliente não encontrado.');
  if (cli.asaas_id) return cli.asaas_id;
  const doc = so(cli.cnpj);
  if (![11, 14].includes(doc.length)) throw new HttpError(400, `Para emitir boleto/Pix, preencha o CNPJ ou CPF do cliente "${cli.nome_fantasia}".`);
  // Reaproveita se já existir no Asaas (evita duplicar)
  const achou = await chamar(c, 'GET', `/customers?externalReference=cliente:${cli.id}&limit=1`);
  let id = achou.data?.[0]?.id;
  if (!id) {
    const fone = so(cli.whatsapp || cli.telefone);
    const novo = await chamar(c, 'POST', '/customers', {
      name: cli.razao_social || cli.nome_fantasia, cpfCnpj: doc, email: cli.email || undefined,
      mobilePhone: fone.length === 11 ? fone : undefined, phone: fone.length === 10 ? fone : undefined,
      postalCode: so(cli.cep) || undefined, address: cli.endereco || undefined, addressNumber: cli.numero || undefined, province: cli.bairro || undefined,
      externalReference: `cliente:${cli.id}`, notificationDisabled: !c.notificar_cliente, company: cli.nome_fantasia,
    });
    id = novo.id;
  }
  await q('UPDATE clientes SET asaas_id=? WHERE id=?', [id, cli.id]);
  return id;
}

// Cria (uma vez só) o boleto/Pix de uma cobrança
async function emitir(cobrancaId, { c: cfgPronta } = {}) {
  const c = cfgPronta || (await cfg());
  if (!c.api_key) throw new HttpError(400, 'Configure o Asaas primeiro (Configurações → Asaas).');
  const cb = await one('SELECT * FROM cobrancas WHERE id=?', [cobrancaId]);
  if (!cb) throw new HttpError(404, 'Cobrança não encontrada.');
  if (cb.asaas_id) return cb;
  if (['pago', 'cancelado'].includes(cb.status)) throw new HttpError(400, 'Esta cobrança já está paga ou cancelada.');
  // Reserva a cobrança para não emitir duas vezes ao mesmo tempo
  const res = await q("UPDATE cobrancas SET asaas_status='CRIANDO', asaas_erro=NULL WHERE id=? AND asaas_id IS NULL AND (asaas_status IS NULL OR asaas_status='ERRO' OR (asaas_status='CRIANDO' AND updated_at < UTC_TIMESTAMP() - INTERVAL 2 MINUTE))", [cb.id]);
  if (res.affectedRows !== 1) throw new HttpError(409, 'Esta cobrança já está sendo gerada no Asaas. Aguarde alguns segundos.');
  try {
    const cliente = await garantirCliente(c, cb.cliente_id);
    // Se uma tentativa anterior criou no Asaas mas não gravou aqui, reaproveita
    const ja = await chamar(c, 'GET', `/payments?externalReference=cobranca:${cb.id}&limit=5`);
    let pg = (ja.data || []).find((p) => !p.deleted);
    if (!pg) {
      const hoje = todaySql();
      const venc = cb.vencimento < hoje ? hoje : cb.vencimento; // o Asaas não aceita vencimento no passado
      const desc = `Mensalidade ${cb.competencia}${cb.observacoes && !/automaticamente/i.test(cb.observacoes) ? ' — ' + cb.observacoes.slice(0, 200) : ''}`;
      pg = await chamar(c, 'POST', '/payments', {
        customer: cliente, billingType: c.tipo, value: Number(cb.valor), dueDate: venc, description: desc,
        externalReference: `cobranca:${cb.id}`,
        ...(c.multa ? { fine: { value: c.multa, type: 'PERCENTAGE' } } : {}), ...(c.juros ? { interest: { value: c.juros } } : {}),
      });
    }
    await q('UPDATE cobrancas SET asaas_id=?, asaas_url=?, asaas_boleto_url=?, asaas_status=?, asaas_erro=NULL WHERE id=?',
      [pg.id, pg.invoiceUrl || null, pg.bankSlipUrl || null, pg.status || 'PENDING', cb.id]);
    return one('SELECT * FROM cobrancas WHERE id=?', [cb.id]);
  } catch (e) {
    await q("UPDATE cobrancas SET asaas_status='ERRO', asaas_erro=? WHERE id=?", [String(e.message).slice(0, 500), cb.id]);
    throw e;
  }
}

// Mudanças feitas no painel vão para o Asaas (valor, vencimento, cancelamento, pago em dinheiro)
async function aoSalvarCobranca(row, old) {
  if (!old || !row.asaas_id) return;
  const c = await cfg();
  if (!c.api_key) return;
  try {
    if (row.status === 'cancelado' && old.status !== 'cancelado' && !STATUS_PAGO.includes(row.asaas_status)) {
      await chamar(c, 'DELETE', `/payments/${row.asaas_id}`);
      await q("UPDATE cobrancas SET asaas_status='DELETED' WHERE id=?", [row.id]);
    } else if (row.status === 'pago' && old.status !== 'pago' && !STATUS_PAGO.includes(row.asaas_status)) {
      // Pago por fora (dinheiro, transferência): avisa o Asaas para não cobrar mais
      await chamar(c, 'POST', `/payments/${row.asaas_id}/receiveInCash`, { paymentDate: row.pago_em || todaySql(), value: Number(row.valor), notifyCustomer: false });
      await q("UPDATE cobrancas SET asaas_status='RECEIVED_IN_CASH' WHERE id=?", [row.id]);
    } else if (!['pago', 'cancelado'].includes(row.status) && (Number(row.valor) !== Number(old.valor) || row.vencimento !== old.vencimento)) {
      const hoje = todaySql();
      await chamar(c, 'PUT', `/payments/${row.asaas_id}`, { value: Number(row.valor), dueDate: row.vencimento < hoje ? hoje : row.vencimento });
    }
  } catch (e) {
    await q('UPDATE cobrancas SET asaas_erro=? WHERE id=?', [String(e.message).slice(0, 500), row.id]);
    console.error('asaas sincronizar:', e.message);
  }
}

// Emite sozinho as cobranças novas (criadas depois de ligar o Asaas)
async function emitirPendentes() {
  const c = await cfg();
  if (!c.ativo || !c.automatico || !c.api_key || !c.ativado_em) return { emitidas: 0 };
  const rows = await q(`SELECT id FROM cobrancas WHERE asaas_id IS NULL AND asaas_status IS NULL AND status IN ('pendente','atrasado')
    AND created_at >= ? AND valor > 0 ORDER BY id LIMIT 30`, [c.ativado_em]);
  let emitidas = 0;
  for (const r of rows) { try { await emitir(r.id, { c }); emitidas++; } catch (e) { console.error('asaas emitir', r.id, e.message); } }
  return { emitidas };
}

let rodando = false;
async function tick() {
  if (rodando) return; rodando = true;
  const conn = await getPool().getConnection();
  try {
    const [[lock]] = await conn.query("SELECT GET_LOCK('neon_asaas', 0) l");
    if (!lock.l) return;
    try { await emitirPendentes(); } finally { await conn.query("SELECT RELEASE_LOCK('neon_asaas')"); }
  } catch (e) { console.error('asaas:', e.message); } finally { conn.release(); rodando = false; }
}
function iniciar() { if (TESTE) return; setTimeout(tick, 30000); setInterval(tick, 3 * 60e3).unref(); }

// ---------- Webhook (o Asaas avisa quando o cliente paga) ----------
async function processarEvento(ev) {
  const p = ev.payment;
  if (!p || !p.id) return 'sem pagamento';
  let cb = await one('SELECT * FROM cobrancas WHERE asaas_id=?', [p.id]);
  if (!cb) { const m = String(p.externalReference || '').match(/^cobranca:(\d+)$/); if (m) cb = await one('SELECT * FROM cobrancas WHERE id=?', [Number(m[1])]); }
  if (!cb) return 'cobrança não encontrada';
  await q('UPDATE cobrancas SET asaas_id=COALESCE(asaas_id, ?), asaas_status=?, asaas_url=COALESCE(?, asaas_url), asaas_boleto_url=COALESCE(?, asaas_boleto_url) WHERE id=?',
    [p.id, p.status || null, p.invoiceUrl || null, p.bankSlipUrl || null, cb.id]);
  if (PAGO.includes(ev.event)) {
    if (cb.status === 'pago') return 'já estava paga';
    const data = String(p.paymentDate || p.clientPaymentDate || p.confirmedDate || todaySql()).slice(0, 10);
    await q("UPDATE cobrancas SET status='pago', pago_em=?, forma=COALESCE(?, forma) WHERE id=?", [data, FORMAS[p.billingType] || null, cb.id]);
    await audit(null, 'editar', 'cobrancas', cb.id, `Pagamento confirmado pelo Asaas (${p.billingType || '—'})`, { status: [cb.status, 'pago'] });
    const cli = await one('SELECT nome_fantasia FROM clientes WHERE id=?', [cb.cliente_id]);
    require('./alertas').disparar({ evento: 'pagamento_recebido', link: `/cobrancas/${cb.id}`, titulo: `Pagamento recebido: ${cli?.nome_fantasia || 'cliente'}`, texto: `${cb.competencia} · ${Number(p.value || cb.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · ${p.billingType === 'PIX' ? 'Pix' : p.billingType === 'BOLETO' ? 'Boleto' : p.billingType === 'CREDIT_CARD' ? 'Cartão' : (p.billingType || '')}` }).catch(() => {});
    return 'baixa feita';
  }
  if (ev.event === 'PAYMENT_OVERDUE' && cb.status === 'pendente') { await q("UPDATE cobrancas SET status='atrasado' WHERE id=?", [cb.id]); return 'atrasada'; }
  if ((ev.event === 'PAYMENT_DELETED') && !['pago', 'cancelado'].includes(cb.status)) { await q("UPDATE cobrancas SET status='cancelado' WHERE id=?", [cb.id]); return 'cancelada no Asaas'; }
  if (ev.event === 'PAYMENT_RESTORED' && cb.status === 'cancelado') { await q("UPDATE cobrancas SET status=IF(vencimento < ?, 'atrasado', 'pendente') WHERE id=?", [todaySql(), cb.id]); return 'restaurada'; }
  if (['PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_RECEIVED_IN_CASH_UNDONE'].includes(ev.event) && cb.status === 'pago') {
    await q("UPDATE cobrancas SET status=IF(vencimento < ?, 'atrasado', 'pendente'), pago_em=NULL, observacoes=CONCAT(COALESCE(observacoes,''), ?) WHERE id=?",
      [todaySql(), `\n[Asaas] ${ev.event === 'PAYMENT_REFUNDED' ? 'Pagamento estornado' : 'Pagamento contestado/desfeito'} em ${todaySql()}`, cb.id]);
    return 'pagamento desfeito';
  }
  return 'registrado';
}

const pub = express.Router();
pub.post('/publico/asaas/webhook', express.json({ limit: '1mb' }), wrap(async (req, res) => {
  const c = await cfg();
  const tok = req.headers['asaas-access-token'];
  if (!c.webhook_token || !tok || tok.length !== c.webhook_token.length || !crypto.timingSafeEqual(Buffer.from(tok), Buffer.from(c.webhook_token))) return res.status(401).json({ erro: 'Token inválido.' });
  const ev = req.body || {};
  const id = String(ev.id || `${ev.event}:${ev.payment?.id}:${ev.dateCreated || ''}`).slice(0, 80);
  const novo = await q('INSERT IGNORE INTO asaas_eventos (id, evento, pagamento) VALUES (?,?,?)', [id, String(ev.event || '?').slice(0, 60), ev.payment?.id || null]);
  if (novo.affectedRows !== 1) return res.json({ ok: true, repetido: true });
  try {
    const resultado = await processarEvento(ev);
    await q('UPDATE asaas_eventos SET resultado=? WHERE id=?', [resultado, id]);
    res.json({ ok: true, resultado });
  } catch (e) {
    await q('DELETE FROM asaas_eventos WHERE id=?', [id]); // deixa o Asaas reenviar
    throw e;
  }
}));

// ---------- Rotas do painel ----------
const router = express.Router();
router.use(requireUser);

const mask = (v) => (v ? '••••••' + String(v).slice(-4) : '');

router.get('/config', requireAdmin, wrap(async (req, res) => {
  const c = await cfg();
  const eventos = await q('SELECT * FROM asaas_eventos ORDER BY created_at DESC LIMIT 30');
  const [n] = await q("SELECT SUM(asaas_id IS NOT NULL) emitidas, SUM(asaas_status='ERRO') erros FROM cobrancas");
  res.json({ ...c, api_key: mask(c.api_key), webhook_token: undefined, tem_chave: !!c.api_key, url_webhook_sugerida: urlWebhook(), eventos, emitidas: Number(n.emitidas || 0), erros: Number(n.erros || 0) });
}));

function urlWebhook() { return String(process.env.PUBLIC_URL || '').replace(/\/$/, '') + '/publico/asaas/webhook'; }

router.post('/config', requireAdmin, wrap(async (req, res) => {
  const b = req.body || {}; const atual = await cfg(); const novo = {};
  if (b.ambiente !== undefined) novo.ambiente = b.ambiente === 'producao' ? 'producao' : 'sandbox';
  if (typeof b.api_key === 'string' && b.api_key.trim() && !b.api_key.startsWith('••••••')) novo.api_key = b.api_key.trim();
  if (b.tipo !== undefined) novo.tipo = ['UNDEFINED', 'BOLETO', 'PIX'].includes(b.tipo) ? b.tipo : 'UNDEFINED';
  for (const k of ['automatico', 'notificar_cliente']) if (b[k] !== undefined) novo[k] = !!b[k];
  for (const k of ['multa', 'juros']) if (b[k] !== undefined) novo[k] = Math.max(0, Math.min(k === 'multa' ? 2 : 1, Number(String(b[k]).replace(',', '.')) || 0));
  // Trocar de ambiente invalida os ids salvos (são de outra conta)
  if (novo.ambiente && novo.ambiente !== atual.ambiente) {
    novo.webhook_id = null; novo.conta = null;
    await q("UPDATE clientes SET asaas_id=NULL WHERE asaas_id IS NOT NULL");
  }
  const ligar = b.ativo === undefined ? undefined : !!b.ativo;
  if (ligar && !atual.ativado_em) novo.ativado_em = new Date().toISOString().slice(0, 19).replace('T', ' ');
  if (ligar && !(novo.api_key || atual.api_key)) throw new HttpError(400, 'Informe a chave de API antes de ligar.');
  await salvarCfg(novo, ligar);
  await audit(req, 'config', 'integracoes', 'asaas', 'Alterou a integração com o Asaas');
  res.json({ ok: true });
}));

router.post('/testar', requireAdmin, wrap(async (req, res) => {
  const c = await cfg();
  const conta = await chamar(c, 'GET', '/myAccount');
  await salvarCfg({ conta: { nome: conta.name || conta.companyName || '', email: conta.email || '', cnpj: conta.cpfCnpj || '' } });
  res.json({ ok: true, conta: conta.name || conta.companyName || conta.email, ambiente: c.ambiente });
}));

// Cria/atualiza o webhook no Asaas apontando para este painel
router.post('/webhook', requireAdmin, wrap(async (req, res) => {
  const c = await cfg();
  const token = c.webhook_token || crypto.randomBytes(24).toString('hex');
  const url = urlWebhook();
  if (!/^https:\/\//.test(url) && !TESTE) throw new HttpError(400, 'Defina PUBLIC_URL com https:// nas variáveis do servidor.');
  const corpo = { name: 'Neon Gestão', url, email: req.user.email, enabled: true, interrupted: false, apiVersion: 3, authToken: token, sendType: 'SEQUENTIALLY',
    events: ['PAYMENT_CREATED', 'PAYMENT_UPDATED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_OVERDUE', 'PAYMENT_DELETED', 'PAYMENT_RESTORED', 'PAYMENT_REFUNDED', 'PAYMENT_RECEIVED_IN_CASH', 'PAYMENT_RECEIVED_IN_CASH_UNDONE', 'PAYMENT_CHARGEBACK_REQUESTED'] };
  let wh;
  try { wh = c.webhook_id ? await chamar(c, 'PUT', `/webhooks/${c.webhook_id}`, corpo) : await chamar(c, 'POST', '/webhooks', corpo); }
  catch (e) { if (c.webhook_id) wh = await chamar(c, 'POST', '/webhooks', corpo); else throw e; }
  await salvarCfg({ webhook_token: token, webhook_id: wh.id, webhook_url: url });
  res.json({ ok: true, url });
}));

router.post('/cobrancas/:id/emitir', wrap(async (req, res) => {
  if (!canWrite(req.user)) throw new HttpError(403, 'Sem permissão.');
  const row = await emitir(Number(req.params.id));
  await audit(req, 'editar', 'cobrancas', row.id, `Boleto/Pix gerado no Asaas (${row.asaas_id})`);
  res.json({ data: row });
}));

router.get('/cobrancas/:id/pix', wrap(async (req, res) => {
  const cb = await one('SELECT asaas_id FROM cobrancas WHERE id=?', [Number(req.params.id)]);
  if (!cb?.asaas_id) throw new HttpError(400, 'Gere a cobrança no Asaas primeiro.');
  const c = await cfg();
  const r = await chamar(c, 'GET', `/payments/${cb.asaas_id}/pixQrCode`);
  res.json({ copia_e_cola: r.payload, imagem: r.encodedImage ? 'data:image/png;base64,' + r.encodedImage : null, expira: r.expirationDate || null });
}));

// Confere no Asaas o estado atual da cobrança (caso algum aviso tenha se perdido)
router.post('/cobrancas/:id/atualizar', wrap(async (req, res) => {
  const cb = await one('SELECT asaas_id FROM cobrancas WHERE id=?', [Number(req.params.id)]);
  if (!cb?.asaas_id) throw new HttpError(400, 'Esta cobrança não está no Asaas.');
  const c = await cfg();
  const p = await chamar(c, 'GET', `/payments/${cb.asaas_id}`);
  const evento = STATUS_PAGO.includes(p.status) ? (p.status === 'RECEIVED_IN_CASH' ? 'PAYMENT_RECEIVED_IN_CASH' : 'PAYMENT_RECEIVED') : p.deleted ? 'PAYMENT_DELETED' : p.status === 'OVERDUE' ? 'PAYMENT_OVERDUE' : 'PAYMENT_UPDATED';
  const resultado = await processarEvento({ event: evento, payment: p });
  res.json({ ok: true, status: p.status, resultado });
}));

if (TESTE) router.post('/_teste/emitir-pendentes', requireAdmin, wrap(async (req, res) => res.json(await emitirPendentes())));

const ESTADO = { pronto: async () => { const c = await cfg(); return { ativo: c.ativo, pronto: !!(c.ativo && c.api_key) }; } };
router.get('/estado', wrap(async (req, res) => res.json(await ESTADO.pronto())));

module.exports = { router, pub, migrate, iniciar, tick, emitir, emitirPendentes, aoSalvarCobranca, processarEvento, URLS };
