// Asaas: configuração, emissão de boleto/Pix, sincronização e baixa automática pelo webhook (com um Asaas falso).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { start, stop, sql, Client, BASE } = require('./helpers');

// ---- Asaas falso ----
const fake = { customers: [], payments: [], webhooks: [], chamadas: [] };
let srv, fakeUrl;
function resp(res, code, body) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); }
function iniciarFake() {
  return new Promise((ok) => {
    srv = http.createServer((req, res) => {
      let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => {
        const body = b ? JSON.parse(b) : null; const u = new URL(req.url, 'http://x'); const p = u.pathname;
        fake.chamadas.push(`${req.method} ${p}`);
        if (req.headers.access_token !== 'chave-sandbox-123') return resp(res, 401, { errors: [{ description: 'invalid token' }] });
        if (p === '/myAccount') return resp(res, 200, { name: 'Neon Sistemas (sandbox)' });
        if (p === '/customers' && req.method === 'GET') return resp(res, 200, { data: fake.customers.filter((c) => c.externalReference === u.searchParams.get('externalReference')) });
        if (p === '/customers') { if (!body.cpfCnpj) return resp(res, 400, { errors: [{ description: 'cpfCnpj obrigatório' }] }); const c = { id: 'cus_' + (fake.customers.length + 1), ...body }; fake.customers.push(c); return resp(res, 200, c); }
        if (p === '/payments' && req.method === 'GET') return resp(res, 200, { data: fake.payments.filter((x) => x.externalReference === u.searchParams.get('externalReference')) });
        if (p === '/payments') { const x = { id: 'pay_' + (fake.payments.length + 1), status: 'PENDING', invoiceUrl: 'https://sandbox.asaas.com/i/abc' + (fake.payments.length + 1), bankSlipUrl: 'https://sandbox.asaas.com/b/abc', ...body }; fake.payments.push(x); return resp(res, 200, x); }
        let m = p.match(/^\/payments\/(pay_\d+)(\/\w+)?$/);
        if (m) {
          const x = fake.payments.find((y) => y.id === m[1]); if (!x) return resp(res, 404, {});
          if (m[2] === '/pixQrCode') return resp(res, 200, { payload: '00020126PIXCOPIAECOLA', encodedImage: 'iVBOR' });
          if (m[2] === '/receiveInCash') { x.status = 'RECEIVED_IN_CASH'; return resp(res, 200, x); }
          if (req.method === 'DELETE') { x.deleted = true; return resp(res, 200, { deleted: true, id: x.id }); }
          if (req.method === 'PUT') { Object.assign(x, body); return resp(res, 200, x); }
          return resp(res, 200, x);
        }
        if (p === '/webhooks' && req.method === 'POST') { const w = { id: 'wh_1', ...body }; fake.webhooks.push(w); return resp(res, 200, w); }
        m = p.match(/^\/webhooks\/(\w+)$/); if (m) { Object.assign(fake.webhooks[0], body); return resp(res, 200, fake.webhooks[0]); }
        resp(res, 404, { errors: [{ description: 'rota falsa inexistente ' + p }] });
      });
    }).listen(0, () => { fakeUrl = `http://127.0.0.1:${srv.address().port}`; ok(); });
  });
}

const admin = new Client();
const ctx = {};
const esperar = async (fn, ms = 3000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 50)); } return false; };
const webhook = (body, token) => fetch(BASE + '/publico/asaas/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'asaas-access-token': token }, body: JSON.stringify(body) });

before(async () => {
  await iniciarFake();
  await start({ ASAAS_URL_TESTE: fakeUrl }); await admin.login();
  ctx.cli = (await admin.post('/api/clientes', { nome_fantasia: 'Motel Asaas', status: 'ativo', email: 'fin@motel.local', whatsapp: '(34) 99999-0000' })).body.data;
  ctx.cob = (await admin.post('/api/cobrancas', { cliente_id: ctx.cli.id, competencia: '2026-11', valor: '250,00', vencimento: '2099-12-10' })).body.data;
});
after(async () => { await stop(); srv.close(); });

test('sem configurar: emissão recusada com mensagem clara', async () => {
  const r = await admin.post(`/api/asaas/cobrancas/${ctx.cob.id}/emitir`);
  assert.equal(r.status, 400); assert.match(r.body.erro, /Configure o Asaas/);
});

test('configurar, testar a conexão e criar o webhook', async () => {
  assert.equal((await admin.post('/api/asaas/config', { ativo: true })).status, 400); // sem chave
  await admin.post('/api/asaas/config', { api_key: 'errada' });
  assert.equal((await admin.post('/api/asaas/testar')).status, 400);
  await admin.post('/api/asaas/config', { api_key: 'chave-sandbox-123', ativo: true, ambiente: 'sandbox' });
  const t = await admin.post('/api/asaas/testar');
  assert.equal(t.status, 200); assert.match(t.body.conta, /sandbox/);
  const w = await admin.post('/api/asaas/webhook');
  assert.equal(w.status, 200, JSON.stringify(w.body));
  assert.equal(fake.webhooks[0].url, BASE + '/publico/asaas/webhook');
  assert.ok(fake.webhooks[0].authToken.length >= 32);
  ctx.token = fake.webhooks[0].authToken;
  const c = await admin.get('/api/asaas/config');
  assert.ok(!JSON.stringify(c.body).includes('chave-sandbox-123'));
  assert.ok(!JSON.stringify(c.body).includes(ctx.token));
  assert.equal(c.body.tem_chave, true);
});

test('cliente sem CNPJ/CPF: aviso para preencher', async () => {
  const r = await admin.post(`/api/asaas/cobrancas/${ctx.cob.id}/emitir`);
  assert.equal(r.status, 400); assert.match(r.body.erro, /CNPJ ou CPF/);
  const [cb] = await sql('SELECT asaas_status, asaas_erro FROM cobrancas WHERE id=?', [ctx.cob.id]);
  assert.equal(cb.asaas_status, 'ERRO');
});

test('emite boleto/Pix uma vez só', async () => {
  await admin.patch(`/api/clientes/${ctx.cli.id}`, { cnpj: '12.345.678/0001-90' });
  const r = await admin.post(`/api/asaas/cobrancas/${ctx.cob.id}/emitir`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.asaas_id, 'pay_1'); assert.match(r.body.data.asaas_url, /sandbox\.asaas\.com/);
  assert.equal(fake.customers[0].cpfCnpj, '12345678000190'); assert.equal(fake.customers[0].mobilePhone, '34999990000');
  assert.equal(fake.payments[0].value, 250); assert.equal(fake.payments[0].dueDate, '2099-12-10'); assert.equal(fake.payments[0].externalReference, `cobranca:${ctx.cob.id}`);
  await admin.post(`/api/asaas/cobrancas/${ctx.cob.id}/emitir`);
  assert.equal(fake.payments.length, 1);
  const pix = await admin.get(`/api/asaas/cobrancas/${ctx.cob.id}/pix`);
  assert.equal(pix.body.copia_e_cola, '00020126PIXCOPIAECOLA');
});

test('mudar valor e vencimento no painel atualiza o Asaas', async () => {
  await admin.patch(`/api/cobrancas/${ctx.cob.id}`, { valor: '300', vencimento: '2099-12-15' });
  assert.ok(await esperar(() => fake.payments[0].value === 300 && fake.payments[0].dueDate === '2099-12-15'));
});

test('webhook: token errado é recusado; pagamento dá baixa e repetição é ignorada', async () => {
  assert.equal((await webhook({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } }, 'errado')).status, 401);
  const ev = { id: 'evt_1', event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1', status: 'RECEIVED', billingType: 'PIX', value: 300, paymentDate: '2026-11-20', externalReference: `cobranca:${ctx.cob.id}` } };
  const r = await webhook(ev, ctx.token);
  assert.equal(r.status, 200); assert.equal((await r.json()).resultado, 'baixa feita');
  const [cb] = await sql('SELECT status, pago_em, forma, asaas_status FROM cobrancas WHERE id=?', [ctx.cob.id]);
  assert.equal(cb.status, 'pago'); assert.equal(cb.pago_em, '2026-11-20'); assert.equal(cb.forma, 'pix'); assert.equal(cb.asaas_status, 'RECEIVED');
  const r2 = await webhook(ev, ctx.token);
  assert.equal((await r2.json()).repetido, true);
  const [log] = await sql("SELECT COUNT(*) n FROM atividades WHERE entidade='cobrancas' AND resumo LIKE '%Asaas%'");
  assert.ok(log.n >= 1);
});

test('estorno volta a cobrança para em aberto', async () => {
  const r = await webhook({ id: 'evt_2', event: 'PAYMENT_REFUNDED', payment: { id: 'pay_1', status: 'REFUNDED' } }, ctx.token);
  assert.equal((await r.json()).resultado, 'pagamento desfeito');
  const [cb] = await sql('SELECT status, pago_em FROM cobrancas WHERE id=?', [ctx.cob.id]);
  assert.equal(cb.status, 'pendente'); assert.equal(cb.pago_em, null);
});

test('pago por fora e cancelado no painel avisam o Asaas', async () => {
  const c2 = (await admin.post('/api/cobrancas', { cliente_id: ctx.cli.id, competencia: '2026-12', valor: '100', vencimento: '2099-01-10' })).body.data;
  await admin.post(`/api/asaas/cobrancas/${c2.id}/emitir`);
  await admin.post(`/api/cobrancas/${c2.id}/pagar`, { forma: 'dinheiro' });
  assert.ok(await esperar(() => fake.payments[1].status === 'RECEIVED_IN_CASH'));
  const c3 = (await admin.post('/api/cobrancas', { cliente_id: ctx.cli.id, competencia: '2027-01', valor: '100', vencimento: '2099-02-10' })).body.data;
  await admin.post(`/api/asaas/cobrancas/${c3.id}/emitir`);
  await admin.patch(`/api/cobrancas/${c3.id}`, { status: 'cancelado' });
  assert.ok(await esperar(() => fake.payments[2].deleted === true));
});

test('vencido e atualizar manualmente', async () => {
  const c4 = (await admin.post('/api/cobrancas', { cliente_id: ctx.cli.id, competencia: '2027-02', valor: '80', vencimento: '2099-03-10' })).body.data;
  const e = await admin.post(`/api/asaas/cobrancas/${c4.id}/emitir`);
  const pay = fake.payments.find((p) => p.id === e.body.data.asaas_id);
  pay.status = 'CONFIRMED'; pay.billingType = 'BOLETO'; pay.paymentDate = '2026-11-21';
  const r = await admin.post(`/api/asaas/cobrancas/${c4.id}/atualizar`);
  assert.equal(r.body.resultado, 'baixa feita');
  const [cb] = await sql('SELECT status, forma FROM cobrancas WHERE id=?', [c4.id]);
  assert.equal(cb.status, 'pago'); assert.equal(cb.forma, 'boleto');
});

test('emissão automática só para cobranças novas', async () => {
  // Cobrança antiga (antes de ligar) não é emitida
  const [old] = await sql("SELECT id FROM cobrancas WHERE competencia='2026-11'");
  await sql("INSERT INTO cobrancas (cliente_id, competencia, valor, vencimento, status, created_at) VALUES (?, '2025-01', 10, '2099-01-01', 'pendente', '2020-01-01')", [ctx.cli.id]);
  const nova = (await admin.post('/api/cobrancas', { cliente_id: ctx.cli.id, competencia: '2027-03', valor: '90', vencimento: '2099-04-10' })).body.data;
  const antes = fake.payments.length;
  const asaas = require('../server/asaas');
  assert.equal(typeof asaas.emitirPendentes, 'function');
  const r = await admin.post('/api/asaas/_teste/emitir-pendentes');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.emitidas, 1);
  assert.equal(fake.payments.length, antes + 1);
  const [cb] = await sql('SELECT asaas_id FROM cobrancas WHERE id=?', [nova.id]);
  assert.ok(cb.asaas_id); assert.ok(old);
});

test('pagamento recebido gera alerta', async () => {
  await admin.post('/api/alertas/telegram/chat', { chat_id: '55555555' }).catch(() => {});
  await sql("INSERT IGNORE INTO integracoes (rede, ativo, config) VALUES ('telegram', 1, '{\"bot_token\":\"1:a\"}')");
  await admin.post('/api/alertas/_teste/limpar');
  const [cb] = await sql("SELECT id, asaas_id FROM cobrancas WHERE competencia='2027-03'");
  await webhook({ id: 'evt_9', event: 'PAYMENT_CONFIRMED', payment: { id: cb.asaas_id, billingType: 'BOLETO', value: 90 } }, ctx.token);
  const s = (await admin.get('/api/alertas/_teste/saida')).body.data;
  assert.ok(s.some((x) => x.texto && x.texto.includes('Pagamento recebido')));
});
