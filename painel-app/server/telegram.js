// Robô do Telegram: pedidos de posts e campanhas, aprovação com botões e avisos.
const crypto = require('crypto');
const fs = require('fs');
const { q, one } = require('./db');
const { fetchJson, fetchBuffer } = require('./ai');
const { getConfig, mediaInfo, publicUrl } = require('./social');

async function tgConfig() {
  const c = await getConfig('telegram');
  const chats = String(c.config.chats_autorizados || '').split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
  return { ...c, token: c.config.bot_token, chats, secret: c.config.webhook_secret };
}

async function api(method, body, token) {
  const t = token || (await tgConfig()).token;
  if (!t) throw new Error('Robô do Telegram não configurado.');
  if (body instanceof FormData) return fetchJson(`https://api.telegram.org/bot${t}/${method}`, { method: 'POST', body });
  return fetchJson(`https://api.telegram.org/bot${t}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
}

const esc = (s) => String(s ?? '').replace(/[<&>]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
const NOMES_REDES = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn', telegram_canal: 'Canal Telegram' };

function fmtData(sqlUtc) {
  if (!sqlUtc) return 'assim que aprovar';
  const d = new Date(sqlUtc.replace(' ', 'T') + 'Z');
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function parseJ(v, d) { if (typeof v === 'string') { try { return JSON.parse(v); } catch { return d; } } return v ?? d; }

function approvalKeyboard(id) {
  return { inline_keyboard: [
    [{ text: '✅ Aprovar', callback_data: `ap:${id}` }, { text: '🔁 Refazer', callback_data: `rf:${id}` }],
    [{ text: '⏰ Hoje 18h', callback_data: `ag:${id}:h18` }, { text: '⏰ Amanhã 9h', callback_data: `ag:${id}:a9` }],
    [{ text: '🗑 Descartar', callback_data: `ds:${id}` }, { text: '✏️ Abrir no painel', url: `${publicUrl() || 'https://painel.neonsistemas.com'}/marketing/posts/${id}` }],
  ] };
}

function previewText(post) {
  const redes = parseJ(post.redes, []);
  const textos = parseJ(post.textos, {});
  const corpo = textos.instagram || post.texto || '';
  return `🆕 <b>Post para aprovar</b> #${post.id}\n\n<b>${esc(post.titulo)}</b>\n\n${esc(corpo).slice(0, 700)}${corpo.length > 700 ? '…' : ''}\n\n` +
    (post.hashtags ? `<i>${esc(post.hashtags).slice(0, 200)}</i>\n\n` : '') +
    `📣 Redes: ${redes.map((r) => NOMES_REDES[r] || r).join(', ') || 'nenhuma'}${post.publicar_site ? ' + Site' : ''}\n🕒 Publicar: ${fmtData(post.agendado_para)}`;
}

// Envia um post para aprovação em todos os chats autorizados
async function sendForApproval(postId) {
  const cfg = await tgConfig();
  if (!cfg.ativo || !cfg.token || !cfg.chats.length) return false;
  const post = await one('SELECT * FROM posts WHERE id=?', [postId]);
  if (!post) return false;
  const img = await mediaInfo(post.imagem);
  const caption = previewText(post);
  for (const chat of cfg.chats) {
    try {
      if (img && fs.existsSync(img.caminho) && caption.length <= 1024) {
        const form = new FormData();
        form.append('chat_id', chat); form.append('caption', caption); form.append('parse_mode', 'HTML');
        form.append('reply_markup', JSON.stringify(approvalKeyboard(post.id)));
        form.append('photo', new Blob([fs.readFileSync(img.caminho)]), img.nome);
        await api('sendPhoto', form, cfg.token);
      } else {
        if (img && fs.existsSync(img.caminho)) {
          const form = new FormData(); form.append('chat_id', chat);
          form.append('photo', new Blob([fs.readFileSync(img.caminho)]), img.nome);
          await api('sendPhoto', form, cfg.token);
        }
        await api('sendMessage', { chat_id: chat, text: caption, parse_mode: 'HTML', reply_markup: approvalKeyboard(post.id) }, cfg.token);
      }
    } catch (e) { console.error('telegram aprovação:', e.message); }
  }
  return true;
}

async function notify(text) {
  const cfg = await tgConfig();
  if (!cfg.ativo || !cfg.token) return;
  for (const chat of cfg.chats) {
    try { await api('sendMessage', { chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true }, cfg.token); } catch { /* ignora */ }
  }
}

function resultSummary(post) {
  const res = parseJ(post.resultado, {});
  const linhas = Object.entries(res).map(([r, v]) => `${v.ok ? '✅' : '❌'} ${NOMES_REDES[r] || (r === 'site' ? 'Site' : r)}${v.url ? ` — ${v.url}` : ''}${v.ignorado ? ' (ignorado: ' + esc(v.motivo) + ')' : ''}${!v.ok ? ': ' + esc(v.erro) : ''}`);
  return `📢 <b>Post #${post.id} — ${esc(post.titulo)}</b>\n${linhas.join('\n') || 'Sem redes selecionadas.'}`;
}

// Horário em Brasília → texto SQL UTC
function brtToUtcSql(daysAhead, hour) {
  const now = new Date(Date.now() - 3 * 3600e3);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysAhead, hour + 3, 0, 0));
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

// ---------- Processa atualizações recebidas ----------
async function handleUpdate(update, deps) {
  const cfg = await tgConfig();
  if (update.callback_query) return handleCallback(update.callback_query, cfg, deps);
  const msg = update.message || update.channel_post;
  if (!msg) return;
  const chatId = String(msg.chat.id);
  const reply = (text, extra = {}) => api('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra }, cfg.token).catch(() => {});
  if (!cfg.chats.includes(chatId)) {
    return reply(`🔒 Este chat ainda não está autorizado.\nSeu ID é <code>${chatId}</code>.\nCole esse número em <b>Marketing → Integrações → Telegram → Chats autorizados</b> no painel.`);
  }
  const text = (msg.text || msg.caption || '').trim();
  const cmd = (text.match(/^\/(\w+)/) || [])[1]?.toLowerCase();
  const arg = text.replace(/^\/\w+(@\w+)?\s*/, '').trim();

  if (cmd === 'start' || cmd === 'ajuda' || cmd === 'help') {
    return reply('🤖 <b>Robô Neon Marketing</b>\n\n' +
      '• <code>/post</code> ideia do post — crio texto e imagem e mando para você aprovar\n' +
      '• <code>/campanha</code> descrição, N posts — crio a campanha e os posts\n' +
      '• Envie uma <b>foto com legenda</b> — vira post usando a sua foto\n' +
      '• <code>/fila</code> — posts aguardando aprovação e agendados\n' +
      '• <code>/status</code> — resumo do marketing\n\n' +
      'Também posso entender texto livre: é só mandar a ideia.');
  }
  if (cmd === 'fila') {
    const rows = await q("SELECT id, titulo, status, agendado_para FROM posts WHERE status IN ('aguardando','aprovado','agendado','erro','parcial') ORDER BY COALESCE(agendado_para, created_at) LIMIT 15");
    if (!rows.length) return reply('📭 Nada na fila.');
    const st = { aguardando: '🟡 aguardando', aprovado: '🔵 aprovado', agendado: '🟣 agendado', erro: '🔴 erro', parcial: '🟠 parcial' };
    await reply('📋 <b>Fila</b>\n' + rows.map((r) => `#${r.id} ${st[r.status]} · ${esc(r.titulo).slice(0, 50)} · ${fmtData(r.agendado_para)}`).join('\n'));
    const aguard = rows.filter((r) => r.status === 'aguardando').slice(0, 5);
    for (const r of aguard) await sendForApproval(r.id);
    return;
  }
  if (cmd === 'status') {
    const s = await one(`SELECT
      (SELECT COUNT(*) FROM posts WHERE status='aguardando') aguardando,
      (SELECT COUNT(*) FROM posts WHERE status='agendado') agendados,
      (SELECT COUNT(*) FROM posts WHERE status='publicado' AND publicado_em > UTC_TIMESTAMP() - INTERVAL 30 DAY) publicados,
      (SELECT COUNT(*) FROM posts WHERE status IN ('erro','parcial')) com_erro,
      (SELECT COUNT(*) FROM campanhas WHERE status='ativa') campanhas`);
    return reply(`📊 <b>Marketing</b>\n🟡 Aguardando aprovação: ${s.aguardando}\n🟣 Agendados: ${s.agendados}\n✅ Publicados (30 dias): ${s.publicados}\n🔴 Com erro: ${s.com_erro}\n📣 Campanhas ativas: ${s.campanhas}`);
  }

  // Foto enviada → post com a foto
  let fotoId = null;
  if (msg.photo && msg.photo.length) {
    const big = msg.photo[msg.photo.length - 1];
    const f = await api('getFile', { file_id: big.file_id }, cfg.token);
    const buf = await fetchBuffer(`https://api.telegram.org/file/bot${cfg.token}/${f.result.file_path}`);
    fotoId = await deps.saveBuffer(buf, `telegram-${Date.now()}.jpg`, 'image/jpeg');
  }

  if (cmd === 'campanha') {
    if (!(await deps.mktConfig()).usar_ia) return reply('🔌 A IA está desligada no painel. Sem IA, mande uma <b>foto com legenda</b> (primeira linha = título) e eu monto o post no modelo padrão.');
    if (!arg) return reply('Descreva a campanha. Ex.: <code>/campanha Black Friday do Neon Motel com 20% de desconto na implantação, 5 posts</code>');
    await reply('⏳ Criando a campanha e os posts… isso leva cerca de 1 minuto por post.');
    try {
      const r = await deps.createCampaignFromText(arg);
      await reply(`✅ Campanha <b>${esc(r.campanha.nome)}</b> criada com ${r.posts.length} post(s). Vou mandar cada um para você aprovar.` + (r.erros.length ? `\n⚠️ ${r.erros.length} post(s) falharam: ${esc(r.erros[0])}` : ''));
    } catch (e) { await reply('❌ Não consegui criar a campanha: ' + esc(e.message).slice(0, 600)); }
    return;
  }

  const ideia = cmd === 'post' ? arg : (cmd ? '' : text);
  if (!ideia && !fotoId) return reply('Não entendi. Mande /ajuda para ver os comandos.');
  const usaIa = (await deps.mktConfig()).usar_ia;
  await reply(usaIa ? (fotoId ? '⏳ Criando o post com a sua foto…' : '⏳ Criando o post (texto + imagem)…') : '🖼 Montando o post no modelo padrão…');
  try {
    const post = await deps.generatePost({ ideia: ideia || 'Post a partir da foto enviada', imagemId: fotoId, origem: 'telegram' });
    await deps.requestApproval(post.id);
  } catch (e) { await reply('❌ Não consegui criar o post: ' + esc(e.message).slice(0, 600)); }
}

async function handleCallback(cb, cfg, deps) {
  const chatId = String(cb.message?.chat?.id || cb.from.id);
  const answer = (text) => api('answerCallbackQuery', { callback_query_id: cb.id, text, show_alert: false }, cfg.token).catch(() => {});
  if (!cfg.chats.includes(chatId)) return answer('Chat não autorizado.');
  const [acao, idStr, opt] = String(cb.data || '').split(':');
  const id = Number(idStr);
  const post = await one('SELECT * FROM posts WHERE id=?', [id]);
  const done = async (txt) => {
    try { await api('editMessageReplyMarkup', { chat_id: chatId, message_id: cb.message.message_id, reply_markup: { inline_keyboard: [] } }, cfg.token); } catch { /* ok */ }
    await api('sendMessage', { chat_id: chatId, text: txt, parse_mode: 'HTML', reply_to_message_id: cb.message.message_id }, cfg.token).catch(() => {});
  };
  if (!post) { await answer('Post não encontrado.'); return done('⚠️ Esse post não existe mais.'); }
  const quem = [cb.from.first_name, cb.from.last_name].filter(Boolean).join(' ');

  if (acao === 'ap' || acao === 'ag') {
    if (['publicado', 'publicando'].includes(post.status)) { await answer('Já publicado.'); return; }
    let quando = post.agendado_para;
    if (acao === 'ag') quando = opt === 'h18' ? brtToUtcSql(0, 18) : brtToUtcSql(1, 9);
    if (!quando || new Date(quando.replace(' ', 'T') + 'Z') < new Date()) quando = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await q("UPDATE posts SET status='agendado', agendado_para=? WHERE id=?", [quando, id]);
    await deps.audit(`Post #${id} aprovado no Telegram por ${quem}`, id);
    await answer('Aprovado!');
    return done(`✅ Aprovado por ${esc(quem)}. Publicação: <b>${fmtData(quando)}</b>. Aviso aqui quando sair.`);
  }
  if (acao === 'ds') {
    await q("UPDATE posts SET status='rascunho' WHERE id=?", [id]);
    await deps.audit(`Post #${id} descartado no Telegram por ${quem}`, id);
    await answer('Descartado.');
    return done('🗑 Descartado. Ele continua salvo como rascunho no painel.');
  }
  if (acao === 'rf') {
    await answer('Refazendo…');
    await done('🔁 Criando uma nova versão…');
    try {
      const novo = await deps.regeneratePost(id);
      await deps.requestApproval(novo.id);
    } catch (e) { await api('sendMessage', { chat_id: chatId, text: '❌ ' + e.message.slice(0, 500) }, cfg.token).catch(() => {}); }
  }
}

async function connectWebhook() {
  const cfg = await tgConfig();
  if (!cfg.token) throw new Error('Informe o token do robô.');
  const base = publicUrl();
  if (!base) throw new Error('Defina PUBLIC_URL nas variáveis do servidor.');
  let secret = cfg.secret;
  if (!secret) {
    secret = crypto.randomBytes(24).toString('hex');
    const row = await getConfig('telegram');
    await q('UPDATE integracoes SET config=? WHERE rede=?', [JSON.stringify({ ...row.config, webhook_secret: secret }), 'telegram']);
  }
  const me = await api('getMe', {}, cfg.token);
  await api('setWebhook', { url: `${base}/publico/telegram/${secret}`, secret_token: secret, allowed_updates: ['message', 'callback_query', 'channel_post'], drop_pending_updates: false }, cfg.token);
  await api('setMyCommands', { commands: [
    { command: 'post', description: 'Criar um post com IA' },
    { command: 'campanha', description: 'Criar uma campanha com vários posts' },
    { command: 'fila', description: 'Ver posts pendentes' },
    { command: 'status', description: 'Resumo do marketing' },
    { command: 'ajuda', description: 'Como usar' },
  ] }, cfg.token).catch(() => {});
  return `Robô @${me.result.username} conectado.`;
}

module.exports = { handleUpdate, sendForApproval, notify, resultSummary, connectWebhook, tgConfig, api };
