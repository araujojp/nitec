// Roteador de IAs: tenta cada provedor na ordem configurada; se um falhar, passa para o próximo.
const { q, one } = require('./db');

// ---------- Catálogo de provedores ----------
// campos: chave da API, modelo e (quando precisa) conta / URL base
const TEXT_PROVIDERS = {
  gemini: { nome: 'Google Gemini', custo: 'Grátis (camada gratuita) · depois centavos', site: 'https://aistudio.google.com/apikey',
    campos: { api_key: 'Chave da API', modelo: 'Modelo' }, padrao: { modelo: 'gemini-2.5-flash' } },
  groq: { nome: 'Groq (Llama)', custo: 'Grátis com limite diário', site: 'https://console.groq.com/keys',
    campos: { api_key: 'Chave da API', modelo: 'Modelo' }, padrao: { modelo: 'llama-3.3-70b-versatile' }, openai: 'https://api.groq.com/openai/v1' },
  openrouter: { nome: 'OpenRouter', custo: 'Tem modelos grátis (:free)', site: 'https://openrouter.ai/keys',
    campos: { api_key: 'Chave da API', modelo: 'Modelo' }, padrao: { modelo: 'meta-llama/llama-3.3-70b-instruct:free' }, openai: 'https://openrouter.ai/api/v1' },
  mistral: { nome: 'Mistral AI', custo: 'Grátis (plano experimental)', site: 'https://console.mistral.ai/api-keys',
    campos: { api_key: 'Chave da API', modelo: 'Modelo' }, padrao: { modelo: 'mistral-small-latest' }, openai: 'https://api.mistral.ai/v1' },
  deepseek: { nome: 'DeepSeek', custo: 'Muito barato (centavos por mil posts)', site: 'https://platform.deepseek.com/api_keys',
    campos: { api_key: 'Chave da API', modelo: 'Modelo' }, padrao: { modelo: 'deepseek-chat' }, openai: 'https://api.deepseek.com/v1' },
  openai: { nome: 'OpenAI (ChatGPT)', custo: 'Pago · barato no modelo mini', site: 'https://platform.openai.com/api-keys',
    campos: { api_key: 'Chave da API', modelo: 'Modelo' }, padrao: { modelo: 'gpt-4o-mini' }, openai: 'https://api.openai.com/v1' },
  anthropic: { nome: 'Anthropic (Claude)', custo: 'Pago · ótima escrita', site: 'https://console.anthropic.com/settings/keys',
    campos: { api_key: 'Chave da API', modelo: 'Modelo' }, padrao: { modelo: 'claude-haiku-5-5' } },
  xai: { nome: 'xAI (Grok)', custo: 'Pago', site: 'https://console.x.ai',
    campos: { api_key: 'Chave da API', modelo: 'Modelo' }, padrao: { modelo: 'grok-3-mini' }, openai: 'https://api.x.ai/v1' },
  personalizado: { nome: 'Compatível com OpenAI (Ollama, LM Studio…)', custo: 'Grátis se rodar no seu servidor', site: 'https://ollama.com',
    campos: { base_url: 'URL base (ex.: http://seu-servidor:11434/v1)', api_key: 'Chave (se houver)', modelo: 'Modelo' }, padrao: { modelo: 'llama3.1' } },
};

const IMAGE_PROVIDERS = {
  cloudflare: { nome: 'Cloudflare Workers AI (FLUX)', custo: 'Grátis (10 mil usos/dia)', site: 'https://dash.cloudflare.com/profile/api-tokens',
    campos: { account_id: 'ID da conta', api_key: 'Token da API', modelo: 'Modelo' }, padrao: { modelo: '@cf/black-forest-labs/flux-1-schnell' } },
  together: { nome: 'Together AI (FLUX)', custo: 'Grátis no modelo -Free', site: 'https://api.together.ai/settings/api-keys',
    campos: { api_key: 'Chave da API', modelo: 'Modelo' }, padrao: { modelo: 'black-forest-labs/FLUX.1-schnell-Free' } },
  pollinations: { nome: 'Pollinations', custo: 'Grátis · nem precisa de chave', site: 'https://pollinations.ai',
    campos: { api_key: 'Token (opcional, remove limites)', modelo: 'Modelo' }, padrao: { modelo: 'flux' }, semChave: true },
  gemini: { nome: 'Google Gemini Imagem', custo: 'Pago · barato', site: 'https://aistudio.google.com/apikey',
    campos: { api_key: 'Chave da API', modelo: 'Modelo' }, padrao: { modelo: 'gemini-2.5-flash-image' } },
  openai: { nome: 'OpenAI Imagens', custo: 'Pago', site: 'https://platform.openai.com/api-keys',
    campos: { api_key: 'Chave da API', modelo: 'Modelo' }, padrao: { modelo: 'gpt-image-1' } },
  stability: { nome: 'Stability AI', custo: 'Pago (créditos)', site: 'https://platform.stability.ai/account/keys',
    campos: { api_key: 'Chave da API', modelo: 'Modelo (core, ultra, sd3)' }, padrao: { modelo: 'core' } },
  replicate: { nome: 'Replicate', custo: 'Pago por uso', site: 'https://replicate.com/account/api-tokens',
    campos: { api_key: 'Token da API', modelo: 'Modelo' }, padrao: { modelo: 'black-forest-labs/flux-schnell' } },
};

const DEFAULT_ORDER = {
  texto: Object.keys(TEXT_PROVIDERS),
  imagem: Object.keys(IMAGE_PROVIDERS),
};

const TIMEOUT = 90e3;

async function fetchJson(url, opts = {}, timeout = TIMEOUT) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    const txt = await r.text();
    let data; try { data = JSON.parse(txt); } catch { data = txt; }
    if (!r.ok) {
      const msg = (data && (data.error?.message || data.error || data.message || data.errors?.[0]?.message)) || String(txt).slice(0, 200);
      const e = new Error(`HTTP ${r.status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`.slice(0, 300));
      e.status = r.status; throw e;
    }
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Tempo esgotado');
    throw e;
  } finally { clearTimeout(t); }
}

async function fetchBuffer(url, opts = {}, timeout = TIMEOUT) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return Buffer.from(await r.arrayBuffer());
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Tempo esgotado');
    throw e;
  } finally { clearTimeout(t); }
}

// ---------- Configuração salva ----------
async function getAiConfig() {
  const row = await one("SELECT config FROM integracoes WHERE rede='ia'");
  let c = {}; if (row && row.config) c = typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
  c.texto = c.texto || {}; c.imagem = c.imagem || {};
  if (!c.imagem.pollinations) c.imagem.pollinations = { ativo: true }; // grátis e sem chave: já vem ligado
  c.ordem = c.ordem || {};
  c.ordem.texto = mergeOrder(c.ordem.texto, DEFAULT_ORDER.texto);
  c.ordem.imagem = mergeOrder(c.ordem.imagem, DEFAULT_ORDER.imagem);
  return c;
}
function mergeOrder(saved, def) {
  const s = (saved || []).filter((x) => def.includes(x));
  return [...s, ...def.filter((x) => !s.includes(x))];
}
async function saveAiConfig(c) {
  await q("INSERT INTO integracoes (rede, ativo, config) VALUES ('ia',1,?) ON DUPLICATE KEY UPDATE config=VALUES(config)", [JSON.stringify(c)]);
}

function providerReady(kind, id, cfg) {
  const p = (kind === 'texto' ? TEXT_PROVIDERS : IMAGE_PROVIDERS)[id];
  const c = cfg[kind][id] || {};
  if (!c.ativo) return false;
  if (p.semChave) return true;
  if (id === 'personalizado') return !!c.base_url;
  if (id === 'cloudflare') return !!(c.api_key && c.account_id);
  return !!c.api_key;
}

// ---------- Texto ----------
async function callText(id, c, system, prompt) {
  const p = TEXT_PROVIDERS[id];
  const modelo = c.modelo || p.padrao.modelo;
  if (id === 'gemini') {
    const d = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.api_key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.9, responseMimeType: 'application/json' } }),
    });
    return d.candidates?.[0]?.content?.parts?.map((x) => x.text).join('') || '';
  }
  if (id === 'anthropic') {
    const d = await fetchJson('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': c.api_key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: modelo, max_tokens: 4000, system, messages: [{ role: 'user', content: prompt }] }),
    });
    return (d.content || []).map((x) => x.text || '').join('');
  }
  const base = id === 'personalizado' ? String(c.base_url).replace(/\/$/, '') : p.openai;
  const headers = { 'Content-Type': 'application/json' };
  if (c.api_key) headers.Authorization = `Bearer ${c.api_key}`;
  if (id === 'openrouter') { headers['HTTP-Referer'] = 'https://neonsistemas.com'; headers['X-Title'] = 'Neon Gestão'; }
  const body = { model: modelo, temperature: 0.9, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] };
  if (['openai', 'groq', 'deepseek', 'mistral', 'xai'].includes(id)) body.response_format = { type: 'json_object' };
  const d = await fetchJson(`${base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) });
  return d.choices?.[0]?.message?.content || '';
}

function extractJson(txt) {
  const s = String(txt).replace(/```json|```/g, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('A IA não devolveu JSON.');
  return JSON.parse(s.slice(a, b + 1));
}

// Gera texto com fallback. Devolve { data, provedor, tentativas }
async function generateText(system, prompt, { json = true, only } = {}) {
  const cfg = await getAiConfig();
  const order = only ? [only] : cfg.ordem.texto;
  const tentativas = [];
  for (const id of order) {
    if (!only && !providerReady('texto', id, cfg)) continue;
    const c = { ...TEXT_PROVIDERS[id].padrao, ...(cfg.texto[id] || {}) };
    try {
      const txt = await callText(id, c, system, prompt);
      const data = json ? extractJson(txt) : txt;
      tentativas.push({ provedor: id, ok: true });
      return { data, provedor: id, nome: TEXT_PROVIDERS[id].nome, tentativas };
    } catch (e) {
      tentativas.push({ provedor: id, ok: false, erro: e.message });
    }
  }
  const e = new Error(tentativas.length ? 'Todas as IAs de texto falharam: ' + tentativas.map((t) => `${TEXT_PROVIDERS[t.provedor].nome} (${t.erro})`).join(' · ') : 'Nenhuma IA de texto configurada. Vá em Marketing → Integrações → IAs.');
  e.tentativas = tentativas; e.status = 400; throw e;
}

// ---------- Imagem ----------
async function callImage(id, c, prompt) {
  const p = IMAGE_PROVIDERS[id];
  const modelo = c.modelo || p.padrao.modelo;
  if (id === 'pollinations') {
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1080&height=1080&nologo=true&enhance=true&model=${encodeURIComponent(modelo)}&seed=${Math.floor(Math.random() * 1e9)}`;
    return fetchBuffer(url, c.api_key ? { headers: { Authorization: `Bearer ${c.api_key}` } } : {}, 120e3);
  }
  if (id === 'cloudflare') {
    const d = await fetchJson(`https://api.cloudflare.com/client/v4/accounts/${c.account_id}/ai/run/${modelo}`, {
      method: 'POST', headers: { Authorization: `Bearer ${c.api_key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, steps: 8 }),
    });
    const b64 = d.result?.image; if (!b64) throw new Error('Resposta sem imagem.');
    return Buffer.from(b64, 'base64');
  }
  if (id === 'together') {
    const d = await fetchJson('https://api.together.xyz/v1/images/generations', {
      method: 'POST', headers: { Authorization: `Bearer ${c.api_key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelo, prompt, width: 1024, height: 1024, steps: 4, n: 1, response_format: 'b64_json' }),
    });
    const it = d.data?.[0]; if (!it) throw new Error('Resposta sem imagem.');
    return it.b64_json ? Buffer.from(it.b64_json, 'base64') : fetchBuffer(it.url);
  }
  if (id === 'gemini') {
    const d = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.api_key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'] } }),
    });
    const part = d.candidates?.[0]?.content?.parts?.find((x) => x.inlineData || x.inline_data);
    const data = part && (part.inlineData || part.inline_data)?.data; if (!data) throw new Error('Resposta sem imagem.');
    return Buffer.from(data, 'base64');
  }
  if (id === 'openai') {
    const d = await fetchJson('https://api.openai.com/v1/images/generations', {
      method: 'POST', headers: { Authorization: `Bearer ${c.api_key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelo, prompt, size: '1024x1024', n: 1 }),
    }, 180e3);
    const it = d.data?.[0]; if (!it) throw new Error('Resposta sem imagem.');
    return it.b64_json ? Buffer.from(it.b64_json, 'base64') : fetchBuffer(it.url);
  }
  if (id === 'stability') {
    const form = new FormData();
    form.append('prompt', prompt); form.append('output_format', 'png'); form.append('aspect_ratio', '1:1');
    return fetchBuffer(`https://api.stability.ai/v2beta/stable-image/generate/${modelo}`, {
      method: 'POST', headers: { Authorization: `Bearer ${c.api_key}`, Accept: 'image/*' }, body: form,
    }, 120e3);
  }
  if (id === 'replicate') {
    const d = await fetchJson(`https://api.replicate.com/v1/models/${modelo}/predictions`, {
      method: 'POST', headers: { Authorization: `Bearer ${c.api_key}`, 'Content-Type': 'application/json', Prefer: 'wait' },
      body: JSON.stringify({ input: { prompt, aspect_ratio: '1:1', output_format: 'png' } }),
    }, 120e3);
    const out = Array.isArray(d.output) ? d.output[0] : d.output;
    if (!out) throw new Error(d.error || 'Resposta sem imagem.');
    return fetchBuffer(out);
  }
  throw new Error('Provedor desconhecido');
}

async function generateImage(prompt, { only } = {}) {
  const cfg = await getAiConfig();
  const order = only ? [only] : cfg.ordem.imagem;
  const tentativas = [];
  for (const id of order) {
    if (!only && !providerReady('imagem', id, cfg)) continue;
    const c = { ...IMAGE_PROVIDERS[id].padrao, ...(cfg.imagem[id] || {}) };
    try {
      const buf = await callImage(id, c, prompt);
      if (!buf || buf.length < 1000) throw new Error('Imagem vazia.');
      tentativas.push({ provedor: id, ok: true });
      return { buffer: buf, provedor: id, nome: IMAGE_PROVIDERS[id].nome, tentativas };
    } catch (e) {
      tentativas.push({ provedor: id, ok: false, erro: e.message });
    }
  }
  const e = new Error(tentativas.length ? 'Todas as IAs de imagem falharam: ' + tentativas.map((t) => `${IMAGE_PROVIDERS[t.provedor].nome} (${t.erro})`).join(' · ') : 'Nenhuma IA de imagem configurada. Vá em Marketing → Integrações → IAs.');
  e.tentativas = tentativas; e.status = 400; throw e;
}

module.exports = {
  TEXT_PROVIDERS, IMAGE_PROVIDERS, getAiConfig, saveAiConfig, providerReady,
  generateText, generateImage, fetchJson, fetchBuffer,
};
