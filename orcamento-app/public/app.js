/* Gerador de orçamento · Neon Sistemas (cliente) */
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const BRL = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) ? '—' :
    Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const num = (v) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- perguntas sobre a situação atual ---------- */
  const AMB = [
    { k: 'internet', q: 'Tem internet contratada?', t: 'sn' },
    { k: 'velocidade', q: 'Velocidade contratada (Mbps)', t: 'txt', ph: 'Ex.: 300' },
    { k: 'computador', q: 'Já tem computador para a recepção (Neon Motel + PABX)?', t: 'sn', sug: { sim: { e_pc: 'h' }, nao: { e_pc: 'p' } } },
    { k: 'roteador', q: 'Já tem roteador de acesso?', t: 'sn', sug: { sim: { r_roteador: 'h' }, nao: { r_roteador: 'p' } } },
    { k: 'switch', q: 'Já tem switch gerenciável?', t: 'sn', sug: { sim: { r_switch: 'h', r_switch_ala: 'h' }, nao: { r_switch: 'p', r_switch_ala: 'p' } } },
    { k: 'rede', q: 'Já existe cabeamento estruturado (cabo passado até as suítes)?', t: 'sn', sug: { sim: { r_cabo: 'h', r_keystone: 'h', r_patch: 'h', r_rack: 'h', r_patchcord: 'h', r_tomada: 'h', m_passagem: 'n' }, nao: { r_cabo: 'p', m_passagem: 'p' } }, nota: { sim: 'Cabeamento já existente: confira se os pontos estão certificados e se chegam a cada suíte. Será feita apenas a certificação.' } },
    { k: 'wifi', q: 'Como está o Wi-Fi hoje?', t: 'esc', opts: ['Ruim', 'Regular', 'Boa'], nota: { Boa: 'Wi-Fi bom: avalie se os access points atuais podem ser aproveitados. Antes de descartar, faça um teste de cobertura.', Ruim: 'Wi-Fi ruim: recomendamos os access points de teto previstos na proposta.' } },
    { k: 'tablets', q: 'Já tem tablets para as suítes?', t: 'sn', sug: { sim: { e_tablet: 'h', e_suporte: 'h' }, nao: { e_tablet: 'p' } } },
    { k: 'tomada', q: 'As suítes já têm tomada perto do painel?', t: 'sn', sug: { sim: { m_tomada: 'h' }, nao: { m_tomada: 'p' } } },
    { k: 'pabx', q: 'Já tem central telefônica (PABX)?', t: 'sn', nota: { sim: 'Se a central atual for substituída, confira a integração e os ramais existentes.' } },
    { k: 'tv', q: 'As suítes já têm TV?', t: 'sn', nota: { sim: 'A TV pode ser controlada pelo painel Neon. Confirme o modelo e o protocolo de controle.' } },
  ];

  /* ---------- catálogo: cada item tem quantidade calculada ---------- */
  function contexto(L) {
    const suites = Math.max(1, parseInt(L.suites) || 0);
    const alas = Math.max(1, parseInt(L.alas) || 1);
    const aps = alas * Math.ceil(suites / alas / 5) + 1; // ~1 access point a cada 5 suítes por ala, +1 na recepção
    const extras = Math.max(0, parseInt(L.extras) || 0);
    const pontos = suites + aps + extras;
    return { suites, alas, aps, extras, pontos, ramais: Math.max(0, parseInt(L.ramais) || 0), horas: Math.max(0, parseInt(L.horas) || 0), tablet: L.tablet || '10.1' };
  }
  function definicoes(c) {
    const tab = c.tablet === '10.1' ? '10,1"' : c.tablet.replace('.', ',') + '"';
    const tabRef = c.tablet === '10.1' ? 'R$ 725 a R$ 1.500 (Android 10,1")' : 'a cotar (tablet 8")';
    return [
      { id: 'r_roteador', g: 'Rede', n: 'Roteador de acesso / firewall', e: 'Equipamento de borda com firewall e balanceamento de link. Pode ser o do provedor, se atender.', u: 'un', q: () => 1, ref: 'a cotar' },
      { id: 'r_switch', g: 'Rede', n: 'Switch principal gerenciável PoE 24 portas', e: 'Gigabit, PoE+, gerenciável, com portas SFP para uplink. Ex.: Intelbras SG2404 PoE Max; TP-Link TL-SG3428MP.', u: 'un', q: () => 1, ref: 'R$ 1.600 (Intelbras SG2404 PoE Max) a R$ 4.300 (TP-Link 24 PoE+)' },
      { id: 'r_switch_ala', g: 'Rede', n: 'Switch de ala PoE 8 portas (um por ala)', e: 'Gigabit gerenciável com PoE+, para os access points e tablets de cada ala.', u: 'un', q: (x) => x.alas, ref: 'a cotar na visita' },
      { id: 'r_ap', g: 'Rede', n: 'Access point Wi-Fi 6 (teto ou parede, PoE)', e: 'Cobertura dos corredores e da recepção. Ex.: TP-Link Omada EAP650 (Wi-Fi 6, AX3000). Alternativa econômica: Huawei AP361.', u: 'un', q: (x) => x.aps, ref: 'R$ 1.250 (TP-Link EAP650) · R$ 390 (Huawei AP361)' },
      { id: 'r_rack', g: 'Rede', n: 'Rack de parede 6U', e: 'Com porta e ventilação, para switch, patch panel e nobreak.', u: 'un', q: () => 1, ref: 'a cotar' },
      { id: 'r_patch', g: 'Rede', n: 'Patch panel 24 portas Cat6', e: 'Organização dos cabos no rack.', u: 'un', q: (x) => x.alas, ref: 'a cotar' },
      { id: 'r_keystone', g: 'Rede', n: 'Conectores RJ45 keystone Cat6', e: 'Um conector por ponto de rede.', u: 'un', q: (x) => x.pontos, ref: 'a cotar' },
      { id: 'r_cabo', g: 'Rede', n: 'Cabo UTP Cat6 — caixa de 305 m', e: 'Cobre, 4 pares. Estimativa de 30 m por ponto, com folga.', u: 'caixa', q: (x) => Math.ceil(x.pontos * 30 / 305), ref: 'R$ 480 a R$ 2.850 por caixa, conforme a marca' },
      { id: 'r_patchcord', g: 'Rede', n: 'Patch cords Cat6 (1 m e 2 m)', e: 'Ligação do rack e dos pontos.', u: 'un', q: (x) => x.pontos * 2, ref: 'a cotar' },
      { id: 'r_tomada', g: 'Rede', n: 'Tomadas, caixas 4x2 e eletrodutos', e: 'Acabamento de cada ponto de rede.', u: 'ponto', q: (x) => x.pontos, ref: 'a cotar' },
      { id: 'r_nobreak', g: 'Rede', n: 'Nobreak 600 VA (rack de cada ala e recepção)', e: 'Proteção do rack e do servidor.', u: 'un', q: (x) => x.alas + 1, ref: 'a cotar' },
      { id: 'e_pc', g: 'Equipamentos', n: 'Computador da recepção (Neon Motel + PABX)', e: 'Mínimo: Intel Core i3 8ª geração (ou Ryzen 3), 4 GB de RAM, SSD 128 GB. Recomendado: i5 10ª geração (ou Ryzen 5), 8 GB, SSD 256 GB.', u: 'un', q: () => 1, ref: 'R$ 800 a R$ 1.300 (gerações anteriores)' },
      { id: 'e_tablet', g: 'Equipamentos', n: `Tablet para o painel da suíte (${tab})`, e: 'Android, para o Painel Neon de cada suíte. Capa de proteção incluída nesta linha.', u: 'un', q: (x) => x.suites, ref: tabRef },
      { id: 'e_suporte', g: 'Equipamentos', n: 'Suporte de parede para tablet (antifurto)', e: 'Fixação de parede com trava antifurto.', u: 'un', q: (x) => x.suites, ref: 'a cotar' },
      { id: 's_motel', g: 'Sistemas Neon', n: 'Neon Motel — licença do sistema de gestão', e: 'Suítes, recepção, caixa, estoque, governança e relatórios.', u: 'licença', q: () => 1, ref: 'preço de venda' },
      { id: 's_painel', g: 'Sistemas Neon', n: 'Painel Neon — licença por suíte', e: 'Painel touch da suíte: luzes, TV, som, clima e cenas.', u: 'suíte', q: (x) => x.suites, ref: 'preço de venda' },
      { id: 's_central', g: 'Sistemas Neon', n: 'Central de automação da suíte (placa Neon)', e: 'Controla luzes, ar-condicionado e cenas da suíte.', u: 'un', q: (x) => x.suites, ref: 'preço de venda a definir' },
      { id: 's_pabx', g: 'Sistemas Neon', n: 'PABX Neon — licença por ramal', e: 'Ramais no celular da equipe e da recepção, URA e integração com o Neon Motel.', u: 'ramal', q: (x) => x.ramais, ref: 'preço de venda' },
      { id: 'm_passagem', g: 'Instalação e mão de obra', n: 'Passagem de cabo Cat6 até cada ponto', e: 'Lançamento, identificação e fixação dos cabos.', u: 'ponto', q: (x) => x.pontos, ref: 'a cotar (sem tabela pública confiável)' },
      { id: 'm_teste', g: 'Instalação e mão de obra', n: 'Certificação e teste de cada ponto (relatório)', e: 'Teste de continuidade e certificação conforme NBR 14565 / TIA-568.', u: 'ponto', q: (x) => x.pontos, ref: 'a cotar' },
      { id: 'm_rack', g: 'Instalação e mão de obra', n: 'Montagem do rack, switches e organização', e: 'Fixação, identificação e organização dos cabos.', u: 'serviço', q: () => 1, ref: 'a cotar' },
      { id: 'm_tomada', g: 'Instalação e mão de obra', n: 'Tomada elétrica para tablet e painel (110/220 V)', e: 'Uma tomada por suíte, perto do painel.', u: 'suíte', q: (x) => x.suites, ref: 'a cotar' },
      { id: 'm_tablet', g: 'Instalação e mão de obra', n: 'Instalação dos tablets e suportes', e: 'Fixação, energia e ligação ao painel da suíte.', u: 'suíte', q: (x) => x.suites, ref: 'a cotar' },
      { id: 'm_motel', g: 'Instalação e mão de obra', n: 'Instalação e configuração do Neon Motel', e: 'Instalação no servidor da recepção, cadastro das suítes e da equipe.', u: 'serviço', q: () => 1, ref: 'a cotar' },
      { id: 'm_pabx', g: 'Instalação e mão de obra', n: 'Instalação e configuração do PABX Neon', e: 'Servidor, ramais no celular, URA e integração.', u: 'serviço', q: () => 1, ref: 'a cotar' },
      { id: 'm_painel', g: 'Instalação e mão de obra', n: 'Configuração dos painéis Neon nas suítes', e: 'Cenas de ambiente e integração com a central de cada suíte.', u: 'suíte', q: (x) => x.suites, ref: 'a cotar' },
      { id: 'm_wifi', g: 'Instalação e mão de obra', n: 'Configuração de redes Wi-Fi (sistema, hóspedes, telefonia)', e: 'Separação de redes, segurança e testes de cobertura.', u: 'serviço', q: () => 1, ref: 'a cotar' },
      { id: 'm_treino', g: 'Instalação e mão de obra', n: 'Treinamento da equipe', e: 'Operação do painel, recepção e rotina diária.', u: 'hora', q: (x) => x.horas, ref: 'a definir' },
      { id: 'p_inicial', g: 'Suporte', n: 'Suporte inicial gratuito (3 meses)', e: 'Incluído no valor da implantação.', u: 'mês', q: () => 3, ref: 'incluso', fixo: 0 },
      { id: 'p_mensal', g: 'Suporte', n: 'Suporte mensal após o período inicial', e: 'Atendimento remoto e visitas de manutenção.', u: 'mês', q: () => 12, ref: 'a definir' },
    ];
  }

  /* ---------- estado ---------- */
  const hoje = () => new Date().toISOString().slice(0, 10);
  let S = novoEstado();
  let memId = null; // quando aberto a partir da memória
  let curId = null, curToken = null; // orçamento criado por este navegador

  function novoEstado() {
    const L = { suites: 30, alas: 2, extras: 4, ramais: 10, horas: 8, tablet: '10.1' };
    const c = contexto(L);
    return {
      titulo: '', data: hoje(), validade: 15, status: 'rascunho',
      cliente: { nome: '', tipo: '', responsavel: '', telefone: '', email: '', documento: '', endereco: '', cidade: '', uf: '' },
      local: L,
      ambiente: {},
      itens: definicoes(c).map((d) => ({ id: d.id, grupo: d.g, nome: d.n, espec: d.e, unidade: d.u, qtd: d.q(c), ref: d.ref,
        status: 'precisa', valorUnit: d.fixo !== undefined ? d.fixo : null, obs: '', auto: true })),
      descontoPct: 0, impostoPct: 0, pagamento: '', condicoes: '', observacoes: '',
    };
  }
  function recalcular() {
    const c = contexto(S.local);
    const defs = Object.fromEntries(definicoes(c).map((d) => [d.id, d]));
    for (const it of S.itens) {
      const d = defs[it.id];
      if (!d) continue;
      if (it.auto) {
        it.qtd = d.q(c);
        it.nome = d.n; it.espec = d.e; it.ref = d.ref;
      }
    }
  }

  /* ---------- editor: campos gerais ---------- */
  let camposLigados = false;
  function bindCampos() {
    if (camposLigados) return;
    camposLigados = true;
    $$('[data-k]').forEach((el) => {
      const k = el.dataset.k;
      el.value = S[k] ?? '';
      el.addEventListener('input', () => { S[k] = el.type === 'number' ? num(el.value) ?? '' : el.value; atualizarTotais(); autoSalvarRascunho(); });
    });
    $$('[data-c]').forEach((el) => {
      const k = el.dataset.c;
      el.value = S.cliente[k] ?? '';
      el.addEventListener('input', () => { S.cliente[k] = el.value; autoSalvarRascunho(); });
    });
    $$('[data-l]').forEach((el) => {
      const k = el.dataset.l;
      el.value = S.local[k] ?? '';
      el.addEventListener('input', () => {
        S.local[k] = el.value;
        recalcular(); renderItens(); atualizarTotais(); autoSalvarRascunho();
      });
    });
  }

  /* ---------- situação atual ---------- */
  function renderAmbiente() {
    const box = $('#ambiente');
    box.innerHTML = AMB.map((p) => {
      const val = S.ambiente[p.k] ?? '';
      let ctrl = '';
      if (p.t === 'sn') {
        ctrl = `<div class="seg" data-q="${p.k}">
          <button type="button" data-v="sim" class="${val === 'sim' ? 'on' : ''}">Sim</button>
          <button type="button" data-v="nao" class="${val === 'nao' ? 'on' : ''}">Não</button></div>`;
      } else if (p.t === 'esc') {
        ctrl = `<div class="seg" data-q="${p.k}">${p.opts.map((o) => `<button type="button" data-v="${o}" class="${val === o ? 'on' : ''}">${o}</button>`).join('')}</div>`;
      } else {
        ctrl = `<div class="txt"><input data-txt="${p.k}" value="${esc(val)}" placeholder="${esc(p.ph || '')}"></div>`;
      }
      const nota = p.nota && p.nota[val] ? `<div class="sug">${esc(p.nota[val])}</div>` : '';
      return `<div class="q"><span>${esc(p.q)}</span>${ctrl}${nota}</div>`;
    }).join('');
    $$('[data-q]').forEach((g) => g.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const k = g.dataset.q, v = b.dataset.v;
      S.ambiente[k] = v;
      aplicarSugestao(k, v);
      renderAmbiente(); renderItens(); atualizarTotais(); autoSalvarRascunho();
    }));
    $$('[data-txt]').forEach((i) => i.addEventListener('input', () => { S.ambiente[i.dataset.txt] = i.value; autoSalvarRascunho(); }));
  }
  function aplicarSugestao(k, v) {
    const p = AMB.find((x) => x.k === k);
    const map = p && p.sug && p.sug[v === 'sim' ? 'sim' : (v === 'nao' ? 'nao' : v)];
    if (!map) return;
    const st = { h: 'possui', p: 'precisa', n: 'nao' };
    for (const [id, code] of Object.entries(map)) {
      const it = S.itens.find((x) => x.id === id);
      if (it) it.status = st[code];
    }
  }

  /* ---------- tabela de itens ---------- */
  const STATUS_OPTS = [['precisa', 'Precisa (orçar)'], ['possui', 'Cliente já possui'], ['nao', 'Não se aplica']];
  function renderItens() {
    const body = $('#itensBody');
    let html = '', grupoAtual = null;
    S.itens.forEach((it, idx) => {
      if (it.grupo !== grupoAtual) { grupoAtual = it.grupo; html += `<tr class="grp"><td colspan="8">${esc(grupoAtual)}</td></tr>`; }
      const off = it.status !== 'precisa';
      const sel = `<select data-i="${idx}" data-f="status">${STATUS_OPTS.map(([v, l]) => `<option value="${v}" ${it.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
      const tot = (it.status === 'precisa' && it.valorUnit !== null && it.valorUnit !== '' && Number.isFinite(Number(it.valorUnit))) ? Number(it.valorUnit) * (Number(it.qtd) || 0) : null;
      const pend = (it.status === 'precisa' && (Number(it.qtd) || 0) > 0 && (it.valorUnit === null || it.valorUnit === '')) ? '<span class="pend">sem valor</span>' : '';
      html += `<tr class="${off ? 'off' : ''}">
        <td><span class="nm">${esc(it.nome)}</span><span class="espec">${esc(it.espec || '')}</span>${it.ref ? `<span class="ref">Ref.: ${esc(it.ref)}</span>` : ''}</td>
        <td class="c">${sel}</td>
        <td class="c"><input class="qt" type="number" min="0" step="1" data-i="${idx}" data-f="qtd" value="${esc(it.qtd)}">${it.auto ? '' : '<span class="lock" title="Quantidade ajustada manualmente">✎ manual</span>'}</td>
        <td>${esc(it.unidade)}</td>
        <td class="r"><input class="num" type="number" min="0" step="0.01" data-i="${idx}" data-f="valorUnit" value="${it.valorUnit ?? ''}" placeholder="—" ${off ? 'disabled' : ''}></td>
        <td class="r calc">${tot === null ? '—' : BRL(tot)} ${pend}</td>
        <td><input data-i="${idx}" data-f="obs" value="${esc(it.obs || '')}" placeholder="Observação"></td>
        <td><button class="del" type="button" data-i="${idx}" data-del title="Remover (marca como não se aplica)">×</button></td>
      </tr>`;
    });
    body.innerHTML = html;
    $$('#itensBody [data-f]').forEach((el) => {
      const ev = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(ev, () => {
        const it = S.itens[+el.dataset.i], f = el.dataset.f;
        if (f === 'qtd') { it.qtd = num(el.value) ?? 0; it.auto = false; }
        else if (f === 'valorUnit') { it.valorUnit = el.value === '' ? null : num(el.value); }
        else if (f === 'status') { it.status = el.value; }
        else if (f === 'obs') { it.obs = el.value; }
        if (f === 'status' || f === 'qtd') renderItens();
        else { atualizarLinha(el); }
        atualizarTotais(); autoSalvarRascunho();
      });
    });
    $$('#itensBody [data-del]').forEach((b) => b.addEventListener('click', () => { S.itens[+b.dataset.i].status = 'nao'; renderItens(); atualizarTotais(); autoSalvarRascunho(); }));
  }
  function atualizarLinha(el) {
    const tr = el.closest('tr'); const it = S.itens[+el.dataset.i];
    if (!tr || !it) return;
    const cel = tr.querySelector('td.r.calc');
    const tot = (it.status === 'precisa' && it.valorUnit !== null && Number.isFinite(Number(it.valorUnit))) ? Number(it.valorUnit) * (Number(it.qtd) || 0) : null;
    const pend = (it.status === 'precisa' && (Number(it.qtd) || 0) > 0 && (it.valorUnit === null)) ? ' <span class="pend">sem valor</span>' : '';
    cel.innerHTML = (tot === null ? '—' : BRL(tot)) + pend;
  }

  /* ---------- totais ---------- */
  function calcular(D = S) {
    let sub = 0, pend = 0;
    for (const it of D.itens) {
      if (it.status !== 'precisa') continue;
      const q = Number(it.qtd) || 0;
      if (it.valorUnit === null || it.valorUnit === '' || !Number.isFinite(Number(it.valorUnit))) { if (q > 0) pend++; continue; }
      sub += Number(it.valorUnit) * q;
    }
    const desc = sub * ((Number(D.descontoPct) || 0) / 100);
    const imp = (sub - desc) * ((Number(D.impostoPct) || 0) / 100);
    return { sub, desc, imp, tot: sub - desc + imp, pend };
  }
  function atualizarTotais() {
    const r = calcular();
    $('#tSub').textContent = BRL(r.sub);
    $('#tDesc').textContent = BRL(r.desc);
    $('#tImp').textContent = BRL(r.imp);
    $('#tTot').textContent = r.sub > 0 ? BRL(r.tot) : 'a preencher';
    $('#tPend').textContent = r.pend;
  }

  /* ---------- rascunho local ---------- */
  let tRasc = null;
  function autoSalvarRascunho() {
    clearTimeout(tRasc);
    tRasc = setTimeout(() => { try { localStorage.setItem('neon-orc-rascunho', JSON.stringify(S)); } catch (e) {} }, 400);
  }
  function carregarRascunho() {
    try { const r = JSON.parse(localStorage.getItem('neon-orc-rascunho') || 'null'); if (r && r.itens) S = r; } catch (e) {}
    try { const c = JSON.parse(localStorage.getItem('neon-orc-atual') || 'null'); if (c) { curId = c.id; curToken = c.token; } } catch (e) {}
  }

  /* ---------- salvar ---------- */
  function msg(html, ok) { $('#saveBox').innerHTML = `<div class="${ok ? 'ok' : ''}">${html}</div>`; }
  async function api(url, opts = {}) {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, method: opts.method || 'GET', body: opts.body, credentials: 'same-origin' });
    let j = {}; try { j = await r.json(); } catch (e) {}
    if (!r.ok) throw Object.assign(new Error(j.erro || 'Erro ao comunicar com o servidor.'), { status: r.status });
    return j;
  }
  async function salvar() {
    const dados = JSON.parse(JSON.stringify(S));
    dados.titulo = dados.titulo || ('Orçamento · ' + (dados.cliente.nome || 'sem cliente'));
    S.titulo = dados.titulo;
    try {
      if (memId) {
        await api('/api/memoria/' + memId, { method: 'PUT', body: JSON.stringify({ dados }) });
        msg(`Atualizado na memória (#${memId}).`, true);
      } else if (curId && curToken) {
        const r = await api('/api/orcamentos/' + curId, { method: 'PUT', headers: { 'X-Token': curToken }, body: JSON.stringify({ dados }) });
        msg(`Salvo · versão ${r.versao}. Número <b>#${curId}</b>.`, true);
      } else {
        const r = await api('/api/orcamentos', { method: 'POST', body: JSON.stringify({ dados }) });
        curId = r.id; curToken = r.token;
        localStorage.setItem('neon-orc-atual', JSON.stringify({ id: curId, token: curToken }));
        msg(`Salvo na memória como <b>#${curId}</b>. Guarde este código de edição: <code>${esc(curToken)}</code>`, true);
      }
    } catch (e) { msg(esc(e.message), false); }
  }

  /* ---------- exportar ---------- */
  async function baixar(url, nome) {
    try {
      const dados = JSON.parse(JSON.stringify(S));
      dados.titulo = dados.titulo || ('Orçamento · ' + (dados.cliente.nome || 'sem cliente'));
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dados }) });
      if (!r.ok) { let j = {}; try { j = await r.json(); } catch (e) {} throw new Error(j.erro || 'Falha ao exportar.'); }
      const blob = await r.blob();
      const cd = r.headers.get('Content-Disposition') || '';
      const m = /filename="([^"]+)"/.exec(cd);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = m ? m[1] : nome;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { msg(esc(e.message), false); }
  }

  /* ---------- PDF (mesmo padrão visual da proposta) ---------- */
  function propostaHTML(d) {
    const c = contexto(d.local);
    const itens = (d.itens || []).filter((i) => i.status !== 'nao');
    const grupos = [...new Set(itens.map((i) => i.grupo))];
    const r = calcular(d);
    const logo = location.origin + '/assets/logo-neon.png';
    const linhasItens = (g) => itens.filter((i) => i.grupo === g).map((i) => {
      const sit = i.status === 'possui' ? '<span class="pill ok">Cliente já possui</span>' : '<span class="pill">Precisa</span>';
      const vu = i.status === 'precisa' && i.valorUnit !== null && i.valorUnit !== '' ? BRL(i.valorUnit) : (i.status === 'possui' ? '—' : '<span class="blank">R$ ________</span>');
      const tt = i.status === 'precisa' && i.valorUnit !== null && i.valorUnit !== '' ? BRL(Number(i.valorUnit) * (Number(i.qtd) || 0)) : (i.status === 'possui' ? '—' : '<span class="blank">R$ ________</span>');
      return `<tr><td><b>${esc(i.nome)}</b><br><span class="sm">${esc(i.espec || '')}</span></td><td>${sit}</td><td class="c">${esc(i.qtd)} ${esc(i.unidade)}</td><td class="r">${vu}</td><td class="r">${tt}</td></tr>`;
    }).join('');
    const ambRows = AMB.map((p) => {
      const v = (d.ambiente || {})[p.k];
      const vt = v === 'sim' ? 'Sim' : v === 'nao' ? 'Não' : (v || '—');
      return `<tr><td>${esc(p.q)}</td><td>${esc(vt)}</td></tr>`;
    }).join('');
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(d.titulo || 'Pré-orçamento')}</title>
<style>
@page{size:A4;margin:12mm 14mm 16mm}
body{font:9.6pt/1.5 Inter,Arial,sans-serif;color:#1c2233;margin:0}
h1{font:700 21pt/1.12 'Space Grotesk',Arial,sans-serif;color:#0b1122;margin:0 0 3mm}
h2{font:700 13pt 'Space Grotesk',Arial,sans-serif;color:#0b1122;border-bottom:2px solid #f97316;padding-bottom:1.5mm;margin:7mm 0 3mm;page-break-after:avoid}
.band{background:linear-gradient(120deg,#070b16,#0f1830);color:#fff;padding:10mm 14mm;margin:-12mm -14mm 6mm;display:flex;justify-content:space-between;align-items:center}
.band img{height:14mm}.band .t{text-align:right;font-size:8.5pt;color:#9aa6c4}.band .t b{color:#f9a03f}
.cover{background:linear-gradient(160deg,#070b16,#0f1830);color:#fff;margin:-12mm -14mm 0;padding:18mm 16mm 14mm;border-radius:0 0 6mm 6mm}
.cover img{height:24mm;margin-bottom:9mm}
.eyebrow{font:600 11pt Inter;color:#f9a03f;letter-spacing:.14em;text-transform:uppercase}
.cover h1{color:#fff;font-size:26pt;margin:3mm 0}
.cover .s{color:#9aa6c4;font-size:10.5pt}
.aviso{background:#fff4e8;border:1px solid #f9c48a;border-left:4px solid #f97316;padding:3mm 4mm;border-radius:2mm;font-size:9pt;margin:6mm 0}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:3mm;margin:4mm 0}
.meta div{border:1px solid #e3e7f0;border-radius:2mm;padding:3mm 4mm}.meta small{display:block;color:#6b7697;font-size:7.8pt;text-transform:uppercase;letter-spacing:.08em}.meta b{font-size:10pt}
table{width:100%;border-collapse:collapse;margin:2mm 0 3mm;font-size:8.6pt}
th{background:#0b1122;color:#fff;text-align:left;padding:2mm 2.2mm;font-weight:600}
td{padding:1.8mm 2.2mm;border-bottom:1px solid #e3e7f0;vertical-align:top}
tr:nth-child(even) td{background:#f7f9fc}
td.r,th.r{text-align:right;white-space:nowrap}td.c,th.c{text-align:center}
.sm{color:#4b5570;font-size:8pt}.blank{color:#9aa6c4;font-style:italic;white-space:nowrap}
.pill{display:inline-block;font-size:7.8pt;padding:.5mm 2mm;border-radius:6px;background:#eef2f9;color:#334155}.pill.ok{background:#dcfce7;color:#14803c}
.tot{margin-top:3mm;margin-left:auto;width:70mm}.tot div{display:flex;justify-content:space-between;padding:1.6mm 0;border-bottom:1px solid #e3e7f0}
.tot .g{font:700 12pt 'Space Grotesk';color:#0b1122;border-bottom:none;padding-top:2.5mm}
ul{margin:1mm 0 2mm 4mm;padding:0}li{margin:.6mm 0}
.grp{font:700 10pt 'Space Grotesk';color:#f97316;margin:4mm 0 1mm;text-transform:uppercase;letter-spacing:.06em}
.foot{position:fixed;bottom:0;left:0;right:0;font-size:7.4pt;color:#6b7697;border-top:1px solid #e3e7f0;padding-top:1.5mm;display:flex;justify-content:space-between}
</style></head><body>
<div class="cover"><img src="${logo}" alt="Neon Sistemas">
<div class="eyebrow">Proposta de pré-orçamento</div>
<h1>${esc(d.titulo || 'Pré-orçamento')}</h1>
<div class="s">Estimativa preliminar de equipamentos, instalação e serviços. ${esc(d.local.suites)} suítes em ${esc(d.local.alas)} alas.</div></div>
<div class="aviso"><b>Este documento é uma proposta de pré-orçamento, não é um orçamento oficial.</b> Serve para dar uma ideia do investimento. Os valores em branco serão preenchidos após a revisão técnica. Valores de referência vêm de pesquisa de mercado, sem data confirmada.</div>
<div class="meta">
<div><small>Cliente</small><b>${esc(d.cliente.nome || '—')}</b></div>
<div><small>Local</small><b>${esc([d.cliente.cidade, d.cliente.uf].filter(Boolean).join(' / ') || '—')}</b></div>
<div><small>Responsável</small><b>${esc(d.cliente.responsavel || '—')}</b></div>
<div><small>Data · validade</small><b>${esc(d.data || '—')} · ${esc(d.validade || '—')} dias</b></div></div>

<h2>1. Premissas</h2>
<table><tr><th>Item</th><th>Premissa</th></tr>
<tr><td>Suítes</td><td>${esc(d.local.suites)} suítes, em ${esc(d.local.alas)} alas</td></tr>
<tr><td>Recepção</td><td>Computador do Neon Motel + servidor do PABX + ramal da recepção</td></tr>
<tr><td>Tablets</td><td>Um por suíte no Painel Neon (${d.local.tablet === '10.1' ? '10,1"' : esc(d.local.tablet) + '"'})</td></tr>
<tr><td>Ramais PABX</td><td>${esc(d.local.ramais)} ramais no celular, sem custo de ligação interna</td></tr>
<tr><td>Rede</td><td>Cabeamento Cat6 até cada suíte, com Wi-Fi nas alas e na recepção (${c.aps} access points estimados)</td></tr>
<tr><td>Operação</td><td>Instalação por ala, sem parar o motel</td></tr></table>

<h2>2. Situação atual do cliente</h2>
<table><tr><th>Pergunta</th><th>Resposta</th></tr>${ambRows}</table>

<h2>3. Equipamentos, sistemas e serviços</h2>
${grupos.map((g) => `<div class="grp">${esc(g)}</div><table><tr><th>Item</th><th>Situação</th><th class="c">Qtd</th><th class="r">Unitário</th><th class="r">Total</th></tr>${linhasItens(g)}</table>`).join('')}

<h2>4. Investimento</h2>
<div class="tot">
<div><span>Subtotal (itens com valor)</span><span>${r.sub > 0 ? BRL(r.sub) : '<span class="blank">R$ ________</span>'}</span></div>
<div><span>Desconto (${esc(d.descontoPct || 0)}%)</span><span>${r.desc > 0 ? BRL(r.desc) : '—'}</span></div>
<div><span>Impostos (${esc(d.impostoPct || 0)}%)</span><span>${r.imp > 0 ? BRL(r.imp) : '—'}</span></div>
<div class="g"><span>Total estimado</span><span>${r.sub > 0 ? BRL(r.tot) : '<span class="blank">R$ ________</span>'}</span></div>
</div>
<p class="sm">Itens sem valor preenchido: ${r.pend}. Impostos, frete, projeto executivo e obras civis não estão incluídos, salvo indicação.</p>

<h2>5. Condições</h2>
<ul>
<li><b>Forma de pagamento:</b> ${esc(d.pagamento || 'a definir')}</li>
<li>Suporte inicial de <b>3 meses gratuitos</b>, incluído no valor da implantação.</li>
<li>Proposta válida por ${esc(d.validade || '—')} dias a partir da data de emissão.</li>
${d.condicoes ? `<li>${esc(d.condicoes)}</li>` : ''}
</ul>
<h2>6. Próximos passos</h2>
<ol><li>Revisão deste pré-orçamento e confirmação das quantidades.</li><li>Visita técnica para medir as alas e confirmar os pontos.</li><li>Proposta final com valores preenchidos e cronograma.</li></ol>
<div class="foot"><span>Neon Sistemas · neonsistemas.com</span><span>WhatsApp (34) 98430-2083 · contato@neonsistemas.com</span></div>
</body></html>`;
  }
  function imprimirPDF() {
    const html = propostaHTML(S);
    const w = window.open('', '_blank');
    if (!w) { msg('O navegador bloqueou a janela. Permita pop-ups deste site e tente de novo.', false); return; }
    w.document.open(); w.document.write(html); w.document.close();
    w.onload = () => setTimeout(() => { w.focus(); w.print(); }, 350);
  }

  /* ---------- memória ---------- */
  function fmtDT(s) { return s ? s.replace('T', ' ').slice(0, 16) : '—'; }
  function linhaMem(o) {
    return `<tr><td>#${o.id}</td><td>${esc(o.titulo)}</td><td>${esc(o.cliente || '—')}</td>
    <td><span class="badge ${o.status === 'aprovado' ? 'b-ok' : o.status === 'recusado' ? 'b-bad' : 'b-mid'}">${esc(o.status)}</span></td>
    <td class="r">${o.total ? BRL(o.total) : '—'}</td><td>${fmtDT(o.atualizado_em)}</td>
    <td><button class="btn ghost" data-abrir="${o.id}" type="button">Abrir</button></td></tr>`;
  }
  let MEM = [];
  async function memCarregar() {
    try {
      const j = await api('/api/memoria/lista');
      MEM = j.data || [];
      $('#memLogin').classList.add('hidden'); $('#memPainel').classList.remove('hidden');
      memRender();
    } catch (e) {
      $('#memPainel').classList.add('hidden'); $('#memLogin').classList.remove('hidden');
    }
  }
  function memRender() {
    const q = ($('#memBusca').value || '').toLowerCase();
    const rows = MEM.filter((o) => !q || [o.titulo, o.cliente, o.status].join(' ').toLowerCase().includes(q));
    $('#memBody').innerHTML = rows.length ? rows.map(linhaMem).join('') : '<tr><td colspan="7" class="c">Nenhum orçamento salvo.</td></tr>';
    $$('#memBody [data-abrir]').forEach((b) => b.addEventListener('click', () => memAbrir(+b.dataset.abrir)));
  }
  async function memAbrir(id) {
    try {
      const o = await api('/api/memoria/' + id);
      const det = $('#memDetalhe');
      det.classList.remove('hidden');
      det.innerHTML = `<h2>#${o.id} · ${esc(o.titulo)}</h2>
        <p class="hint">Cliente: <b>${esc(o.cliente || '—')}</b> · Status: <b>${esc(o.status)}</b> · Total: <b>${o.total ? BRL(o.total) : 'a preencher'}</b> · Versão ${o.versao} · criado em ${fmtDT(o.criado_em)} · atualizado em ${fmtDT(o.atualizado_em)}</p>
        <div class="detalhe-acoes">
          <button class="btn primary" id="memEditar" type="button">Editar este orçamento</button>
          <button class="btn" id="memPdf" type="button">Gerar PDF</button>
          <button class="btn" id="memXlsx" type="button">Excel (.xlsx)</button>
          <button class="btn" id="memDocx" type="button">Word (.docx)</button>
          <button class="btn ghost" id="memApagar" type="button" style="color:#b42318">Apagar</button>
        </div>
        <div class="versoes"><b>Histórico de versões:</b> ${o.versoes.map((v) => `<button data-v="${v.versao}" type="button">v${v.versao}</button>`).join(' ')}</div>
        <p class="hint" id="memMsg"></p>`;
      det.scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('#memEditar').onclick = () => { S = o.dados; memId = o.id; curId = null; curToken = null; localStorage.removeItem('neon-orc-atual'); preencherTudo(); mostrar('editor'); msg(`Editando o orçamento #${o.id} (memória). Ao salvar, a alteração entra como nova versão.`, true); };
      $('#memPdf').onclick = () => { const antes = S; S = o.dados; imprimirPDF(); S = antes; };
      $('#memXlsx').onclick = () => memExport(o.dados, '/api/exportar/xlsx', 'xlsx');
      $('#memDocx').onclick = () => memExport(o.dados, '/api/exportar/docx', 'docx');
      $('#memApagar').onclick = async () => { if (!confirm('Apagar este orçamento da memória? Essa ação não pode ser desfeita.')) return; await api('/api/memoria/' + o.id, { method: 'DELETE' }); det.classList.add('hidden'); memCarregar(); };
      $$('#memDetalhe [data-v]').forEach((b) => b.addEventListener('click', async () => {
        const v = await api(`/api/memoria/${o.id}/versao/${b.dataset.v}`);
        const antes = S; S = v.dados; imprimirPDF(); S = antes;
        $('#memMsg').textContent = `Versão ${v.versao} de ${fmtDT(v.criado_em)} aberta para PDF.`;
      }));
    } catch (e) { alert(e.message); }
  }
  async function memExport(dados, url, tipo) {
    const antes = S; S = dados; await baixar(url, 'orcamento.' + tipo); S = antes;
  }

  /* ---------- navegação e inicialização ---------- */
  function mostrar(v) {
    $$('.view').forEach((s) => s.classList.toggle('on', s.id === v));
    $$('nav a').forEach((a) => a.classList.toggle('on', a.dataset.go === v));
    if (v === 'memoria') memCarregar();
  }
  function preencherTudo() {
    renderAmbiente(); bindCampos(); recalcular(); renderItens(); atualizarTotais();
    $$('[data-k]').forEach((el) => { el.value = S[el.dataset.k] ?? ''; });
    $$('[data-c]').forEach((el) => { el.value = S.cliente[el.dataset.c] ?? ''; });
    $$('[data-l]').forEach((el) => { el.value = S.local[el.dataset.l] ?? ''; });
  }
  function init() {
    carregarRascunho();
    if (!S.local || !S.itens) S = novoEstado();
    // garante estrutura nova em rascunhos antigos
    for (const it of S.itens) if (it.auto === undefined) it.auto = true;
    preencherTudo();

    $$('nav a').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); mostrar(a.dataset.go); history.replaceState(null, '', '#' + a.dataset.go); }));
    if (location.hash === '#memoria') mostrar('memoria');

    $('#addItem').addEventListener('click', () => {
      const n = prompt('Nome do item:'); if (!n) return;
      S.itens.push({ id: 'x' + Date.now(), grupo: 'Itens próprios', nome: n, espec: '', unidade: 'un', qtd: 1, ref: '', status: 'precisa', valorUnit: null, obs: '', auto: false });
      renderItens(); atualizarTotais(); autoSalvarRascunho();
    });
    $('#resetAuto').addEventListener('click', () => {
      if (!confirm('Restaurar as quantidades automáticas? Os ajustes manuais de quantidade serão perdidos.')) return;
      S.itens.forEach((it) => { if (it.id[0] !== 'x') it.auto = true; });
      recalcular(); renderItens(); atualizarTotais(); autoSalvarRascunho();
    });
    $('#btnSalvar').addEventListener('click', salvar);
    $('#btnPdf').addEventListener('click', imprimirPDF);
    $('#btnXlsx').addEventListener('click', () => baixar('/api/exportar/xlsx', 'orcamento.xlsx'));
    $('#btnDocx').addEventListener('click', () => baixar('/api/exportar/docx', 'orcamento.docx'));
    $('#btnNovo').addEventListener('click', () => {
      if (!confirm('Começar um orçamento novo? O atual continua salvo na memória, se já foi salvo.')) return;
      S = novoEstado(); memId = null; curId = null; curToken = null;
      localStorage.removeItem('neon-orc-atual'); localStorage.removeItem('neon-orc-rascunho');
      preencherTudo(); msg('Orçamento novo iniciado.', true);
    });

    $('#formMem').addEventListener('submit', async (e) => {
      e.preventDefault();
      $('#memErr').textContent = '';
      try {
        await api('/api/memoria/entrar', { method: 'POST', body: JSON.stringify({ senha: $('#memSenha').value }) });
        $('#memSenha').value = '';
        memCarregar();
      } catch (err) { $('#memErr').textContent = err.message; }
    });
    $('#memSair').addEventListener('click', async () => { await api('/api/memoria/sair', { method: 'POST' }); $('#memPainel').classList.add('hidden'); $('#memLogin').classList.remove('hidden'); });
    $('#memBusca').addEventListener('input', memRender);
  }
  document.addEventListener('DOMContentLoaded', init);
})();
