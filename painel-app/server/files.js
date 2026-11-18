const express = require('express');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { q, one } = require('./db');
const { requireUser, canWrite, canDelete } = require('./auth');
const { uuid, audit, wrap, HttpError } = require('./util');

const PASTAS = {
  atualizacoes: 'Atualizações',
  chamados: 'Anexos de chamados',
  comprovantes: 'Comprovantes',
  contratos: 'Contratos',
  marketing: 'Marketing (imagens e vídeos)',
  geral: 'Outros arquivos',
};
const CHUNK_MAX = 16 * 1024 * 1024;

function storageDir() {
  return process.env.STORAGE_DIR || path.join(__dirname, '..', 'storage');
}
function maxBytes() {
  return Number(process.env.MAX_UPLOAD_MB || 2048) * 1024 * 1024;
}
function filePath(f) {
  return path.join(storageDir(), f.pasta, f.disco);
}

async function ensureDirs() {
  for (const p of Object.keys(PASTAS)) await fsp.mkdir(path.join(storageDir(), p), { recursive: true });
}

function hashFile(p) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(p).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

async function sizeOnDisk(f) {
  try { return (await fsp.stat(filePath(f))).size; } catch { return 0; }
}

const router = express.Router();
router.use(requireUser);

router.get('/pastas', wrap(async (req, res) => {
  const rows = await q('SELECT pasta, COUNT(*) n, COALESCE(SUM(tamanho),0) bytes FROM arquivos WHERE completo=1 GROUP BY pasta');
  const map = Object.fromEntries(rows.map((r) => [r.pasta, r]));
  res.json({ data: Object.entries(PASTAS).map(([k, nome]) => ({ chave: k, nome, n: map[k]?.n || 0, bytes: Number(map[k]?.bytes || 0) })) });
}));

router.get('/', wrap(async (req, res) => {
  const where = ['completo=1']; const params = [];
  if (req.query.pasta) { where.push('pasta=?'); params.push(req.query.pasta); }
  if (req.query.q) { where.push('nome LIKE ?'); params.push(`%${req.query.q}%`); }
  if (req.query.meus) { where.push('enviado_por=?'); params.push(req.user.id); }
  const limit = Math.min(Number(req.query.limit) || 60, 300);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const rows = await q(`SELECT a.*, u.nome AS enviado_por_nome FROM arquivos a LEFT JOIN usuarios u ON u.id=a.enviado_por WHERE ${where.join(' AND ')} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
  const [{ n }] = await q(`SELECT COUNT(*) n FROM arquivos WHERE ${where.join(' AND ')}`, params);
  res.json({ data: rows, total: n });
}));

// 1) Inicia um envio (ou retoma um existente)
router.post('/iniciar', wrap(async (req, res) => {
  if (!canWrite(req.user)) throw new HttpError(403, 'Sem permissão para enviar arquivos.');
  const nome = String(req.body.nome || 'arquivo').replace(/[\\/]/g, '_').slice(0, 255);
  const tamanho = Number(req.body.tamanho);
  const pasta = PASTAS[req.body.pasta] ? req.body.pasta : 'geral';
  if (!Number.isFinite(tamanho) || tamanho < 0) throw new HttpError(400, 'Tamanho inválido.');
  if (tamanho > maxBytes()) throw new HttpError(413, `Arquivo grande demais. O limite é ${Math.round(maxBytes() / 1024 / 1024)} MB.`);
  // Retomar envio interrompido do mesmo arquivo
  const pendente = await one('SELECT * FROM arquivos WHERE completo=0 AND nome=? AND tamanho=? AND pasta=? AND enviado_por=? ORDER BY created_at DESC LIMIT 1', [nome, tamanho, pasta, req.user.id]);
  if (pendente) return res.json({ id: pendente.id, recebido: await sizeOnDisk(pendente), parte: 8 * 1024 * 1024 });
  const id = uuid();
  const ext = path.extname(nome).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 12);
  const f = { id, pasta, disco: id + ext };
  await ensureDirs();
  await fsp.writeFile(filePath(f), '');
  await q('INSERT INTO arquivos (id, nome, disco, pasta, mime, tamanho, completo, enviado_por) VALUES (?,?,?,?,?,?,0,?)',
    [id, nome, f.disco, pasta, String(req.body.mime || 'application/octet-stream').slice(0, 120), tamanho, req.user.id]);
  if (tamanho === 0) return finalize(req, res, await one('SELECT * FROM arquivos WHERE id=?', [id]));
  res.json({ id, recebido: 0, parte: 8 * 1024 * 1024 });
}));

async function finalize(req, res, f) {
  const sha = await hashFile(filePath(f));
  await q('UPDATE arquivos SET completo=1, sha256=? WHERE id=?', [sha, f.id]);
  await audit(req, 'enviar', 'arquivos', f.id, `Enviou ${f.nome}`);
  res.json({ id: f.id, recebido: f.tamanho, completo: true, sha256: sha, nome: f.nome, tamanho: f.tamanho });
}

// 2) Recebe uma parte do arquivo
router.put('/:id/parte', express.raw({ type: '*/*', limit: CHUNK_MAX }), wrap(async (req, res) => {
  const f = await one('SELECT * FROM arquivos WHERE id=?', [req.params.id]);
  if (!f || f.completo) throw new HttpError(404, 'Envio não encontrado.');
  if (f.enviado_por !== req.user.id) throw new HttpError(403, 'Envio de outro usuário.');
  const offset = Number(req.query.offset);
  const atual = await sizeOnDisk(f);
  if (offset !== atual) return res.status(409).json({ erro: 'Posição fora de ordem.', recebido: atual });
  const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (atual + buf.length > f.tamanho) throw new HttpError(400, 'O arquivo ficou maior que o informado.');
  await fsp.appendFile(filePath(f), buf);
  const recebido = atual + buf.length;
  if (recebido === Number(f.tamanho)) return finalize(req, res, f);
  res.json({ id: f.id, recebido });
}));

router.get('/:id/status', wrap(async (req, res) => {
  const f = await one('SELECT * FROM arquivos WHERE id=?', [req.params.id]);
  if (!f) throw new HttpError(404, 'Arquivo não encontrado.');
  res.json({ id: f.id, recebido: f.completo ? Number(f.tamanho) : await sizeOnDisk(f), completo: !!f.completo });
}));

router.patch('/:id', wrap(async (req, res) => {
  if (!canWrite(req.user)) throw new HttpError(403, 'Sem permissão.');
  const f = await one('SELECT * FROM arquivos WHERE id=?', [req.params.id]);
  if (!f) throw new HttpError(404, 'Arquivo não encontrado.');
  const nome = String(req.body.nome || f.nome).replace(/[\\/]/g, '_').slice(0, 255);
  let pasta = f.pasta;
  if (req.body.pasta && PASTAS[req.body.pasta] && req.body.pasta !== f.pasta) {
    pasta = req.body.pasta;
    await fsp.mkdir(path.join(storageDir(), pasta), { recursive: true });
    await fsp.rename(filePath(f), path.join(storageDir(), pasta, f.disco));
  }
  await q('UPDATE arquivos SET nome=?, pasta=? WHERE id=?', [nome, pasta, f.id]);
  res.json({ ok: true });
}));

router.delete('/:id', wrap(async (req, res) => {
  if (!canDelete(req.user)) throw new HttpError(403, 'Somente administradores podem apagar arquivos.');
  const f = await one('SELECT * FROM arquivos WHERE id=?', [req.params.id]);
  if (!f) throw new HttpError(404, 'Arquivo não encontrado.');
  const uso = await one(`SELECT
      (SELECT COUNT(*) FROM versoes WHERE arquivo=?) +
      (SELECT COUNT(*) FROM licencas WHERE contrato_arquivo=?) +
      (SELECT COUNT(*) FROM cobrancas WHERE comprovante=?) +
      (SELECT COUNT(*) FROM chamados WHERE JSON_CONTAINS(COALESCE(anexos,'[]'), JSON_QUOTE(?))) AS n`, [f.id, f.id, f.id, f.id]);
  if (uso.n > 0 && !req.query.forcar) throw new HttpError(409, 'Este arquivo está em uso (versão, contrato, comprovante ou chamado). Confirme para apagar mesmo assim.');
  await fsp.rm(filePath(f), { force: true });
  await q('DELETE FROM arquivos WHERE id=?', [f.id]);
  await audit(req, 'apagar', 'arquivos', f.id, `Apagou ${f.nome}`);
  res.json({ ok: true });
}));

// Limpa envios abandonados (mais de 2 dias sem terminar)
async function cleanupPartial() {
  const old = await q('SELECT * FROM arquivos WHERE completo=0 AND created_at < UTC_TIMESTAMP() - INTERVAL 2 DAY');
  for (const f of old) { await fsp.rm(filePath(f), { force: true }); await q('DELETE FROM arquivos WHERE id=?', [f.id]); }
}

// Entrega um arquivo (com suporte a download retomável / Range)
async function sendAsset(req, res, f) {
  const p = filePath(f);
  if (!fs.existsSync(p)) throw new HttpError(404, 'Arquivo não encontrado no disco.');
  const download = req.query.download !== undefined;
  const safe = f.nome.replace(/"/g, '');
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(safe).replace(/%20/g, ' ')}"; filename*=UTF-8''${encodeURIComponent(safe)}`);
  if (f.sha256) res.setHeader('X-Checksum-SHA256', f.sha256);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const inlineOk = /^(image\/(png|jpeg|gif|webp)|application\/pdf|text\/plain)$/.test(f.mime || '');
  res.sendFile(p, { headers: { 'Content-Type': download || !inlineOk ? 'application/octet-stream' : f.mime }, acceptRanges: true, cacheControl: false });
}

module.exports = { router, PASTAS, ensureDirs, sendAsset, cleanupPartial, storageDir };
