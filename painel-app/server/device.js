// API usada pelos equipamentos instalados nos clientes.
// Mantém as mesmas 4 chamadas do painel antigo (Directus):
//   GET  /items/versoes   GET /assets/:id   GET /items/licencas   POST /items/checkins
// e oferece também rotas novas e simples em /api/v1/equipamento/...
const express = require('express');
const rateLimit = require('express-rate-limit');
const { q, one } = require('./db');
const { sha256, nowSql, clientIp, wrap, HttpError } = require('./util');
const { sendAsset } = require('./files');

const EVENTOS = ['heartbeat', 'inicio', 'atualizado', 'erro'];

const limiter = rateLimit({ windowMs: 1000, limit: 100, standardHeaders: true, legacyHeaders: false, message: { errors: [{ message: 'Muitas requisições.' }] } });

// Identifica o equipamento pelo token (Authorization: Bearer ... ou ?access_token=...)
async function deviceFromReq(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : (req.query.access_token || '').trim();
  if (!token) return null;
  const inst = await one(`SELECT i.*, p.codigo AS produto_codigo FROM instalacoes i JOIN produtos p ON p.id=i.produto_id
                          WHERE i.token_hash=?`, [sha256(token)]);
  return inst || null;
}

const requireDevice = wrap(async (req, res, next) => {
  const inst = await deviceFromReq(req);
  if (!inst) return res.status(401).json({ errors: [{ message: 'Token inválido ou ausente.', extensions: { code: 'INVALID_CREDENTIALS' } }] });
  if (['cancelada', 'suspensa'].includes(inst.status)) return res.status(403).json({ errors: [{ message: `Instalação ${inst.status}.`, extensions: { code: 'FORBIDDEN' } }] });
  req.device = inst;
  next();
});

// Lê filtros no formato do Directus: filter[produto][codigo][_eq]=x
function directusFilter(query) {
  const f = query.filter || {};
  let obj = f;
  if (typeof f === 'string') { try { obj = JSON.parse(f); } catch { obj = {}; } }
  const pick = (...path) => { let o = obj; for (const p of path) { if (!o || typeof o !== 'object') return undefined; o = o[p]; } return o; };
  return {
    produto: pick('produto', 'codigo', '_eq'),
    canal: pick('canal', '_eq'),
    numero: pick('numero', '_eq'),
  };
}

function versionRow(v) {
  return {
    id: v.id,
    numero: v.numero,
    canal: v.canal,
    obrigatoria: !!v.obrigatoria,
    sha256: v.sha256,
    notas: v.notas,
    data_lancamento: v.data_lancamento,
    date_created: v.created_at ? v.created_at.replace(' ', 'T') + 'Z' : null,
    produto: { codigo: v.produto_codigo },
    arquivo: v.arquivo ? { id: v.arquivo, filename_download: v.arq_nome, filesize: Number(v.arq_tamanho), type: v.arq_mime } : null,
  };
}

async function findVersions(device, { produto, canal, numero, limit }) {
  const prod = produto || device.produto_codigo;
  // Equipamento no canal estável não vê versões beta
  let canais = canal ? [canal] : (device.canal === 'beta' ? ['estavel', 'beta'] : ['estavel']);
  if (device.canal !== 'beta') canais = canais.filter((c) => c === 'estavel');
  if (!canais.length) return [];
  const params = [prod, canais];
  let extra = '';
  if (numero) { extra = ' AND v.numero=?'; params.push(numero); }
  params.push(Math.min(Number(limit) || 1, 50));
  return q(`SELECT v.*, p.codigo AS produto_codigo, a.nome AS arq_nome, a.tamanho AS arq_tamanho, a.mime AS arq_mime
            FROM versoes v JOIN produtos p ON p.id=v.produto_id LEFT JOIN arquivos a ON a.id=v.arquivo
            WHERE p.codigo=? AND v.canal IN (?) AND v.publicada=1${extra}
            ORDER BY v.created_at DESC, v.id DESC LIMIT ?`, params);
}

async function licenseRows(device) {
  return q('SELECT chave, status, plano, vencimento, inicio FROM licencas WHERE instalacao_id=? ORDER BY id DESC', [device.id]);
}

async function registerCheckin(req, device, body) {
  const evento = EVENTOS.includes(body.evento) ? body.evento : 'heartbeat';
  const versao = body.versao ? String(body.versao).slice(0, 40) : null;
  const codigo = body.codigo_instalacao ? String(body.codigo_instalacao).toUpperCase() : device.codigo;
  if (codigo !== device.codigo) throw new HttpError(403, 'O código da instalação não pertence a este token.');
  const detalhes = body.detalhes == null ? null : JSON.stringify(body.detalhes).slice(0, 20000);
  const ip = clientIp(req);
  const r = await q('INSERT INTO checkins (instalacao_id, codigo_instalacao, evento, versao, mensagem, detalhes, ip) VALUES (?,?,?,?,?,?,?)',
    [device.id, device.codigo, evento, versao, body.mensagem ? String(body.mensagem).slice(0, 500) : null, detalhes, ip]);
  await q(`UPDATE instalacoes SET ultimo_contato=?, ip=COALESCE(?, ip)${versao ? ', versao_instalada=?' : ''} WHERE id=?`,
    versao ? [nowSql(), ip || null, versao, device.id] : [nowSql(), ip || null, device.id]);
  return { id: r.insertId, codigo_instalacao: device.codigo, evento, versao };
}

async function assetForDevice(req, res, device) {
  const v = await one(`SELECT v.id, a.* FROM versoes v JOIN arquivos a ON a.id=v.arquivo JOIN produtos p ON p.id=v.produto_id
                       WHERE v.arquivo=? AND v.publicada=1 AND (v.canal='estavel' OR ?='beta') AND p.id=?`, [req.params.id, device.canal, device.produto_id]);
  if (!v) return res.status(403).json({ errors: [{ message: 'Arquivo não liberado para este equipamento.', extensions: { code: 'FORBIDDEN' } }] });
  if (req.method === 'GET' && !req.headers.range) await q('UPDATE versoes SET downloads=downloads+1 WHERE arquivo=?', [req.params.id]);
  return sendAsset(req, res, v);
}

// ---------------- Rotas compatíveis com o painel antigo ----------------
const compat = express.Router();
compat.use(limiter);

compat.get('/items/versoes', requireDevice, wrap(async (req, res) => {
  const f = directusFilter(req.query);
  const rows = await findVersions(req.device, { ...f, limit: req.query.limit || 1 });
  res.json({ data: rows.map(versionRow) });
}));

compat.get('/items/licencas', requireDevice, wrap(async (req, res) => {
  res.json({ data: await licenseRows(req.device) });
}));

compat.get('/items/instalacoes', requireDevice, wrap(async (req, res) => {
  const d = req.device;
  res.json({ data: [{ codigo: d.codigo, status: d.status, canal: d.canal, versao_instalada: d.versao_instalada, produto: { codigo: d.produto_codigo } }] });
}));

compat.post('/items/checkins', requireDevice, wrap(async (req, res) => {
  res.json({ data: await registerCheckin(req, req.device, req.body || {}) });
}));

// ---------------- API nova (mais simples) ----------------
const v1 = express.Router();
v1.use(limiter, requireDevice);

v1.get('/', wrap(async (req, res) => {
  const d = req.device;
  const [ultima] = await findVersions(d, {});
  res.json({
    instalacao: { codigo: d.codigo, status: d.status, canal: d.canal, versao_instalada: d.versao_instalada, produto: d.produto_codigo },
    licencas: await licenseRows(d),
    ultima_versao: ultima ? versionRow(ultima) : null,
  });
}));
v1.get('/versao', wrap(async (req, res) => {
  const [v] = await findVersions(req.device, { canal: req.query.canal });
  const atual = req.query.atual;
  const temNova = !!(v && (!atual || compareVersions(v.numero, atual) > 0));
  res.json({ atualizacao_disponivel: temNova, versao: v ? versionRow(v) : null });
}));
v1.get('/licenca', wrap(async (req, res) => res.json({ data: await licenseRows(req.device) })));
v1.post('/sinal', wrap(async (req, res) => res.json({ data: await registerCheckin(req, req.device, req.body || {}) })));
v1.get('/download/:id', wrap(async (req, res) => assetForDevice(req, res, req.device)));

function compareVersions(a, b) {
  const pa = String(a).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

module.exports = { compat, v1, deviceFromReq, assetForDevice, compareVersions };
