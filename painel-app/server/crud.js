const express = require('express');
const bcrypt = require('bcryptjs');
const { q, one } = require('./db');
const { ENTITIES } = require('./entities');
const { requireUser, canWrite, canDelete } = require('./auth');
const { audit, licenseKey, todaySql, nowSql, wrap, HttpError } = require('./util');

const router = express.Router();
router.use(requireUser);

// ---------- Helpers ----------
function getEntity(name, user) {
  const e = ENTITIES[name];
  if (!e) throw new HttpError(404, 'Tabela não encontrada.');
  if (e.adminOnly && user.funcao !== 'admin' && name !== 'usuarios') throw new HttpError(403, 'Sem permissão.');
  return e;
}
const id_ = (v) => (v === '' || v == null ? null : Number(v));

function parseMoney(v) {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') return v;
  let s = String(v).replace(/[^\d,.-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}
function parseDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}
function parseDateTime(v) {
  if (!v) return null;
  if (v === 'now') return nowSql();
  const d = new Date(v);
  if (isNaN(d)) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function coerce(field, key, v) {
  if (v === undefined) return undefined;
  switch (field.type) {
    case 'int': { if (v === '' || v == null) return null; const n = parseInt(v, 10); if (!Number.isFinite(n)) throw new HttpError(400, `${field.label}: número inválido.`); return n; }
    case 'money': return parseMoney(v);
    case 'date': return parseDate(v);
    case 'datetime': return parseDateTime(v);
    case 'month': { if (!v) return null; const m = String(v).match(/^(\d{4})-(\d{2})/) || String(v).match(/^(\d{2})\/(\d{4})/); if (!m) throw new HttpError(400, `${field.label}: use o formato AAAA-MM.`); return m[1].length === 4 ? `${m[1]}-${m[2]}` : `${m[2]}-${m[1]}`; }
    case 'bool': return v === true || v === 1 || v === '1' || v === 'true' || v === 'sim' || v === 'Sim' ? 1 : 0;
    case 'relation': return id_(v);
    case 'select': {
      if (v === '' || v == null) return null;
      const s = String(v);
      const o = field.options.find((o) => o.value === s || o.label.toLowerCase() === s.toLowerCase());
      if (!o) throw new HttpError(400, `${field.label}: opção inválida (${s}).`);
      return o.value;
    }
    case 'multiselect': {
      let arr = v; if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch { arr = arr.split(/[,;]/); } }
      arr = (Array.isArray(arr) ? arr : []).map((x) => String(x).trim()).filter((x) => field.options.some((o) => o.value === x));
      return JSON.stringify([...new Set(arr)]);
    }
    case 'cron': {
      const s = String(v || '').trim().replace(/\s+/g, ' ');
      try { require('./cron').nextRun(s); } catch (e) { throw new HttpError(400, `${field.label}: ${e.message}`); }
      return s;
    }
    case 'files': return JSON.stringify(Array.isArray(v) ? v.filter(Boolean).slice(0, 50) : []);
    case 'json': return v == null || v === '' ? null : (typeof v === 'string' ? v : JSON.stringify(v));
    case 'file': return v ? String(v).slice(0, 36) : null;
    default: {
      if (v == null) return null;
      let s = String(v).trim();
      if (field.upper) s = s.toUpperCase().replace(/\s+/g, '-');
      if (field.lower) s = s.toLowerCase();
      if (field.max) s = s.slice(0, field.max);
      return s === '' ? null : s;
    }
  }
}

// Monta o objeto a gravar a partir do corpo da requisição
function buildData(e, body, isCreate) {
  const data = {};
  for (const [key, f] of Object.entries(e.fields)) {
    if (f.readonly || f.virtual) continue;
    let v = body[key];
    if (v === undefined && isCreate && f.default !== undefined && f.default !== 'me') v = f.default;
    const c = coerce(f, key, v);
    if (c !== undefined) data[key] = c;
  }
  if (isCreate) {
    for (const [key, f] of Object.entries(e.fields)) {
      if (f.required && !f.readonly && (data[key] == null || data[key] === '')) throw new HttpError(400, `Preencha o campo "${f.label}".`);
    }
  } else {
    for (const [key, v] of Object.entries(data)) {
      const f = e.fields[key];
      if (f.required && (v == null || v === '')) throw new HttpError(400, `Preencha o campo "${f.label}".`);
    }
  }
  return data;
}

// ---------- Regras de negócio ----------
const hooks = {
  clientes: {
    async before(data, old) {
      if (data.status === 'ativo' && !(old && old.cliente_desde) && !data.cliente_desde) data.cliente_desde = todaySql();
    },
  },
  licencas: {
    async before(data, old) {
      if (!old) data.chave = licenseKey();
      const instId = data.instalacao_id ?? (old && old.instalacao_id);
      if (instId) {
        const inst = await one('SELECT cliente_id FROM instalacoes WHERE id=?', [instId]);
        if (!inst) throw new HttpError(400, 'Instalação não encontrada.');
        data.cliente_id = inst.cliente_id;
      }
    },
  },
  versoes: {
    async before(data, old) {
      const arq = data.arquivo ?? (old && old.arquivo);
      if (arq && !data.sha256 && !(old && old.sha256 && data.arquivo === undefined)) {
        const f = await one('SELECT sha256 FROM arquivos WHERE id=?', [arq]);
        if (f && f.sha256) data.sha256 = f.sha256;
      }
      if (data.sha256) data.sha256 = String(data.sha256).toLowerCase().replace(/[^0-9a-f]/g, '');
      const prod = data.produto_id ?? old?.produto_id, num = data.numero ?? old?.numero, canal = data.canal ?? old?.canal;
      const dup = await one('SELECT id FROM versoes WHERE produto_id=? AND numero=? AND canal=? AND id<>?', [prod, num, canal, old ? old.id : 0]);
      if (dup) throw new HttpError(400, `Já existe a versão ${num} desse produto nesse canal.`);
      if (data.publicada === 1 && !arq) throw new HttpError(400, 'Envie o arquivo antes de publicar a versão.');
    },
  },
  chamados: {
    async before(data, old) {
      const st = data.status;
      await require('./chamados').definirSla(data, old);
      if (st && ['resolvido', 'fechado'].includes(st) && !(old && old.resolvido_em)) data.resolvido_em = nowSql();
      if (st && ['aberto', 'andamento', 'aguardando'].includes(st)) data.resolvido_em = null;
      if (data.instalacao_id) {
        const inst = await one('SELECT cliente_id FROM instalacoes WHERE id=?', [data.instalacao_id]);
        const cli = data.cliente_id ?? old?.cliente_id;
        if (inst && cli && inst.cliente_id !== cli) throw new HttpError(400, 'Essa instalação é de outro cliente.');
      }
    },
    async after(row, old) {
      require('./alertas').aoSalvarChamado(row, old); // não espera: os avisos saem em segundo plano
      require('./chamados').aposSalvar(row, old);
    },
  },
  cobrancas: {
    async before(data, old) {
      const st = data.status ?? old?.status;
      if (st === 'pago' && !data.pago_em && !(old && old.pago_em)) data.pago_em = todaySql();
      if (data.status && data.status !== 'pago') data.pago_em = data.pago_em ?? null;
      const venc = data.vencimento ?? old?.vencimento;
      if (st === 'pendente' && venc && venc < todaySql()) data.status = 'atrasado';
      if (st === 'atrasado' && venc && venc >= todaySql()) data.status = 'pendente';
    },
    async after(row, old) {
      require('./asaas').aoSalvarCobranca(row, old).catch(() => {}); // leva ao Asaas as mudanças feitas aqui
    },
  },
  contatos: {
    async before(data, old, req) {
      if (!old && !data.usuario_id) data.usuario_id = req.user.id;
    },
    async after(row) {
      await q('UPDATE clientes SET ultimo_contato=(SELECT MAX(data) FROM contatos WHERE cliente_id=?) WHERE id=?', [row.cliente_id, row.cliente_id]);
    },
  },
  usuarios: {
    async before(data, old, req, body) {
      if (req.user.funcao !== 'admin') throw new HttpError(403, 'Somente administradores gerenciam a equipe.');
      if (body.senha) {
        if (String(body.senha).length < 8) throw new HttpError(400, 'A senha precisa ter pelo menos 8 caracteres.');
        data.senha_hash = await bcrypt.hash(String(body.senha), 11);
      } else if (!old) throw new HttpError(400, 'Defina uma senha inicial.');
      if (old) {
        const tirandoAdmin = old.funcao === 'admin' && ((data.funcao && data.funcao !== 'admin') || data.ativo === 0);
        if (tirandoAdmin) {
          const c = await one("SELECT COUNT(*) n FROM usuarios WHERE funcao='admin' AND ativo=1");
          if (c.n <= 1) throw new HttpError(400, 'Precisa existir pelo menos um administrador ativo.');
        }
        if (data.senha_hash || (data.funcao && data.funcao !== old.funcao) || data.ativo === 0) {
          data.sessao_versao = old.sessao_versao + 1;
        }
      }
    },
  },
  produtos: {},
  instalacoes: {},
  posts: {
    async before(data, old) {
      const titulo = data.titulo ?? old?.titulo;
      if (titulo && (!old || data.titulo !== undefined)) {
        data.slug = String(titulo).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 180) + '-' + Date.now().toString(36).slice(-4);
      }
      const st = data.status ?? old?.status;
      const quando = data.agendado_para !== undefined ? data.agendado_para : old?.agendado_para;
      if (st === 'agendado' && !quando) throw new HttpError(400, 'Defina a data e hora para agendar.');
    },
  },
  tarefas: {
    async before(data, old, req) {
      if (req.user.funcao !== 'admin') throw new HttpError(403, 'Somente administradores.');
      const cron = data.cron ?? old?.cron;
      if (cron) data.proxima_execucao = require('./cron').nextRun(cron);
    },
  },
};

function stripSecrets(name, row) {
  if (!row) return row;
  if (name === 'usuarios') { delete row.senha_hash; delete row.totp_secret; delete row.sessao_versao; delete row.telegram_codigo; delete row.alertas; }
  if (name === 'instalacoes') { delete row.token_hash; }
  for (const k of ['anexos', 'detalhes', 'redes', 'textos', 'resultado', 'parametros', 'arte']) {
    if (typeof row[k] === 'string') { try { row[k] = JSON.parse(row[k]); } catch { /* mantém */ } }
  }
  return row;
}

// Rótulos legíveis das relações (ex.: cliente_id → "Motel Paraíso")
async function relationLabels(e, rows) {
  const labels = {};
  for (const [key, f] of Object.entries(e.fields)) {
    if (f.type !== 'relation') continue;
    const ids = [...new Set(rows.map((r) => r[key]).filter((v) => v != null))];
    if (!ids.length) continue;
    const t = ENTITIES[f.entity];
    const found = await q(`SELECT id, ${t.title} AS label FROM ${t.table} WHERE id IN (?)`, [ids]);
    labels[key] = Object.fromEntries(found.map((r) => [r.id, r.label]));
  }
  // Arquivos
  const fileIds = [];
  for (const [key, f] of Object.entries(e.fields)) {
    if (f.type === 'file') rows.forEach((r) => r[key] && fileIds.push(r[key]));
    if (f.type === 'files') rows.forEach((r) => { let a = r[key]; if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = []; } } (a || []).forEach((x) => fileIds.push(x)); });
  }
  if (fileIds.length) {
    const fs = await q('SELECT id, nome, tamanho, mime, sha256 FROM arquivos WHERE id IN (?)', [[...new Set(fileIds)]]);
    labels.__arquivos = Object.fromEntries(fs.map((f) => [f.id, f]));
  }
  return labels;
}

// Filtros da lista: f_campo=a,b  de_campo=  ate_campo=  q=busca
function buildWhere(e, query) {
  const where = []; const params = [];
  for (const [k, v] of Object.entries(query)) {
    if (v === '' || v == null) continue;
    let m;
    if ((m = k.match(/^f_(\w+)$/)) && (e.fields[m[1]] || m[1] === 'id')) {
      const vals = String(v).split(',');
      if (vals.includes('__null')) { where.push(`\`${m[1]}\` IS NULL`); continue; }
      where.push(`\`${m[1]}\` IN (?)`); params.push(vals);
    } else if ((m = k.match(/^de_(\w+)$/)) && (e.fields[m[1]] || m[1] === 'created_at')) {
      where.push(`\`${m[1]}\` >= ?`); params.push(v);
    } else if ((m = k.match(/^ate_(\w+)$/)) && (e.fields[m[1]] || m[1] === 'created_at')) {
      where.push(`\`${m[1]}\` <= ?`); params.push(v.length === 10 && e.fields[m[1]]?.type === 'datetime' ? v + ' 23:59:59' : v);
    }
  }
  if (query.q && e.search) {
    const term = `%${String(query.q).trim()}%`;
    const digits = String(query.q).replace(/\D/g, '');
    const parts = e.search.map((c) => `\`${c}\` LIKE ?`);
    e.search.forEach(() => params.push(term));
    if (digits.length >= 4) {
      for (const c of e.search.filter((c) => ['cnpj', 'telefone', 'whatsapp'].includes(c))) {
        parts.push(`REGEXP_REPLACE(\`${c}\`, '[^0-9]', '') LIKE ?`); params.push(`%${digits}%`);
      }
    }
    if (/^\d+$/.test(String(query.q).trim())) { parts.push('id = ?'); params.push(Number(query.q)); }
    where.push(`(${parts.join(' OR ')})`);
  }
  return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

function buildOrder(e, sort) {
  const s = sort || e.defaultSort || '-id';
  const desc = s.startsWith('-');
  const col = desc ? s.slice(1) : s;
  if (!(e.fields[col] || ['id', 'created_at', 'updated_at'].includes(col))) return 'ORDER BY id DESC';
  return `ORDER BY \`${col}\` ${desc ? 'DESC' : 'ASC'}, id DESC`;
}

// ---------- Rotas ----------
router.get('/meta', (req, res) => {
  res.json({ entities: ENTITIES, user: { id: req.user.id, funcao: req.user.funcao } });
});

// Opções para campos de relação (com busca)
router.get('/:entity/opcoes', wrap(async (req, res) => {
  const e = getEntity(req.params.entity, req.user);
  const params = []; const where = [];
  if (req.query.q) { where.push(`${e.title} LIKE ?`); params.push(`%${req.query.q}%`); }
  if (req.query.cliente_id && e.fields.cliente_id) { where.push('cliente_id=?'); params.push(Number(req.query.cliente_id)); }
  if (e.key === 'usuarios') where.push('ativo=1');
  const extra = e.key === 'instalacoes' ? ', produto_id, cliente_id' : e.key === 'produtos' ? ', preco_padrao' : e.key === 'licencas' ? ', valor_mensal, cliente_id' : '';
  const rows = await q(`SELECT id, ${e.title} AS label${extra} FROM ${e.table} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${e.title} LIMIT 50`, params);
  res.json({ data: rows });
}));

router.get('/:entity', wrap(async (req, res) => {
  const e = getEntity(req.params.entity, req.user);
  const { sql, params } = buildWhere(e, req.query);
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const extra = e.key === 'instalacoes' ? ', (ultimo_contato > UTC_TIMESTAMP() - INTERVAL 2 HOUR) AS online' : '';
  const rows = await q(`SELECT *${extra} FROM ${e.table} ${sql} ${buildOrder(e, req.query.sort)} LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
  const [{ n }] = await q(`SELECT COUNT(*) n FROM ${e.table} ${sql}`, params);
  rows.forEach((r) => stripSecrets(e.key, r));
  res.json({ data: rows, total: n, page, limit, labels: await relationLabels(e, rows) });
}));

router.get('/:entity/exportar', wrap(async (req, res) => {
  const e = getEntity(req.params.entity, req.user);
  const { sql, params } = buildWhere(e, req.query);
  const rows = await q(`SELECT * FROM ${e.table} ${sql} ${buildOrder(e, req.query.sort)} LIMIT 100000`, params);
  rows.forEach((r) => stripSecrets(e.key, r));
  const labels = await relationLabels(e, rows);
  const cols = ['id', ...Object.keys(e.fields).filter((k) => !e.fields[k].virtual && !e.fields[k].hidden)];
  const esc = (v) => { const s = v == null ? '' : String(v); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const fmt = (k, v) => {
    const f = e.fields[k]; if (!f || v == null) return v;
    if (f.type === 'select') return f.options.find((o) => o.value === v)?.label ?? v;
    if (f.type === 'relation') return labels[k]?.[v] ?? v;
    if (f.type === 'bool') return v ? 'Sim' : 'Não';
    if (f.type === 'money') return Number(v).toFixed(2).replace('.', ',');
    if (f.type === 'file') return labels.__arquivos?.[v]?.nome ?? v;
    if (f.type === 'files' || f.type === 'json') return JSON.stringify(v);
    return v;
  };
  const head = cols.map((k) => esc(k === 'id' ? 'ID' : e.fields[k].label)).join(';');
  const body = rows.map((r) => cols.map((k) => esc(fmt(k, r[k]))).join(';')).join('\r\n');
  await audit(req, 'exportar', e.key, null, `Exportou ${rows.length} registros de ${e.label}`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${e.key}-${todaySql()}.csv"`);
  res.send('﻿' + head + '\r\n' + body);
}));

router.post('/:entity/importar', wrap(async (req, res) => {
  const e = getEntity(req.params.entity, req.user);
  if (!canWrite(req.user) || e.readonly || e.key === 'usuarios') throw new HttpError(403, 'Sem permissão para importar aqui.');
  const rows = Array.isArray(req.body.rows) ? req.body.rows.slice(0, 5000) : [];
  // Aceita cabeçalho pelo nome do campo ou pelo rótulo
  const byLabel = Object.fromEntries(Object.entries(e.fields).map(([k, f]) => [f.label.toLowerCase(), k]));
  let ok = 0; const erros = [];
  for (let i = 0; i < rows.length; i++) {
    try {
      const raw = {};
      for (const [h, v] of Object.entries(rows[i])) {
        const key = e.fields[h] ? h : byLabel[String(h).trim().toLowerCase()];
        if (!key) continue;
        const f = e.fields[key];
        if (f.type === 'relation' && v && !/^\d+$/.test(String(v))) {
          const t = ENTITIES[f.entity];
          const found = await one(`SELECT id FROM ${t.table} WHERE ${t.title}=? LIMIT 1`, [String(v).trim()]);
          raw[key] = found ? found.id : null;
        } else if (f.type === 'bool') raw[key] = /^(sim|s|1|true|x)$/i.test(String(v).trim());
        else raw[key] = v;
      }
      await createRow(e, raw, req, true);
      ok++;
    } catch (err) { erros.push({ linha: i + 2, erro: err.message }); }
  }
  await audit(req, 'importar', e.key, null, `Importou ${ok} registros em ${e.label}`);
  res.json({ importados: ok, erros: erros.slice(0, 50) });
}));

router.get('/:entity/:id', wrap(async (req, res) => {
  const e = getEntity(req.params.entity, req.user);
  const extra = e.key === 'instalacoes' ? ', (ultimo_contato > UTC_TIMESTAMP() - INTERVAL 2 HOUR) AS online' : '';
  const row = await one(`SELECT *${extra} FROM ${e.table} WHERE id=?`, [Number(req.params.id)]);
  if (!row) throw new HttpError(404, 'Registro não encontrado.');
  const hasToken = e.key === 'instalacoes' ? !!row.token_hash : undefined;
  stripSecrets(e.key, row);
  if (hasToken !== undefined) row.tem_token = hasToken;
  res.json({ data: row, labels: await relationLabels(e, [row]) });
}));

async function createRow(e, body, req, silent) {
  const data = buildData(e, body, true);
  if (hooks[e.key]?.before) await hooks[e.key].before(data, null, req, body);
  await checkUnique(e, data, null);
  const cols = Object.keys(data);
  const r = await q(`INSERT INTO ${e.table} (${cols.map((c) => `\`${c}\``).join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((c) => data[c]));
  const row = await one(`SELECT * FROM ${e.table} WHERE id=?`, [r.insertId]);
  if (hooks[e.key]?.after) await hooks[e.key].after(row, null);
  if (!silent) await audit(req, 'criar', e.key, row.id, `${e.singular}: ${row[e.title] ?? row.id}`);
  return row;
}

async function checkUnique(e, data, id) {
  for (const [k, f] of Object.entries(e.fields)) {
    if (f.unique && data[k] != null) {
      const dup = await one(`SELECT id FROM ${e.table} WHERE \`${k}\`=? AND id<>?`, [data[k], id || 0]);
      if (dup) throw new HttpError(400, `Já existe um registro com ${f.label.toLowerCase()} "${data[k]}".`);
    }
  }
}

router.post('/:entity', wrap(async (req, res) => {
  const e = getEntity(req.params.entity, req.user);
  if (!canWrite(req.user) || e.readonly) throw new HttpError(403, 'Você não tem permissão para cadastrar.');
  const row = await createRow(e, req.body, req);
  res.status(201).json({ data: stripSecrets(e.key, row) });
}));

router.patch('/:entity/:id', wrap(async (req, res) => {
  const e = getEntity(req.params.entity, req.user);
  if (!canWrite(req.user) || e.readonly) throw new HttpError(403, 'Você não tem permissão para editar.');
  const id = Number(req.params.id);
  const old = await one(`SELECT * FROM ${e.table} WHERE id=?`, [id]);
  if (!old) throw new HttpError(404, 'Registro não encontrado.');
  const data = buildData(e, req.body, false);
  if (hooks[e.key]?.before) await hooks[e.key].before(data, old, req, req.body);
  await checkUnique(e, data, id);
  const cols = Object.keys(data);
  if (cols.length) await q(`UPDATE ${e.table} SET ${cols.map((c) => `\`${c}\`=?`).join(',')} WHERE id=?`, [...cols.map((c) => data[c]), id]);
  const row = await one(`SELECT * FROM ${e.table} WHERE id=?`, [id]);
  if (hooks[e.key]?.after) await hooks[e.key].after(row, old);
  const mudancas = {};
  for (const c of cols) if (c !== 'senha_hash' && String(old[c] ?? '') !== String(row[c] ?? '')) mudancas[c] = [old[c], row[c]];
  if (data.senha_hash) mudancas.senha = ['***', '***'];
  if (Object.keys(mudancas).length) await audit(req, 'editar', e.key, id, `${e.singular}: ${row[e.title] ?? id}`, mudancas);
  res.json({ data: stripSecrets(e.key, row) });
}));

router.delete('/:entity/:id', wrap(async (req, res) => {
  const e = getEntity(req.params.entity, req.user);
  if (!canDelete(req.user)) throw new HttpError(403, 'Somente administradores podem apagar.');
  const id = Number(req.params.id);
  const old = await one(`SELECT * FROM ${e.table} WHERE id=?`, [id]);
  if (!old) throw new HttpError(404, 'Registro não encontrado.');
  if (e.key === 'usuarios') {
    if (id === req.user.id) throw new HttpError(400, 'Você não pode apagar o próprio usuário.');
    if (old.funcao === 'admin') {
      const c = await one("SELECT COUNT(*) n FROM usuarios WHERE funcao='admin' AND ativo=1");
      if (c.n <= 1) throw new HttpError(400, 'Precisa existir pelo menos um administrador.');
    }
  }
  // Bloqueia apagar registros com dependentes
  const deps = {
    clientes: [['instalacoes', 'cliente_id', 'instalações'], ['chamados', 'cliente_id', 'chamados'], ['cobrancas', 'cliente_id', 'cobranças']],
    instalacoes: [['licencas', 'instalacao_id', 'licenças']],
    produtos: [['instalacoes', 'produto_id', 'instalações'], ['versoes', 'produto_id', 'versões']],
  }[e.key] || [];
  for (const [t, col, nome] of deps) {
    const c = await one(`SELECT COUNT(*) n FROM ${t} WHERE ${col}=?`, [id]);
    if (c.n > 0 && !req.query.forcar) throw new HttpError(409, `Este registro tem ${c.n} ${nome} ligados. Apague-os antes, ou confirme para apagar tudo junto.`);
  }
  if (req.query.forcar) {
    if (e.key === 'clientes') {
      const insts = await q('SELECT id FROM instalacoes WHERE cliente_id=?', [id]);
      if (insts.length) await q('DELETE FROM licencas WHERE instalacao_id IN (?)', [insts.map((i) => i.id)]);
      for (const t of ['instalacoes', 'chamados', 'cobrancas', 'contatos']) await q(`DELETE FROM ${t} WHERE cliente_id=?`, [id]);
    }
    if (e.key === 'instalacoes') await q('DELETE FROM licencas WHERE instalacao_id=?', [id]);
  } else if (e.key === 'clientes') {
    await q('DELETE FROM contatos WHERE cliente_id=?', [id]);
  }
  await q(`DELETE FROM ${e.table} WHERE id=?`, [id]);
  await audit(req, 'apagar', e.key, id, `${e.singular}: ${old[e.title] ?? id}`);
  res.json({ ok: true });
}));

module.exports = { router, createRow };
