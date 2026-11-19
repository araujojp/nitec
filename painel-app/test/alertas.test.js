// Alertas: preferências, canais, chamados, equipamentos sem sinal, licenças, cobranças, lembretes e resumo.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, sql, Client } = require('./helpers');

const admin = new Client();
const ctx = {};
const saida = async () => (await admin.get('/api/alertas/_teste/saida')).body.data;
const limpar = () => admin.post('/api/alertas/_teste/limpar');
const esperar = async (fn, ms = 3000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 50)); } return false; };

before(async () => {
  await start(); await admin.login();
  const [u] = await sql("SELECT id FROM usuarios WHERE email='admin@teste.local'"); ctx.adminId = u.id;
  const c = await admin.post('/api/clientes', { nome_fantasia: 'Motel Alerta', status: 'ativo' }); ctx.cli = c.body.data;
  const [prod] = await sql('SELECT id FROM produtos LIMIT 1');
  ctx.inst = (await admin.post('/api/instalacoes', { cliente_id: ctx.cli.id, produto_id: prod.id, codigo: 'ALERTA-01' })).body.data;
});
after(stop);

test('preferências padrão e salvas', async () => {
  const r = await admin.get('/api/alertas/meus');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.prefs.chamado_urgente, ['telegram', 'push', 'email']);
  assert.equal(r.body.canais.telegram.vinculado, false);
  const s = await admin.post('/api/alertas/meus', { prefs: { ...r.body.prefs, chamado_novo: ['telegram', 'xpto'] } });
  assert.deepEqual(s.body.prefs.chamado_novo, ['telegram']);
});

test('vínculo do Telegram por código e por ID', async () => {
  const v = await admin.post('/api/alertas/telegram/vincular');
  assert.equal(v.status, 400); // robô não configurado
  await sql("INSERT INTO integracoes (rede, ativo, config) VALUES ('telegram', 1, '{\"bot_token\":\"123:abc\"}')");
  const v2 = await admin.post('/api/alertas/telegram/vincular');
  assert.equal(v2.status, 200); assert.match(v2.body.link, /start=v_/);
  const al = require('../server/alertas');
  // o código não aparece para a equipe na lista de usuários
  const lista = await admin.get('/api/usuarios');
  assert.ok(lista.body.data.every((u) => !('telegram_codigo' in u)));
  assert.equal((await admin.post('/api/alertas/telegram/chat', { chat_id: 'abc' })).status, 400);
  assert.equal((await admin.post('/api/alertas/telegram/chat', { chat_id: '987654321' })).status, 200);
  const r = await admin.get('/api/alertas/meus');
  assert.equal(r.body.canais.telegram.vinculado, true);
  assert.equal(typeof al.vincularTelegram, 'function');
});

test('push: chave pública e inscrição', async () => {
  const k = await admin.get('/api/alertas/push/chave');
  assert.ok(k.body.chave && k.body.chave.length > 40);
  const k2 = await admin.get('/api/alertas/push/chave');
  assert.equal(k.body.chave, k2.body.chave);
  assert.equal((await admin.post('/api/alertas/push/inscrever', { inscricao: { endpoint: 'http://x' } })).status, 400);
  const ok = await admin.post('/api/alertas/push/inscrever', { inscricao: { endpoint: 'https://push.exemplo/abc', keys: { p256dh: 'p', auth: 'a' } } });
  assert.equal(ok.status, 200);
  await admin.post('/api/alertas/push/inscrever', { inscricao: { endpoint: 'https://push.exemplo/abc', keys: { p256dh: 'p', auth: 'a' } } });
  const [n] = await sql('SELECT COUNT(*) n FROM push_inscricoes');
  assert.equal(n.n, 1);
});

test('teste de alerta vai para mim nos canais prontos', async () => {
  await limpar();
  const r = await admin.post('/api/alertas/teste');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const s = await saida();
  assert.deepEqual(s.map((x) => x.canal).sort(), ['email', 'push', 'telegram']);
});

test('chamado novo e urgente disparam uma vez só', async () => {
  await admin.post('/api/alertas/meus', { prefs: { chamado_novo: ['telegram'], chamado_urgente: ['telegram', 'email'] } });
  await limpar();
  const c = await admin.post('/api/chamados', { cliente_id: ctx.cli.id, titulo: 'Sem internet', prioridade: 'media' });
  assert.ok(await esperar(async () => (await saida()).length === 1));
  await admin.patch(`/api/chamados/${c.body.data.id}`, { prioridade: 'urgente' });
  assert.ok(await esperar(async () => (await saida()).length === 3));
  await admin.patch(`/api/chamados/${c.body.data.id}`, { descricao: 'mais detalhes' });
  await new Promise((r) => setTimeout(r, 300));
  const s = await saida();
  assert.equal(s.length, 3);
  assert.ok(s[1].texto.includes('urgente'));
  assert.ok(s[1].texto.includes('/chamados/'));
});

test('chamado atribuído avisa só o responsável', async () => {
  const eq = await admin.post('/api/usuarios', { nome: 'Técnico', email: 'tec@teste.local', funcao: 'equipe', senha: 'senha-1234' });
  await sql("UPDATE usuarios SET telegram_chat_id='111222333' WHERE id=?", [eq.body.data.id]);
  await limpar();
  await admin.post('/api/chamados', { cliente_id: ctx.cli.id, titulo: 'Ar não liga', prioridade: 'baixa', responsavel_id: eq.body.data.id });
  assert.ok(await esperar(async () => (await saida()).some((x) => x.para === '111222333' && x.texto.includes('agora é seu'))));
  const s = await saida();
  assert.ok(!s.some((x) => x.para === '987654321' && x.texto.includes('agora é seu')));
});

test('equipamento sem sinal e de volta', async () => {
  await admin.post('/api/alertas/meus', { prefs: { equipamento_offline: ['telegram'], equipamento_voltou: ['telegram'] } });
  await sql("UPDATE instalacoes SET ultimo_contato=UTC_TIMESTAMP() - INTERVAL 5 HOUR WHERE id=?", [ctx.inst.id]);
  await limpar();
  let r = await admin.post('/api/alertas/rodar');
  assert.equal(r.body.data.offline, 1);
  r = await admin.post('/api/alertas/rodar');
  assert.equal(r.body.data.offline, 0, 'não repete');
  await sql('UPDATE instalacoes SET ultimo_contato=UTC_TIMESTAMP() + INTERVAL 1 SECOND WHERE id=?', [ctx.inst.id]);
  r = await admin.post('/api/alertas/rodar');
  assert.equal(r.body.data.voltou, 1);
  const s = (await saida()).filter((x) => x.para === '987654321');
  assert.ok(s[0].texto.includes('Sem sinal: ALERTA-01'));
  assert.ok(s.some((x) => x.texto.includes('Voltou: ALERTA-01')));
});

test('licença vencendo, cobrança atrasada e lembrete', async () => {
  await admin.post('/api/alertas/meus', { prefs: { licenca_vencendo: ['email'], cobranca_atrasada: ['telegram'], lembrete: ['push'] } });
  const lic = await admin.post('/api/licencas', { instalacao_id: ctx.inst.id, valor_mensal: '100', gerar_cobranca: false });
  await sql('UPDATE licencas SET vencimento=DATE(UTC_TIMESTAMP() - INTERVAL 3 HOUR) + INTERVAL 3 DAY WHERE id=?', [lic.body.data.id]);
  await sql("INSERT INTO cobrancas (cliente_id, competencia, valor, vencimento, status) VALUES (?, '2026-01', 50, DATE(UTC_TIMESTAMP() - INTERVAL 3 HOUR) - INTERVAL 2 DAY, 'atrasado')", [ctx.cli.id]);
  const ct = await admin.post('/api/contatos', { cliente_id: ctx.cli.id, tipo: 'ligacao', resumo: 'Ligar de novo', proximo_passo: 'Enviar proposta', lembrete: new Date(Date.now() - 60e3).toISOString() });
  assert.equal(ct.status, 201, JSON.stringify(ct.body));
  await limpar();
  const r = await admin.post('/api/alertas/rodar');
  assert.equal(r.body.data.licencas, 1); assert.equal(r.body.data.cobrancas, 1); assert.equal(r.body.data.lembretes, 1);
  const r2 = await admin.post('/api/alertas/rodar');
  assert.equal(r2.body.data.licencas + r2.body.data.cobrancas + r2.body.data.lembretes, 0);
  const s = await saida();
  assert.ok(s.find((x) => x.canal === 'email' && x.assunto.includes('vence em 3 dias')));
  assert.ok(s.find((x) => x.canal === 'telegram' && x.texto.includes('Cobrança atrasada')));
  assert.ok(s.find((x) => x.canal === 'push' && x.payload.body.includes('Enviar proposta')));
});

test('resumo do dia sai uma vez no horário', async () => {
  await admin.post('/api/alertas/meus', { prefs: { resumo_diario: ['email'] } });
  await admin.post('/api/alertas/config', { geral: { resumo_hora: 8 } });
  await limpar();
  const fora = new Date(); fora.setUTCHours(23, 0, 0, 0); // 20h em Brasília
  assert.equal((await admin.post('/api/alertas/rodar', { agora: fora.toISOString() })).body.data.resumo, 0);
  const na = new Date(); na.setUTCHours(11, 30, 0, 0); // 8h30 em Brasília
  assert.equal((await admin.post('/api/alertas/rodar', { agora: na.toISOString() })).body.data.resumo, 1);
  assert.equal((await admin.post('/api/alertas/rodar', { agora: na.toISOString() })).body.data.resumo, 0);
  const s = await saida();
  assert.ok(s[0].assunto.startsWith('Resumo do dia'));
  assert.ok(s[0].html.includes('cobrança(s) atrasada(s)'));
});

test('desligar os alertas para tudo', async () => {
  await admin.post('/api/alertas/config', { geral: { ativo: false } });
  await limpar();
  await admin.post('/api/chamados', { cliente_id: ctx.cli.id, titulo: 'Silencioso', prioridade: 'urgente' });
  await new Promise((r) => setTimeout(r, 400));
  assert.equal((await saida()).length, 0);
  await admin.post('/api/alertas/config', { geral: { ativo: true } });
});

test('configuração de e-mail nunca devolve a senha', async () => {
  assert.equal((await admin.post('/api/alertas/config', { email: { usuario: 'sem-arroba' } })).status, 400);
  await admin.post('/api/alertas/config', { email: { usuario: 'avisos@neonsistemas.com', senha: 'SuperSecreta99' } });
  const c = await admin.get('/api/alertas/config');
  assert.equal(c.body.email.usuario, 'avisos@neonsistemas.com');
  assert.ok(!JSON.stringify(c.body).includes('SuperSecreta99'));
  await admin.post('/api/alertas/config', { email: { senha: c.body.email.senha } }); // senha mascarada não sobrescreve
  const [row] = await sql("SELECT config FROM integracoes WHERE rede='email'");
  assert.ok(JSON.stringify(row.config).includes('SuperSecreta99'));
  assert.ok(!JSON.stringify((await admin.get('/api/config')).body).includes('SuperSecreta99'));
  const eq = await new Client().login('tec@teste.local', 'senha-1234');
  assert.equal((await eq.get('/api/alertas/config')).status, 403);
  assert.equal((await eq.get('/api/alertas/meus')).status, 200);
});
