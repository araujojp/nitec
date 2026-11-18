// Neon Gestão — painel de gestão da Neon Sistemas
require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');

const { migrate, q, one } = require('./server/db');
const auth = require('./server/auth');
const crud = require('./server/crud');
const files = require('./server/files');
const api = require('./server/api');
const device = require('./server/device');
const marketing = require('./server/marketing');
const { wrap } = require('./server/util');

const app = express();
app.set('trust proxy', true);
app.set('query parser', 'extended');
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'script-src': ["'self'", "'unsafe-eval'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'blob:'],
      'connect-src': ["'self'", 'https://viacep.com.br', 'https://brasilapi.com.br'],
      'frame-ancestors': ["'none'"],
      'upgrade-insecure-requests': null,
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(compression({ filter: (req, res) => !req.path.startsWith('/assets/') && !req.path.includes('/download/') && compression.filter(req, res) }));
app.use(cookieParser());
app.use(express.json({ limit: '25mb' }));

app.get('/saude', (req, res) => res.json({ ok: true, sistema: 'Neon Gestão' }));

// API dos equipamentos (compatível com o painel antigo + rotas novas)
app.use(device.compat);
app.use('/api/v1/equipamento', device.v1);
app.use(marketing.pub);

// Sessão do painel
app.use(auth.loadUser);
app.use('/api/auth', auth.router);
app.use('/api/arquivos', files.router);
app.use('/api/marketing', marketing.router);
app.use('/api', api.router);
app.use('/api', crud.router);

// Arquivos: usuários do painel veem tudo; equipamentos só as atualizações liberadas
app.get('/assets/:id', wrap(async (req, res) => {
  if (req.user) {
    const f = await one('SELECT * FROM arquivos WHERE id=? AND completo=1', [req.params.id]);
    if (!f) return res.status(404).json({ erro: 'Arquivo não encontrado.' });
    return files.sendAsset(req, res, f);
  }
  const d = await device.deviceFromReq(req);
  if (!d) return res.status(401).json({ errors: [{ message: 'Token inválido ou ausente.' }] });
  return device.assetForDevice(req, res, d);
}));

// Interface (SPA)
const pub = path.join(__dirname, 'public');
app.use(express.static(pub, { index: false, maxAge: '1h', setHeaders: (res, p) => { if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
app.get(/^\/(?!api\/|assets\/|items\/|publico\/|novidades).*/, (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(pub, 'index.html'));
});

// Erros
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || (err.type === 'entity.too.large' ? 413 : 500);
  if (status >= 500) console.error(err);
  const msg = status >= 500 ? 'Erro interno. Tente de novo em instantes.' : err.message;
  if (req.path.startsWith('/items') || req.path.startsWith('/assets') || req.path.startsWith('/api/v1/')) {
    return res.status(status).json({ errors: [{ message: msg }] });
  }
  res.status(status).json({ erro: msg });
});

async function seed() {
  const c = await one('SELECT COUNT(*) n FROM produtos');
  if (c.n === 0) {
    await q(`INSERT INTO produtos (nome, codigo, descricao) VALUES
      ('Painel Neon','painel-neon','Painel touch de automação de suítes: iluminação, TV, som, climatização e cenas.'),
      ('Neon Motel','neon-motel','Sistema de gestão para motéis, hotéis e pousadas.'),
      ('PABX Neon','pabx-neon','PABX VoIP com ramais no celular, URA e integração com o sistema.')`);
  }
  const defaults = { empresa_nome: 'Neon Sistemas', empresa_whatsapp: '34984302083', empresa_email: 'contato@neonsistemas.com',
    msg_cobranca: 'Olá, {cliente}! Tudo bem? Passando para lembrar da mensalidade {competencia} no valor de {valor}, com vencimento em {vencimento}. Qualquer dúvida estou à disposição. — Neon Sistemas' };
  for (const [k, v] of Object.entries(defaults)) await q('INSERT IGNORE INTO configuracoes (chave, valor) VALUES (?,?)', [k, v]);
}

const PORT = process.env.PORT || 3000;
(async () => {
  try {
    await migrate();
    await seed();
    await auth.ensureAdmin();
    await files.ensureDirs();
    marketing.startScheduler();
  } catch (e) {
    console.error('Falha ao preparar o banco:', e.message);
  }
  app.listen(PORT, () => console.log(`Neon Gestão rodando na porta ${PORT}`));
})();
