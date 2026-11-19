// Marketing: geração com IA, integrações, aprovação, fila de publicação, tarefas agendadas e páginas públicas.
const express = require('express');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { q, one, getPool } = require('./db');
const { requireUser, requireAdmin, canWrite } = require('./auth');
const { uuid, audit, wrap, HttpError, nowSql } = require('./util');
const ai = require('./ai');
const social = require('./social');
const tg = require('./telegram');
const { storageDir, ensureDirs, sendAsset } = require('./files');
const { nextRun } = require('./cron');
const templates = require('./templates');

const REDES_POST = ['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin', 'telegram_canal'];
const parseJ = (v, d) => { if (typeof v === 'string') { try { return JSON.parse(v); } catch { return d; } } return v ?? d; };

async function mktConfig() {
  const rows = await q("SELECT chave, valor FROM configuracoes WHERE chave LIKE 'mkt_%' OR chave LIKE 'empresa_%'");
  const c = Object.fromEntries(rows.map((r) => [r.chave, r.valor]));
  return {
    exigir_aprovacao: c.mkt_exigir_aprovacao !== '0',
    usar_ia: c.mkt_usar_ia !== '0',
    modelo_padrao: c.mkt_modelo_padrao || 'destaque',
    rodape: c.mkt_rodape ?? '(34) 98430-2083 · neonsistemas.com',
    legendas: { ...LEGENDAS_PADRAO, ...parseJ(c.mkt_legendas, {}) },
    redes_padrao: parseJ(c.mkt_redes_padrao, ['instagram', 'facebook', 'linkedin']),
    sobre: c.mkt_sobre || 'A Neon Sistemas cria tecnologia para motéis, hotéis e pousadas: o Painel Neon (automação de suítes com painel touch: iluminação, TV, som, ar-condicionado e cenas), o Neon Motel (sistema de gestão com mapa de suítes, recepção, caixa, estoque e relatórios) e o PABX Neon (PABX VoIP com ramais no celular, URA e integração).',
    estilo_imagem: c.mkt_estilo_imagem || 'fotografia profissional, ambiente de suíte de motel/hotel moderno e elegante, iluminação neon laranja e azul, alto contraste, aspecto premium, sem texto na imagem',
    empresa: c.empresa_nome || 'Neon Sistemas',
    whatsapp: c.empresa_whatsapp || '',
  };
}

const LEGENDAS_PADRAO = {
  instagram: '{titulo}\n\n{texto}\n\n📲 Fale com a gente: {whatsapp_link}\n\n{hashtags}',
  facebook: '{titulo}\n\n{texto}\n\n👉 Saiba mais: {site}\n📲 WhatsApp: {whatsapp_link}',
  linkedin: '{titulo}\n\n{texto}\n\nSaiba mais em {site}\n\n{hashtags}',
  tiktok: '{titulo} {hashtags}',
  youtube: '{titulo}\n\n{texto}\n\nWhatsApp: {whatsapp_link}\nSite: {site}',
  telegram_canal: '<b>{titulo}</b>\n\n{texto}\n\n{site}',
};

function fillCaption(tpl, d) {
  return String(tpl || '{titulo}\n\n{texto}').replace(/\{(\w+)\}/g, (m, k) => (d[k] ?? '')).replace(/\n{3,}/g, '\n\n').trim();
}

// Monta os textos de cada rede a partir dos modelos de legenda (sem IA)
async function captionsFromTemplates(titulo, texto, hashtags, redes) {
  const cfg = await mktConfig();
  const wa = (cfg.whatsapp || '').replace(/\D/g, '');
  const d = { titulo: titulo || '', texto: texto || '', hashtags: hashtags || '', whatsapp: cfg.whatsapp || '', whatsapp_link: wa ? `https://wa.me/55${wa}` : '', site: 'https://neonsistemas.com', empresa: cfg.empresa };
  const out = {};
  for (const r of redes) out[r] = fillCaption(cfg.legendas[r], d).replace(/<\/?b>/g, r === 'telegram_canal' ? '' : '');
  return out;
}

// Renderiza a arte de um modelo e salva na pasta Marketing
async function renderArt(modelo, dados, fotoId, userId) {
  const cfg = await mktConfig();
  let foto = null;
  if (fotoId) {
    const f = await one('SELECT * FROM arquivos WHERE id=? AND completo=1', [fotoId]);
    if (f) foto = await fsp.readFile(path.join(storageDir(), f.pasta, f.disco));
  }
  const buf = await templates.render(modelo, { ...dados, rodape: dados.rodape ?? cfg.rodape, foto });
  return saveBuffer(buf, `arte-${modelo}-${Date.now()}.jpg`, 'image/jpeg', userId);
}

// Cria um post sem IA a partir de foto + texto, usando um modelo
async function createPostFromTemplate({ titulo, texto, fotoId, modelo, redes, agendado_para, hashtags, destaque, cta, userId, origem = 'painel', semArte = false }) {
  const cfg = await mktConfig();
  const r = redes && redes.length ? redes : cfg.redes_padrao;
  const mod = modelo || cfg.modelo_padrao;
  const arte = { titulo: titulo || '', subtitulo: (texto || '').split('\n')[0].slice(0, 140), destaque: destaque || '', cta: cta || 'Fale no WhatsApp', foto: fotoId || null };
  const imagem = semArte ? fotoId : await renderArt(mod, arte, fotoId, userId);
  const textos = await captionsFromTemplates(titulo, texto, hashtags, r);
  const status = cfg.exigir_aprovacao ? 'aguardando' : (agendado_para ? 'agendado' : 'aprovado');
  const slug = String(titulo || 'post').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 180) + '-' + Date.now().toString(36).slice(-4);
  const ins = await q(`INSERT INTO posts (titulo, slug, texto, textos, hashtags, imagem, redes, agendado_para, status, modelo, arte, resultado)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [String(titulo || 'Post').slice(0, 200), slug, texto || '', JSON.stringify(textos), hashtags || null, imagem, JSON.stringify(r), agendado_para || null, status, semArte ? null : mod, JSON.stringify(arte), JSON.stringify({ origem: { via: origem, sem_ia: true } })]);
  return one('SELECT * FROM posts WHERE id=?', [ins.insertId]);
}

// ---------- Salvar arquivo gerado ----------
async function saveBuffer(buf, nome, mime, userId) {
  await ensureDirs();
  const id = uuid();
  const ext = path.extname(nome).toLowerCase() || '.png';
  const disco = id + ext;
  await fsp.writeFile(path.join(storageDir(), 'marketing', disco), buf);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  await q('INSERT INTO arquivos (id, nome, disco, pasta, mime, tamanho, sha256, completo, enviado_por) VALUES (?,?,?,?,?,?,?,1,?)',
    [id, nome, disco, 'marketing', mime, buf.length, sha, userId || null]);
  return id;
}

function detectMime(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return ['image/png', '.png'];
  if (buf[0] === 0xff && buf[1] === 0xd8) return ['image/jpeg', '.jpg'];
  if (buf.slice(0, 4).toString() === 'RIFF') return ['image/webp', '.webp'];
  return ['image/png', '.png'];
}

// ---------- Geração com IA ----------
const SYSTEM = (cfg) => `Você é o redator e diretor de arte de marketing da ${cfg.empresa}. Escreva SEMPRE em português do Brasil, com linguagem natural, persuasiva e sem exageros falsos.
Sobre a empresa: ${cfg.sobre}
${cfg.whatsapp ? `WhatsApp para chamadas: ${cfg.whatsapp}.` : ''}
Regras: não invente preços, números ou depoimentos que não foram informados; use emojis com moderação; cada rede tem seu estilo:
- instagram: legenda envolvente, quebras de linha, CTA, até 2200 caracteres;
- facebook: texto um pouco mais informativo, CTA claro;
- linkedin: tom profissional, foco em resultado para o negócio do cliente;
- tiktok: curto, direto, gancho forte no começo;
- youtube: título chamativo na primeira linha + descrição;
- telegram_canal: texto curto e objetivo.
Responda SOMENTE com JSON válido.`;

async function aiPostContent({ ideia, campanha, redes, cfg }) {
  const prompt = `Crie UM post de redes sociais.
Ideia / pedido: ${ideia}
${campanha ? `Campanha: ${campanha.nome}. Objetivo: ${campanha.objetivo || '-'}. Público: ${campanha.publico || '-'}. Tom: ${campanha.tom || 'profissional'}. Briefing: ${campanha.briefing || '-'}` : ''}
Redes: ${redes.join(', ') || 'instagram, facebook, linkedin'}
Formato do JSON:
{"titulo": "título curto interno (até 80 caracteres)",
 "texto": "texto principal",
 "textos": {${redes.map((r) => `"${r}": "texto para ${r}"`).join(', ')}},
 "hashtags": "#exemplo #outra (até 10)",
 "prompt_imagem": "descrição em INGLÊS da imagem ideal para o post, fotográfica, sem textos escritos"}`;
  return ai.generateText(SYSTEM(cfg), prompt);
}

async function generatePost({ ideia, campanhaId, redes, comImagem = true, imagemId = null, agendado_para = null, userId = null, origem = 'painel' }) {
  const cfg = await mktConfig();
  if (!cfg.usar_ia) {
    // Modo sem IA: o texto vira legenda e a foto entra no modelo padrão
    const linhas = String(ideia || '').split('\n');
    return createPostFromTemplate({ titulo: linhas[0].slice(0, 120), texto: linhas.slice(1).join('\n').trim() || linhas[0], fotoId: imagemId, redes, agendado_para, userId, origem });
  }
  const campanha = campanhaId ? await one('SELECT * FROM campanhas WHERE id=?', [campanhaId]) : null;
  let r = redes && redes.length ? redes : (campanha ? parseJ(campanha.redes, []).filter((x) => x !== 'site') : []);
  if (!r.length) r = cfg.redes_padrao;
  const publicarSite = campanha ? parseJ(campanha.redes, []).includes('site') : false;
  const gen = await aiPostContent({ ideia, campanha, redes: r, cfg });
  const d = gen.data;
  let imagem = imagemId;
  let imgInfo = null;
  if (!imagem && comImagem && d.prompt_imagem) {
    try {
      const img = await ai.generateImage(`${d.prompt_imagem}. Style: ${cfg.estilo_imagem}`);
      const [mime, ext] = detectMime(img.buffer);
      imagem = await saveBuffer(img.buffer, `ia-${Date.now()}${ext}`, mime, userId);
      imgInfo = img.nome;
    } catch (e) { imgInfo = 'falhou: ' + e.message; }
  }
  const textos = {};
  for (const k of r) if (d.textos && d.textos[k]) textos[k] = String(d.textos[k]);
  const titulo = String(d.titulo || ideia).slice(0, 200);
  const slug = titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 180) + '-' + Date.now().toString(36).slice(-4);
  const status = cfg.exigir_aprovacao ? 'aguardando' : (agendado_para ? 'agendado' : 'aprovado');
  const ins = await q(`INSERT INTO posts (campanha_id, titulo, slug, texto, textos, hashtags, imagem, redes, publicar_site, agendado_para, status, gerado_por_ia, resultado)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?)`, [campanha ? campanha.id : null, titulo, slug, String(d.texto || ''), JSON.stringify(textos), d.hashtags ? String(d.hashtags).slice(0, 500) : null,
    imagem, JSON.stringify(r), publicarSite ? 1 : 0, agendado_para, status, JSON.stringify({ ia: { texto: gen.nome, imagem: imgInfo, origem } })]);
  await q("INSERT INTO atividades (usuario_id, acao, entidade, entidade_id, resumo) VALUES (?,?,?,?,?)", [userId, 'ia', 'posts', String(ins.insertId), `Post criado por IA (${gen.nome}${imgInfo ? ' · imagem: ' + imgInfo : ''})`]);
  return one('SELECT * FROM posts WHERE id=?', [ins.insertId]);
}

async function regeneratePost(id) {
  const old = await one('SELECT * FROM posts WHERE id=?', [id]);
  if (!old) throw new Error('Post não encontrado.');
  const novo = await generatePost({ ideia: `${old.titulo}. Faça uma versão diferente e melhor que esta: ${String(old.texto || '').slice(0, 600)}`, campanhaId: old.campanha_id, redes: parseJ(old.redes, []), agendado_para: old.agendado_para, origem: 'refazer' });
  await q("UPDATE posts SET status='rascunho' WHERE id=?", [id]);
  return novo;
}

// Distribui N posts ao longo do período da campanha (horários bons: 9h, 12h, 18h, 20h de Brasília)
function scheduleSlots(n, inicio, fim) {
  const start = inicio ? new Date(inicio + 'T12:00:00Z') : new Date(Date.now() + 864e5);
  const today = new Date(); if (start < today) start.setTime(today.getTime() + 864e5);
  const end = fim ? new Date(fim + 'T12:00:00Z') : new Date(start.getTime() + Math.max(n, 1) * 2 * 864e5);
  const days = Math.max(1, Math.round((end - start) / 864e5));
  const horas = [9, 12, 18, 20];
  const out = [];
  for (let i = 0; i < n; i++) {
    const day = Math.floor((i * days) / Math.max(n, 1));
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + day, horas[i % horas.length] + 3));
    out.push(d.toISOString().slice(0, 19).replace('T', ' '));
  }
  return out;
}

async function generateForCampaign(campanhaId, quantidade, userId) {
  const c = await one('SELECT * FROM campanhas WHERE id=?', [campanhaId]);
  if (!c) throw new Error('Campanha não encontrada.');
  const cfg = await mktConfig();
  const n = Math.min(Math.max(Number(quantidade) || 3, 1), 20);
  // 1) pauta
  const pauta = await ai.generateText(SYSTEM(cfg), `Monte a pauta de ${n} posts diferentes e complementares para a campanha "${c.nome}".
Objetivo: ${c.objetivo || '-'}. Público: ${c.publico || '-'}. Tom: ${c.tom || '-'}. Briefing: ${c.briefing || '-'}.
Varie os formatos (benefício, prova, bastidor, pergunta, oferta, tutorial). JSON: {"ideias": ["ideia 1", "ideia 2", ...]}`);
  const ideias = (pauta.data.ideias || []).slice(0, n);
  const slots = scheduleSlots(ideias.length, c.inicio, c.fim);
  const posts = []; const erros = [];
  for (let i = 0; i < ideias.length; i++) {
    try {
      const p = await generatePost({ ideia: ideias[i], campanhaId: c.id, agendado_para: slots[i], userId, origem: 'campanha' });
      posts.push(p);
      if (p.status === 'aguardando') await tg.sendForApproval(p.id).catch(() => {});
    } catch (e) { erros.push(e.message); }
  }
  return { campanha: c, posts, erros };
}

async function createCampaignFromText(texto) {
  const cfg = await mktConfig();
  const n = Number((texto.match(/(\d+)\s*posts?/i) || [])[1]) || 4;
  const g = await ai.generateText(SYSTEM(cfg), `A partir deste pedido, monte os dados de uma campanha: "${texto}".
JSON: {"nome": "...", "objetivo": "vendas|marca|lancamento|promocao|relacionamento|conteudo", "publico": "...", "tom": "profissional|descontraido|sofisticado|urgente|tecnico", "briefing": "...", "dias": número de dias de duração}`);
  const d = g.data;
  const inicio = new Date(Date.now() - 3 * 3600e3 + 864e5).toISOString().slice(0, 10);
  const fim = new Date(Date.now() - 3 * 3600e3 + (1 + Math.min(Number(d.dias) || 7, 60)) * 864e5).toISOString().slice(0, 10);
  const objetivos = ['vendas', 'marca', 'lancamento', 'promocao', 'relacionamento', 'conteudo'];
  const tons = ['profissional', 'descontraido', 'sofisticado', 'urgente', 'tecnico'];
  const r = await q('INSERT INTO campanhas (nome, objetivo, publico, tom, briefing, inicio, fim, status, redes) VALUES (?,?,?,?,?,?,?,?,?)', [
    String(d.nome || texto).slice(0, 160), objetivos.includes(d.objetivo) ? d.objetivo : 'vendas', String(d.publico || '').slice(0, 255),
    tons.includes(d.tom) ? d.tom : 'profissional', String(d.briefing || texto), inicio, fim, 'ativa', JSON.stringify(cfg.redes_padrao)]);
  return generateForCampaign(r.insertId, n, null);
}

async function requestApproval(postId) {
  const p = await one('SELECT * FROM posts WHERE id=?', [postId]);
  if (!p) throw new Error('Post não encontrado.');
  if (!['aguardando'].includes(p.status)) await q("UPDATE posts SET status='aguardando' WHERE id=?", [postId]);
  const sent = await tg.sendForApproval(postId);
  return sent;
}

const deps = {
  saveBuffer: (buf, nome, mime) => saveBuffer(buf, nome, mime, null),
  mktConfig: () => mktConfig(),
  generatePost, regeneratePost, requestApproval, createCampaignFromText,
  audit: (resumo, id) => q("INSERT INTO atividades (acao, entidade, entidade_id, resumo, usuario_nome) VALUES ('aprovar','posts',?,?, 'Telegram')", [String(id), resumo]),
};

// ---------- Tarefas agendadas ----------
async function publishDue() {
  const due = await q("SELECT id FROM posts WHERE status='agendado' AND agendado_para <= UTC_TIMESTAMP() ORDER BY agendado_para LIMIT 5");
  const out = [];
  for (const p of due) {
    const st = await social.publishPost(p.id);
    const post = await one('SELECT * FROM posts WHERE id=?', [p.id]);
    await tg.notify(tg.resultSummary(post)).catch(() => {});
    out.push(`#${p.id}: ${st}`);
  }
  // tenta de novo (até 3 vezes) os que falharam por completo
  const retry = await q("SELECT id FROM posts WHERE status='erro' AND tentativas < 3 AND updated_at < UTC_TIMESTAMP() - INTERVAL 15 MINUTE LIMIT 3");
  for (const p of retry) out.push(`#${p.id} (nova tentativa): ${await social.publishPost(p.id)}`);
  return out.length ? out.join(' · ') : 'Nada para publicar.';
}

const TASK_RUNNERS = {
  async publicar_fila() { return publishDue(); },
  async gerar_posts(p) {
    if (!p || !p.campanha_id) throw new Error('Informe {"campanha_id": N} nos parâmetros.');
    const r = await generateForCampaign(p.campanha_id, p.quantidade || 3, null);
    if (p.aprovar && !(await mktConfig()).exigir_aprovacao) { /* já entram aprovados */ }
    return `${r.posts.length} post(s) criados${r.erros.length ? `, ${r.erros.length} erro(s)` : ''}.`;
  },
  async automacoes_gestao() {
    const r = await require('./automations').runAutomations();
    return `Atrasadas: ${r.atrasadas} · Licenças vencidas: ${r.licencas_vencidas} · Mensalidades geradas: ${r.mensalidades_geradas}`;
  },
  async publicar_biblioteca(p = {}) {
    const params = [];
    let where = "biblioteca=1 AND status='aprovado'";
    if (p.campanha_id) { where += ' AND campanha_id=?'; params.push(p.campanha_id); }
    let post = await one(`SELECT id, titulo FROM posts WHERE ${where} ORDER BY id LIMIT 1`, params);
    if (!post && p.repetir) {
      const w2 = "biblioteca=1 AND status IN ('publicado','parcial')" + (p.campanha_id ? ' AND campanha_id=?' : '');
      await q(`UPDATE posts SET status='aprovado', resultado=NULL, tentativas=0 WHERE ${w2}`, params);
      post = await one(`SELECT id, titulo FROM posts WHERE ${where} ORDER BY id LIMIT 1`, params);
    }
    if (!post) return 'Biblioteca vazia: nada para publicar.';
    await q("UPDATE posts SET status='agendado', agendado_para=UTC_TIMESTAMP() WHERE id=?", [post.id]);
    const st = await social.publishPost(post.id);
    const full = await one('SELECT * FROM posts WHERE id=?', [post.id]);
    await tg.notify(tg.resultSummary(full)).catch(() => {});
    return `#${post.id} "${post.titulo}": ${st}`;
  },
  async lembrar_cobrancas() {
    const rows = await q(`SELECT cb.competencia, cb.valor, cb.vencimento, cl.nome_fantasia, cl.whatsapp FROM cobrancas cb JOIN clientes cl ON cl.id=cb.cliente_id
      WHERE cb.status='atrasado' OR (cb.status='pendente' AND cb.vencimento <= CURDATE() + INTERVAL 3 DAY) ORDER BY cb.vencimento LIMIT 30`);
    if (!rows.length) return 'Nenhuma cobrança para lembrar.';
    const fmt = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    await tg.notify('💰 <b>Cobranças para lembrar</b>\n' + rows.map((r) => `• ${r.nome_fantasia} — ${r.competencia} — ${fmt(r.valor)} — vence ${r.vencimento.split('-').reverse().join('/')}${r.whatsapp ? ` — wa.me/55${String(r.whatsapp).replace(/\D/g, '')}` : ''}`).join('\n'));
    return `${rows.length} cobrança(s) enviadas ao Telegram.`;
  },
};

async function runTask(t) {
  let ok = 1, msg;
  try { msg = await TASK_RUNNERS[t.tipo](parseJ(t.parametros, {})); } catch (e) { ok = 0; msg = e.message; }
  let prox = null; try { prox = nextRun(t.cron); } catch { /* inválida */ }
  await q('UPDATE tarefas SET ultima_execucao=?, proxima_execucao=?, ultimo_resultado=?, ultimo_ok=? WHERE id=?', [nowSql(), prox, String(msg).slice(0, 2000), ok, t.id]);
  return { ok: !!ok, resultado: msg };
}

let running = false;
async function tick() {
  if (running) return; running = true;
  const conn = await getPool().getConnection();
  try {
    const [[lock]] = await conn.query("SELECT GET_LOCK('neon_tarefas', 0) l");
    if (!lock.l) return;
    try {
      const due = await q('SELECT * FROM tarefas WHERE ativo=1 AND (proxima_execucao IS NULL OR proxima_execucao <= UTC_TIMESTAMP())');
      for (const t of due) await runTask(t);
    } finally { await conn.query("SELECT RELEASE_LOCK('neon_tarefas')"); }
  } catch (e) { console.error('tarefas:', e.message); } finally { conn.release(); running = false; }
}

async function seedTasks() {
  const sys = [
    ['Publicar posts agendados', 'publicar_fila', '*/2 * * * *'],
    ['Rotinas da gestão (cobranças e licenças)', 'automacoes_gestao', '*/15 * * * *'],
  ];
  for (const [nome, tipo, cron] of sys) {
    const ex = await one('SELECT id FROM tarefas WHERE tipo=? AND sistema=1', [tipo]);
    if (!ex) await q('INSERT INTO tarefas (nome, tipo, cron, ativo, sistema, proxima_execucao) VALUES (?,?,?,1,1,?)', [nome, tipo, cron, nextRun(cron)]);
  }
  const ex = await one("SELECT id FROM tarefas WHERE tipo='lembrar_cobrancas'");
  if (!ex) await q("INSERT INTO tarefas (nome, tipo, cron, ativo, proxima_execucao) VALUES ('Lembrete de cobranças no Telegram (seg a sex, 8h30)','lembrar_cobrancas','30 8 * * 1-5',0,?)", [nextRun('30 8 * * 1-5')]);
}

function startScheduler() {
  seedTasks().catch((e) => console.error('seed tarefas:', e.message));
  setTimeout(tick, 8000);
  setInterval(tick, 60e3).unref();
}

// ---------- Integrações (com segredos mascarados) ----------
const SECRET_KEYS = /token|secret|api_key|password/i;
const mask = (v) => (v ? '••••••' + String(v).slice(-4) : '');
function maskConfig(c) { const o = {}; for (const [k, v] of Object.entries(c || {})) o[k] = SECRET_KEYS.test(k) && k !== 'webhook_secret' ? mask(v) : v; delete o.webhook_secret; return o; }
function mergeSecrets(novo, antigo) {
  const o = { ...antigo };
  for (const [k, v] of Object.entries(novo || {})) {
    if (typeof v === 'string' && v.startsWith('••••••')) continue; // não alterado
    o[k] = typeof v === 'string' ? v.trim() : v;
  }
  return o;
}

const TELEGRAM_DEF = {
  nome: 'Telegram (robô de comandos e aprovação)', cor: '#26A5E4',
  campos: { bot_token: 'Token do robô (do @BotFather)', chats_autorizados: 'Chats autorizados (IDs separados por vírgula)' },
  ajuda: [
    'No Telegram, abra o @BotFather, envie /newbot, escolha um nome e copie o token.',
    'Cole o token aqui, salve e clique em "Conectar robô".',
    'Mande /start para o seu robô: ele responde com o seu ID. Cole o ID em "Chats autorizados" e salve.',
    'Pronto: use /post, /campanha, /fila e /status, e aprove os posts pelos botões.',
  ],
};

// ---------- Rotas autenticadas ----------
const router = express.Router();
router.use(requireUser);

router.get('/integracoes', wrap(async (req, res) => {
  const out = { redes: {}, ia: null };
  for (const [k, def] of Object.entries({ ...social.REDES, telegram: TELEGRAM_DEF })) {
    const c = await social.getConfig(k);
    out.redes[k] = { ...def, ativo: c.ativo, config: maskConfig(c.config), ultimo_teste: c.ultimo_teste || null, ultimo_status: c.ultimo_status || null };
  }
  const aic = await ai.getAiConfig();
  const listar = (kind, cat) => aic.ordem[kind].map((id) => ({ id, ...cat[id], config: maskConfig({ ...cat[id].padrao, ...(aic[kind][id] || {}) }), ativo: !!aic[kind][id]?.ativo, pronto: ai.providerReady(kind, id, aic), ultimo: aic[kind][id]?._ultimo || null }));
  out.ia = { texto: listar('texto', ai.TEXT_PROVIDERS), imagem: listar('imagem', ai.IMAGE_PROVIDERS) };
  out.public_url = social.publicUrl();
  out.config = await mktConfig();
  res.json(out);
}));

router.post('/integracoes/rede/:rede', requireAdmin, wrap(async (req, res) => {
  const rede = req.params.rede;
  if (!social.REDES[rede] && rede !== 'telegram') throw new HttpError(404, 'Rede desconhecida.');
  const atual = await social.getConfig(rede);
  const config = mergeSecrets(req.body.config, atual.config);
  await q('INSERT INTO integracoes (rede, ativo, config) VALUES (?,?,?) ON DUPLICATE KEY UPDATE ativo=VALUES(ativo), config=VALUES(config)', [rede, req.body.ativo ? 1 : 0, JSON.stringify(config)]);
  await audit(req, 'config', 'integracoes', rede, `Atualizou a integração ${rede}`);
  res.json({ ok: true });
}));

router.post('/integracoes/rede/:rede/testar', requireAdmin, wrap(async (req, res) => {
  const rede = req.params.rede;
  let msg, ok = true;
  try {
    if (rede === 'telegram') msg = await tg.connectWebhook();
    else { const c = await social.getConfig(rede); msg = await social.test[rede](c.config); }
  } catch (e) { ok = false; msg = e.message; }
  await q('UPDATE integracoes SET ultimo_teste=?, ultimo_status=? WHERE rede=?', [nowSql(), (ok ? '✅ ' : '❌ ') + String(msg).slice(0, 240), rede]);
  res.json({ ok, mensagem: msg });
}));

router.post('/integracoes/ia', requireAdmin, wrap(async (req, res) => {
  const c = await ai.getAiConfig();
  const { tipo, id, config, ativo, ordem } = req.body;
  if (ordem && ordem.texto) c.ordem.texto = ordem.texto;
  if (ordem && ordem.imagem) c.ordem.imagem = ordem.imagem;
  if (tipo && id) {
    const cat = tipo === 'texto' ? ai.TEXT_PROVIDERS : ai.IMAGE_PROVIDERS;
    if (!cat[id]) throw new HttpError(404, 'IA desconhecida.');
    c[tipo][id] = { ...mergeSecrets(config, c[tipo][id] || {}), ativo: !!ativo };
  }
  await ai.saveAiConfig(c);
  await audit(req, 'config', 'integracoes', 'ia', `Atualizou as IAs${id ? ' (' + id + ')' : ''}`);
  res.json({ ok: true });
}));

router.post('/integracoes/ia/testar', requireAdmin, wrap(async (req, res) => {
  const { tipo, id } = req.body;
  const t0 = Date.now();
  const c = await ai.getAiConfig();
  let ok = true, msg, preview = null;
  try {
    if (tipo === 'texto') {
      const r = await ai.generateText('Responda apenas JSON.', 'Escreva {"frase": "uma frase curta e animada sobre automação de suítes de motel"}', { only: id });
      msg = r.data.frase || JSON.stringify(r.data);
    } else {
      const r = await ai.generateImage('a modern hotel suite with orange neon lighting, professional photography', { only: id });
      const [mime, ext] = detectMime(r.buffer);
      preview = await saveBuffer(r.buffer, `teste-${id}${ext}`, mime, req.user.id);
      msg = `Imagem gerada (${Math.round(r.buffer.length / 1024)} KB)`;
    }
  } catch (e) { ok = false; msg = e.message; }
  c[tipo][id] = { ...(c[tipo][id] || {}), _ultimo: `${ok ? '✅' : '❌'} ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · ${Math.round((Date.now() - t0) / 100) / 10}s` };
  await ai.saveAiConfig(c);
  res.json({ ok, mensagem: msg, preview, segundos: (Date.now() - t0) / 1000 });
}));

router.post('/config', requireAdmin, wrap(async (req, res) => {
  const map = { exigir_aprovacao: 'mkt_exigir_aprovacao', usar_ia: 'mkt_usar_ia', redes_padrao: 'mkt_redes_padrao', sobre: 'mkt_sobre', estilo_imagem: 'mkt_estilo_imagem', modelo_padrao: 'mkt_modelo_padrao', rodape: 'mkt_rodape', legendas: 'mkt_legendas' };
  for (const [k, chave] of Object.entries(map)) {
    if (req.body[k] === undefined) continue;
    let v = req.body[k];
    if (k === 'exigir_aprovacao' || k === 'usar_ia') v = v ? '1' : '0';
    if (k === 'legendas') v = JSON.stringify(v || {});
    if (k === 'redes_padrao') v = JSON.stringify((v || []).filter((x) => REDES_POST.includes(x)));
    await q('INSERT INTO configuracoes (chave, valor) VALUES (?,?) ON DUPLICATE KEY UPDATE valor=VALUES(valor)', [chave, String(v).slice(0, 4000)]);
  }
  res.json({ ok: true });
}));

// ---------- Modelos sem IA ----------
router.get('/modelos', (req, res) => res.json({ modelos: templates.MODELOS, campos: templates.CAMPOS, legendas_padrao: LEGENDAS_PADRAO }));

// Prévia de um modelo (não salva)
router.post('/modelos/previa', wrap(async (req, res) => {
  const cfg = await mktConfig();
  let foto = null;
  if (req.body.foto) {
    const f = await one('SELECT * FROM arquivos WHERE id=? AND completo=1', [req.body.foto]);
    if (f) foto = await fsp.readFile(path.join(storageDir(), f.pasta, f.disco));
  }
  const buf = await templates.render(req.body.modelo, { ...(req.body.dados || {}), rodape: req.body.dados?.rodape ?? cfg.rodape, foto });
  res.setHeader('Content-Type', 'image/jpeg'); res.setHeader('Cache-Control', 'no-store');
  res.send(buf);
}));

// Aplica um modelo ao post (gera a arte e coloca como imagem)
router.post('/posts/:id/arte', wrap(async (req, res) => {
  if (!canWrite(req.user)) throw new HttpError(403, 'Sem permissão.');
  const post = await one('SELECT * FROM posts WHERE id=?', [Number(req.params.id)]);
  if (!post) throw new HttpError(404, 'Post não encontrado.');
  const dados = req.body.dados || {};
  const id = await renderArt(req.body.modelo, dados, req.body.foto || null, req.user.id);
  await q('UPDATE posts SET imagem=?, modelo=?, arte=? WHERE id=?', [id, req.body.modelo, JSON.stringify({ ...dados, foto: req.body.foto || null }), post.id]);
  res.json({ imagem: id });
}));

// Preenche as legendas de cada rede usando os modelos de legenda
router.post('/posts/:id/legendas', wrap(async (req, res) => {
  if (!canWrite(req.user)) throw new HttpError(403, 'Sem permissão.');
  const post = await one('SELECT * FROM posts WHERE id=?', [Number(req.params.id)]);
  if (!post) throw new HttpError(404, 'Post não encontrado.');
  const textos = await captionsFromTemplates(post.titulo, post.texto, post.hashtags, parseJ(post.redes, []));
  await q('UPDATE posts SET textos=? WHERE id=?', [JSON.stringify(textos), post.id]);
  res.json({ textos });
}));

router.post('/criar-sem-ia', wrap(async (req, res) => {
  if (!canWrite(req.user)) throw new HttpError(403, 'Sem permissão.');
  const b = req.body;
  if (!b.titulo) throw new HttpError(400, 'Escreva o título.');
  const post = await createPostFromTemplate({ titulo: b.titulo, texto: b.texto, fotoId: b.foto, modelo: b.modelo, redes: b.redes, agendado_para: b.agendado_para, hashtags: b.hashtags, destaque: b.destaque, cta: b.cta, userId: req.user.id, semArte: !b.modelo });
  if (b.campanha_id) await q('UPDATE posts SET campanha_id=? WHERE id=?', [b.campanha_id, post.id]);
  if (b.biblioteca) await q("UPDATE posts SET biblioteca=1, status='aprovado' WHERE id=?", [post.id]);
  else if (post.status === 'aguardando') await tg.sendForApproval(post.id).catch(() => {});
  res.json({ data: await one('SELECT * FROM posts WHERE id=?', [post.id]) });
}));

// Criar post com IA
router.post('/gerar-post', wrap(async (req, res) => {
  if (!canWrite(req.user)) throw new HttpError(403, 'Sem permissão.');
  const ideia = String(req.body.ideia || '').trim();
  if (!ideia) throw new HttpError(400, 'Descreva a ideia do post.');
  if (!(await mktConfig()).usar_ia) throw new HttpError(400, 'A IA está desligada nas configurações do Marketing. Use "Criar com modelo".');
  const post = await generatePost({ ideia, campanhaId: req.body.campanha_id || null, redes: req.body.redes, comImagem: req.body.com_imagem !== false, agendado_para: req.body.agendado_para || null, userId: req.user.id });
  if (post.status === 'aguardando') await tg.sendForApproval(post.id).catch(() => {});
  res.json({ data: post });
}));

router.post('/posts/:id/imagem-ia', wrap(async (req, res) => {
  if (!canWrite(req.user)) throw new HttpError(403, 'Sem permissão.');
  const post = await one('SELECT * FROM posts WHERE id=?', [Number(req.params.id)]);
  if (!post) throw new HttpError(404, 'Post não encontrado.');
  const cfg = await mktConfig();
  const descr = String(req.body.prompt || `${post.titulo}. ${String(post.texto || '').slice(0, 300)}`);
  const img = await ai.generateImage(`${descr}. Style: ${cfg.estilo_imagem}`);
  const [mime, ext] = detectMime(img.buffer);
  const id = await saveBuffer(img.buffer, `ia-${Date.now()}${ext}`, mime, req.user.id);
  await q('UPDATE posts SET imagem=? WHERE id=?', [id, post.id]);
  res.json({ imagem: id, provedor: img.nome });
}));

router.post('/posts/:id/reescrever', wrap(async (req, res) => {
  if (!canWrite(req.user)) throw new HttpError(403, 'Sem permissão.');
  const post = await one('SELECT * FROM posts WHERE id=?', [Number(req.params.id)]);
  if (!post) throw new HttpError(404, 'Post não encontrado.');
  const cfg = await mktConfig();
  const redes = parseJ(post.redes, cfg.redes_padrao);
  const pedido = String(req.body.pedido || 'Melhore o texto, deixe mais persuasivo.');
  const gen = await aiPostContent({ ideia: `${pedido}\nPost atual: ${post.titulo}\n${post.texto}`, campanha: post.campanha_id ? await one('SELECT * FROM campanhas WHERE id=?', [post.campanha_id]) : null, redes, cfg });
  const d = gen.data;
  await q('UPDATE posts SET texto=?, textos=?, hashtags=? WHERE id=?', [String(d.texto || post.texto), JSON.stringify(d.textos || {}), d.hashtags || post.hashtags, post.id]);
  res.json({ ok: true, provedor: gen.nome });
}));

router.post('/campanhas/:id/gerar', wrap(async (req, res) => {
  if (!canWrite(req.user)) throw new HttpError(403, 'Sem permissão.');
  const r = await generateForCampaign(Number(req.params.id), req.body.quantidade, req.user.id);
  res.json({ criados: r.posts.length, erros: r.erros });
}));

router.post('/posts/:id/aprovacao', wrap(async (req, res) => {
  if (!canWrite(req.user)) throw new HttpError(403, 'Sem permissão.');
  const sent = await requestApproval(Number(req.params.id));
  res.json({ ok: true, telegram: sent });
}));

router.post('/posts/:id/aprovar', wrap(async (req, res) => {
  if (!canWrite(req.user)) throw new HttpError(403, 'Sem permissão.');
  const id = Number(req.params.id);
  const p = await one('SELECT * FROM posts WHERE id=?', [id]);
  if (!p) throw new HttpError(404, 'Post não encontrado.');
  let quando = req.body.agendado_para ? new Date(req.body.agendado_para) : (p.agendado_para ? new Date(p.agendado_para.replace(' ', 'T') + 'Z') : new Date());
  if (isNaN(quando) || quando < new Date()) quando = new Date();
  await q("UPDATE posts SET status='agendado', agendado_para=? WHERE id=?", [quando.toISOString().slice(0, 19).replace('T', ' '), id]);
  await audit(req, 'aprovar', 'posts', id, `Aprovou o post "${p.titulo}"`);
  res.json({ ok: true });
}));

router.post('/posts/:id/publicar-agora', wrap(async (req, res) => {
  if (!canWrite(req.user)) throw new HttpError(403, 'Sem permissão.');
  const id = Number(req.params.id);
  const st = await social.publishPost(id);
  const post = await one('SELECT * FROM posts WHERE id=?', [id]);
  await audit(req, 'publicar', 'posts', id, `Publicou o post "${post.titulo}" (${st})`);
  tg.notify(tg.resultSummary(post)).catch(() => {});
  res.json({ status: st, resultado: parseJ(post.resultado, {}) });
}));

router.get('/calendario', wrap(async (req, res) => {
  const de = req.query.de || new Date(Date.now() - 31 * 864e5).toISOString().slice(0, 10);
  const ate = req.query.ate || new Date(Date.now() + 62 * 864e5).toISOString().slice(0, 10);
  const rows = await q(`SELECT p.id, p.titulo, p.status, p.agendado_para, p.publicado_em, p.redes, p.imagem, p.campanha_id, c.nome campanha
    FROM posts p LEFT JOIN campanhas c ON c.id=p.campanha_id
    WHERE COALESCE(p.agendado_para, p.publicado_em, p.created_at) BETWEEN ? AND ? ORDER BY COALESCE(p.agendado_para, p.publicado_em, p.created_at)`, [de, ate + ' 23:59:59']);
  rows.forEach((r) => { r.redes = parseJ(r.redes, []); });
  res.json({ data: rows });
}));

router.get('/resumo', wrap(async (req, res) => {
  const r = await one(`SELECT
    (SELECT COUNT(*) FROM campanhas WHERE status='ativa') campanhas_ativas,
    (SELECT COUNT(*) FROM posts WHERE status='aguardando') aguardando,
    (SELECT COUNT(*) FROM posts WHERE status='agendado') agendados,
    (SELECT COUNT(*) FROM posts WHERE status='publicado' AND publicado_em > UTC_TIMESTAMP() - INTERVAL 30 DAY) publicados_30d,
    (SELECT COUNT(*) FROM posts WHERE status IN ('erro','parcial')) com_erro,
    (SELECT COUNT(*) FROM integracoes WHERE ativo=1 AND rede NOT IN ('ia','telegram')) redes_ativas`);
  res.json({ data: r });
}));

router.post('/tarefas/:id/rodar', requireAdmin, wrap(async (req, res) => {
  const t = await one('SELECT * FROM tarefas WHERE id=?', [Number(req.params.id)]);
  if (!t) throw new HttpError(404, 'Tarefa não encontrada.');
  res.json(await runTask(t));
}));

// ---------- Rotas públicas (sem login) ----------
const pub = express.Router();

// Mídia de marketing (as redes sociais precisam buscar a imagem por URL)
pub.get('/publico/midia/:id{/:nome}', wrap(async (req, res) => {
  const f = await one("SELECT * FROM arquivos WHERE id=? AND pasta='marketing' AND completo=1", [req.params.id]);
  if (!f) return res.status(404).send('Não encontrado');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  return sendAsset(req, res, f);
}));

// Webhook do Telegram
pub.post('/publico/telegram/:secret', express.json({ limit: '2mb' }), wrap(async (req, res) => {
  const cfg = await tg.tgConfig();
  if (!cfg.secret || req.params.secret !== cfg.secret || req.headers['x-telegram-bot-api-secret-token'] !== cfg.secret) return res.status(403).end();
  res.json({ ok: true }); // responde logo; processa em seguida
  tg.handleUpdate(req.body, deps).catch((e) => console.error('telegram:', e.message));
}));

// Disparo externo das tarefas (cron da hospedagem): /publico/cron/CHAVE
pub.get('/publico/cron/:chave', wrap(async (req, res) => {
  const chave = process.env.CRON_KEY;
  if (!chave || req.params.chave !== chave) return res.status(403).json({ erro: 'Chave inválida.' });
  await tick();
  res.json({ ok: true, em: new Date().toISOString() });
}));

// Feed de novidades para o site
pub.get('/publico/novidades.json', wrap(async (req, res) => {
  const rows = await q(`SELECT id, titulo, slug, texto, hashtags, imagem, publicado_em FROM posts
    WHERE publicar_site=1 AND status IN ('publicado','parcial') ORDER BY publicado_em DESC LIMIT ?`, [Math.min(Number(req.query.limite) || 12, 50)]);
  const base = social.publicUrl();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({ data: rows.map((r) => ({ ...r, url: `${base}/novidades/${r.slug}`, imagem_url: r.imagem ? `${base}/publico/midia/${r.imagem}` : null })) });
}));

const escH = (s) => String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
function pageShell(title, body, desc = '', img = '') {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escH(title)}</title><meta name="description" content="${escH(desc)}"><meta property="og:title" content="${escH(title)}"><meta property="og:description" content="${escH(desc)}">${img ? `<meta property="og:image" content="${escH(img)}">` : ''}
<link rel="icon" href="/img/icon.png"><style>
body{margin:0;background:#070b16;color:#d6deef;font:16px/1.7 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
a{color:#ff8a2b}.w{max-width:760px;margin:0 auto;padding:28px 20px 60px}header{display:flex;align-items:center;gap:12px;margin-bottom:28px}
header img{height:40px}h1{color:#fff;font-size:30px;line-height:1.2;margin:.2em 0}.card{background:#0e1424;border:1px solid #1d2742;border-radius:18px;overflow:hidden;margin-bottom:22px}
.card img{width:100%;display:block}.card .t{padding:18px 22px}.meta{color:#7d8aa8;font-size:14px}.tags{color:#ff8a2b;font-size:14px}
.cta{display:inline-block;margin-top:18px;background:linear-gradient(90deg,#ff6a00,#ff9d2e);color:#111;font-weight:700;padding:12px 22px;border-radius:12px;text-decoration:none}
p{white-space:pre-line}</style></head><body><div class="w"><header><a href="https://neonsistemas.com"><img src="/img/logo.png" alt="Neon Sistemas"></a></header>${body}</div></body></html>`;
}

pub.get('/novidades', wrap(async (req, res) => {
  const rows = await q("SELECT titulo, slug, texto, imagem, publicado_em FROM posts WHERE publicar_site=1 AND status IN ('publicado','parcial') ORDER BY publicado_em DESC LIMIT 30");
  const body = `<h1>Novidades</h1>${rows.map((r) => `<a class="card" style="display:block;text-decoration:none;color:inherit" href="/novidades/${r.slug}">${r.imagem ? `<img src="/publico/midia/${r.imagem}" alt="" loading="lazy">` : ''}<div class="t"><div class="meta">${new Date(r.publicado_em.replace(' ', 'T') + 'Z').toLocaleDateString('pt-BR')}</div><h2 style="color:#fff;margin:.2em 0">${escH(r.titulo)}</h2><div>${escH(String(r.texto || '').slice(0, 180))}…</div></div></a>`).join('') || '<p>Em breve.</p>'}`;
  res.send(pageShell('Novidades | Neon Sistemas', body, 'Novidades da Neon Sistemas'));
}));

pub.get('/novidades/:slug', wrap(async (req, res) => {
  const r = await one("SELECT * FROM posts WHERE slug=? AND publicar_site=1 AND status IN ('publicado','parcial')", [req.params.slug]);
  if (!r) return res.status(404).send(pageShell('Não encontrado', '<h1>Página não encontrada</h1><a href="/novidades">Ver novidades</a>'));
  const cfg = await mktConfig();
  const base = social.publicUrl();
  const body = `<article class="card">${r.imagem ? `<img src="/publico/midia/${r.imagem}" alt="">` : ''}<div class="t"><div class="meta">${new Date(r.publicado_em.replace(' ', 'T') + 'Z').toLocaleDateString('pt-BR')}</div><h1>${escH(r.titulo)}</h1><p>${escH(r.texto)}</p>${r.hashtags ? `<div class="tags">${escH(r.hashtags)}</div>` : ''}
  ${cfg.whatsapp ? `<a class="cta" href="https://wa.me/55${cfg.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent('Olá! Vi a novidade "' + r.titulo + '" e quero saber mais.')}">Falar no WhatsApp</a>` : ''}</div></article><a href="/novidades">← Todas as novidades</a>`;
  res.send(pageShell(`${r.titulo} | Neon Sistemas`, body, String(r.texto || '').slice(0, 160), r.imagem ? `${base}/publico/midia/${r.imagem}` : ''));
}));

// Depoimentos de clientes para o site (só os autorizados e marcados para publicar)
pub.get('/publico/depoimentos.json', wrap(async (req, res) => {
  const rows = await q(`SELECT id, nome, cargo, estabelecimento, tipo, cidade, uf, num_suites, cliente_desde, nota, titulo, texto, produtos, foto, destaque
    FROM depoimentos WHERE publicado=1 AND autorizado=1 ORDER BY destaque DESC, ordem IS NULL, ordem, id DESC LIMIT ?`, [Math.min(Number(req.query.limite) || 12, 30)]);
  const base = social.publicUrl();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({ data: rows.map((r) => {
    let produtos = r.produtos; if (typeof produtos === 'string') { try { produtos = JSON.parse(produtos); } catch { produtos = []; } }
    return { ...r, nota: Math.max(1, Math.min(5, Number(r.nota) || 5)), destaque: !!r.destaque, produtos: Array.isArray(produtos) ? produtos : [], foto_url: r.foto ? `${base}/publico/midia/${r.foto}` : null, foto: undefined };
  }) });
}));

// Widget para colocar no site: <div id="neon-novidades"></div><script src="https://painel.neonsistemas.com/publico/widget.js" defer></script>
pub.get('/publico/widget.js', (req, res) => {
  const base = social.publicUrl();
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=600');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.send(`(function(){var el=document.getElementById('neon-novidades');if(!el)return;fetch('${base}/publico/novidades.json?limite='+(el.dataset.limite||6)).then(function(r){return r.json()}).then(function(j){
var h='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:18px">';j.data.forEach(function(p){h+='<a href="'+p.url+'" style="display:block;background:#0e1424;border:1px solid #1d2742;border-radius:16px;overflow:hidden;color:#d6deef;text-decoration:none;font-family:inherit">'+(p.imagem_url?'<img src="'+p.imagem_url+'" style="width:100%;aspect-ratio:1;object-fit:cover;display:block" loading="lazy" alt="">':'')+'<div style="padding:14px 16px"><b style="color:#fff">'+p.titulo.replace(/</g,'&lt;')+'</b></div></a>'});el.innerHTML=h+'</div>';}).catch(function(){});})();`);
});

module.exports = { router, pub, startScheduler, tick, generatePost };
