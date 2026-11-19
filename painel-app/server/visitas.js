// Visitas do site neonsistemas.com: cada visita é registrada (de onde veio, IP, localização provável,
// aparelho, páginas, seções, cliques, WhatsApp, calculadora, formulário) e vira um relatório por e-mail.
const express = require('express');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { q, one, getPool } = require('./db');
const { requireAdmin } = require('./auth');
const { wrap, HttpError, clientIp, todaySql } = require('./util');

const TESTE = process.env.NEON_TESTE === '1';
const ORIGENS = ['https://neonsistemas.com', 'https://www.neonsistemas.com'];
const INATIVA_MIN = 15; // visita encerrada depois de 15 min sem nada novo
const TIPOS = new Set(['inicio', 'pagina', 'secao', 'rolagem', 'clique', 'whatsapp', 'form_campo', 'form_envio', 'calculadora', 'copia', 'idioma', 'oculta', 'visivel', 'fim', 'erro']);
const ROBO_UA = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|whatsapp|telegram|curl|wget|python|java\/|go-http|axios|node-fetch|monitor|uptime|scan/i;

// ---------- Banco ----------
async function migrate() {
  await q(`CREATE TABLE IF NOT EXISTS site_visitas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sessao CHAR(24) NOT NULL UNIQUE,
    visitante CHAR(24) NULL,
    ip VARCHAR(60) NULL,
    geo JSON NULL,
    ua VARCHAR(500) NULL,
    meta JSON NULL,
    origem VARCHAR(500) NULL,
    entrada VARCHAR(500) NULL,
    idioma VARCHAR(10) NULL,
    inicio DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ultimo DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    n_eventos INT NOT NULL DEFAULT 0,
    paginas INT NOT NULL DEFAULT 0,
    formulario TINYINT NOT NULL DEFAULT 0,
    whatsapp TINYINT NOT NULL DEFAULT 0,
    terminou TINYINT NOT NULL DEFAULT 0,
    robo TINYINT NOT NULL DEFAULT 0,
    email_status VARCHAR(255) NULL,
    email_em DATETIME NULL,
    INDEX (visitante), INDEX (inicio), INDEX (email_status, ultimo)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await q(`CREATE TABLE IF NOT EXISTS site_visita_eventos (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    visita_id INT NOT NULL,
    tipo VARCHAR(20) NOT NULL,
    dados JSON NULL,
    em DATETIME(3) NOT NULL,
    INDEX (visita_id, em)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await q(`CREATE TABLE IF NOT EXISTS site_ip_cache (
    ip VARCHAR(60) PRIMARY KEY,
    dados JSON NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const padroes = { visitas_ativo: '1', visitas_email: 'bignetsoluc@gmail.com', visitas_modo: 'todas', visitas_robos: '0', visitas_resumo: '1', visitas_resumo_hora: '21' };
  for (const [k, v] of Object.entries(padroes)) await q('INSERT IGNORE INTO configuracoes (chave, valor) VALUES (?,?)', [k, v]);
}

async function cfg() {
  const rows = await q("SELECT chave, valor FROM configuracoes WHERE chave LIKE 'visitas\\_%'");
  const c = Object.fromEntries(rows.map((r) => [r.chave, r.valor]));
  return {
    ativo: c.visitas_ativo !== '0',
    email: String(c.visitas_email || '').split(/[,;\s]+/).filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)),
    modo: c.visitas_modo === 'interacao' ? 'interacao' : 'todas',
    robos: c.visitas_robos === '1',
    resumo: c.visitas_resumo !== '0',
    resumo_hora: Math.max(0, Math.min(23, Number(c.visitas_resumo_hora ?? 21) || 0)),
  };
}

function parseJ(v, d) { if (typeof v === 'string') { try { return JSON.parse(v); } catch { return d; } } return v ?? d; }
const txt = (v, n) => (v == null ? null : String(v).replace(/[\u0000-\u001f]/g, ' ').slice(0, n));
const idOk = (v) => (/^[A-Za-z0-9_-]{8,24}$/.test(String(v || '')) ? String(v) : null);

// Limpa um objeto vindo do navegador: só valores simples, textos curtos, sem aninhar fundo
function limpar(o, prof = 0) {
  if (o == null) return null;
  if (typeof o === 'number') return Number.isFinite(o) ? o : null;
  if (typeof o === 'boolean') return o;
  if (typeof o === 'string') return txt(o, 1500);
  if (prof > 2) return null;
  if (Array.isArray(o)) return o.slice(0, 20).map((x) => limpar(x, prof + 1));
  if (typeof o === 'object') { const r = {}; for (const [k, v] of Object.entries(o).slice(0, 40)) r[txt(k, 40)] = limpar(v, prof + 1); return r; }
  return null;
}

// ---------- Localização provável pelo IP ----------
function ipPrivado(ip) { return !ip || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|fc|fd|fe80)/i.test(ip); }

async function geoIp(ip) {
  if (ipPrivado(ip)) return { local: true };
  const c = await one('SELECT dados FROM site_ip_cache WHERE ip=? AND created_at > UTC_TIMESTAMP() - INTERVAL 7 DAY', [ip]);
  if (c) return parseJ(c.dados, {});
  if (TESTE) return { cidade: 'Uberlândia', estado: 'Minas Gerais', uf: 'MG', pais: 'Brasil', pais_codigo: 'BR', cep: '38400', lat: -18.91, lon: -48.27, provedor: 'Provedor Teste', fonte: 'teste' };
  let g = null;
  try {
    const r = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?lang=pt-BR&fields=status,message,continent,country,countryCode,regionName,region,city,district,zip,lat,lon,timezone,currency,isp,org,as,asname,reverse,mobile,proxy,hosting,query`, { signal: AbortSignal.timeout(6000) });
    const j = await r.json();
    if (j.status === 'success') {
      g = { cidade: j.city, bairro: j.district || null, estado: j.regionName, uf: j.region, pais: j.country, pais_codigo: j.countryCode, continente: j.continent, cep: j.zip || null, lat: j.lat, lon: j.lon,
        fuso: j.timezone, moeda: j.currency, provedor: j.isp, organizacao: j.org, asn: j.as, asn_nome: j.asname, dns_reverso: j.reverse || null,
        rede_movel: !!j.mobile, proxy_vpn: !!j.proxy, datacenter: !!j.hosting, fonte: 'ip-api.com' };
    }
  } catch { /* tenta o outro */ }
  if (!g) {
    try {
      const r = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?lang=pt-BR`, { signal: AbortSignal.timeout(6000) });
      const j = await r.json();
      if (j.success) g = { cidade: j.city, estado: j.region, uf: j.region_code, pais: j.country, pais_codigo: j.country_code, continente: j.continent, cep: j.postal || null, lat: j.latitude, lon: j.longitude,
        fuso: j.timezone?.id, provedor: j.connection?.isp, organizacao: j.connection?.org, asn: j.connection?.asn ? 'AS' + j.connection.asn : null, fonte: 'ipwho.is' };
    } catch { /* sem localização */ }
  }
  if (!g) return { erro: 'localização indisponível' };
  await q('INSERT INTO site_ip_cache (ip, dados) VALUES (?,?) ON DUPLICATE KEY UPDATE dados=VALUES(dados), created_at=CURRENT_TIMESTAMP', [ip, JSON.stringify(g)]).catch(() => {});
  return g;
}

// ---------- Aparelho a partir do navegador ----------
function aparelho(ua, m = {}) {
  ua = String(ua || '');
  const ch = m.ch || {};
  let so = 'Desconhecido', navegador = 'Desconhecido', tipo = 'Computador', modelo = ch.model || null;
  let x;
  if ((x = ua.match(/Android ([\d.]+)/))) { so = 'Android ' + x[1]; tipo = /Mobile/.test(ua) ? 'Celular' : 'Tablet'; if (!modelo && (x = ua.match(/Android [\d.]+; ([^;)]+?)(?: Build|\))/))) modelo = x[1].trim(); }
  else if ((x = ua.match(/iPhone OS ([\d_]+)/))) { so = 'iOS ' + x[1].replace(/_/g, '.'); tipo = 'Celular'; modelo = modelo || 'iPhone'; }
  else if ((x = ua.match(/iPad.*OS ([\d_]+)/))) { so = 'iPadOS ' + x[1].replace(/_/g, '.'); tipo = 'Tablet'; modelo = modelo || 'iPad'; }
  else if (/Windows NT 10/.test(ua)) so = ch.platformVersion && parseInt(ch.platformVersion, 10) >= 13 ? 'Windows 11' : 'Windows 10/11';
  else if ((x = ua.match(/Windows NT ([\d.]+)/))) so = 'Windows NT ' + x[1];
  else if ((x = ua.match(/Mac OS X ([\d_]+)/))) { so = 'macOS ' + x[1].replace(/_/g, '.'); if (m.toque > 1) { tipo = 'Tablet'; modelo = modelo || 'iPad'; } }
  else if (/CrOS/.test(ua)) so = 'ChromeOS';
  else if (/Linux/.test(ua)) so = 'Linux';
  if ((x = ua.match(/Edg(?:A|iOS)?\/([\d]+)/))) navegador = 'Edge ' + x[1];
  else if ((x = ua.match(/OPR\/([\d]+)/))) navegador = 'Opera ' + x[1];
  else if ((x = ua.match(/SamsungBrowser\/([\d]+)/))) navegador = 'Samsung Internet ' + x[1];
  else if ((x = ua.match(/(?:Chrome|CriOS)\/([\d]+)/))) navegador = 'Chrome ' + x[1];
  else if ((x = ua.match(/(?:Firefox|FxiOS)\/([\d]+)/))) navegador = 'Firefox ' + x[1];
  else if ((x = ua.match(/Version\/([\d.]+).*Safari/))) navegador = 'Safari ' + x[1];
  if (/Instagram/.test(ua)) navegador += ' (dentro do Instagram)';
  else if (/FBAN|FBAV/.test(ua)) navegador += ' (dentro do Facebook)';
  else if (/LinkedInApp/.test(ua)) navegador += ' (dentro do LinkedIn)';
  if (m.tela && Math.min(m.tela[0], m.tela[1]) >= 600 && tipo === 'Celular') tipo = 'Tablet';
  return { tipo, so, navegador, modelo };
}

function origemLegivel(ref, utm = {}) {
  const fonte = utm.utm_source || utm.fonte;
  if (utm.gclid) return 'Anúncio do Google (Google Ads)';
  if (utm.fbclid && !fonte) return 'Facebook / Instagram (link compartilhado ou anúncio)';
  if (fonte) { const site = ref ? origemSite(ref) : null; return `${site ? site + ' · ' : ''}Campanha: ${fonte}${utm.utm_medium ? ' / ' + utm.utm_medium : ''}${utm.utm_campaign ? ' / ' + utm.utm_campaign : ''}`; }
  if (!ref) return 'Acesso direto (digitou o endereço, favorito, QR Code ou aplicativo)';
  return origemSite(ref);
}
function origemSite(ref) {
  let h = ''; try { h = new URL(ref).hostname.replace(/^www\./, ''); } catch { return ref; }
  if (/google\./.test(h)) return 'Busca do Google';
  if (/bing\.|duckduckgo|yahoo|ecosia|yandex/.test(h)) return 'Busca (' + h + ')';
  if (/instagram/.test(h)) return 'Instagram';
  if (/facebook|fb\.com/.test(h)) return 'Facebook';
  if (/linkedin|lnkd\.in/.test(h)) return 'LinkedIn';
  if (/whatsapp|wa\.me/.test(h)) return 'WhatsApp';
  if (/youtube|youtu\.be/.test(h)) return 'YouTube';
  if (/tiktok/.test(h)) return 'TikTok';
  if (/neonsistemas\.com$/.test(h)) return 'Outra página da Neon (' + h + ')';
  return 'Site: ' + h;
}

// ---------- Recebimento ----------
const limiter = rateLimit({ windowMs: 60e3, limit: 240, standardHeaders: false, legacyHeaders: false, handler: (req, res) => res.status(204).end() });
const pub = express.Router();

function cors(req, res) {
  const o = req.headers.origin;
  if (ORIGENS.includes(o) || (TESTE && o)) { res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Vary', 'Origin'); }
}
pub.options('/publico/visitas', (req, res) => { cors(req, res); res.setHeader('Access-Control-Allow-Methods', 'POST'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.status(204).end(); });

pub.post('/publico/visitas', limiter, express.text({ type: '*/*', limit: '64kb' }), wrap(async (req, res) => {
  cors(req, res);
  const c = await cfg();
  if (!c.ativo) return res.status(204).end();
  let o; try { o = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch { return res.status(204).end(); }
  const sessao = idOk(o.s); if (!sessao) return res.status(204).end();
  const ua = String(req.headers['user-agent'] || '');
  const ip = clientIp(req);
  let v = await one('SELECT id, n_eventos, ip FROM site_visitas WHERE sessao=?', [sessao]);
  if (!v) {
    const meta = limpar(o.m || {}) || {};
    const robo = ROBO_UA.test(ua) || meta.webdriver === true ? 1 : 0;
    await q(`INSERT IGNORE INTO site_visitas (sessao, visitante, ip, ua, meta, origem, entrada, idioma, robo) VALUES (?,?,?,?,?,?,?,?,?)`,
      [sessao, idOk(o.v), ip, txt(ua, 500), JSON.stringify(meta), txt(meta.ref, 500) || null, txt(meta.url, 500) || null, txt(meta.lang, 10) || null, robo]);
    v = await one('SELECT id, n_eventos, ip FROM site_visitas WHERE sessao=?', [sessao]);
    // localização em segundo plano
    geoIp(ip).then((g) => q('UPDATE site_visitas SET geo=?, robo=GREATEST(robo, ?) WHERE id=?', [JSON.stringify(g), g.datacenter ? 1 : 0, v.id])).catch(() => {});
  } else if (o.m) {
    const meta = limpar(o.m) || {};
    await q('UPDATE site_visitas SET meta=JSON_MERGE_PATCH(COALESCE(meta, JSON_OBJECT()), ?), origem=COALESCE(origem, ?), entrada=COALESCE(entrada, ?), idioma=COALESCE(idioma, ?), robo=GREATEST(robo, ?) WHERE id=?',
      [JSON.stringify(meta), txt(meta.ref, 500) || null, txt(meta.url, 500) || null, txt(meta.lang, 10) || null, meta.webdriver === true ? 1 : 0, v.id]).catch(() => {});
  }
  const evs = Array.isArray(o.e) ? o.e.slice(0, 200) : [];
  if (v.n_eventos + evs.length > 3000) return res.status(204).end();
  const linhas = [];
  let paginas = 0, form = 0, wa = 0, fim = 0;
  for (const e of evs) {
    const tipo = String(e && e.k || '');
    if (!TIPOS.has(tipo)) continue;
    const ts = Number(e.t); const em = Number.isFinite(ts) && Math.abs(ts - Date.now()) < 864e5 ? new Date(ts) : new Date();
    const dados = limpar({ ...e, k: undefined, t: undefined }) || {};
    delete dados.k; delete dados.t;
    linhas.push([v.id, tipo, JSON.stringify(dados), em.toISOString().slice(0, 23).replace('T', ' ')]);
    if (tipo === 'pagina' || tipo === 'inicio') paginas++;
    if (tipo === 'form_campo') form = Math.max(form, 1);
    if (tipo === 'form_envio') form = 2;
    if (tipo === 'whatsapp') wa = 1;
    if (tipo === 'fim') fim = 1;
  }
  if (linhas.length) await q('INSERT INTO site_visita_eventos (visita_id, tipo, dados, em) VALUES ?', [linhas]);
  await q(`UPDATE site_visitas SET ultimo=UTC_TIMESTAMP(), n_eventos=n_eventos+?, paginas=paginas+?, formulario=GREATEST(formulario, ?),
    whatsapp=GREATEST(whatsapp, ?), terminou=GREATEST(terminou, ?), ip=COALESCE(ip, ?) WHERE id=?`, [linhas.length, paginas, form, wa, fim, ip, v.id]);
  res.status(204).end();
}));

// ---------- Relatório ----------
const esc = (s) => String(s ?? '').replace(/[<&>"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));
const brt = (d) => new Date(String(d).replace(' ', 'T') + (String(d).includes('Z') ? '' : 'Z'));
const dtBr = (d, seg) => brt(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', ...(seg ? { second: '2-digit' } : {}) });
const horaBr = (d) => brt(d).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' });
function dur(ms) { const s = Math.max(0, Math.round(ms / 1000)); if (s < 60) return `${s} s`; const m = Math.floor(s / 60); if (m < 60) return `${m} min ${s % 60} s`; return `${Math.floor(m / 60)} h ${m % 60} min`; }

const SECOES = { produtos: 'Produtos', 'painel-neon': 'Painel Neon', voz: 'Comando de voz', 'neon-motel': 'Neon Motel', 'pabx-neon': 'PABX Neon', 'como-funciona': 'Como funciona',
  calculadora: 'Calculadora', comparativo: 'Comparativo', novidades: 'Novidades', depoimentos: 'Depoimentos', perguntas: 'Perguntas frequentes', contato: 'Contato' };
const CAMPOS = { nome: 'Nome', empresa: 'Empresa', interesse: 'Interesse', msg: 'Mensagem', cSuites: 'Suítes', cGiro: 'Giro por suíte/dia', cFrigo: 'Consumo de frigobar', cEnergia: 'Conta de energia' };

async function montar(id) {
  const v = await one('SELECT * FROM site_visitas WHERE id=?', [id]);
  if (!v) return null;
  const evs = await q('SELECT tipo, dados, em FROM site_visita_eventos WHERE visita_id=? ORDER BY em, id', [id]);
  evs.forEach((e) => { e.dados = parseJ(e.dados, {}) || {}; });
  const m = parseJ(v.meta, {}) || {}; const g = parseJ(v.geo, {}) || {};
  const ap = aparelho(v.ua, m);
  const anteriores = v.visitante ? await q('SELECT id, inicio, paginas, formulario, whatsapp FROM site_visitas WHERE visitante=? AND id < ? ORDER BY id DESC LIMIT 10', [v.visitante, v.id]) : [];
  const [mesmoIp] = v.ip ? await q('SELECT COUNT(*) n FROM site_visitas WHERE ip=? AND id<>?', [v.ip, v.id]) : [{ n: 0 }];
  const ini = evs.length ? brt(evs[0].em) : brt(v.inicio); const fimT = evs.length ? brt(evs[evs.length - 1].em) : brt(v.ultimo);
  const fim = evs.filter((e) => e.tipo === 'fim').pop();
  const duracao = fim?.dados?.total_ms || (fimT - ini);
  const ativo = fim?.dados?.ativo_ms || null;
  // seções: tempo somado
  const secoes = {};
  for (const e of evs.filter((x) => x.tipo === 'secao')) { const k = e.dados.id; secoes[k] = (secoes[k] || 0) + (Number(e.dados.ms) || 0); }
  const rolagem = Math.max(0, ...evs.filter((e) => e.tipo === 'rolagem').map((e) => Number(e.dados.pct) || 0));
  const cliques = evs.filter((e) => e.tipo === 'clique');
  const was = evs.filter((e) => e.tipo === 'whatsapp');
  const envio = evs.filter((e) => e.tipo === 'form_envio').pop();
  const camposTocados = [...new Set(evs.filter((e) => e.tipo === 'form_campo').map((e) => e.dados.campo))];
  const calc = evs.filter((e) => e.tipo === 'calculadora').pop();
  const utm = m.utm || {};
  const origem = origemLegivel(v.origem, utm);
  const local = g.cidade ? `${g.cidade}${g.uf ? '/' + g.uf : g.estado ? ' – ' + g.estado : ''}${g.pais && g.pais_codigo !== 'BR' ? ', ' + g.pais : ''}` : (g.local ? 'rede interna' : 'local não identificado');
  const interesse = [];
  if (envio) interesse.push('ENVIOU O FORMULÁRIO');
  else if (camposTocados.length) interesse.push('começou a preencher o formulário');
  if (was.length) interesse.push(`clicou no WhatsApp${was.length > 1 ? ` (${was.length}x)` : ''}`);
  if (calc) interesse.push('usou a calculadora');
  const quente = !!(envio || was.length);
  const titulo = `${quente ? '🔥 ' : ''}Visita no site · ${local} · ${ap.tipo.toLowerCase()} · ${v.paginas || 1} pág. · ${dur(duracao)}${interesse.length ? ' · ' + interesse[0] : ''}`;

  const linha = (k, val) => (val == null || val === '' || val === false ? '' : `<tr><td style="padding:5px 10px 5px 0;color:#6b7489;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:5px 0;vertical-align:top">${val === true ? 'sim' : esc(val)}</td></tr>`);
  const bloco = (t, corpo) => (corpo.replace(/<\/?table[^>]*>/g, '').trim() ? `<h2 style="font-size:15px;margin:22px 0 6px;color:#e8650c;text-transform:uppercase;letter-spacing:.05em">${esc(t)}</h2>${corpo}` : '');
  const tabela = (rows) => `<table style="border-collapse:collapse;font-size:14px;width:100%">${rows.join('')}</table>`;
  const mapa = g.lat != null ? `https://www.google.com/maps?q=${g.lat},${g.lon}` : null;

  const tl = evs.map((e) => {
    const d = e.dados; let t;
    switch (e.tipo) {
      case 'inicio': t = `Entrou em <b>${esc(d.titulo || d.url)}</b>`; break;
      case 'pagina': t = `Abriu a página <b>${esc(d.titulo || d.url)}</b>`; break;
      case 'secao': t = `Viu a seção <b>${esc(SECOES[d.id] || d.id)}</b> por ${dur(d.ms)}`; break;
      case 'rolagem': t = `Rolou até ${esc(d.pct)}% da página`; break;
      case 'clique': t = `Clicou em <b>${esc(d.texto || d.alvo || 'elemento')}</b>${d.href ? ` <span style="color:#6b7489">(${esc(d.href)})</span>` : ''}`; break;
      case 'whatsapp': t = `<b style="color:#128c4a">Clicou no WhatsApp</b>${d.numero ? ' ' + esc(d.numero) : ''}${d.onde ? ` <span style="color:#6b7489">(${esc(d.onde)})</span>` : ''}`; break;
      case 'form_campo': t = `Preencheu o campo <b>${esc(CAMPOS[d.campo] || d.campo)}</b> do formulário${d.tam ? ` (${esc(d.tam)} caracteres)` : ''}`; break;
      case 'form_envio': t = '<b style="color:#e8650c">Enviou o formulário de contato</b>'; break;
      case 'calculadora': t = `Usou a calculadora: ${esc(Object.entries(d.valores || {}).map(([k, x]) => `${CAMPOS[k] || k} ${x}`).join(', '))}`; break;
      case 'copia': t = `Copiou o texto “${esc(d.texto)}”`; break;
      case 'idioma': t = `Trocou o idioma para ${esc(d.para)}`; break;
      case 'oculta': t = 'Saiu da aba (mudou de aba ou de aplicativo)'; break;
      case 'visivel': t = 'Voltou para a aba'; break;
      case 'fim': t = `Fechou ou saiu do site${d.ativo_ms ? ` · tempo ativo ${dur(d.ativo_ms)}` : ''}`; break;
      case 'erro': t = `Erro na página: ${esc(d.msg)}`; break;
      default: t = esc(e.tipo);
    }
    return `<tr><td style="padding:4px 10px 4px 0;color:#6b7489;white-space:nowrap;vertical-align:top;font-variant-numeric:tabular-nums">${horaBr(e.em)}</td><td style="padding:4px 0">${t}</td></tr>`;
  });

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)}</title></head>
<body style="margin:0;background:#f3f5f9;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#1d2433">
<div style="max-width:680px;margin:0 auto;padding:22px 14px"><div style="background:#fff;border-radius:14px;padding:22px 22px 26px;border-top:4px solid ${quente ? '#e8650c' : '#38bdf8'}">
<div style="font-size:12px;color:#7a8499;text-transform:uppercase;letter-spacing:.06em">neonsistemas.com · visita #${v.id}${v.robo ? ' · provável robô/servidor' : ''}</div>
<h1 style="font-size:20px;line-height:1.3;margin:6px 0 4px">${esc(local)} · ${esc(ap.tipo)} · ${esc(origem)}</h1>
<div style="font-size:14px;color:#4a5468">${dtBr(v.inicio)} · ${dur(duracao)} no site${ativo ? ` (${dur(ativo)} ativo)` : ''} · ${v.paginas || 1} página(s) · ${anteriores.length ? `<b>voltou</b> (${anteriores.length} visita(s) antes)` : 'primeira visita'}</div>
${interesse.length ? `<div style="margin-top:12px;background:${quente ? '#fff1e6' : '#eef6ff'};border-radius:10px;padding:10px 12px;font-weight:600">${esc(interesse.join(' · '))}</div>` : ''}
${envio ? bloco('Formulário enviado', tabela(Object.entries(envio.dados.campos || {}).map(([k, x]) => linha(CAMPOS[k] || k, x)))) : ''}
${!envio && camposTocados.length ? bloco('Formulário (não enviado)', `<p style="margin:0;font-size:14px">Mexeu nos campos: ${esc(camposTocados.map((k) => CAMPOS[k] || k).join(', '))}. O texto não enviado não é registrado.</p>`) : ''}
${calc ? bloco('Calculadora', tabela([...Object.entries(calc.dados.valores || {}).map(([k, x]) => linha(CAMPOS[k] || k, x)), linha('Resultado mostrado', calc.dados.resultado)])) : ''}
${bloco('De onde veio', tabela([linha('Origem', origem), linha('Página anterior', v.origem), linha('Entrou por', v.entrada),
    linha('Campanha (UTM)', [utm.utm_source, utm.utm_medium, utm.utm_campaign, utm.utm_term, utm.utm_content].filter(Boolean).join(' / ')), linha('Clique de anúncio', utm.gclid ? 'Google Ads (gclid)' : utm.fbclid ? 'Meta (fbclid)' : null)]))}
${bloco('Localização provável (pelo IP)', tabela([linha('Cidade', g.cidade ? `${g.cidade}${g.bairro ? ' – ' + g.bairro : ''}` : null), linha('Estado', g.estado), linha('País', g.pais), linha('CEP aproximado', g.cep),
    linha('Coordenadas', g.lat != null ? `${g.lat}, ${g.lon}` : null), linha('Fuso horário', g.fuso)]) + (mapa ? `<p style="margin:6px 0 0;font-size:13px"><a href="${mapa}" style="color:#e8650c">Ver no mapa</a> · <span style="color:#6b7489">A localização pelo IP é aproximada: costuma acertar a cidade, mas pode indicar a cidade do provedor.</span></p>` : ''))}
${bloco('Rede e IP', tabela([linha('IP', v.ip), linha('DNS reverso', g.dns_reverso), linha('Provedor', g.provedor), linha('Organização', g.organizacao !== g.provedor ? g.organizacao : null), linha('ASN', g.asn),
    linha('Tipo de conexão', g.rede_movel ? 'rede móvel (4G/5G)' : g.provedor ? 'internet fixa / Wi-Fi' : null), linha('Proxy ou VPN', g.proxy_vpn ? 'sim, provável' : null), linha('Data center / servidor', g.datacenter ? 'sim (pode ser robô ou VPN)' : null),
    linha('Outras visitas deste IP', mesmoIp.n ? String(mesmoIp.n) : null)]))}
${bloco('Aparelho e navegador', tabela([linha('Tipo', ap.tipo), linha('Modelo', ap.modelo), linha('Sistema', ap.so), linha('Navegador', ap.navegador), linha('Tela', m.tela ? `${m.tela[0]} × ${m.tela[1]} px${m.dpr ? ` (densidade ${m.dpr}x)` : ''}` : null),
    linha('Janela', m.janela ? `${m.janela[0]} × ${m.janela[1]} px` : null), linha('Idiomas do aparelho', (m.idiomas || []).join(', ')), linha('Idioma no site', v.idioma), linha('Fuso do aparelho', m.fuso),
    linha('Conexão informada', m.rede ? `${m.rede.tipo || ''}${m.rede.mbps ? ` · ~${m.rede.mbps} Mbps` : ''}${m.rede.economia ? ' · economia de dados' : ''}` : null), linha('Memória', m.memoria ? `${m.memoria} GB` : null), linha('Processador', m.nucleos ? `${m.nucleos} núcleos` : null),
    linha('Tela de toque', m.toque ? `sim (${m.toque} pontos)` : null), linha('Tema do aparelho', m.escuro ? 'escuro' : m.escuro === false ? 'claro' : null), linha('User-agent', v.ua)]))}
${bloco('O que viu', (Object.keys(secoes).length ? tabela(Object.entries(secoes).sort((a, b) => b[1] - a[1]).map(([k, ms]) => linha(SECOES[k] || k, dur(ms)))) : '') + (rolagem ? `<p style="margin:6px 0 0;font-size:14px">Rolou até <b>${rolagem}%</b> da página.</p>` : '') + (cliques.length ? `<p style="margin:6px 0 0;font-size:14px">${cliques.length} clique(s) em botões e links.</p>` : ''))}
${anteriores.length ? bloco('Visitas anteriores deste visitante', tabela(anteriores.map((a) => linha(dtBr(a.inicio), `${a.paginas || 1} pág.${a.formulario === 2 ? ' · enviou formulário' : ''}${a.whatsapp ? ' · WhatsApp' : ''}`)))) : ''}
${bloco('Linha do tempo (horário de Brasília)', tabela(tl))}
<p style="font-size:12px;color:#8a93a6;margin:22px 0 0">Relatório automático do Neon Gestão. Para mudar o destinatário ou desligar, abra o painel em Marketing → Visitas do site.</p>
</div></div></body></html>`;
  const texto = `${titulo}\n\nQuando: ${dtBr(v.inicio)}\nOrigem: ${origem}\nLocal provável: ${local}\nIP: ${v.ip || '—'} · ${g.provedor || ''}\nAparelho: ${ap.tipo} · ${ap.so} · ${ap.navegador}${ap.modelo ? ' · ' + ap.modelo : ''}\n${interesse.length ? 'Interesse: ' + interesse.join(', ') + '\n' : ''}`;
  return { v, titulo, html, texto, quente, interagiu: !!(cliques.length || was.length || camposTocados.length || calc || duracao > 30000) };
}

// ---------- Envio por e-mail ----------
async function enviarPendentes() {
  const c = await cfg();
  if (!c.ativo || !c.email.length) return { enviados: 0 };
  const al = require('./alertas');
  const pronto = TESTE || (await al.emailCfg()).pronto;
  // sem e-mail configurado: visitas com mais de 24 h ficam sem aviso (evita uma enxurrada depois)
  if (!pronto) { await q("UPDATE site_visitas SET email_status='não enviado: e-mail de avisos não configurado' WHERE email_status IS NULL AND ultimo < UTC_TIMESTAMP() - INTERVAL 24 HOUR"); return { enviados: 0, pronto: false }; }
  const rows = await q(`SELECT id, robo FROM site_visitas WHERE email_status IS NULL AND
    (ultimo < UTC_TIMESTAMP() - INTERVAL ? MINUTE OR (terminou=1 AND ultimo < UTC_TIMESTAMP() - INTERVAL 1 MINUTE)) ORDER BY id LIMIT 20`, [INATIVA_MIN]);
  let enviados = 0;
  for (const r of rows) {
    const marca = (s) => q('UPDATE site_visitas SET email_status=?, email_em=UTC_TIMESTAMP() WHERE id=?', [String(s).slice(0, 255), r.id]);
    const claim = await q("UPDATE site_visitas SET email_status='enviando' WHERE id=? AND email_status IS NULL", [r.id]);
    if (claim.affectedRows !== 1) continue;
    try {
      const rel = await montar(r.id);
      if (rel.v.robo && !c.robos) { await marca('pulado: robô ou servidor'); continue; }
      if (c.modo === 'interacao' && !rel.interagiu) { await marca('pulado: sem interação'); continue; }
      for (const para of c.email) await al.enviarEmailCru({ para, assunto: rel.titulo, html: rel.html, texto: rel.texto });
      await marca('enviado'); enviados++;
    } catch (e) { await marca('erro: ' + e.message); }
  }
  return { enviados };
}

async function resumoDiario(agora = new Date()) {
  const c = await cfg();
  if (!c.ativo || !c.resumo || !c.email.length) return false;
  const hora = new Date(agora.getTime() - 3 * 3600e3).getUTCHours();
  if (hora < c.resumo_hora || hora > c.resumo_hora + 2) return false;
  const al = require('./alertas');
  if (!TESTE && !(await al.emailCfg()).pronto) return false;
  const hoje = todaySql();
  if (!(await al.primeiraVez(`visitas:resumo:${hoje}`))) return false;
  const de = new Date(Date.parse(hoje + 'T03:00:00Z')).toISOString().slice(0, 19).replace('T', ' ');
  const vs = await q('SELECT * FROM site_visitas WHERE inicio >= ? AND robo=0 ORDER BY inicio', [de]);
  const conta = (f) => { const m = {}; vs.forEach((v) => { const k = f(v); if (k) m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8); };
  const cidades = conta((v) => { const g = parseJ(v.geo, {}) || {}; return g.cidade ? `${g.cidade}/${g.uf || g.pais}` : 'não identificado'; });
  const origens = conta((v) => origemLegivel(v.origem, (parseJ(v.meta, {}) || {}).utm || {}));
  const aparelhos = conta((v) => aparelho(v.ua, parseJ(v.meta, {}) || {}).tipo);
  const novos = vs.filter((v) => v.visitante).length - new Set(vs.filter((v) => v.visitante).map((v) => v.visitante)).size;
  const forms = vs.filter((v) => v.formulario === 2), was = vs.filter((v) => v.whatsapp);
  const lista = (arr) => arr.map(([k, n]) => `<tr><td style="padding:3px 12px 3px 0">${esc(k)}</td><td style="text-align:right;font-weight:600">${n}</td></tr>`).join('');
  const html = `<!doctype html><html><body style="margin:0;background:#f3f5f9;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#1d2433"><div style="max-width:620px;margin:0 auto;padding:22px 14px"><div style="background:#fff;border-radius:14px;padding:22px;border-top:4px solid #e8650c">
<div style="font-size:12px;color:#7a8499;text-transform:uppercase;letter-spacing:.06em">neonsistemas.com · resumo do dia</div>
<h1 style="font-size:21px;margin:6px 0 12px">${vs.length} visita(s) hoje · ${forms.length} formulário(s) · ${was.length} clique(s) no WhatsApp</h1>
<p style="font-size:14px;color:#4a5468;margin:0 0 10px">${novos > 0 ? `${novos} visita(s) de quem já tinha vindo antes hoje.` : ''}</p>
<h2 style="font-size:14px;color:#e8650c;text-transform:uppercase">Cidades</h2><table style="font-size:14px">${lista(cidades)}</table>
<h2 style="font-size:14px;color:#e8650c;text-transform:uppercase">Origem</h2><table style="font-size:14px">${lista(origens)}</table>
<h2 style="font-size:14px;color:#e8650c;text-transform:uppercase">Aparelhos</h2><table style="font-size:14px">${lista(aparelhos)}</table>
${forms.length ? `<h2 style="font-size:14px;color:#e8650c;text-transform:uppercase">Enviaram o formulário</h2><p style="font-size:14px">${forms.map((v) => `visita #${v.id} às ${horaBr(v.inicio)}`).join('<br>')}</p>` : ''}
<p style="font-size:12px;color:#8a93a6">Cada visita também chegou num e-mail separado, com todos os detalhes.</p></div></div></body></html>`;
  for (const para of c.email) await al.enviarEmailCru({ para, assunto: `Resumo do site ${hoje.split('-').reverse().join('/')}: ${vs.length} visita(s), ${forms.length} formulário(s)`, html, texto: `${vs.length} visitas hoje, ${forms.length} formulários, ${was.length} cliques no WhatsApp.` });
  return true;
}

async function limparAntigas() {
  const velhas = await q('SELECT id FROM site_visitas WHERE inicio < UTC_TIMESTAMP() - INTERVAL 12 MONTH LIMIT 500');
  if (velhas.length) { const ids = velhas.map((x) => x.id); await q('DELETE FROM site_visita_eventos WHERE visita_id IN (?)', [ids]); await q('DELETE FROM site_visitas WHERE id IN (?)', [ids]); }
  await q('DELETE FROM site_ip_cache WHERE created_at < UTC_TIMESTAMP() - INTERVAL 30 DAY');
}

let rodando = false;
async function tick() {
  if (rodando) return; rodando = true;
  const conn = await getPool().getConnection();
  try {
    const [[lock]] = await conn.query("SELECT GET_LOCK('neon_visitas', 0) l");
    if (!lock.l) return;
    try { await enviarPendentes(); await resumoDiario(); await limparAntigas(); } finally { await conn.query("SELECT RELEASE_LOCK('neon_visitas')"); }
  } catch (e) { console.error('visitas:', e.message); } finally { conn.release(); rodando = false; }
}
function iniciar() { if (TESTE) return; setTimeout(tick, 25000); setInterval(tick, 60e3).unref(); }

// ---------- Rotas do painel (administradores) ----------
const router = express.Router();
router.use(requireAdmin);

router.get('/', wrap(async (req, res) => {
  const where = []; const params = [];
  if (req.query.filtro === 'contato') where.push('(formulario=2 OR whatsapp=1)');
  if (req.query.filtro === 'voltaram') where.push('visitante IN (SELECT visitante FROM (SELECT visitante FROM site_visitas WHERE visitante IS NOT NULL GROUP BY visitante HAVING COUNT(*) > 1) x)');
  if (req.query.filtro !== 'robos') where.push('robo=0'); else where.push('robo=1');
  const limit = 50; const page = Math.max(1, Number(req.query.page) || 1);
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const rows = await q(`SELECT id, visitante, ip, geo, ua, meta, origem, idioma, inicio, ultimo, paginas, formulario, whatsapp, robo, email_status FROM site_visitas ${w} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
  const [{ n }] = await q(`SELECT COUNT(*) n FROM site_visitas ${w}`, params);
  const [hoje] = await q("SELECT COUNT(*) visitas, SUM(formulario=2) formularios, SUM(whatsapp) whatsapp FROM site_visitas WHERE robo=0 AND inicio >= ?", [new Date(Date.parse(todaySql() + 'T03:00:00Z')).toISOString().slice(0, 19).replace('T', ' ')]);
  res.json({
    total: n, hoje: { visitas: Number(hoje.visitas || 0), formularios: Number(hoje.formularios || 0), whatsapp: Number(hoje.whatsapp || 0) },
    data: rows.map((v) => { const g = parseJ(v.geo, {}) || {}; const m = parseJ(v.meta, {}) || {}; const ap = aparelho(v.ua, m);
      return { id: v.id, inicio: v.inicio, ultimo: v.ultimo, local: g.cidade ? `${g.cidade}/${g.uf || g.pais}` : '—', provedor: g.provedor || null, ip: v.ip, aparelho: `${ap.tipo} · ${ap.so}`, origem: origemLegivel(v.origem, m.utm || {}),
        paginas: v.paginas, formulario: v.formulario, whatsapp: !!v.whatsapp, robo: !!v.robo, email: v.email_status, duracao_ms: brt(v.ultimo) - brt(v.inicio) }; }),
  });
}));

router.get('/config', wrap(async (req, res) => {
  const c = await cfg();
  res.json({ ...c, email: c.email.join(', '), email_pronto: TESTE || (await require('./alertas').emailCfg()).pronto });
}));

router.post('/config', wrap(async (req, res) => {
  const b = req.body || {}; const set = {};
  if (b.ativo !== undefined) set.visitas_ativo = b.ativo ? '1' : '0';
  if (b.email !== undefined) {
    const lista = String(b.email).split(/[,;\s]+/).filter(Boolean);
    if (lista.some((x) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))) throw new HttpError(400, 'Confira o e-mail: use endereços completos, separados por vírgula.');
    set.visitas_email = lista.join(',');
  }
  if (b.modo !== undefined) set.visitas_modo = b.modo === 'interacao' ? 'interacao' : 'todas';
  if (b.robos !== undefined) set.visitas_robos = b.robos ? '1' : '0';
  if (b.resumo !== undefined) set.visitas_resumo = b.resumo ? '1' : '0';
  if (b.resumo_hora !== undefined) set.visitas_resumo_hora = String(Math.max(0, Math.min(23, Number(b.resumo_hora) || 0)));
  for (const [k, v] of Object.entries(set)) await q('INSERT INTO configuracoes (chave, valor) VALUES (?,?) ON DUPLICATE KEY UPDATE valor=VALUES(valor)', [k, v]);
  res.json({ ok: true });
}));

router.get('/:id/relatorio', wrap(async (req, res) => {
  const r = await montar(Number(req.params.id));
  if (!r) throw new HttpError(404, 'Visita não encontrada.');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(r.html);
}));

router.post('/:id/enviar', wrap(async (req, res) => {
  const c = await cfg();
  const r = await montar(Number(req.params.id));
  if (!r) throw new HttpError(404, 'Visita não encontrada.');
  if (!c.email.length) throw new HttpError(400, 'Defina o e-mail que recebe as visitas.');
  try { for (const para of c.email) await require('./alertas').enviarEmailCru({ para, assunto: r.titulo, html: r.html, texto: r.texto }); }
  catch (e) { throw new HttpError(400, 'Não consegui enviar: ' + e.message + ' (confira o e-mail de avisos em Configurações → Alertas).'); }
  res.json({ ok: true, para: c.email });
}));

if (TESTE) router.post('/_teste/rodar', wrap(async (req, res) => res.json({ ...(await enviarPendentes()), resumo: await resumoDiario(req.body.agora ? new Date(req.body.agora) : new Date()) })));

module.exports = { router, pub, migrate, iniciar, tick, montar, aparelho, origemLegivel, geoIp };
