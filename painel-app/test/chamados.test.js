// Chamados: prazo (SLA), conversa, e-mails ao cliente e alerta de prazo estourado.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, sql, Client } = require('./helpers');

const admin = new Client();
const ctx = {};
const saida = async () => (await admin.get('/api/alertas/_teste/saida')).body.data;
const esperar = async (fn, ms = 3000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 50)); } return false; };
const horasEntre = (a, b) => (new Date(b.replace(' ', 'T') + 'Z') - new Date(a.replace(' ', 'T') + 'Z')) / 36e5;

before(async () => {
  await start(); await admin.login();
  ctx.cli = (await admin.post('/api/clientes', { nome_fantasia: 'Motel Suporte', contato_nome: 'Carla Souza', email: 'carla@motel.local', status: 'ativo' })).body.data;
  ctx.semEmail = (await admin.post('/api/clientes', { nome_fantasia: 'Sem Email', status: 'ativo' })).body.data;
});
after(stop);

test('prazo calculado pela prioridade e recalculado quando ela muda', async () => {
  const c = (await admin.post('/api/chamados', { cliente_id: ctx.cli.id, titulo: 'Fechadura travada', prioridade: 'media', descricao: 'Suíte 12' })).body.data;
  ctx.ch = c;
  assert.ok(c.sla_limite);
  assert.equal(Math.round(horasEntre(c.created_at, c.sla_limite)), 24);
  const u = (await admin.patch(`/api/chamados/${c.id}`, { prioridade: 'urgente' })).body.data;
  assert.equal(Math.round(horasEntre(c.created_at, u.sla_limite)), 4);
  // o campo não pode ser editado à mão
  const x = (await admin.patch(`/api/chamados/${c.id}`, { sla_limite: '2099-01-01 00:00:00' })).body.data;
  assert.equal(x.sla_limite, u.sla_limite);
});

test('e-mail de abertura vai para o cliente (uma vez) e fica na conversa', async () => {
  assert.ok(await esperar(async () => (await saida()).some((m) => m.para === 'carla@motel.local' && m.assunto.includes(`#${ctx.ch.id}`))));
  const m = (await saida()).find((x) => x.para === 'carla@motel.local');
  assert.ok(m.html.includes('Olá, Carla!')); assert.ok(m.html.includes('Fechadura travada'));
  const conv = await admin.get(`/api/chamados/${ctx.ch.id}/conversa`);
  assert.ok(conv.body.data.some((i) => i.tipo === 'sistema' && i.envio_status.startsWith('enviado')));
  assert.ok(conv.body.data.some((i) => i.tipo === 'evento' && i.texto.includes('Prioridade')));
});

test('cliente sem e-mail: registra o motivo', async () => {
  const c = (await admin.post('/api/chamados', { cliente_id: ctx.semEmail.id, titulo: 'Sem e-mail', prioridade: 'baixa' })).body.data;
  assert.ok(await esperar(async () => (await admin.get(`/api/chamados/${c.id}/conversa`)).body.data.some((i) => i.envio_status === 'cliente sem e-mail')));
});

test('comentário interno e comentário enviado ao cliente', async () => {
  await admin.post('/api/alertas/_teste/limpar');
  const a = await admin.post(`/api/chamados/${ctx.ch.id}/comentarios`, { texto: 'Peça encomendada (nota interna)' });
  assert.equal(a.status, 201); assert.equal(a.body.data.enviado_cliente, 0);
  const b = await admin.post(`/api/chamados/${ctx.ch.id}/comentarios`, { texto: 'O técnico vai amanhã às 9h.', enviar_cliente: true });
  assert.equal(b.body.data.enviado_cliente, 1);
  const s = await saida();
  assert.equal(s.filter((m) => m.para === 'carla@motel.local').length, 1);
  assert.ok(s[0].html.includes('O técnico vai amanhã'));
  assert.ok(!s.some((m) => m.html?.includes('nota interna')));
  assert.equal((await admin.post(`/api/chamados/${ctx.ch.id}/comentarios`, { texto: '  ' })).status, 400);
  const conv = (await admin.get(`/api/chamados/${ctx.ch.id}/conversa`)).body.data;
  assert.equal(conv.filter((i) => i.tipo === 'comentario').length, 2);
});

test('só leitura não comenta; equipe não apaga comentário dos outros', async () => {
  await admin.post('/api/usuarios', { nome: 'Leitor', email: 'le@teste.local', funcao: 'leitura', senha: 'senha-1234' });
  await admin.post('/api/usuarios', { nome: 'Equipe', email: 'eq@teste.local', funcao: 'equipe', senha: 'senha-1234' });
  const le = await new Client().login('le@teste.local', 'senha-1234');
  assert.equal((await le.post(`/api/chamados/${ctx.ch.id}/comentarios`, { texto: 'oi' })).status, 403);
  const eq = await new Client().login('eq@teste.local', 'senha-1234');
  const [c] = await sql('SELECT id FROM chamado_comentarios WHERE usuario_id IS NOT NULL LIMIT 1');
  assert.equal((await eq.del(`/api/chamados/comentarios/${c.id}`)).status, 403);
  assert.equal((await admin.del(`/api/chamados/comentarios/${c.id}`)).status, 200);
});

test('resolver manda e-mail com a solução; prazo estourado gera alerta', async () => {
  await admin.post('/api/alertas/_teste/limpar');
  await admin.patch(`/api/chamados/${ctx.ch.id}`, { status: 'resolvido', solucao: 'Trocamos o motor da fechadura.' });
  assert.ok(await esperar(async () => (await saida()).some((m) => m.assunto?.includes('resolvido') && m.html.includes('Trocamos o motor'))));
  // prazo estourado
  await admin.post('/api/alertas/telegram/chat', { chat_id: '4242424242' });
  await sql("INSERT IGNORE INTO integracoes (rede, ativo, config) VALUES ('telegram',1,'{\"bot_token\":\"1:a\"}')");
  const c = (await admin.post('/api/chamados', { cliente_id: ctx.semEmail.id, titulo: 'Atrasado', prioridade: 'alta' })).body.data;
  await sql('UPDATE chamados SET sla_limite = UTC_TIMESTAMP() - INTERVAL 1 HOUR WHERE id=?', [c.id]);
  await admin.post('/api/alertas/_teste/limpar');
  const r = await admin.post('/api/alertas/rodar');
  assert.equal(r.body.data.sla, 1);
  assert.equal((await admin.post('/api/alertas/rodar')).body.data.sla, undefined);
  assert.ok((await saida()).some((m) => m.texto?.includes(`Fora do prazo: chamado #${c.id}`)));
  const ind = await admin.get('/api/chamados-sla');
  assert.equal(ind.body.estourados, 1); assert.equal(ind.body.resolvidos, 1); assert.equal(ind.body.no_prazo, 1);
});

test('configuração: prazos e e-mails ao cliente podem ser desligados', async () => {
  assert.equal((await admin.post('/api/chamados-config', { sla: { urgente: 0 } })).status, 400);
  await admin.post('/api/chamados-config', { sla: { media: 48 }, email_abertura: false });
  const cfg = (await admin.get('/api/chamados-config')).body;
  assert.equal(cfg.sla.media, 48); assert.equal(cfg.email_abertura, false);
  await admin.post('/api/alertas/_teste/limpar');
  const c = (await admin.post('/api/chamados', { cliente_id: ctx.cli.id, titulo: 'Sem aviso', prioridade: 'media' })).body.data;
  assert.equal(Math.round(horasEntre(c.created_at, c.sla_limite)), 48);
  await new Promise((r) => setTimeout(r, 400));
  assert.ok(!(await saida()).some((m) => m.para === 'carla@motel.local'));
  const eq = await new Client().login('eq@teste.local', 'senha-1234');
  assert.equal((await eq.post('/api/chamados-config', { email_abertura: true })).status, 403);
});
