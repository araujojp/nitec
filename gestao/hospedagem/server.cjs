// Painel de Gestão Neon (Directus) - entrada para a hospedagem Hostinger (Node.js / LiteSpeed)
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const dir = __dirname;
for (const k of ['STORAGE_LOCAL_ROOT', 'EXTENSIONS_PATH']) if (process.env[k]) fs.mkdirSync(process.env[k], { recursive: true });

(async () => {
  // Descobre o endereço do MySQL que responde nesta hospedagem
  if (process.env.DB_CLIENT === 'mysql' && process.env.DB_HOST_CANDIDATES) {
    const mysql = require('mysql2/promise');
    for (const host of process.env.DB_HOST_CANDIDATES.split(',')) {
      try {
        const c = await mysql.createConnection({ host, port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER,
          password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE, connectTimeout: 5000 });
        await c.end(); process.env.DB_HOST = host; console.log('[neon] banco em', host); break;
      } catch (e) { console.log('[neon] banco indisponível em', host, e.code || e.message); }
    }
  }
  // Cria/atualiza as tabelas do Directus (idempotente) e o administrador na primeira vez
  const r = spawnSync(process.execPath, [path.join(dir, 'node_modules/directus/cli.js'), 'bootstrap'], { env: process.env, stdio: 'inherit' });
  if (r.status !== 0) console.error('[neon] bootstrap terminou com código', r.status);

  const { createServer } = await import('@directus/api/server');
  const server = await createServer();
  const port = process.env.PORT || 8055;
  server.listen(port, () => console.log('[neon] Directus ouvindo em', port));
})().catch((e) => { console.error('[neon] falha ao iniciar', e); process.exit(1); });
