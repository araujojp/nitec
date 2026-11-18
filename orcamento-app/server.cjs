// Gerador de orçamento — Neon Sistemas
// Entrada para a hospedagem Hostinger (Node.js). Banco MySQL. Sem dependências nativas.
'use strict';
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const ExcelJS = require('exceljs');
const docx = require('docx');

const PORT = process.env.PORT || 3000;
const SECRET = process.env.SECRET || crypto.randomBytes(32).toString('hex');
const MEM_SENHA = process.env.MEMORIA_SENHA || '';
const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self'");
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// ---------- banco ----------
let pool = null;
function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE,
      waitForConnections: true, connectionLimit: 5, charset: 'utf8mb4', dateStrings: true,
    });
  }
  return pool;
}
const q = async (sql, params = []) => (await getPool().query(sql, params))[0];

async function migrate() {
  await q(`CREATE TABLE IF NOT EXISTS orcamentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    token_hash CHAR(64) NOT NULL,
    titulo VARCHAR(200) NOT NULL,
    cliente VARCHAR(200) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'rascunho',
    total DECIMAL(14,2) NULL,
    versao INT NOT NULL DEFAULT 1,
    dados LONGTEXT NOT NULL,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await q(`CREATE TABLE IF NOT EXISTS orcamento_versoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    orcamento_id INT NOT NULL,
    versao INT NOT NULL,
    status VARCHAR(20) NOT NULL,
    total DECIMAL(14,2) NULL,
    dados LONGTEXT NOT NULL,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX (orcamento_id),
    CONSTRAINT fk_ov FOREIGN KEY (orcamento_id) REFERENCES orcamentos(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await migratePrecos();
}

// ---------- tabela de preços (editável no modo admin) ----------
const { PRECOS, NIVEIS } = require('./precos.cjs');
async function migratePrecos() {
  await q(`CREATE TABLE IF NOT EXISTS precos (
    chave VARCHAR(80) PRIMARY KEY,
    grupo VARCHAR(80) NOT NULL,
    rotulo VARCHAR(200) NOT NULL,
    valor DECIMAL(12,2) NULL,
    unidade VARCHAR(30) NOT NULL,
    fonte VARCHAR(30) NOT NULL,
    nota VARCHAR(400) NULL,
    atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  for (const [grupo, chave, rotulo, valor, unidade, fonte, nota] of PRECOS) {
    // INSERT IGNORE: não sobrescreve valores que o admin já alterou
    await q('INSERT IGNORE INTO precos (chave, grupo, rotulo, valor, unidade, fonte, nota) VALUES (?,?,?,?,?,?,?)',
      [chave, grupo, rotulo, valor, unidade, fonte, nota]);
  }
}

// ---------- utilidades ----------
const sha = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const sane = (d) => {
  if (!d || typeof d !== 'object') throw new Error('Dados inválidos.');
  const s = JSON.stringify(d);
  if (s.length > 900_000) throw new Error('Orçamento grande demais.');
  return d;
};
const totalDe = (d) => {
  const itens = Array.isArray(d.itens) ? d.itens : [];
  let sub = 0;
  for (const i of itens) {
    if (i.status !== 'precisa' || i.tipo === 'mensal') continue;
    const v = Number(i.valorUnit), n = Number(i.qtd);
    if (Number.isFinite(v) && Number.isFinite(n)) sub += v * n;
  }
  const desc = sub * (Number(d.descontoPct || 0) / 100);
  const imp = (sub - desc) * (Number(d.impostoPct || 0) / 100);
  return Math.round((sub - desc + imp) * 100) / 100;
};
const fmtBRL = (v) => (v == null || v === '' || !Number.isFinite(Number(v))) ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ---------- memória (senha) ----------
let MEM_HASH = null;
(async () => { if (MEM_SENHA) MEM_HASH = await bcrypt.hash(MEM_SENHA, 12); })();
const memLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 6, standardHeaders: true, legacyHeaders: false,
  message: { erro: 'Muitas tentativas. Aguarde 15 minutos.' } });
function exigeMemoria(req, res, next) {
  try {
    const p = jwt.verify(req.cookies && req.cookies.mem, SECRET);
    if (p && p.m === 1) return next();
  } catch (e) { /* sem sessão */ }
  res.status(401).json({ erro: 'Acesso restrito à memória. Informe a senha.' });
}

// ---------- API ----------
app.post('/api/memoria/entrar', memLimiter, async (req, res) => {
  const senha = String((req.body && req.body.senha) || '');
  if (!MEM_HASH) return res.status(503).json({ erro: 'Memória indisponível (senha não configurada).' });
  const ok = await bcrypt.compare(senha, MEM_HASH);
  if (!ok) return res.status(401).json({ erro: 'Senha incorreta.' });
  const t = jwt.sign({ m: 1 }, SECRET, { expiresIn: '12h' });
  res.cookie('mem', t, { httpOnly: true, secure: true, sameSite: 'strict', maxAge: 12 * 3600 * 1000 });
  res.json({ ok: true });
});
app.post('/api/memoria/sair', (req, res) => { res.clearCookie('mem'); res.json({ ok: true }); });

// criar orçamento (público): devolve id + token de edição (guardar com você)
app.post('/api/orcamentos', async (req, res) => {
  try {
    const d = sane(req.body.dados);
    const token = crypto.randomBytes(18).toString('base64url');
    const titulo = String(d.titulo || 'Orçamento sem título').slice(0, 200);
    const cliente = String((d.cliente && d.cliente.nome) || '').slice(0, 200);
    const total = totalDe(d);
    const r = await q('INSERT INTO orcamentos (token_hash, titulo, cliente, status, total, versao, dados) VALUES (?,?,?,?,?,?,?)',
      [sha(token), titulo, cliente, d.status || 'rascunho', total, 1, JSON.stringify(d)]);
    const id = r.insertId;
    await q('INSERT INTO orcamento_versoes (orcamento_id, versao, status, total, dados) VALUES (?,?,?,?,?)', [id, 1, d.status || 'rascunho', total, JSON.stringify(d)]);
    res.json({ id, token });
  } catch (e) { res.status(400).json({ erro: e.message }); }
});

// atualizar (exige o token de edição)
app.put('/api/orcamentos/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const token = String(req.headers['x-token'] || '');
    const rows = await q('SELECT token_hash, versao FROM orcamentos WHERE id=?', [id]);
    if (!rows.length || rows[0].token_hash !== sha(token)) return res.status(403).json({ erro: 'Não autorizado.' });
    const d = sane(req.body.dados);
    const nv = rows[0].versao + 1;
    const total = totalDe(d);
    const titulo = String(d.titulo || 'Orçamento sem título').slice(0, 200);
    const cliente = String((d.cliente && d.cliente.nome) || '').slice(0, 200);
    await q('UPDATE orcamentos SET titulo=?, cliente=?, status=?, total=?, versao=?, dados=? WHERE id=?',
      [titulo, cliente, d.status || 'rascunho', total, nv, JSON.stringify(d), id]);
    await q('INSERT INTO orcamento_versoes (orcamento_id, versao, status, total, dados) VALUES (?,?,?,?,?)', [id, nv, d.status || 'rascunho', total, JSON.stringify(d)]);
    res.json({ ok: true, versao: nv });
  } catch (e) { res.status(400).json({ erro: e.message }); }
});

// abrir pelo token (para editar depois)
app.get('/api/orcamentos/:id', async (req, res) => {
  const rows = await q('SELECT token_hash, dados, versao FROM orcamentos WHERE id=?', [Number(req.params.id)]);
  if (!rows.length || rows[0].token_hash !== sha(String(req.headers['x-token'] || ''))) return res.status(403).json({ erro: 'Não autorizado.' });
  res.json({ dados: JSON.parse(rows[0].dados), versao: rows[0].versao });
});

// ---------- memória ----------
app.get('/api/memoria/lista', exigeMemoria, async (req, res) => {
  const rows = await q('SELECT id, titulo, cliente, status, total, versao, criado_em, atualizado_em FROM orcamentos ORDER BY atualizado_em DESC LIMIT 500');
  res.json({ data: rows });
});
app.get('/api/memoria/:id', exigeMemoria, async (req, res) => {
  const id = Number(req.params.id);
  const rows = await q('SELECT id, titulo, cliente, status, total, versao, criado_em, atualizado_em, dados FROM orcamentos WHERE id=?', [id]);
  if (!rows.length) return res.status(404).json({ erro: 'Não encontrado.' });
  const vers = await q('SELECT versao, status, total, criado_em FROM orcamento_versoes WHERE orcamento_id=? ORDER BY versao DESC', [id]);
  res.json({ ...rows[0], dados: JSON.parse(rows[0].dados), versoes: vers });
});
app.get('/api/memoria/:id/versao/:v', exigeMemoria, async (req, res) => {
  const rows = await q('SELECT dados, versao, criado_em FROM orcamento_versoes WHERE orcamento_id=? AND versao=?', [Number(req.params.id), Number(req.params.v)]);
  if (!rows.length) return res.status(404).json({ erro: 'Versão não encontrada.' });
  res.json({ versao: rows[0].versao, criado_em: rows[0].criado_em, dados: JSON.parse(rows[0].dados) });
});
// editar um orçamento a partir da memória (sem token; a senha da memória já autoriza)
app.put('/api/memoria/:id', exigeMemoria, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await q('SELECT versao FROM orcamentos WHERE id=?', [id]);
    if (!rows.length) return res.status(404).json({ erro: 'Não encontrado.' });
    const d = sane(req.body.dados);
    const nv = rows[0].versao + 1;
    const total = totalDe(d);
    await q('UPDATE orcamentos SET titulo=?, cliente=?, status=?, total=?, versao=?, dados=? WHERE id=?',
      [String(d.titulo || 'Orçamento sem título').slice(0, 200), String((d.cliente && d.cliente.nome) || '').slice(0, 200), d.status || 'rascunho', total, nv, JSON.stringify(d), id]);
    await q('INSERT INTO orcamento_versoes (orcamento_id, versao, status, total, dados) VALUES (?,?,?,?,?)', [id, nv, d.status || 'rascunho', total, JSON.stringify(d)]);
    res.json({ ok: true, versao: nv });
  } catch (e) { res.status(400).json({ erro: e.message }); }
});
app.delete('/api/memoria/:id', exigeMemoria, async (req, res) => {
  await q('DELETE FROM orcamentos WHERE id=?', [Number(req.params.id)]);
  res.json({ ok: true });
});

// preços (leitura pública, usada pelo gerador) e níveis de escolha
app.get('/api/precos', async (req, res) => {
  const rows = await q('SELECT chave, grupo, rotulo, valor, unidade, fonte, nota FROM precos ORDER BY grupo, chave');
  res.json({ data: rows, niveis: NIVEIS });
});
// edição admin (exige a sessão da memória / modo admin)
app.put('/api/admin/precos', exigeMemoria, async (req, res) => {
  try {
    const lista = Array.isArray(req.body.precos) ? req.body.precos : [];
    if (lista.length > 500) throw new Error('Lista grande demais.');
    for (const it of lista) {
      const chave = String(it.chave || '');
      if (!/^[a-z0-9_]{2,80}$/.test(chave)) continue;
      const v = (it.valor === null || it.valor === '' || it.valor === undefined) ? null : Number(String(it.valor).replace(',', '.'));
      if (v !== null && (!Number.isFinite(v) || v < 0 || v > 10000000)) throw new Error('Valor inválido em ' + chave);
      await q('UPDATE precos SET valor=? WHERE chave=?', [v, chave]);
    }
    res.json({ ok: true, atualizados: lista.length });
  } catch (e) { res.status(400).json({ erro: e.message }); }
});
app.post('/api/admin/precos/restaurar', exigeMemoria, async (req, res) => {
  for (const [grupo, chave, rotulo, valor, unidade, fonte, nota] of PRECOS) {
    await q('UPDATE precos SET valor=?, rotulo=?, fonte=?, nota=?, unidade=?, grupo=? WHERE chave=?', [valor, rotulo, fonte, nota, unidade, grupo, chave]);
  }
  res.json({ ok: true });
});

// ---------- exportação (Excel e Word) — a partir dos dados do editor ----------
function linhasItens(d) {
  return (d.itens || []).filter((i) => i.status !== 'nao').map((i) => ({
    grupo: i.grupo, nome: i.nome, espec: i.espec || '', unidade: i.unidade || 'un',
    qtd: Number(i.qtd) || 0,
    situacao: i.status === 'possui' ? 'Cliente já possui' : 'Precisa',
    valorUnit: (i.status === 'precisa' && i.valorUnit !== '' && i.valorUnit != null) ? Number(i.valorUnit) : null,
    total: (i.status === 'precisa' && i.valorUnit !== '' && i.valorUnit != null) ? Number(i.valorUnit) * (Number(i.qtd) || 0) : null,
    obs: i.obs || '',
    tipo: i.tipo === 'mensal' ? 'Mensal' : 'Único',
  }));
}
app.post('/api/exportar/xlsx', async (req, res) => {
  try {
    const d = sane(req.body.dados);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Neon Sistemas'; wb.created = new Date();
    const brand = { argb: 'FF0B1122' }, orange = { argb: 'FFF97316' };
    const head = (ws) => { const r = ws.getRow(1); r.font = { bold: true, color: { argb: 'FFFFFFFF' } }; r.fill = { type: 'pattern', pattern: 'solid', fgColor: brand }; r.height = 22; };

    const r = wb.addWorksheet('Resumo');
    r.columns = [{ width: 34 }, { width: 46 }];
    r.addRow(['PRÉ-ORÇAMENTO · Neon Sistemas']).font = { bold: true, size: 14, color: { argb: 'FFF97316' } };
    r.addRow(['Aviso', 'Proposta de pré-orçamento. Não é orçamento oficial.']);
    r.addRow([]);
    [['Título', d.titulo], ['Cliente', d.cliente && d.cliente.nome], ['Responsável', d.cliente && d.cliente.responsavel],
     ['Telefone', d.cliente && d.cliente.telefone], ['E-mail', d.cliente && d.cliente.email],
     ['Endereço', [d.cliente && d.cliente.endereco, d.cliente && d.cliente.cidade, d.cliente && d.cliente.uf].filter(Boolean).join(' - ')],
     ['Data', d.data], ['Validade (dias)', d.validade], ['Suítes', d.local && d.local.suites], ['Alas', d.local && d.local.alas],
     ['Status', d.status]].forEach((x) => r.addRow(x));
    r.addRow([]);
    const tot = totalDe(d);
    r.addRow(['Total estimado (itens com valor preenchido)', tot ? fmtBRL(tot) : 'A preencher']).font = { bold: true };
    r.addRow(['Desconto (%)', d.descontoPct || 0]);
    r.addRow(['Impostos (%)', d.impostoPct || 0]);
    r.getColumn(2).alignment = { wrapText: true, vertical: 'top' };

    const it = wb.addWorksheet('Itens');
    it.columns = [{ header: 'Grupo', key: 'grupo', width: 20 }, { header: 'Item', key: 'nome', width: 38 },
      { header: 'Especificação', key: 'espec', width: 52 }, { header: 'Situação', key: 'situacao', width: 20 },
      { header: 'Unidade', key: 'unidade', width: 10 }, { header: 'Qtd', key: 'qtd', width: 8 },
      { header: 'Valor unitário (R$)', key: 'valorUnit', width: 18 }, { header: 'Total (R$)', key: 'total', width: 16 },
      { header: 'Observações', key: 'obs', width: 36 }];
    head(it);
    for (const l of linhasItens(d)) it.addRow(l);
    it.getColumn('valorUnit').numFmt = '"R$" #,##0.00'; it.getColumn('total').numFmt = '"R$" #,##0.00';
    it.getColumn('espec').alignment = { wrapText: true, vertical: 'top' };
    it.autoFilter = 'A1:I1'; it.views = [{ state: 'frozen', ySplit: 1 }];
    const rowTot = it.addRow({ nome: 'TOTAL', total: tot || null });
    rowTot.font = { bold: true }; rowTot.getCell('total').numFmt = '"R$" #,##0.00';

    const c = wb.addWorksheet('Cliente e ambiente');
    c.columns = [{ header: 'Campo', key: 'k', width: 34 }, { header: 'Valor', key: 'v', width: 60 }];
    head(c);
    const amb = d.ambiente || {};
    const rowsC = [
      ...Object.entries(d.cliente || {}).map(([k, v]) => ['Cliente · ' + k, v]),
      ...Object.entries(d.local || {}).map(([k, v]) => ['Local · ' + k, v]),
      ...Object.entries(amb).map(([k, v]) => ['Ambiente atual · ' + k, v]),
    ];
    rowsC.forEach(([k, v]) => c.addRow({ k, v: v == null ? '' : String(v) }));

    const cond = wb.addWorksheet('Condições');
    cond.columns = [{ header: 'Item', key: 'k', width: 26 }, { header: 'Texto', key: 'v', width: 90 }];
    head(cond);
    [['Forma de pagamento', d.pagamento], ['Condições gerais', d.condicoes], ['Observações', d.observacoes]].forEach(([k, v]) => cond.addRow({ k, v: v || '' }));
    cond.getColumn('v').alignment = { wrapText: true, vertical: 'top' };

    const buf = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${slug(d.titulo)}.xlsx"`);
    res.send(Buffer.from(buf));
  } catch (e) { res.status(400).json({ erro: e.message }); }
});

function slug(t) { return String(t || 'orcamento').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\-]+/g, '-').replace(/-+/g, '-').slice(0, 80) || 'orcamento'; }

app.post('/api/exportar/docx', async (req, res) => {
  try {
    const d = sane(req.body.dados);
    const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, AlignmentType, ShadingType, BorderStyle } = docx;
    const H = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 120 },
      children: [new TextRun({ text: t, bold: true, color: '0B1122', size: 28 })] });
    const P = (t, o = {}) => new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: String(t ?? ''), ...o })] });
    const cell = (t, o = {}) => new TableCell({
      width: o.w ? { size: o.w, type: WidthType.PERCENTAGE } : undefined,
      shading: o.head ? { type: ShadingType.CLEAR, color: 'auto', fill: '0B1122' } : undefined,
      margins: { top: 60, bottom: 60, left: 90, right: 90 },
      children: [new Paragraph({ alignment: o.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [new TextRun({ text: String(t ?? ''), bold: !!o.head || !!o.bold, color: o.head ? 'FFFFFF' : '1C2233', size: 18 })] })],
    });
    const table = (cols, rows) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({ tableHeader: true, children: cols.map((c) => cell(c.t, { head: true, w: c.w, right: c.r })) }),
        ...rows.map((r) => new TableRow({ children: r.map((v, i) => cell(v.t ?? v, { w: cols[i].w, right: cols[i].r, bold: v.bold })) }))],
    });

    const tot = totalDe(d);
    const itens = linhasItens(d);
    const grupos = [...new Set(itens.map((i) => i.grupo))];
    const children = [
      new Paragraph({ children: [new TextRun({ text: 'NEON SISTEMAS', bold: true, color: 'F97316', size: 24 })] }),
      new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: 'Pré-orçamento · proposta de referência, não é orçamento oficial', color: '6B7697', size: 18 })] }),
      new Paragraph({ children: [new TextRun({ text: d.titulo || 'Pré-orçamento', bold: true, size: 40, color: '0B1122' })] }),
      P(`Cliente: ${(d.cliente && d.cliente.nome) || '—'}   ·   Data: ${d.data || '—'}   ·   Validade: ${d.validade || '—'} dias`, { color: '4B5570' }),
      H('1. Cliente e local'),
      table([{ t: 'Campo', w: 35 }, { t: 'Valor', w: 65 }], [
        ['Responsável', (d.cliente && d.cliente.responsavel) || '—'], ['Telefone', (d.cliente && d.cliente.telefone) || '—'],
        ['E-mail', (d.cliente && d.cliente.email) || '—'], ['Endereço', [d.cliente && d.cliente.endereco, d.cliente && d.cliente.cidade, d.cliente && d.cliente.uf].filter(Boolean).join(' - ') || '—'],
        ['Suítes', (d.local && d.local.suites) || '—'], ['Alas', (d.local && d.local.alas) || '—'],
      ]),
      H('2. Situação atual do cliente'),
      table([{ t: 'Item', w: 40 }, { t: 'Resposta', w: 60 }], Object.entries(d.ambiente || {}).map(([k, v]) => [k.replace(/_/g, ' '), v || '—'])),
    ];
    children.push(H('3. Itens e serviços'));
    for (const g of grupos) {
      children.push(P(g, { bold: true, color: 'F97316', size: 22 }));
      const linhas = itens.filter((i) => i.grupo === g).map((i) => [i.nome, i.espec, i.situacao, String(i.qtd), i.valorUnit == null ? 'a preencher' : fmtBRL(i.valorUnit), i.total == null ? 'a preencher' : fmtBRL(i.total)]);
      children.push(table([{ t: 'Item', w: 22 }, { t: 'Especificação', w: 32 }, { t: 'Situação', w: 14 }, { t: 'Qtd', w: 7, r: true }, { t: 'Unitário', w: 12, r: true }, { t: 'Total', w: 13, r: true }], linhas));
    }
    children.push(H('4. Total'));
    children.push(table([{ t: 'Descrição', w: 70 }, { t: 'Valor', w: 30, r: true }], [
      ['Total estimado (itens com valor preenchido)', tot ? fmtBRL(tot) : 'a preencher'],
      ['Desconto aplicado (%)', String(d.descontoPct || 0)], ['Impostos (%)', String(d.impostoPct || 0)],
    ]));
    children.push(H('5. Condições'));
    children.push(P(`Forma de pagamento: ${d.pagamento || 'a definir'}`));
    children.push(P(d.condicoes || 'Validade e condições a definir.'));
    if (d.observacoes) children.push(P(d.observacoes));

    const doc = new Document({ creator: 'Neon Sistemas', title: d.titulo || 'Pré-orçamento',
      styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
      sections: [{ properties: { page: { margin: { top: 900, bottom: 900, left: 900, right: 900 } } }, children }] });
    const buf = await Packer.toBuffer(doc);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${slug(d.titulo)}.docx"`);
    res.send(buf);
  } catch (e) { res.status(400).json({ erro: e.message }); }
});

// ---------- arquivos estáticos ----------
app.get(['/memoria', '/memoria/'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html', maxAge: '1h', etag: true, dotfiles: 'deny' }));
app.use((req, res) => res.status(404).json({ erro: 'Não encontrado.' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ erro: 'Erro interno.' }); });

// ---------- inicialização ----------
(async () => {
  try { await migrate(); console.log('[orcamento] banco pronto'); }
  catch (e) { console.error('[orcamento] banco indisponível:', e.message); }
  app.listen(PORT, () => console.log('[orcamento] ouvindo em', PORT));
})();

module.exports = { app, totalDe, linhasItens };
