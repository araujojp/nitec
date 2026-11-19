// Visitas do site: recebimento, localização, relatório e e-mail por visita.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, sql, Client, BASE } = require('./helpers');

const admin = new Client();
const UA_CEL = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const manda = (corpo, ua = UA_CEL, ip = '177.37.0.1') => fetch(BASE + '/publico/visitas', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8', 'User-Agent': ua, Origin: 'https://neonsistemas.com', 'X-Forwarded-For': ip }, body: JSON.stringify(corpo) });
const saida = async () => (await admin.get('/api/alertas/_teste/saida')).body.data;
const agora = () => Date.now();

before(async () => { await start(); await admin.login(); });
after(stop);

test('recebe a visita com aparelho, origem e eventos', async () => {
  const r = await manda({ s: 'sessaoAAAA0001', v: 'visitanteX0001', m: { url: 'https://neonsistemas.com/?utm_source=instagram&utm_campaign=bf', ref: 'https://l.instagram.com/', lang: 'pt', tela: [412, 915], dpr: 3, janela: [412, 800], fuso: 'America/Sao_Paulo', idiomas: ['pt-BR', 'en'], toque: 5, memoria: 8, nucleos: 8, rede: { tipo: '4g', mbps: 10 }, escuro: true, utm: { utm_source: 'instagram', utm_campaign: 'bf' }, ch: { model: 'SM-S918B' } },
    e: [{ k: 'inicio', t: agora(), url: 'https://neonsistemas.com/', titulo: 'Neon Sistemas' }, { k: 'secao', t: agora(), id: 'painel-neon', ms: 42000 }, { k: 'rolagem', t: agora(), pct: 75 },
      { k: 'clique', t: agora(), texto: 'Ver planos', href: '#planos' }, { k: 'calculadora', t: agora(), valores: { cSuites: 20, cGiro: 3 }, resultado: 'R$ 4.200/mês' },
      { k: 'form_campo', t: agora(), campo: 'nome', tam: 5 }, { k: 'form_envio', t: agora(), campos: { nome: 'Carla', empresa: 'Motel Lua', interesse: 'Painel Neon', msg: 'Quero orçamento' } },
      { k: 'whatsapp', t: agora(), numero: '5534984302083', onde: 'flutuante' }, { k: 'tipo_invalido', t: agora() }, { k: 'fim', t: agora(), total_ms: 185000, ativo_ms: 150000 }] });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://neonsistemas.com');
  const [v] = await sql("SELECT * FROM site_visitas WHERE sessao='sessaoAAAA0001'");
  assert.equal(v.ip, '177.37.0.1'); assert.equal(v.formulario, 2); assert.equal(v.whatsapp, 1); assert.equal(v.terminou, 1); assert.equal(v.n_eventos, 10 - 1);
  await new Promise((x) => setTimeout(x, 300));
  const [v2] = await sql("SELECT geo FROM site_visitas WHERE sessao='sessaoAAAA0001'");
  assert.match(JSON.stringify(v2.geo), /Uberlândia/);
});

test('robôs são marcados; sessão inválida e origem estranha são ignoradas', async () => {
  await manda({ s: 'sessaoROBO0001', e: [{ k: 'inicio', t: agora() }] }, 'Googlebot/2.1 (+http://www.google.com/bot.html)');
  const [r] = await sql("SELECT robo FROM site_visitas WHERE sessao='sessaoROBO0001'");
  assert.equal(r.robo, 1);
  await manda({ s: 'x', e: [] });
  const [n] = await sql('SELECT COUNT(*) n FROM site_visitas');
  assert.equal(n.n, 2);
});

test('relatório completo e e-mail por visita para o destinatário', async () => {
  const [v] = await sql("SELECT id FROM site_visitas WHERE sessao='sessaoAAAA0001'");
  const rel = await admin.get(`/api/visitas/${v.id}/relatorio`);
  assert.equal(rel.status, 200);
  for (const t of ['Uberlândia/MG', 'Celular', 'Android 14', 'SM-S918B', 'Instagram', 'Campanha: instagram', 'Motel Lua', 'Quero orçamento', 'ENVIOU O FORMULÁRIO', 'Painel Neon', '75%', 'R$ 4.200/mês', '177.37.0.1', 'Ver no mapa', '5534984302083'])
    assert.ok(String(rel.body).includes(t), t);
  await sql("UPDATE site_visitas SET ultimo = UTC_TIMESTAMP() - INTERVAL 20 MINUTE");
  await admin.post('/api/alertas/_teste/limpar');
  const r = await admin.post('/api/visitas/_teste/rodar', {});
  assert.equal(r.body.enviados, 1, JSON.stringify(r.body));
  const s = await saida();
  assert.equal(s.length, 1);
  assert.equal(s[0].para, 'bignetsoluc@gmail.com');
  assert.match(s[0].assunto, /🔥 Visita no site · Uberlândia\/MG · celular/);
  const [st] = await sql("SELECT email_status FROM site_visitas WHERE sessao='sessaoROBO0001'");
  assert.match(st.email_status, /robô/);
  assert.equal((await admin.post('/api/visitas/_teste/rodar', {})).body.enviados, 0);
});

test('visitante que volta é reconhecido', async () => {
  await manda({ s: 'sessaoAAAA0002', v: 'visitanteX0001', m: { url: 'https://neonsistemas.com/' }, e: [{ k: 'inicio', t: agora() }] }, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', '200.1.2.3');
  const [v] = await sql("SELECT id FROM site_visitas WHERE sessao='sessaoAAAA0002'");
  const rel = String((await admin.get(`/api/visitas/${v.id}/relatorio`)).body);
  assert.ok(rel.includes('voltou')); assert.ok(rel.includes('Windows')); assert.ok(rel.includes('Acesso direto'));
});

test('lista, configuração e permissões', async () => {
  const l = await admin.get('/api/visitas');
  assert.equal(l.status, 200); assert.equal(l.body.total, 2); assert.equal(l.body.hoje.formularios, 1);
  assert.equal((await admin.get('/api/visitas?filtro=contato')).body.total, 1);
  assert.equal((await admin.get('/api/visitas?filtro=robos')).body.total, 1);
  assert.equal((await admin.post('/api/visitas/config', { email: 'nao-e-email' })).status, 400);
  await admin.post('/api/visitas/config', { email: 'a@b.com, c@d.com', modo: 'interacao' });
  const c = (await admin.get('/api/visitas/config')).body;
  assert.equal(c.email, 'a@b.com, c@d.com'); assert.equal(c.modo, 'interacao');
  await admin.post('/api/usuarios', { nome: 'Eq', email: 'eqv@teste.local', funcao: 'equipe', senha: 'senha-1234' });
  const eq = await new Client().login('eqv@teste.local', 'senha-1234');
  assert.equal((await eq.get('/api/visitas')).status, 403);
  // modo "só com interação": visita sem nada é pulada
  await manda({ s: 'sessaoVAZIA001', e: [{ k: 'inicio', t: agora() }] });
  await sql("UPDATE site_visitas SET ultimo = UTC_TIMESTAMP() - INTERVAL 20 MINUTE WHERE sessao IN ('sessaoVAZIA001','sessaoAAAA0002')");
  await admin.post('/api/visitas/_teste/rodar', {});
  const [p] = await sql("SELECT email_status FROM site_visitas WHERE sessao='sessaoVAZIA001'");
  assert.match(p.email_status, /sem interação/);
});

test('resumo do dia sai uma vez no horário', async () => {
  await admin.post('/api/visitas/config', { email: 'bignetsoluc@gmail.com', resumo_hora: 21 });
  await admin.post('/api/alertas/_teste/limpar');
  const fora = new Date(); fora.setUTCHours(15, 0, 0, 0);
  assert.equal((await admin.post('/api/visitas/_teste/rodar', { agora: fora.toISOString() })).body.resumo, false);
  const na = new Date(); na.setUTCHours(0, 30, 0, 0); na.setUTCDate(na.getUTCDate() + (new Date().getUTCHours() >= 3 ? 1 : 0)); // 21h30 em Brasília
  const r = await admin.post('/api/visitas/_teste/rodar', { agora: na.toISOString() });
  assert.equal(r.body.resumo, true);
  assert.equal((await admin.post('/api/visitas/_teste/rodar', { agora: na.toISOString() })).body.resumo, false);
  const s = await saida();
  assert.ok(s.some((m) => /Resumo do site/.test(m.assunto)));
});

test('origem completada quando os dados do aparelho chegam antes', async () => {
  await manda({ s: 'sessaoCORRIDA1', m: { ch: { model: 'Pixel 8' } }, e: [] });
  await manda({ s: 'sessaoCORRIDA1', m: { url: 'https://neonsistemas.com/?utm_source=google', ref: 'https://www.google.com/', lang: 'pt', utm: { utm_source: 'google' } }, e: [{ k: 'inicio', t: Date.now() }] });
  const [v] = await sql("SELECT id, origem, entrada FROM site_visitas WHERE sessao='sessaoCORRIDA1'");
  assert.equal(v.origem, 'https://www.google.com/');
  const rel = String((await admin.get(`/api/visitas/${v.id}/relatorio`)).body);
  assert.ok(rel.includes('Pixel 8')); assert.ok(rel.includes('Busca do Google · Campanha: google'));
});
