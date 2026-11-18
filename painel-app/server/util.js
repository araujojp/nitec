const crypto = require('crypto');
const { q } = require('./db');

// ---------- TOTP (RFC 6238), compatível com Google Authenticator ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = String(str).replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  let bits = 0, value = 0; const out = [];
  for (const c of clean) {
    const idx = B32.indexOf(c); if (idx < 0) continue;
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

function totpCode(secret, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const off = h[h.length - 1] & 15;
  const bin = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 1e6).padStart(6, '0');
}

function totpVerify(secret, code) {
  const c = String(code || '').replace(/\D/g, '');
  if (c.length !== 6 || !secret) return false;
  const now = Math.floor(Date.now() / 30000);
  for (let w = -1; w <= 1; w++) {
    const expected = totpCode(secret, now + w);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(c))) return true;
  }
  return false;
}

function totpSecret() { return base32Encode(crypto.randomBytes(20)); }

// ---------- Tokens, chaves, hashes ----------
function sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }

function deviceToken() { return 'neon_' + crypto.randomBytes(30).toString('base64url'); }

function licenseKey() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(20);
  let s = '';
  for (let i = 0; i < 20; i++) s += alphabet[bytes[i] % alphabet.length];
  return 'NEON-' + s.match(/.{5}/g).join('-');
}

function uuid() { return crypto.randomUUID(); }

function randomPassword(len = 16) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += alphabet[bytes[i] % alphabet.length];
  return s;
}

// ---------- Datas ----------
function nowSql() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }
function todaySql() {
  // Data de hoje no fuso de Brasília
  return new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
}

// ---------- Registro de atividades ----------
async function audit(req, acao, entidade, entidade_id, resumo, mudancas) {
  try {
    const u = req && req.user;
    await q('INSERT INTO atividades (usuario_id, usuario_nome, acao, entidade, entidade_id, resumo, mudancas, ip) VALUES (?,?,?,?,?,?,?,?)', [
      u ? u.id : null, u ? u.nome : null, acao, entidade || null, entidade_id != null ? String(entidade_id) : null,
      resumo ? String(resumo).slice(0, 255) : null, mudancas ? JSON.stringify(mudancas) : null, req ? clientIp(req) : null,
    ]);
  } catch (e) { console.error('audit', e.message); }
}

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  return (xf ? String(xf).split(',')[0].trim() : req.socket.remoteAddress || '').slice(0, 60);
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = {
  totpSecret, totpVerify, totpCode, sha256, deviceToken, licenseKey, uuid, randomPassword,
  nowSql, todaySql, audit, clientIp, HttpError, wrap,
};
