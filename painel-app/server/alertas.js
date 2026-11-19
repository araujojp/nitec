// Alertas automáticos para a equipe: Telegram, e-mail e notificação no celular (push).
// Cada pessoa escolhe o que recebe e por onde. Os envios não se repetem, mesmo com os dois
// endereços (painel e gestao) rodando ao mesmo tempo: cada alerta tem uma chave única no banco.
const crypto = require('crypto');
const express = require('express');
const { q, one, getPool } = require('./db');
const { requireUser, requireAdmin } = require('./auth');
const { wrap, HttpError, audit, todaySql, nowSql } = require('./util');

const TESTE = process.env.NEON_TESTE === '1';
const saidaTeste = []; // em teste, os envios ficam aqui em vez de sair

const EMAIL_PADRAO = 'contato@neonsistemas.com'; // caixa que já existe na Hostinger
const CANAIS = { telegram: 'Telegram', email: 'E-mail', push: 'Celular (notificação)' };

const EVENTOS = {
  chamado_novo: { nome: 'Chamado novo', desc: 'Qualquer chamado aberto no painel.', padrao: ['push'] },
  chamado_urgente: { nome: 'Chamado de prioridade alta ou urgente', desc: 'Na abertura ou quando a prioridade sobe.', padrao: ['telegram', 'push', 'email'] },
  chamado_atribuido: { nome: 'Chamado passado para mim', desc: 'Quando você vira o responsável por um chamado.', padrao: ['push', 'telegram'], pessoal: true },
  chamado_sla: { nome: 'Chamado fora do prazo (SLA)', desc: 'Quando o prazo de atendimento estoura.', padrao: ['telegram', 'push'] },
  equipamento_offline: { nome: 'Equipamento sem sinal', desc: 'Instalação ativa que parou de dar sinal.', padrao: ['telegram', 'push'] },
  equipamento_voltou: { nome: 'Equipamento voltou', desc: 'O equipamento que estava sem sinal voltou.', padrao: ['push'] },
  licenca_vencendo: { nome: 'Licença vencendo', desc: 'Faltando 7, 3 e 0 dias (ajustável).', padrao: ['telegram', 'email'] },
  cobranca_atrasada: { nome: 'Cobrança atrasada', desc: 'Quando uma mensalidade passa do vencimento.', padrao: ['telegram'] },
  lembrete: { nome: 'Lembrete da agenda', desc: 'Na hora marcada (vai para quem registrou o contato).', padrao: ['push', 'telegram'], pessoal: true },
  pagamento_recebido: { nome: 'Pagamento recebido (Asaas)', desc: 'Quando o cliente paga o boleto ou o Pix.', padrao: ['telegram', 'push'] },
  resumo_diario: { nome: 'Resumo do dia', desc: 'Todo dia de manhã: o que precisa de atenção hoje.', padrao: ['email', 'telegram'] },
};

// ---------- Banco ----------
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS alertas_enviados (
    chave VARCHAR(190) PRIMARY KEY,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS alertas_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    evento VARCHAR(40) NOT NULL,
    titulo VARCHAR(200) NOT NULL,
    texto TEXT NULL,
    link VARCHAR(255) NULL,
    enviados INT NOT NULL DEFAULT 0,
    falhas TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS push_inscricoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    endpoint_hash CHAR(64) NOT NULL UNIQUE,
    inscricao JSON NOT NULL,
    aparelho VARCHAR(200) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX (usuario_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];
const COLUMNS = [
  ['usuarios', 'alertas', 'JSON NULL'],
  ['usuarios', 'telegram_chat_id', 'VARCHAR(40) NULL'],
  ['usuarios', 'telegram_codigo', 'VARCHAR(24) NULL'],
  ['instalacoes', 'alerta_offline_em', 'DATETIME NULL'],
];

async function migrate() {
  for (const s of SCHEMA) await q(s);
  for (const [t, c, def] of COLUMNS) {
    const ex = await q('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?', [t, c]);
    if (!ex.length) await q(`ALTER TABLE \`${t}\` ADD COLUMN \`${c}\` ${def}`);
  }
  const padroes = { alertas_ativo: '1', offline_horas: '3', resumo_hora: '8', licenca_dias: '7,3,0' };
  for (const [k, v] of Object.entries(padroes)) await q('INSERT IGNORE INTO configuracoes (chave, valor) VALUES (?,?)', [k, v]);
}

async function cfgGeral() {
  const rows = await q("SELECT chave, valor FROM configuracoes WHERE chave IN ('alertas_ativo','offline_horas','resumo_hora','licenca_dias','empresa_nome')");
  const c = Object.fromEntries(rows.map((r) => [r.chave, r.valor]));
  return {
    ativo: c.alertas_ativo !== '0',
    offline_horas: Math.max(1, Math.min(168, Number(c.offline_horas) || 3)),
    resumo_hora: Math.max(0, Math.min(23, Number(c.resumo_hora ?? 8) || 0)),
    licenca_dias: String(c.licenca_dias || '7,3,0').split(/[,;\s]+/).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 90),
    empresa: c.empresa_nome || 'Neon Sistemas',
  };
}

function parseJ(v, d) { if (typeof v === 'string') { try { return JSON.parse(v); } catch { return d; } } return v ?? d; }

async function getIntegracao(rede) {
  const r = await one('SELECT config FROM integracoes WHERE rede=?', [rede]);
  return parseJ(r?.config, {}) || {};
}
async function setIntegracao(rede, config) {
  await q('INSERT INTO integracoes (rede, ativo, config) VALUES (?,1,?) ON DUPLICATE KEY UPDATE config=VALUES(config)', [rede, JSON.stringify(config)]);
}

// Marca o alerta como enviado; devolve false se já tinha sido (por esta ou pela outra instância)
async function primeiraVez(chave) {
  const r = await q('INSERT IGNORE INTO alertas_enviados (chave) VALUES (?)', [String(chave).slice(0, 190)]);
  return r.affectedRows === 1;
}

function baseUrl() { return String(process.env.PUBLIC_URL || '').replace(/\/$/, ''); }
const esc = (s) => String(s ?? '').replace(/[<&>"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
const money = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');

// ---------- Canais ----------
let tgBot = null;
async function tgToken() {
  const c = await getIntegracao('telegram');
  return c.bot_token || null;
}
async function enviarTelegram(chatId, m) {
  const texto = `${m.urgente ? '🚨 ' : ''}<b>${esc(m.titulo)}</b>\n${esc(m.texto)}${m.link && baseUrl() ? `\n\n<a href="${esc(baseUrl() + m.link)}">Abrir no painel</a>` : ''}`;
  if (TESTE) { saidaTeste.push({ canal: 'telegram', para: chatId, texto }); return; }
  const token = await tgToken();
  if (!token) throw new Error('Robô do Telegram não configurado.');
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: texto.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true }), signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error('Telegram: ' + (j.description || r.status));
}

let transporter = null, transporterKey = '';
// Sem a senha da caixa, usa o envio do próprio servidor da hospedagem (sendmail), se existir
function sendmailPath() {
  if (process.env.NEON_SEM_SENDMAIL === '1') return null;
  const fs = require('fs');
  for (const p of ['/usr/sbin/sendmail', '/usr/lib/sendmail', '/usr/bin/sendmail']) { try { fs.accessSync(p, fs.constants.X_OK); return p; } catch { /* tenta o próximo */ } }
  return null;
}
async function emailCfg() {
  const c = await getIntegracao('email');
  const sm = c.senha ? null : sendmailPath();
  return { host: c.host || 'smtp.hostinger.com', porta: Number(c.porta) || 465, usuario: c.usuario || EMAIL_PADRAO, senha: c.senha || '', nome: c.nome || 'Neon Gestão',
    modo: c.senha ? 'smtp' : sm ? 'servidor' : null, sendmail: sm, pronto: !!(c.senha || sm) };
}
async function enviarEmail(para, m) {
  return enviarEmailCru({ para, assunto: (m.urgente ? '🚨 ' : '') + m.titulo, html: emailHtml(m), texto: `${m.titulo}\n\n${m.texto}${m.link && baseUrl() ? `\n\n${baseUrl()}${m.link}` : ''}` });
}
// Envio genérico (usado também nos e-mails para clientes)
async function enviarEmailCru({ para, assunto, html, texto, responderPara }) {
  if (TESTE) { saidaTeste.push({ canal: 'email', para, assunto, html, responderPara }); return; }
  const c = await emailCfg();
  if (!c.pronto) throw new Error('E-mail de avisos não configurado.');
  const key = c.modo === 'servidor' ? 'sendmail|' + c.sendmail : [c.host, c.porta, c.usuario, crypto.createHash('sha256').update(c.senha).digest('hex')].join('|');
  if (!transporter || key !== transporterKey) {
    transporter = c.modo === 'servidor'
      ? require('nodemailer').createTransport({ sendmail: true, newline: 'unix', path: c.sendmail })
      : require('nodemailer').createTransport({ host: c.host, port: c.porta, secure: c.porta === 465, auth: { user: c.usuario, pass: c.senha }, connectionTimeout: 15000, greetingTimeout: 15000 });
    transporterKey = key;
  }
  await transporter.sendMail({ from: { name: c.nome, address: c.usuario }, to: para, subject: assunto, html, text: texto, replyTo: responderPara || undefined });
}
function emailHtml(m) {
  const linhas = esc(m.texto).replace(/\n/g, '<br>');
  return `<!doctype html><html><body style="margin:0;background:#f3f5f9;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#1d2433">
<div style="max-width:560px;margin:0 auto;padding:24px 16px"><div style="background:#fff;border-radius:14px;padding:24px;border-top:4px solid ${m.urgente ? '#ef4444' : '#ff7a1a'}">
<div style="font-size:12px;color:#7a8499;text-transform:uppercase;letter-spacing:.06em">Neon Gestão · alerta</div>
<h1 style="font-size:20px;margin:6px 0 14px">${esc(m.titulo)}</h1><div style="font-size:15px;line-height:1.6">${linhas}</div>
${m.link && baseUrl() ? `<a href="${esc(baseUrl() + m.link)}" style="display:inline-block;margin-top:20px;background:#ff7a1a;color:#fff;text-decoration:none;font-weight:700;padding:11px 20px;border-radius:10px">Abrir no painel</a>` : ''}
</div><div style="font-size:12px;color:#8a93a6;text-align:center;margin-top:14px">Você recebe este e-mail porque escolheu este alerta em Configurações → Alertas.</div></div></body></html>`;
}

let webpush = null;
async function vapid() {
  const c = await getIntegracao('push');
  if (c.public_key && c.private_key) return c;
  const wp = require('web-push');
  const k = wp.generateVAPIDKeys();
  const novo = { public_key: k.publicKey, private_key: k.privateKey, subject: 'mailto:contato@neonsistemas.com' };
  // Gera uma vez só: se a outra instância gerou ao mesmo tempo, fica a primeira que gravou
  await q('INSERT IGNORE INTO integracoes (rede, ativo, config) VALUES (?,1,?)', ['push', JSON.stringify(novo)]);
  const final = await getIntegracao('push');
  if (final.public_key && final.private_key) return final;
  await setIntegracao('push', novo);
  return novo;
}
async function enviarPush(usuarioId, m) {
  const subs = await q('SELECT * FROM push_inscricoes WHERE usuario_id=?', [usuarioId]);
  if (!subs.length) throw new Error('Nenhum aparelho com notificação ativada.');
  const payload = JSON.stringify({ title: m.titulo, body: String(m.texto || '').slice(0, 300), url: m.link || '/', tag: m.tag || m.evento, urgente: !!m.urgente });
  if (TESTE) { saidaTeste.push({ canal: 'push', para: usuarioId, payload: JSON.parse(payload), aparelhos: subs.length }); return; }
  if (!webpush) webpush = require('web-push');
  const v = await vapid();
  let ok = 0; const erros = [];
  for (const s of subs) {
    try {
      await webpush.sendNotification(parseJ(s.inscricao, {}), payload, { vapidDetails: { subject: v.subject, publicKey: v.public_key, privateKey: v.private_key }, TTL: 6 * 3600, urgency: m.urgente ? 'high' : 'normal', timeout: 15000 });
      ok++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await q('DELETE FROM push_inscricoes WHERE id=?', [s.id]); // aparelho desinscrito
      else erros.push(e.statusCode ? `push ${e.statusCode}` : e.message);
    }
  }
  if (!ok && erros.length) throw new Error(erros[0]);
}

// ---------- Destinatários ----------
function prefsDe(u) {
  const salvo = parseJ(u.alertas, null) || {};
  const out = {};
  for (const [ev, def] of Object.entries(EVENTOS)) out[ev] = Array.isArray(salvo[ev]) ? salvo[ev].filter((c) => CANAIS[c]) : def.padrao;
  return out;
}

// Envia um alerta para quem escolheu recebê-lo. `para`: lista de ids (eventos pessoais) ou nada (todos).
async function disparar(m, { para } = {}) {
  const g = await cfgGeral();
  if (!g.ativo && !m.forcar) return { enviados: 0, pulado: 'alertas desligados' };
  let users = await q('SELECT id, nome, email, alertas, telegram_chat_id FROM usuarios WHERE ativo=1');
  if (para) users = users.filter((u) => para.includes(u.id));
  const emailOk = TESTE || (await emailCfg()).pronto;
  const tgOk = TESTE || !!(await tgToken());
  let enviados = 0; const falhas = [];
  for (const u of users) {
    const canais = m.canais || prefsDe(u)[m.evento] || [];
    for (const c of canais) {
      try {
        if (c === 'telegram') { if (!u.telegram_chat_id || !tgOk) continue; await enviarTelegram(u.telegram_chat_id, m); }
        else if (c === 'email') { if (!u.email || !emailOk) continue; await enviarEmail(u.email, m); }
        else if (c === 'push') { const n = await one('SELECT COUNT(*) n FROM push_inscricoes WHERE usuario_id=?', [u.id]); if (!n.n) continue; await enviarPush(u.id, m); }
        else continue;
        enviados++;
      } catch (e) { falhas.push(`${u.nome} · ${CANAIS[c]}: ${e.message}`); }
    }
  }
  if (!m.semLog) {
    await q('INSERT INTO alertas_log (evento, titulo, texto, link, enviados, falhas) VALUES (?,?,?,?,?,?)',
      [m.evento, String(m.titulo).slice(0, 200), String(m.texto || '').slice(0, 5000), m.link || null, enviados, falhas.length ? falhas.join('\n').slice(0, 5000) : null]).catch(() => {});
  }
  return { enviados, falhas };
}

// ---------- Eventos imediatos (chamados) ----------
const PRIO = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente' };
async function aoSalvarChamado(row, old) {
  try {
    const cli = await one('SELECT nome_fantasia FROM clientes WHERE id=?', [row.cliente_id]);
    const base = { link: `/chamados/${row.id}`, tag: `chamado-${row.id}` };
    const desc = `${cli?.nome_fantasia || 'Cliente'} · prioridade ${PRIO[row.prioridade] || row.prioridade}${row.descricao ? `\n${String(row.descricao).slice(0, 400)}` : ''}`;
    const alta = ['alta', 'urgente'].includes(row.prioridade);
    if (!old) {
      if (await primeiraVez(`chamado:${row.id}:novo`)) await disparar({ ...base, evento: 'chamado_novo', titulo: `Chamado #${row.id}: ${row.titulo}`, texto: desc });
    }
    const subiu = alta && (!old || !['alta', 'urgente'].includes(old.prioridade));
    if (subiu && ['aberto', 'andamento', 'aguardando'].includes(row.status) && (await primeiraVez(`chamado:${row.id}:urgente:${row.prioridade}`))) {
      await disparar({ ...base, evento: 'chamado_urgente', urgente: row.prioridade === 'urgente', titulo: `Chamado ${PRIO[row.prioridade].toLowerCase()} #${row.id}: ${row.titulo}`, texto: desc });
    }
    if (row.responsavel_id && (!old || old.responsavel_id !== row.responsavel_id) && (await primeiraVez(`chamado:${row.id}:resp:${row.responsavel_id}:${row.updated_at}`))) {
      await disparar({ ...base, evento: 'chamado_atribuido', titulo: `Chamado #${row.id} agora é seu`, texto: `${row.titulo}\n${desc}` }, { para: [row.responsavel_id] });
    }
  } catch (e) { console.error('alertas chamado:', e.message); }
}

// ---------- Verificações periódicas ----------
async function verificar(agora = new Date()) {
  const g = await cfgGeral();
  const r = { offline: 0, voltou: 0, licencas: 0, cobrancas: 0, lembretes: 0, resumo: 0 };
  if (!g.ativo) return r;
  const hoje = todaySql();

  // Equipamentos sem sinal (uma vez por queda) e de volta
  const off = await q(`SELECT i.id, i.codigo, i.ultimo_contato, c.nome_fantasia cliente FROM instalacoes i JOIN clientes c ON c.id=i.cliente_id
    WHERE i.status='ativa' AND i.ultimo_contato IS NOT NULL AND i.alerta_offline_em IS NULL AND i.ultimo_contato < UTC_TIMESTAMP() - INTERVAL ? HOUR`, [g.offline_horas]);
  for (const i of off) {
    const u = await q('UPDATE instalacoes SET alerta_offline_em=UTC_TIMESTAMP() WHERE id=? AND alerta_offline_em IS NULL', [i.id]);
    if (u.affectedRows !== 1) continue;
    const horas = Math.round((Date.now() - new Date(i.ultimo_contato.replace(' ', 'T') + 'Z').getTime()) / 36e5);
    await disparar({ evento: 'equipamento_offline', urgente: true, link: `/instalacoes/${i.id}`, tag: `inst-${i.id}`, titulo: `Sem sinal: ${i.codigo}`, texto: `${i.cliente}\nÚltimo sinal há ${horas} h.` });
    r.offline++;
  }
  const volta = await q(`SELECT i.id, i.codigo, i.alerta_offline_em, c.nome_fantasia cliente FROM instalacoes i JOIN clientes c ON c.id=i.cliente_id
    WHERE i.alerta_offline_em IS NOT NULL AND i.ultimo_contato > i.alerta_offline_em`);
  for (const i of volta) {
    const u = await q('UPDATE instalacoes SET alerta_offline_em=NULL WHERE id=? AND alerta_offline_em=?', [i.id, i.alerta_offline_em]);
    if (u.affectedRows !== 1) continue;
    await disparar({ evento: 'equipamento_voltou', link: `/instalacoes/${i.id}`, tag: `inst-${i.id}`, titulo: `Voltou: ${i.codigo}`, texto: `${i.cliente}\nO equipamento voltou a dar sinal.` });
    r.voltou++;
  }

  // Chamados que estouraram o prazo de atendimento (SLA)
  const sla = await q(`SELECT ch.id, ch.titulo, ch.prioridade, ch.sla_limite, ch.responsavel_id, c.nome_fantasia cliente FROM chamados ch JOIN clientes c ON c.id=ch.cliente_id
    WHERE ch.status IN ('aberto','andamento') AND ch.sla_limite IS NOT NULL AND ch.sla_limite < UTC_TIMESTAMP() AND ch.sla_limite > UTC_TIMESTAMP() - INTERVAL 30 DAY`);
  for (const ch of sla) {
    if (!(await primeiraVez(`sla:${ch.id}:${ch.sla_limite}`))) continue;
    await disparar({ evento: 'chamado_sla', urgente: ['alta', 'urgente'].includes(ch.prioridade), link: `/chamados/${ch.id}`, tag: `chamado-${ch.id}`, titulo: `Fora do prazo: chamado #${ch.id}`, texto: `${ch.cliente} · ${ch.titulo}\nPrioridade ${PRIO[ch.prioridade] || ch.prioridade}.` });
    r.sla = (r.sla || 0) + 1;
  }

  // Licenças vencendo (7, 3 e 0 dias, por padrão)
  if (g.licenca_dias.length) {
    const lic = await q(`SELECT l.id, l.chave, l.vencimento, l.valor_mensal, DATEDIFF(l.vencimento, ?) dias, c.nome_fantasia cliente FROM licencas l
      LEFT JOIN clientes c ON c.id=l.cliente_id WHERE l.status='ativa' AND l.vencimento IS NOT NULL AND DATEDIFF(l.vencimento, ?) IN (?)`, [hoje, hoje, g.licenca_dias]);
    for (const l of lic) {
      if (!(await primeiraVez(`licenca:${l.id}:${l.vencimento}:${l.dias}`))) continue;
      const quando = l.dias === 0 ? 'vence hoje' : `vence em ${l.dias} dia${l.dias > 1 ? 's' : ''} (${dataBr(l.vencimento)})`;
      await disparar({ evento: 'licenca_vencendo', urgente: l.dias === 0, link: `/licencas/${l.id}`, titulo: `Licença ${quando}: ${l.cliente || l.chave}`, texto: `${l.chave}${l.valor_mensal ? ` · ${money(l.valor_mensal)}/mês` : ''}` });
      r.licencas++;
    }
  }

  // Cobranças que ficaram atrasadas
  const cob = await q(`SELECT cb.id, cb.competencia, cb.valor, cb.vencimento, c.nome_fantasia cliente, c.whatsapp FROM cobrancas cb JOIN clientes c ON c.id=cb.cliente_id
    WHERE cb.status='atrasado' AND cb.vencimento >= ? - INTERVAL 60 DAY`, [hoje]);
  for (const c of cob) {
    if (!(await primeiraVez(`cobranca:${c.id}:atrasada:${c.vencimento}`))) continue;
    await disparar({ evento: 'cobranca_atrasada', link: `/cobrancas/${c.id}`, titulo: `Cobrança atrasada: ${c.cliente}`, texto: `${c.competencia} · ${money(c.valor)} · venceu ${dataBr(c.vencimento)}${c.whatsapp ? `\nWhatsApp: ${c.whatsapp}` : ''}` });
    r.cobrancas++;
  }

  // Lembretes da agenda que chegaram na hora
  const lem = await q(`SELECT ct.id, ct.lembrete, ct.proximo_passo, ct.resumo, ct.usuario_id, ct.cliente_id, c.nome_fantasia cliente FROM contatos ct JOIN clientes c ON c.id=ct.cliente_id
    WHERE ct.concluido=0 AND ct.lembrete IS NOT NULL AND ct.lembrete <= UTC_TIMESTAMP() AND ct.lembrete > UTC_TIMESTAMP() - INTERVAL 2 DAY`);
  for (const l of lem) {
    if (!(await primeiraVez(`lembrete:${l.id}:${l.lembrete}`))) continue;
    await disparar({ evento: 'lembrete', link: `/clientes/${l.cliente_id}`, titulo: `Lembrete: ${l.cliente}`, texto: l.proximo_passo || String(l.resumo || '').slice(0, 300) }, l.usuario_id ? { para: [l.usuario_id] } : {});
    r.lembretes++;
  }

  // Resumo do dia (no horário escolhido, horário de Brasília)
  const horaBr = new Date(agora.getTime() - 3 * 3600e3).getUTCHours();
  if (horaBr >= g.resumo_hora && horaBr < g.resumo_hora + 3 && (await primeiraVez(`resumo:${hoje}`))) {
    const m = await montarResumo(g);
    await disparar(m);
    r.resumo = 1;
  }
  return r;
}

async function montarResumo(g) {
  const hoje = todaySql();
  const [s] = await q(`SELECT
    (SELECT COUNT(*) FROM chamados WHERE status IN ('aberto','andamento','aguardando')) chamados,
    (SELECT COUNT(*) FROM chamados WHERE status IN ('aberto','andamento','aguardando') AND prioridade IN ('alta','urgente')) urgentes,
    (SELECT COUNT(*) FROM chamados WHERE status IN ('aberto','andamento','aguardando') AND prazo IS NOT NULL AND prazo < ?) chamados_atrasados,
    (SELECT COUNT(*) FROM instalacoes WHERE status='ativa' AND ultimo_contato IS NOT NULL AND ultimo_contato < UTC_TIMESTAMP() - INTERVAL ? HOUR) offline,
    (SELECT COUNT(*) FROM cobrancas WHERE status='atrasado') atrasadas_n,
    (SELECT COALESCE(SUM(valor),0) FROM cobrancas WHERE status='atrasado') atrasadas_v,
    (SELECT COUNT(*) FROM cobrancas WHERE status='pendente' AND vencimento = ?) vencem_hoje_n,
    (SELECT COALESCE(SUM(valor),0) FROM cobrancas WHERE status='pendente' AND vencimento = ?) vencem_hoje_v,
    (SELECT COUNT(*) FROM licencas WHERE status='ativa' AND vencimento BETWEEN ? AND DATE_ADD(?, INTERVAL 7 DAY)) licencas,
    (SELECT COUNT(*) FROM contatos WHERE concluido=0 AND lembrete IS NOT NULL AND lembrete <= ?) lembretes`,
  [hoje, g.offline_horas, hoje, hoje, hoje, hoje, hoje + ' 23:59:59']);
  const linhas = [];
  if (s.chamados) linhas.push(`🛟 ${s.chamados} chamado(s) em aberto${s.urgentes ? ` — ${s.urgentes} alta/urgente` : ''}${s.chamados_atrasados ? ` — ${s.chamados_atrasados} com prazo vencido` : ''}`);
  if (s.offline) linhas.push(`📡 ${s.offline} equipamento(s) sem sinal`);
  if (s.atrasadas_n) linhas.push(`⚠️ ${s.atrasadas_n} cobrança(s) atrasada(s): ${money(s.atrasadas_v)}`);
  if (s.vencem_hoje_n) linhas.push(`💰 ${s.vencem_hoje_n} cobrança(s) vencem hoje: ${money(s.vencem_hoje_v)}`);
  if (s.licencas) linhas.push(`🔑 ${s.licencas} licença(s) vencem nos próximos 7 dias`);
  if (s.lembretes) linhas.push(`🔔 ${s.lembretes} lembrete(s) para hoje`);
  return { evento: 'resumo_diario', link: '/', titulo: `Resumo do dia ${dataBr(hoje)}`, texto: linhas.length ? linhas.join('\n') : '✅ Tudo em dia: nada pendente para hoje.' };
}

// Limpa chaves antigas (mantém 120 dias)
async function limpar() {
  await q('DELETE FROM alertas_enviados WHERE created_at < UTC_TIMESTAMP() - INTERVAL 120 DAY');
  await q('DELETE FROM alertas_log WHERE created_at < UTC_TIMESTAMP() - INTERVAL 180 DAY');
}

let rodando = false;
async function tick() {
  if (rodando) return; rodando = true;
  const conn = await getPool().getConnection();
  try {
    const [[lock]] = await conn.query("SELECT GET_LOCK('neon_alertas', 0) l");
    if (!lock.l) return;
    try { await verificar(); await limpar(); } finally { await conn.query("SELECT RELEASE_LOCK('neon_alertas')"); }
  } catch (e) { console.error('alertas:', e.message); } finally { conn.release(); rodando = false; }
}

function iniciar() {
  if (TESTE) return;
  setTimeout(tick, 20000);
  setInterval(tick, 5 * 60e3).unref();
}

// ---------- Vínculo com o Telegram (chamado pelo robô) ----------
// /start v_CODIGO → liga o chat ao usuário que gerou o código
async function vincularTelegram(texto, chatId) {
  const m = String(texto || '').match(/^\/start\s+v_([A-Za-z0-9]{8,24})/);
  if (!m) return null;
  const u = await one('SELECT id, nome FROM usuarios WHERE telegram_codigo=? AND ativo=1', [m[1]]);
  if (!u) return '⚠️ Código de vínculo inválido ou já usado. Gere outro no painel em Configurações → Alertas.';
  await q('UPDATE usuarios SET telegram_chat_id=?, telegram_codigo=NULL WHERE id=?', [String(chatId), u.id]);
  return `✅ Pronto, ${esc(u.nome.split(' ')[0])}! Este chat vai receber os alertas do Neon Gestão que você escolheu.`;
}

// ---------- Rotas ----------
const router = express.Router();
router.use(requireUser);

function canaisDisponiveis(u, pushN, emailPronto, tgPronto) {
  return {
    telegram: { configurado: tgPronto, vinculado: !!u.telegram_chat_id, chat: u.telegram_chat_id || null },
    email: { configurado: emailPronto, endereco: u.email },
    push: { configurado: true, aparelhos: pushN },
  };
}

router.get('/meus', wrap(async (req, res) => {
  const u = await one('SELECT * FROM usuarios WHERE id=?', [req.user.id]);
  const n = await one('SELECT COUNT(*) n FROM push_inscricoes WHERE usuario_id=?', [u.id]);
  const g = await cfgGeral();
  res.json({ eventos: EVENTOS, canais_nomes: CANAIS, prefs: prefsDe(u), canais: canaisDisponiveis(u, n.n, (await emailCfg()).pronto, !!(await tgToken())), ativo: g.ativo });
}));

router.post('/meus', wrap(async (req, res) => {
  const entrada = req.body.prefs || {};
  const out = {};
  for (const ev of Object.keys(EVENTOS)) out[ev] = Array.isArray(entrada[ev]) ? [...new Set(entrada[ev].filter((c) => CANAIS[c]))] : EVENTOS[ev].padrao;
  await q('UPDATE usuarios SET alertas=? WHERE id=?', [JSON.stringify(out), req.user.id]);
  res.json({ ok: true, prefs: out });
}));

router.post('/telegram/vincular', wrap(async (req, res) => {
  const token = await tgToken();
  if (!token) throw new HttpError(400, 'O robô do Telegram ainda não foi configurado (Marketing → Integrações → Telegram).');
  const codigo = crypto.randomBytes(9).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x').slice(0, 12);
  await q('UPDATE usuarios SET telegram_codigo=? WHERE id=?', [codigo, req.user.id]);
  if (!tgBot && !TESTE) {
    try { const r = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(10000) }); const j = await r.json(); tgBot = j.result?.username || null; } catch { /* sem nome */ }
  }
  const bot = TESTE ? 'robo_teste' : tgBot;
  res.json({ codigo, bot, link: bot ? `https://t.me/${bot}?start=v_${codigo}` : null });
}));

router.post('/telegram/chat', wrap(async (req, res) => {
  const chat = String(req.body.chat_id || '').trim();
  if (!/^-?\d{4,20}$/.test(chat)) throw new HttpError(400, 'Informe o ID numérico do chat do Telegram.');
  await q('UPDATE usuarios SET telegram_chat_id=?, telegram_codigo=NULL WHERE id=?', [chat, req.user.id]);
  res.json({ ok: true });
}));

router.delete('/telegram', wrap(async (req, res) => {
  await q('UPDATE usuarios SET telegram_chat_id=NULL, telegram_codigo=NULL WHERE id=?', [req.user.id]);
  res.json({ ok: true });
}));

router.get('/push/chave', wrap(async (req, res) => { res.json({ chave: (await vapid()).public_key }); }));

router.post('/push/inscrever', wrap(async (req, res) => {
  const s = req.body.inscricao;
  if (!s || typeof s.endpoint !== 'string' || !/^https:\/\//.test(s.endpoint) || !s.keys?.p256dh || !s.keys?.auth) throw new HttpError(400, 'Inscrição inválida.');
  const hash = crypto.createHash('sha256').update(s.endpoint).digest('hex');
  await q('INSERT INTO push_inscricoes (usuario_id, endpoint_hash, inscricao, aparelho) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE usuario_id=VALUES(usuario_id), inscricao=VALUES(inscricao), aparelho=VALUES(aparelho)',
    [req.user.id, hash, JSON.stringify({ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } }), String(req.headers['user-agent'] || '').slice(0, 200)]);
  res.json({ ok: true });
}));

router.post('/push/remover', wrap(async (req, res) => {
  if (req.body.endpoint) await q('DELETE FROM push_inscricoes WHERE endpoint_hash=? AND usuario_id=?', [crypto.createHash('sha256').update(String(req.body.endpoint)).digest('hex'), req.user.id]);
  else await q('DELETE FROM push_inscricoes WHERE usuario_id=?', [req.user.id]);
  res.json({ ok: true });
}));

// Teste: manda um alerta só para mim, em todos os canais ligados (ou um só)
router.post('/teste', wrap(async (req, res) => {
  const canais = req.body.canal && CANAIS[req.body.canal] ? [req.body.canal] : Object.keys(CANAIS);
  const r = await disparar({ evento: 'teste', forcar: true, semLog: true, canais, link: '/configuracoes?aba=alertas', titulo: 'Teste de alerta do Neon Gestão', texto: 'Se você recebeu isto, o canal está funcionando. 👍' }, { para: [req.user.id] });
  if (!r.enviados && !r.falhas.length) throw new HttpError(400, 'Nenhum canal pronto para você. Vincule o Telegram, ative o celular ou peça ao administrador para configurar o e-mail.');
  res.json(r);
}));

// ----- Administração -----
const maskSenha = (v) => (v ? '••••••' + String(v).slice(-2) : '');

router.get('/config', requireAdmin, wrap(async (req, res) => {
  const g = await cfgGeral();
  const e = await getIntegracao('email');
  const log = await q('SELECT id, evento, titulo, enviados, falhas, created_at FROM alertas_log ORDER BY id DESC LIMIT 60');
  res.json({ geral: { ativo: g.ativo, offline_horas: g.offline_horas, resumo_hora: g.resumo_hora, licenca_dias: g.licenca_dias.join(',') },
    email_modo: (await emailCfg()).modo,
    email: { host: e.host || 'smtp.hostinger.com', porta: e.porta || 465, usuario: e.usuario || EMAIL_PADRAO, senha: maskSenha(e.senha), nome: e.nome || 'Neon Gestão' },
    telegram_pronto: !!(await tgToken()), log, eventos: EVENTOS });
}));

router.post('/config', requireAdmin, wrap(async (req, res) => {
  const b = req.body || {};
  if (b.geral) {
    const g = b.geral; const set = {};
    if (g.ativo !== undefined) set.alertas_ativo = g.ativo ? '1' : '0';
    if (g.offline_horas !== undefined) set.offline_horas = String(Math.max(1, Math.min(168, Number(g.offline_horas) || 3)));
    if (g.resumo_hora !== undefined) set.resumo_hora = String(Math.max(0, Math.min(23, Number(g.resumo_hora) || 0)));
    if (g.licenca_dias !== undefined) set.licenca_dias = String(g.licenca_dias).split(/[,;\s]+/).filter((x) => /^\d{1,2}$/.test(x)).join(',');
    for (const [k, v] of Object.entries(set)) await q('INSERT INTO configuracoes (chave, valor) VALUES (?,?) ON DUPLICATE KEY UPDATE valor=VALUES(valor)', [k, v]);
  }
  if (b.email) {
    const atual = await getIntegracao('email');
    const e = b.email; const novo = { ...atual };
    for (const k of ['host', 'usuario', 'nome']) if (e[k] !== undefined) novo[k] = String(e[k]).trim().slice(0, 160);
    if (e.porta !== undefined) novo.porta = Number(e.porta) || 465;
    if (typeof e.senha === 'string' && e.senha && !e.senha.startsWith('••••••')) novo.senha = e.senha;
    if (novo.usuario && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(novo.usuario)) throw new HttpError(400, 'O usuário do e-mail precisa ser o endereço completo (ex.: contato@neonsistemas.com).');
    await setIntegracao('email', novo);
    transporter = null;
  }
  await audit(req, 'config', 'configuracoes', 'alertas', 'Alterou a configuração dos alertas');
  res.json({ ok: true });
}));

router.post('/email/testar', requireAdmin, wrap(async (req, res) => {
  const para = String(req.body.para || req.user.email).trim();
  const c = await emailCfg();
  if (!c.pronto && !TESTE) throw new HttpError(400, 'Preencha o e-mail e a senha da caixa de avisos e salve antes de testar.');
  if (c.modo === 'servidor') transporter = null;
  try {
    await enviarEmail(para, { titulo: 'Teste do e-mail de avisos', texto: `O envio de e-mails do Neon Gestão está funcionando.\nRemetente: ${c.usuario}\nEnvio: ${c.modo === 'servidor' ? 'pelo servidor da hospedagem (sem senha da caixa)' : 'pela caixa de e-mail (SMTP)'}`, link: '/configuracoes?aba=alertas' });
  } catch (e) { throw new HttpError(400, 'Não consegui enviar: ' + e.message); }
  res.json({ ok: true, para, modo: c.modo });
}));

router.post('/rodar', requireAdmin, wrap(async (req, res) => {
  res.json({ data: await verificar(req.body.agora ? new Date(req.body.agora) : new Date()) });
}));

router.post('/resumo/enviar', requireAdmin, wrap(async (req, res) => {
  const m = await montarResumo(await cfgGeral());
  res.json(await disparar({ ...m, forcar: true }, { para: [req.user.id] }));
}));

if (TESTE) {
  router.get('/_teste/saida', (req, res) => res.json({ data: saidaTeste }));
  router.post('/_teste/limpar', (req, res) => { saidaTeste.length = 0; res.json({ ok: true }); });
}

module.exports = { router, migrate, iniciar, tick, verificar, disparar, aoSalvarChamado, vincularTelegram, EVENTOS, enviarEmailCru, emailCfg, primeiraVez };
