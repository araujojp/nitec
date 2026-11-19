// Sobe o painel com um banco de teste limpo e oferece um cliente HTTP com sessão.
// Use: TEST_DB_HOST/PORT/USER/PASSWORD (padrão 127.0.0.1:3307, t/t). O banco "painel_teste_auto" é recriado.
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const mysql = require('mysql2/promise');

const DB = {
  host: process.env.TEST_DB_HOST || '127.0.0.1', port: Number(process.env.TEST_DB_PORT || 3307),
  user: process.env.TEST_DB_USER || 't', password: process.env.TEST_DB_PASSWORD || 't',
};
const DB_NAME = 'painel_teste_auto';
const PORT = 3990 + Math.floor(Math.random() * 9);
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = { email: 'admin@teste.local', senha: 'senha-teste-123' };

let proc, conn;

async function start(extraEnv = {}) {
  conn = await mysql.createConnection({ ...DB, multipleStatements: true, dateStrings: true });
  await conn.query(`DROP DATABASE IF EXISTS ${DB_NAME}; CREATE DATABASE ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; USE ${DB_NAME}`);
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-storage-'));
  proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DB_HOST: DB.host, DB_PORT: String(DB.port), DB_USER: DB.user, DB_PASSWORD: DB.password, DB_DATABASE: DB_NAME,
      SECRET: 'segredo-de-teste-automatico-123456', ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.senha,
      PUBLIC_URL: BASE, STORAGE_DIR: storage, PORT: String(PORT), NEON_TESTE: '1', ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; }); proc.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(BASE + '/saude'); if (r.ok) break; } catch { /* aguardando */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  // espera a criação do admin
  for (let i = 0; i < 50; i++) { const [r] = await conn.query('SELECT COUNT(*) n FROM usuarios').catch(() => [[{ n: 0 }]]); if (r[0].n) break; await new Promise((r) => setTimeout(r, 100)); }
  return { log: () => log };
}

async function stop() {
  if (proc) proc.kill();
  if (conn) { await conn.query(`DROP DATABASE IF EXISTS ${DB_NAME}`).catch(() => {}); await conn.end(); }
}

function sql(query, params) { return conn.query(query, params).then(([r]) => r); }

class Client {
  constructor() { this.cookie = ''; }
  async req(method, p, body, headers = {}) {
    const r = await fetch(BASE + p, {
      method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const sc = r.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0];
    const txt = await r.text(); let json; try { json = JSON.parse(txt); } catch { json = txt; }
    return { status: r.status, body: json, headers: r.headers };
  }
  get(p, h) { return this.req('GET', p, null, h); }
  post(p, b, h) { return this.req('POST', p, b || {}, h); }
  patch(p, b) { return this.req('PATCH', p, b); }
  del(p) { return this.req('DELETE', p); }
  async login(email = ADMIN.email, senha = ADMIN.senha) { const r = await this.post('/api/auth/login', { email, senha }); if (r.status !== 200) throw new Error('login falhou: ' + JSON.stringify(r.body)); return this; }
}

module.exports = { start, stop, sql, Client, BASE, ADMIN };
