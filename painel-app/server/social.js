// Publicação nas redes sociais. Cada rede tem seus campos de integração e uma função publicar().
const fs = require('fs');
const path = require('path');
const { q, one } = require('./db');
const { fetchJson } = require('./ai');
const { storageDir } = require('./files');

const REDES = {
  instagram: {
    nome: 'Instagram', cor: '#E1306C',
    campos: { ig_user_id: 'ID da conta comercial do Instagram', access_token: 'Token de acesso (Meta, longa duração)', api_version: 'Versão da Graph API' },
    padrao: { api_version: 'v23.0' },
    ajuda: [
      'A conta do Instagram precisa ser Comercial ou Criador e estar ligada a uma Página do Facebook.',
      'Em developers.facebook.com crie um app do tipo "Empresa" e adicione os produtos "Instagram" e "Facebook Login".',
      'Gere um token com as permissões instagram_basic, instagram_content_publish, pages_show_list e pages_read_engagement, e troque por um de longa duração.',
      'O ID da conta do Instagram aparece em Graph API Explorer: me/accounts?fields=instagram_business_account.',
      'Para publicar para o público, o app passa pela revisão da Meta.',
    ],
  },
  facebook: {
    nome: 'Facebook', cor: '#1877F2',
    campos: { page_id: 'ID da Página', access_token: 'Token da Página (longa duração)', api_version: 'Versão da Graph API' },
    padrao: { api_version: 'v23.0' },
    ajuda: [
      'Use o mesmo app da Meta do Instagram.',
      'Permissões: pages_manage_posts, pages_read_engagement e pages_show_list.',
      'No Graph API Explorer, chame me/accounts para ver o ID e o token de cada Página.',
    ],
  },
  tiktok: {
    nome: 'TikTok', cor: '#00F2EA',
    campos: { client_key: 'Client key', client_secret: 'Client secret', access_token: 'Token de acesso', refresh_token: 'Refresh token', privacidade: 'Privacidade (PUBLIC_TO_EVERYONE ou SELF_ONLY)' },
    padrao: { privacidade: 'SELF_ONLY' },
    ajuda: [
      'Crie um app em developers.tiktok.com com o produto "Content Posting API" e o escopo video.publish.',
      'Verifique o domínio painel.neonsistemas.com no app (necessário para o TikTok buscar as fotos e vídeos).',
      'Até a TikTok auditar o app, os posts saem como privados (SELF_ONLY).',
    ],
  },
  youtube: {
    nome: 'YouTube', cor: '#FF0000',
    campos: { client_id: 'Client ID (Google Cloud)', client_secret: 'Client secret', refresh_token: 'Refresh token', privacidade: 'Privacidade (public, unlisted, private)' },
    padrao: { privacidade: 'public' },
    ajuda: [
      'No Google Cloud Console, ative a "YouTube Data API v3" e crie credenciais OAuth (Aplicativo da Web).',
      'Gere um refresh token com o escopo youtube.upload (pelo OAuth Playground do Google, usando suas credenciais).',
      'O YouTube só aceita vídeo: posts com vídeo anexado viram Shorts/vídeos. Posts só com imagem são ignorados nessa rede.',
    ],
  },
  linkedin: {
    nome: 'LinkedIn', cor: '#0A66C2',
    campos: { author_urn: 'Autor (urn:li:organization:ID ou urn:li:person:ID)', access_token: 'Token de acesso', versao: 'Versão da API (AAAAMM)' },
    padrao: { versao: '202510' },
    ajuda: [
      'Crie um app em linkedin.com/developers ligado à Página da empresa.',
      'Peça os produtos "Share on LinkedIn" e "Community Management API" (para postar como empresa).',
      'Gere o token com w_organization_social (empresa) ou w_member_social (perfil).',
    ],
  },
  telegram_canal: {
    nome: 'Canal do Telegram', cor: '#26A5E4',
    campos: { chat_id: 'ID ou @usuario do canal' },
    padrao: {},
    ajuda: [
      'Usa o mesmo robô configurado em Telegram.',
      'Adicione o robô como administrador do canal e informe o @ do canal (ex.: @neonsistemas).',
    ],
  },
};

async function getConfig(rede) {
  const row = await one('SELECT * FROM integracoes WHERE rede=?', [rede]);
  if (!row) return { ativo: false, config: { ...(REDES[rede]?.padrao || {}) } };
  const c = typeof row.config === 'string' ? JSON.parse(row.config || '{}') : (row.config || {});
  return { ativo: !!row.ativo, config: { ...(REDES[rede]?.padrao || {}), ...c }, ultimo_teste: row.ultimo_teste, ultimo_status: row.ultimo_status };
}

function publicUrl() {
  return String(process.env.PUBLIC_URL || '').replace(/\/$/, '');
}
async function mediaInfo(id) {
  if (!id) return null;
  const f = await one('SELECT * FROM arquivos WHERE id=? AND completo=1', [id]);
  if (!f) return null;
  return { ...f, url: `${publicUrl()}/publico/midia/${f.id}/${encodeURIComponent(f.nome)}`, caminho: path.join(storageDir(), f.pasta, f.disco) };
}

function textoPara(post, rede) {
  let textos = post.textos;
  if (typeof textos === 'string') { try { textos = JSON.parse(textos); } catch { textos = {}; } }
  const base = (textos && textos[rede]) || post.texto || post.titulo || '';
  const tags = post.hashtags && !base.includes('#') ? '\n\n' + post.hashtags : '';
  return (base + tags).trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Publicadores ----------
const publish = {
  async facebook(post, c) {
    const v = c.api_version || 'v23.0';
    const img = await mediaInfo(post.imagem);
    const msg = textoPara(post, 'facebook');
    if (img) {
      const d = await fetchJson(`https://graph.facebook.com/${v}/${c.page_id}/photos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: img.url, caption: msg, access_token: c.access_token }),
      });
      return { id: d.post_id || d.id, url: `https://www.facebook.com/${d.post_id || d.id}` };
    }
    const d = await fetchJson(`https://graph.facebook.com/${v}/${c.page_id}/feed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg, access_token: c.access_token }),
    });
    return { id: d.id, url: `https://www.facebook.com/${d.id}` };
  },

  async instagram(post, c) {
    const v = c.api_version || 'v23.0';
    const img = await mediaInfo(post.imagem);
    const vid = await mediaInfo(post.video);
    if (!img && !vid) throw new Error('O Instagram exige imagem ou vídeo.');
    const body = { caption: textoPara(post, 'instagram'), access_token: c.access_token };
    if (vid) { body.media_type = 'REELS'; body.video_url = vid.url; } else body.image_url = img.url;
    const cont = await fetchJson(`https://graph.facebook.com/${v}/${c.ig_user_id}/media`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    // aguarda o processamento do contêiner
    for (let i = 0; i < 30; i++) {
      const st = await fetchJson(`https://graph.facebook.com/${v}/${cont.id}?fields=status_code&access_token=${encodeURIComponent(c.access_token)}`);
      if (st.status_code === 'FINISHED') break;
      if (st.status_code === 'ERROR') throw new Error('O Instagram não conseguiu processar a mídia.');
      await sleep(vid ? 5000 : 2000);
    }
    const pub = await fetchJson(`https://graph.facebook.com/${v}/${c.ig_user_id}/media_publish`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ creation_id: cont.id, access_token: c.access_token }),
    });
    let url = null;
    try { url = (await fetchJson(`https://graph.facebook.com/${v}/${pub.id}?fields=permalink&access_token=${encodeURIComponent(c.access_token)}`)).permalink; } catch { /* opcional */ }
    return { id: pub.id, url };
  },

  async linkedin(post, c) {
    const headers = { Authorization: `Bearer ${c.access_token}`, 'Content-Type': 'application/json', 'LinkedIn-Version': c.versao || '202510', 'X-Restli-Protocol-Version': '2.0.0' };
    const body = {
      author: c.author_urn, commentary: textoPara(post, 'linkedin').replace(/([\\(){}\[\]@*_~<>|#])/g, (m) => (m === '#' ? '#' : '\\' + m)),
      visibility: 'PUBLIC', distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false,
    };
    const img = await mediaInfo(post.imagem);
    if (img) {
      const init = await fetchJson('https://api.linkedin.com/rest/images?action=initializeUpload', { method: 'POST', headers, body: JSON.stringify({ initializeUploadRequest: { owner: c.author_urn } }) });
      const up = await fetch(init.value.uploadUrl, { method: 'PUT', headers: { Authorization: `Bearer ${c.access_token}` }, body: fs.readFileSync(img.caminho) });
      if (!up.ok) throw new Error(`Falha ao enviar imagem ao LinkedIn (HTTP ${up.status}).`);
      body.content = { media: { id: init.value.image, altText: post.titulo.slice(0, 120) } };
    }
    const r = await fetch('https://api.linkedin.com/rest/posts', { method: 'POST', headers, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 250)}`);
    const id = r.headers.get('x-restli-id');
    return { id, url: id ? `https://www.linkedin.com/feed/update/${id}` : null };
  },

  async tiktok(post, c) {
    const headers = { Authorization: `Bearer ${c.access_token}`, 'Content-Type': 'application/json; charset=UTF-8' };
    const vid = await mediaInfo(post.video);
    const img = await mediaInfo(post.imagem);
    const texto = textoPara(post, 'tiktok');
    let d;
    if (vid) {
      d = await fetchJson('https://open.tiktokapis.com/v2/post/publish/video/init/', {
        method: 'POST', headers,
        body: JSON.stringify({ post_info: { title: texto.slice(0, 2200), privacy_level: c.privacidade || 'SELF_ONLY' }, source_info: { source: 'PULL_FROM_URL', video_url: vid.url } }),
      });
    } else if (img) {
      d = await fetchJson('https://open.tiktokapis.com/v2/post/publish/content/init/', {
        method: 'POST', headers,
        body: JSON.stringify({
          media_type: 'PHOTO', post_mode: 'DIRECT_POST',
          post_info: { title: post.titulo.slice(0, 90), description: texto.slice(0, 4000), privacy_level: c.privacidade || 'SELF_ONLY' },
          source_info: { source: 'PULL_FROM_URL', photo_images: [img.url], photo_cover_index: 0 },
        }),
      });
    } else throw new Error('O TikTok exige imagem ou vídeo.');
    if (d.error && d.error.code && d.error.code !== 'ok') throw new Error(d.error.message || d.error.code);
    return { id: d.data?.publish_id, url: null };
  },

  async youtube(post, c) {
    const vid = await mediaInfo(post.video);
    if (!vid) return { ignorado: true, motivo: 'Sem vídeo (o YouTube só aceita vídeos).' };
    const tok = await fetchJson('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: c.client_id, client_secret: c.client_secret, refresh_token: c.refresh_token, grant_type: 'refresh_token' }),
    });
    const meta = { snippet: { title: post.titulo.slice(0, 100), description: textoPara(post, 'youtube').slice(0, 4900), categoryId: '28' }, status: { privacyStatus: c.privacidade || 'public', selfDeclaredMadeForKids: false } };
    const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST', headers: { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(vid.tamanho), 'X-Upload-Content-Type': vid.mime || 'video/mp4' },
      body: JSON.stringify(meta),
    });
    if (!init.ok) throw new Error(`HTTP ${init.status}: ${(await init.text()).slice(0, 250)}`);
    const loc = init.headers.get('location');
    const up = await fetch(loc, { method: 'PUT', headers: { 'Content-Length': String(vid.tamanho), 'Content-Type': vid.mime || 'video/mp4' }, body: fs.createReadStream(vid.caminho), duplex: 'half' });
    const d = await up.json();
    if (!up.ok) throw new Error(d.error?.message || `HTTP ${up.status}`);
    return { id: d.id, url: `https://youtu.be/${d.id}` };
  },

  async telegram_canal(post, c) {
    const tg = await getConfig('telegram');
    if (!tg.config.bot_token) throw new Error('Configure o robô do Telegram primeiro.');
    const api = `https://api.telegram.org/bot${tg.config.bot_token}`;
    const texto = textoPara(post, 'telegram_canal');
    const img = await mediaInfo(post.imagem);
    let d;
    if (img) {
      const form = new FormData();
      form.append('chat_id', c.chat_id); form.append('caption', texto.slice(0, 1024));
      form.append('photo', new Blob([fs.readFileSync(img.caminho)]), img.nome);
      d = await fetchJson(`${api}/sendPhoto`, { method: 'POST', body: form });
    } else {
      d = await fetchJson(`${api}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: c.chat_id, text: texto }) });
    }
    const m = d.result; const user = m?.chat?.username;
    return { id: m?.message_id, url: user ? `https://t.me/${user}/${m.message_id}` : null };
  },
};

// Testes de conexão (só leitura)
const test = {
  async facebook(c) { const d = await fetchJson(`https://graph.facebook.com/${c.api_version}/${c.page_id}?fields=name&access_token=${encodeURIComponent(c.access_token)}`); return `Página: ${d.name}`; },
  async instagram(c) { const d = await fetchJson(`https://graph.facebook.com/${c.api_version}/${c.ig_user_id}?fields=username&access_token=${encodeURIComponent(c.access_token)}`); return `Conta: @${d.username}`; },
  async linkedin(c) { const r = await fetch('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${c.access_token}` } }); if (!r.ok && r.status !== 403) throw new Error(`HTTP ${r.status}`); return 'Token aceito pelo LinkedIn'; },
  async tiktok(c) { const d = await fetchJson('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', { method: 'POST', headers: { Authorization: `Bearer ${c.access_token}`, 'Content-Type': 'application/json' } }); return `Conta: ${d.data?.creator_nickname || 'ok'}`; },
  async youtube(c) {
    const tok = await fetchJson('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: c.client_id, client_secret: c.client_secret, refresh_token: c.refresh_token, grant_type: 'refresh_token' }) });
    const d = await fetchJson('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { Authorization: `Bearer ${tok.access_token}` } });
    return `Canal: ${d.items?.[0]?.snippet?.title || 'ok'}`;
  },
  async telegram_canal(c) {
    const tg = await getConfig('telegram');
    const d = await fetchJson(`https://api.telegram.org/bot${tg.config.bot_token}/getChat?chat_id=${encodeURIComponent(c.chat_id)}`);
    return `Canal: ${d.result?.title}`;
  },
};

// Publica um post em todas as redes marcadas. Devolve o status final.
async function publishPost(postId) {
  const post = await one('SELECT * FROM posts WHERE id=?', [postId]);
  if (!post) throw new Error('Post não encontrado.');
  let redes = post.redes; if (typeof redes === 'string') { try { redes = JSON.parse(redes); } catch { redes = []; } }
  redes = redes || [];
  let resultado = post.resultado; if (typeof resultado === 'string') { try { resultado = JSON.parse(resultado); } catch { resultado = {}; } }
  resultado = resultado || {};
  await q("UPDATE posts SET status='publicando', tentativas=tentativas+1 WHERE id=?", [postId]);
  if (redes.length && !publicUrl()) {
    await q("UPDATE posts SET status='erro', resultado=? WHERE id=?", [JSON.stringify({ geral: { ok: false, erro: 'Defina PUBLIC_URL nas variáveis do servidor.' } }), postId]);
    return 'erro';
  }
  for (const rede of redes) {
    if (resultado[rede]?.ok) continue; // já publicado nessa rede
    const integ = await getConfig(rede);
    if (!integ.ativo) { resultado[rede] = { ok: false, erro: 'Integração desativada ou não configurada.', em: new Date().toISOString() }; continue; }
    try {
      const r = await publish[rede](post, integ.config);
      resultado[rede] = r.ignorado ? { ok: true, ignorado: true, motivo: r.motivo, em: new Date().toISOString() } : { ok: true, id: r.id, url: r.url, em: new Date().toISOString() };
    } catch (e) {
      resultado[rede] = { ok: false, erro: String(e.message).slice(0, 300), em: new Date().toISOString() };
    }
  }
  if (post.publicar_site) resultado.site = { ok: true, url: `${publicUrl()}/novidades/${post.slug}`, em: new Date().toISOString() };
  const vals = Object.values(resultado);
  const okN = vals.filter((v) => v.ok).length;
  const status = vals.length === 0 ? 'publicado' : okN === vals.length ? 'publicado' : okN > 0 ? 'parcial' : 'erro';
  await q(`UPDATE posts SET status=?, resultado=?, publicado_em=${okN ? 'COALESCE(publicado_em, UTC_TIMESTAMP())' : 'publicado_em'} WHERE id=?`, [status, JSON.stringify(resultado), postId]);
  return status;
}

module.exports = { REDES, getConfig, publish, test, publishPost, mediaInfo, publicUrl };
