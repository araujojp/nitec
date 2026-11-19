// Testes do que já existe: login, permissões, cadastros, mensalidades automáticas, API dos equipamentos e dashboard.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, sql, Client } = require('./helpers');

const admin = new Client();
const ctx = {};

before(async () => { await start(); await admin.login(); });
after(stop);

const hoje = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

test('saúde e login', async () => {
  const anon = new Client();
  assert.equal((await anon.get('/api/dashboard')).status, 401);
  assert.equal((await anon.post('/api/auth/login', { email: 'admin@teste.local', senha: 'errada' })).status, 401);
  const me = await admin.get('/api/auth/me');
  assert.equal(me.body.user.funcao, 'admin');
});

test('cadastro de cliente, instalação e licença', async () => {
  const c = await admin.post('/api/clientes', { nome_fantasia: 'Motel Teste', status: 'ativo', whatsapp: '34999990000', email: 'cliente@teste.local' });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  ctx.cliente = c.body.data;
  assert.equal(ctx.cliente.cliente_desde, hoje());
  const [prod] = await sql('SELECT id FROM produtos ORDER BY id LIMIT 1');
  const i = await admin.post('/api/instalacoes', { cliente_id: ctx.cliente.id, produto_id: prod.id, codigo: 'motel-teste-01' });
  assert.equal(i.status, 201, JSON.stringify(i.body));
  assert.equal(i.body.data.codigo, 'MOTEL-TESTE-01');
  ctx.inst = i.body.data;
  const l = await admin.post('/api/licencas', { instalacao_id: ctx.inst.id, valor_mensal: '199,90', dia_vencimento: 28, gerar_cobranca: true });
  assert.equal(l.status, 201, JSON.stringify(l.body));
  assert.match(l.body.data.chave, /^NEON-/);
  assert.equal(l.body.data.cliente_id, ctx.cliente.id);
  ctx.lic = l.body.data;
});

test('código de instalação duplicado é recusado', async () => {
  const [prod] = await sql('SELECT id FROM produtos ORDER BY id LIMIT 1');
  const r = await admin.post('/api/instalacoes', { cliente_id: ctx.cliente.id, produto_id: prod.id, codigo: 'MOTEL-TESTE-01' });
  assert.equal(r.status, 400);
});

test('automações geram a mensalidade uma única vez', async () => {
  const r1 = await admin.post('/api/automacoes/rodar');
  assert.equal(r1.status, 200);
  await admin.post('/api/automacoes/rodar');
  const rows = await sql('SELECT * FROM cobrancas WHERE licenca_id=?', [ctx.lic.id]);
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0].valor), 199.9);
  assert.equal(rows[0].competencia, hoje().slice(0, 7));
  ctx.cob = rows[0];
});

test('cobrança vencida fica atrasada e pode ser paga', async () => {
  await sql("UPDATE cobrancas SET vencimento='2020-01-10', status='pendente' WHERE id=?", [ctx.cob.id]);
  await admin.post('/api/automacoes/rodar');
  const [c] = await sql('SELECT status FROM cobrancas WHERE id=?', [ctx.cob.id]);
  assert.equal(c.status, 'atrasado');
  const d = await admin.get('/api/dashboard');
  assert.equal(d.body.kpis.atrasado, 199.9);
  assert.equal(d.body.atrasadas.length, 1);
  const p = await admin.post(`/api/cobrancas/${ctx.cob.id}/pagar`, { forma: 'pix' });
  assert.equal(p.status, 200);
  const [c2] = await sql('SELECT status, pago_em, forma FROM cobrancas WHERE id=?', [ctx.cob.id]);
  assert.equal(c2.status, 'pago'); assert.equal(c2.forma, 'pix'); assert.equal(c2.pago_em, hoje());
});

test('chamado registra data de resolução', async () => {
  const c = await admin.post('/api/chamados', { cliente_id: ctx.cliente.id, titulo: 'TV não liga', prioridade: 'alta' });
  assert.equal(c.status, 201);
  ctx.chamado = c.body.data;
  const d = await admin.get('/api/dashboard');
  assert.equal(d.body.kpis.chamados_abertos, 1);
  assert.equal(d.body.kpis.chamados_urgentes, 1);
  const u = await admin.patch(`/api/chamados/${ctx.chamado.id}`, { status: 'resolvido', solucao: 'Trocado o cabo' });
  assert.ok(u.body.data.resolvido_em);
});

test('API dos equipamentos: token, sinal e licença', async () => {
  const t = await admin.post(`/api/instalacoes/${ctx.inst.id}/token`);
  assert.equal(t.status, 200);
  const token = t.body.token;
  const dev = new Client();
  assert.equal((await dev.post('/api/v1/equipamento/sinal', { evento: 'heartbeat' })).status, 401);
  const s = await dev.post('/api/v1/equipamento/sinal', { evento: 'heartbeat', versao: '2.1.0' }, { Authorization: 'Bearer ' + token });
  assert.equal(s.status, 200, JSON.stringify(s.body));
  const lic = await dev.get('/items/licencas', { Authorization: 'Bearer ' + token });
  assert.equal(lic.status, 200);
  assert.ok(JSON.stringify(lic.body).includes(ctx.lic.chave));
  const old = await dev.post('/items/checkins', { codigo_instalacao: 'MOTEL-TESTE-01', evento: 'heartbeat' }, { Authorization: 'Bearer ' + token });
  assert.ok([200, 201].includes(old.status), JSON.stringify(old.body));
  const [i] = await sql('SELECT versao_instalada, ultimo_contato FROM instalacoes WHERE id=?', [ctx.inst.id]);
  assert.equal(i.versao_instalada, '2.1.0'); assert.ok(i.ultimo_contato);
  const d = await admin.get('/api/dashboard');
  assert.equal(d.body.kpis.online, 1);
  // Revogar o token bloqueia o equipamento
  await admin.del(`/api/instalacoes/${ctx.inst.id}/token`);
  assert.equal((await dev.post('/api/v1/equipamento/sinal', {}, { Authorization: 'Bearer ' + token })).status, 401);
});

test('usuário só leitura não cadastra e equipe não apaga', async () => {
  for (const [email, funcao] of [['leitura@teste.local', 'leitura'], ['equipe@teste.local', 'equipe']]) {
    const r = await admin.post('/api/usuarios', { nome: funcao, email, funcao, senha: 'senha-1234' });
    assert.equal(r.status, 201, JSON.stringify(r.body));
  }
  const ler = await new Client().login('leitura@teste.local', 'senha-1234');
  assert.equal((await ler.post('/api/clientes', { nome_fantasia: 'X' })).status, 403);
  assert.equal((await ler.get('/api/clientes')).status, 200);
  const eq = await new Client().login('equipe@teste.local', 'senha-1234');
  assert.equal((await eq.del(`/api/chamados/${ctx.chamado.id}`)).status, 403);
  const us = await eq.get('/api/usuarios');
  assert.ok(us.body.data.every((u) => !('senha_hash' in u) && !('totp_secret' in u)));
  assert.equal((await eq.post('/api/usuarios', { nome: 'z', email: 'z@z.z', senha: '12345678' })).status, 403);
  assert.equal((await eq.post('/api/config', { empresa_nome: 'Y' })).status, 403);
});

test('busca global, funil, agenda e exportação', async () => {
  const b = await admin.get('/api/busca?q=Motel');
  assert.ok(b.body.data.some((r) => r.entity === 'clientes'));
  const lead = await admin.post('/api/clientes', { nome_fantasia: 'Pousada Lead', status: 'lead', valor_estimado: '1000' });
  assert.equal((await admin.post(`/api/funil/${lead.body.data.id}`, { etapa: 'proposta' })).status, 200);
  const [c] = await sql('SELECT status, etapa_funil FROM clientes WHERE id=?', [lead.body.data.id]);
  assert.equal(c.status, 'negociacao'); assert.equal(c.etapa_funil, 'proposta');
  assert.equal((await admin.get('/api/agenda')).status, 200);
  const csv = await admin.get('/api/clientes/exportar');
  assert.equal(csv.status, 200); assert.ok(String(csv.body).includes('Motel Teste'));
});

test('dashboard completo responde com todos os blocos', async () => {
  const d = await admin.get('/api/dashboard');
  for (const k of ['kpis', 'chamados', 'sinais', 'vencendo', 'atrasadas', 'funil', 'lembretes', 'grafico']) assert.ok(k in d.body, k);
  assert.equal(d.body.grafico.meses.length, 12);
  assert.equal(d.body.kpis.receita_mensal, 199.9);
  assert.equal(d.body.kpis.recebido_mes, 199.9);
  assert.equal(d.body.grafico.receita[11], 199.9);
});

test('interface e rotas públicas', async () => {
  const anon = new Client();
  const r = await anon.get('/clientes/123');
  assert.equal(r.status, 200); assert.ok(String(r.body).includes('Neon Gestão'));
  assert.equal((await anon.get('/publico/novidades.json')).status, 200);
  assert.equal((await anon.get('/publico/depoimentos.json')).status, 200);
});

test('ajuda: só para quem está logado, com o manual completo', async () => {
  const anon = new Client();
  const r = await fetch(require('./helpers').BASE + '/ajuda', { redirect: 'manual' });
  assert.equal(r.status, 302); assert.match(r.headers.get('location'), /\/entrar\?voltar=%2Fajuda/);
  const a = await admin.get('/ajuda');
  assert.equal(a.status, 200);
  for (const t of ['Manual do Neon Gestão', 'id="asaas"', 'id="alertas"', 'id="telegram-robo"', '/ajuda/ajuda.js']) assert.ok(String(a.body).includes(t), t);
  assert.equal((await admin.get('/ajuda/ajuda.js')).status, 200);
  assert.equal((await admin.get('/ajuda/tema.js')).status, 200);
  assert.ok(anon);
});
