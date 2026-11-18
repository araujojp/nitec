const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const rateLimit = require('express-rate-limit');
const { q, one } = require('./db');
const { totpSecret, totpVerify, audit, nowSql, wrap, HttpError } = require('./util');

const COOKIE = 'neon_sessao';
const SESSION_DAYS = 7;

function secret() {
  const s = process.env.SECRET || process.env.APP_SECRET;
  if (!s || s.length < 16) throw new Error('Defina a variável SECRET (mínimo 16 caracteres).');
  return s;
}

function publicUser(u) {
  return { id: u.id, nome: u.nome, email: u.email, funcao: u.funcao, totp_ativo: !!u.totp_ativo };
}

function setSession(res, req, u) {
  const token = jwt.sign({ uid: u.id, v: u.sessao_versao }, secret(), { expiresIn: SESSION_DAYS + 'd' });
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/',
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
    maxAge: SESSION_DAYS * 864e5,
  });
}

// Carrega o usuário da sessão (se houver)
const loadUser = wrap(async (req, res, next) => {
  const token = req.cookies && req.cookies[COOKIE];
  if (token) {
    try {
      const p = jwt.verify(token, secret());
      if (p.uid && !p.pre2fa) {
        const u = await one('SELECT * FROM usuarios WHERE id=? AND ativo=1', [p.uid]);
        if (u && u.sessao_versao === p.v) req.user = u;
      }
    } catch { /* sessão inválida */ }
  }
  next();
});

function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ erro: 'Faça login para continuar.' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ erro: 'Faça login para continuar.' });
  if (req.user.funcao !== 'admin') return res.status(403).json({ erro: 'Somente administradores podem fazer isso.' });
  next();
}
function canWrite(u) { return u && (u.funcao === 'admin' || u.funcao === 'equipe'); }
function canDelete(u) { return u && u.funcao === 'admin'; }

const loginLimiter = rateLimit({
  windowMs: 15 * 60e3, limit: 20, standardHeaders: true, legacyHeaders: false,
  message: { erro: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' },
});

const router = express.Router();

router.get('/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});

router.post('/login', loginLimiter, wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const senha = String(req.body.senha || '');
  const codigo = req.body.codigo;
  const u = await one('SELECT * FROM usuarios WHERE email=?', [email]);
  const ok = u && u.ativo && u.senha_hash && (await bcrypt.compare(senha, u.senha_hash));
  if (!ok) {
    await audit(req, 'login_falhou', 'usuarios', u ? u.id : null, `Tentativa de login: ${email}`);
    throw new HttpError(401, 'E-mail ou senha incorretos.');
  }
  if (u.totp_ativo) {
    if (!codigo) return res.json({ precisa2fa: true });
    if (!totpVerify(u.totp_secret, codigo)) throw new HttpError(401, 'Código de verificação inválido.');
  }
  await q('UPDATE usuarios SET ultimo_acesso=? WHERE id=?', [nowSql(), u.id]);
  setSession(res, req, u);
  req.user = u;
  await audit(req, 'login', 'usuarios', u.id, 'Entrou no painel');
  res.json({ user: publicUser(u) });
}));

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

router.post('/senha', requireUser, wrap(async (req, res) => {
  const { atual, nova } = req.body;
  if (!nova || String(nova).length < 8) throw new HttpError(400, 'A nova senha precisa ter pelo menos 8 caracteres.');
  if (!(await bcrypt.compare(String(atual || ''), req.user.senha_hash || ''))) throw new HttpError(400, 'Senha atual incorreta.');
  const hash = await bcrypt.hash(String(nova), 11);
  await q('UPDATE usuarios SET senha_hash=?, sessao_versao=sessao_versao+1 WHERE id=?', [hash, req.user.id]);
  const u = await one('SELECT * FROM usuarios WHERE id=?', [req.user.id]);
  setSession(res, req, u);
  await audit(req, 'senha', 'usuarios', u.id, 'Trocou a própria senha');
  res.json({ ok: true });
}));

router.post('/perfil', requireUser, wrap(async (req, res) => {
  const nome = String(req.body.nome || '').trim();
  if (!nome) throw new HttpError(400, 'Informe seu nome.');
  await q('UPDATE usuarios SET nome=? WHERE id=?', [nome.slice(0, 120), req.user.id]);
  res.json({ ok: true });
}));

// 2FA: gerar segredo + QR Code
router.post('/2fa/iniciar', requireUser, wrap(async (req, res) => {
  const s = totpSecret();
  await q('UPDATE usuarios SET totp_secret=?, totp_ativo=0 WHERE id=?', [s, req.user.id]);
  const label = encodeURIComponent(`Neon Gestão:${req.user.email}`);
  const uri = `otpauth://totp/${label}?secret=${s}&issuer=${encodeURIComponent('Neon Gestão')}&algorithm=SHA1&digits=6&period=30`;
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 240 });
  res.json({ segredo: s, qr });
}));

router.post('/2fa/ativar', requireUser, wrap(async (req, res) => {
  const u = await one('SELECT * FROM usuarios WHERE id=?', [req.user.id]);
  if (!totpVerify(u.totp_secret, req.body.codigo)) throw new HttpError(400, 'Código inválido. Confira o horário do celular e tente de novo.');
  await q('UPDATE usuarios SET totp_ativo=1 WHERE id=?', [u.id]);
  await audit(req, '2fa', 'usuarios', u.id, 'Ativou a verificação em duas etapas');
  res.json({ ok: true });
}));

router.post('/2fa/desativar', requireUser, wrap(async (req, res) => {
  const u = await one('SELECT * FROM usuarios WHERE id=?', [req.user.id]);
  if (!(await bcrypt.compare(String(req.body.senha || ''), u.senha_hash || ''))) throw new HttpError(400, 'Senha incorreta.');
  await q('UPDATE usuarios SET totp_ativo=0, totp_secret=NULL WHERE id=?', [u.id]);
  await audit(req, '2fa', 'usuarios', u.id, 'Desativou a verificação em duas etapas');
  res.json({ ok: true });
}));

// Cria o primeiro administrador a partir de ADMIN_EMAIL / ADMIN_PASSWORD
async function ensureAdmin() {
  const c = await one('SELECT COUNT(*) n FROM usuarios');
  if (c.n > 0) return;
  const email = (process.env.ADMIN_EMAIL || 'admin@neonsistemas.com').toLowerCase();
  const senha = process.env.ADMIN_PASSWORD;
  if (!senha) { console.warn('Nenhum usuário e ADMIN_PASSWORD não definido.'); return; }
  await q('INSERT INTO usuarios (nome, email, senha_hash, funcao) VALUES (?,?,?,?)',
    ['Administrador', email, await bcrypt.hash(senha, 11), 'admin']);
  console.log('Administrador criado:', email);
}

module.exports = { router, loadUser, requireUser, requireAdmin, canWrite, canDelete, ensureAdmin, publicUser };
