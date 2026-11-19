// Relatórios: números do financeiro, inadimplência, produtos, clientes e chamados num período.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, sql, Client } = require('./helpers');

const admin = new Client();
before(async () => {
  await start(); await admin.login();
  const a = (await admin.post('/api/clientes', { nome_fantasia: 'Motel A', status: 'ativo', cliente_desde: '2026-10-05' })).body.data;
  const b = (await admin.post('/api/clientes', { nome_fantasia: 'Motel B', status: 'ativo', cliente_desde: '2025-01-01', whatsapp: '34999990000' })).body.data;
  const [prod] = await sql("SELECT id FROM produtos WHERE codigo='neon-motel'");
  const i = (await admin.post('/api/instalacoes', { cliente_id: a.id, produto_id: prod.id, codigo: 'A-01' })).body.data;
  const l = (await admin.post('/api/licencas', { instalacao_id: i.id, valor_mensal: '300', gerar_cobranca: false })).body.data;
  await sql(`INSERT INTO cobrancas (cliente_id, licenca_id, competencia, valor, vencimento, status, pago_em, forma) VALUES
    (?, ?, '2026-10', 300, '2026-10-10', 'pago', '2026-10-12', 'pix'),
    (?, NULL, '2026-10', 100, '2026-10-15', 'pago', '2026-10-15', 'boleto'),
    (?, NULL, '2026-10', 200, '2026-10-20', 'atrasado', NULL, NULL),
    (?, NULL, '2026-09', 50, '2026-09-20', 'atrasado', NULL, NULL)`, [a.id, l.id, b.id, b.id, b.id]);
  // saída de cliente registrada pela edição
  const c = (await admin.post('/api/clientes', { nome_fantasia: 'Motel C', status: 'ativo' })).body.data;
  await admin.patch(`/api/clientes/${c.id}`, { status: 'cancelado' });
  // chamados
  await admin.post('/api/chamados', { cliente_id: a.id, titulo: 'X', prioridade: 'alta' });
  const ch = (await admin.post('/api/chamados', { cliente_id: a.id, titulo: 'Y', prioridade: 'baixa' })).body.data;
  await admin.patch(`/api/chamados/${ch.id}`, { status: 'resolvido' });
});
after(stop);

test('financeiro de outubro', async () => {
  const r = (await admin.get('/api/relatorios?de=2026-10-01&ate=2026-10-31')).body;
  assert.equal(r.financeiro.recebido, 400); assert.equal(r.financeiro.recebido_n, 2);
  assert.equal(r.financeiro.faturado, 600); assert.equal(r.financeiro.atrasado_periodo, 200);
  assert.equal(r.financeiro.inadimplencia, 33.3);
  assert.equal(r.financeiro.mrr, 300);
  assert.deepEqual(r.financeiro.por_produto.map((x) => [x.produto, x.total]), [['Neon Motel', 300], ['Avulsas (sem licença)', 100]]);
  assert.equal(r.financeiro.por_forma[0].forma, 'pix');
  assert.deepEqual(r.financeiro.por_mes, [{ mes: '2026-10', recebido: 400 }]);
  assert.equal(r.clientes.novos, 1);
});

test('inadimplentes, saídas e chamados', async () => {
  const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const r = (await admin.get(`/api/relatorios?de=2026-01-01&ate=${hoje}`)).body;
  assert.equal(r.inadimplentes.length, 1);
  assert.equal(r.inadimplentes[0].cliente, 'Motel B'); assert.equal(r.inadimplentes[0].total, 250); assert.equal(r.inadimplentes[0].mais_antiga, '2026-09-20');
  assert.equal(r.clientes.saidas, 1); assert.equal(r.clientes.lista_saidas[0].nome_fantasia, 'Motel C');
  assert.equal(r.chamados.abertos, 2); assert.equal(r.chamados.resolvidos, 1); assert.equal(r.chamados.no_prazo_pct, 100);
  assert.equal(r.financeiro.por_mes.length, Number(hoje.slice(5, 7)));
});

test('período inválido', async () => {
  assert.equal((await admin.get('/api/relatorios?de=2026-12-01&ate=2026-01-01')).status, 400);
  assert.equal((await admin.get('/api/relatorios')).status, 200);
});
