/* Gerador de orçamento · Neon Sistemas (cliente) — v2: 5 níveis, preços configuráveis, mensalidades */
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const BRL = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) ? '—' :
    Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const num = (v) => { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hoje = () => new Date().toISOString().slice(0, 10);

  /* ---------- preços (carregados do servidor) ---------- */
  let P = {};          // chave -> { rotulo, valor, unidade, fonte, nota, grupo }
  let NIVEIS = {};     // ap, sw, sa, cab, kp, kr, t8, t10 -> [chaves]

  /* ---------- situação atual do cliente ---------- */
  const AMB = [
    { k: 'internet', q: 'Tem internet contratada?', t: 'sn' },
    { k: 'velocidade', q: 'Velocidade contratada (Mbps)', t: 'txt', ph: 'Ex.: 300' },
    { k: 'computador', q: 'Já tem computador para a recepção (Neon Motel + PABX)?', t: 'sn', sug: { sim: { e_pc: 'h' }, nao: { e_pc: 'p' } } },
    { k: 'roteador', q: 'Já tem roteador de acesso?', t: 'sn', sug: { sim: { r_roteador: 'h' }, nao: { r_roteador: 'p' } } },
    { k: 'switch', q: 'Já tem switch gerenciável?', t: 'sn', sug: { sim: { r_sw: 'h', r_sa: 'h' }, nao: { r_sw: 'p', r_sa: 'p' } } },
    { k: 'rede', q: 'Já existe cabeamento estruturado (cabo passado até as suítes)?', t: 'sn', sug: { sim: { r_cab: 'h', r_kp: 'h', r_kr: 'h', m_passagem: 'n' }, nao: { r_cab: 'p', r_kp: 'p', r_kr: 'p', m_passagem: 'p' } }, nota: { sim: 'Cabeamento já existente: confira se os pontos estão certificados e chegam a cada suíte. Só a certificação será feita.' } },
    { k: 'wifi', q: 'Como está o Wi-Fi hoje?', t: 'esc', opts: ['Ruim', 'Regular', 'Boa'], nota: { Boa: 'Wi-Fi bom: avalie se os access points atuais podem ser aproveitados. Antes de descartar, faça um teste de cobertura.', Ruim: 'Wi-Fi ruim: recomendamos access points de teto, com cobertura da suíte e do corredor.' } },
    { k: 'tablets', q: 'Já tem tablets para as suítes?', t: 'sn', sug: { sim: { e_tab: 'h', mt_suporte: 'h' }, nao: { e_tab: 'p', mt_suporte: 'p' } } },
    { k: 'tomada', q: 'As suítes já têm tomada perto do painel?', t: 'sn', sug: { sim: { m_tomada: 'h' }, nao: { m_tomada: 'p' } } },
    { k: 'pabx', q: 'Já tem central telefônica (PABX)?', t: 'sn', nota: { sim: 'Se a central atual for substituída, confira a integração e os ramais existentes.' } },
    { k: 'tv', q: 'As suítes já têm TV?', t: 'sn', nota: { sim: 'A TV pode ser controlada pelo painel Neon. Confirme o modelo e o protocolo de controle.' } },
  ];

  /* ---------- escolhas de modelos (5 níveis) ---------- */
  const CATS = [
    { k: 'ap', t: 'Wi-Fi (access point)', hint: 'Cobre a suíte e o corredor, e atende a rede do estabelecimento e o Wi-Fi dos hóspedes.' },
    { k: 'sw', t: 'Switch principal (24 portas PoE)', hint: 'Recebe o cabeamento de todas as alas e alimenta os access points.' },
    { k: 'sa', t: 'Switch de ala (8 portas PoE)', hint: 'Um por ala, para os access points e tablets daquela ala.' },
    { k: 'cab', t: 'Cabo Cat6 (caixa de 305 m)', hint: 'O cabeamento de cada ponto. A quantidade é calculada pelos pontos.' },
    { k: 'kp', t: 'Insumos por ponto (keystone, caixa, tomada, patch cord)', hint: 'Materiais de acabamento de cada ponto de rede.' },
    { k: 'kr', t: 'Rack e painel de conexão', hint: 'Painel de 24 portas, suporte ou rack e organização.' },
    { k: 't', t: 'Tablet da suíte (painel Neon)', hint: 'Um por suíte. O tamanho é escolhido na seção 2 (8" ou 10,1").' },
  ];
  const NIVEL_TAG = ['Entrada · suficiente', 'Custo-benefício', 'Intermediário', 'Superior', 'Premium'];

  /* ---------- quantidades e definição dos itens ---------- */
  function contexto(L) {
    const suites = Math.max(1, parseInt(L.suites) || 0);
    const alas = Math.max(1, parseInt(L.alas) || 1);
    const aps = alas * Math.ceil(suites / alas / 5) + 1;
    const extras = Math.max(0, parseInt(L.extras) || 0);
    return { suites, alas, aps, extras, pontos: suites + aps + extras, ramais: Math.max(0, parseInt(L.ramais) || 0), horas: Math.max(0, parseInt(L.horas) || 0), tablet: L.tablet || '10.1' };
  }
  function definicoes(S) {
    const c = contexto(S.local);
    const e = S.escolhas || {};
    const tab = c.tablet === '10.1' ? 't10' : 't8';
    const tabKey = (NIVEIS[tab] || [])[(parseInt(e.t) || 1) - 1] || (tab === 't10' ? 't10_1' : 't8_1');
    const nv = (grp, n) => (NIVEIS[grp] || [])[(parseInt(n) || 1) - 1];
    return [
      { id: 'r_ap', g: 'Rede e Wi-Fi', ch: nv('ap', e.ap), u: 'un', q: c.aps, tipo: 'unico' },
      { id: 'r_roteador', g: 'Rede e Wi-Fi', n: 'Roteador de acesso / firewall', e: 'Equipamento de borda com firewall e balanceamento de link. Pode ser o do provedor, se atender.', u: 'un', q: 1, ref: 'a cotar', tipo: 'unico' },
      { id: 'r_sw', g: 'Rede e Wi-Fi', ch: nv('sw', e.sw), u: 'un', q: 1, tipo: 'unico' },
      { id: 'r_sa', g: 'Rede e Wi-Fi', ch: nv('sa', e.sa), u: 'un', q: c.alas, tipo: 'unico' },
      { id: 'r_cab', g: 'Rede e Wi-Fi', ch: nv('cab', e.cab), u: 'caixa', q: Math.ceil(c.pontos * 30 / 305), tipo: 'unico' },
      { id: 'r_kp', g: 'Rede e Wi-Fi', ch: nv('kp', e.kp), u: 'ponto', q: c.pontos, tipo: 'unico' },
      { id: 'r_kr', g: 'Rede e Wi-Fi', ch: nv('kr', e.kr), u: 'conjunto', q: 1, tipo: 'unico' },
      { id: 'r_nb', g: 'Rede e Wi-Fi', ch: 'nb_600', u: 'un', q: c.alas + 1, tipo: 'unico' },
      { id: 'e_pc', g: 'Equipamentos da recepção e das suítes', n: 'Computador da recepção (Neon Motel + PABX)', e: 'Mínimo: Intel Core i3 8ª geração (ou Ryzen 3), 4 GB de RAM, SSD 128 GB. Recomendado: i5 10ª geração (ou Ryzen 5), 8 GB, SSD 256 GB.', u: 'un', q: 1, ref: 'R$ 800 a R$ 1.300 (gerações anteriores)', tipo: 'unico' },
      { id: 'e_tab', g: 'Equipamentos da recepção e das suítes', ch: tabKey, u: 'un', q: c.suites, tipo: 'unico' },
      { id: 'mt_suporte', g: 'Equipamentos da recepção e das suítes', ch: 'mt_suporte', u: 'un', q: c.suites, tipo: 'unico' },
      { id: 's_motel_lic', g: 'Sistemas Neon', ch: 'sw_motel_licenca', u: 'licença', q: 1, tipo: 'unico' },
      { id: 's_painel_lic', g: 'Sistemas Neon', ch: 'sw_painel_licenca', u: 'suíte', q: c.suites, tipo: 'unico' },
      { id: 's_central', g: 'Sistemas Neon', ch: 'hw_central', u: 'suíte', q: c.suites, tipo: 'unico' },
      { id: 's_pabx_lic', g: 'Sistemas Neon', ch: 'sw_pabx_licenca', u: 'ramal', q: c.ramais, tipo: 'unico' },
      { id: 'm_passagem', g: 'Instalação e mão de obra', ch: 'sv_passagem', u: 'ponto', q: c.pontos, tipo: 'unico' },
      { id: 'm_cert', g: 'Instalação e mão de obra', ch: 'sv_certificacao', u: 'ponto', q: c.pontos, tipo: 'unico' },
      { id: 'm_rack', g: 'Instalação e mão de obra', ch: 'sv_rack', u: 'serviço', q: 1, tipo: 'unico' },
      { id: 'm_tomada', g: 'Instalação e mão de obra', ch: 'sv_tomada', u: 'suíte', q: c.suites, tipo: 'unico' },
      { id: 'm_inst', g: 'Instalação e mão de obra', ch: 'sv_inst_suite', u: 'suíte', q: c.suites, tipo: 'unico' },
      { id: 'm_config_motel', g: 'Instalação e mão de obra', ch: 'sv_config_motel', u: 'serviço', q: 1, tipo: 'unico' },
      { id: 'm_config_pabx', g: 'Instalação e mão de obra', ch: 'sv_config_pabx', u: 'serviço', q: 1, tipo: 'unico' },
      { id: 'm_config_rede', g: 'Instalação e mão de obra', ch: 'sv_config_rede', u: 'serviço', q: 1, tipo: 'unico' },
      { id: 'm_treino', g: 'Instalação e mão de obra', ch: 'sv_treino_hora', u: 'hora', q: c.horas, tipo: 'unico' },
      { id: 'p_inicial', g: 'Suporte', ch: 'sv_suporte_inicial', u: 'mês', q: 3, tipo: 'unico' },
      { id: 'x_motel', g: 'Mensalidades (por mês)', ch: 'sw_motel_mensal', u: 'mês', q: 1, tipo: 'mensal' },
      { id: 'x_painel', g: 'Mensalidades (por mês)', ch: 'sw_painel_mensal', u: 'suíte/mês', q: c.suites, tipo: 'mensal' },
      { id: 'x_pabx', g: 'Mensalidades (por mês)', ch: 'sw_pabx_mensal', u: 'ramal/mês', q: c.ramais, tipo: 'mensal' },
      { id: 'x_suporte', g: 'Mensalidades (por mês)', ch: 'sv_suporte_mensal', u: 'mês', q: 1, tipo: 'mensal' },
    ];
  }
  const NOMES_FIXOS = {};
  function itemDe(d) {
    const pr = d.ch ? P[d.ch] : null;
    return {
      id: d.id, grupo: d.g,
      nome: d.ch ? (pr ? pr.rotulo : d.ch) : d.n,
      espec: d.ch ? (pr ? pr.nota : '') : (d.e || ''),
      unidade: d.u, qtd: d.q, ref: d.ch ? (pr ? `${pr.fonte}` : '') : (d.ref || ''),
      chave: d.ch || null, tipo: d.tipo, status: 'precisa',
      valorUnit: d.ch ? (pr && pr.valor !== null ? Number(pr.valor) : null) : null,
      valorManual: false, obs: '', auto: true,
    };
  }
  function novoEstado() {
    return {
      titulo: '', data: hoje(), validade: 15, status: 'rascunho',
      cliente: { nome: '', tipo: '', responsavel: '', telefone: '', email: '', documento: '', endereco: '', cidade: '', uf: '' },
      local: { suites: 30, alas: 2, extras: 4, ramais: 10, horas: 8, tablet: '10.1' },
      ambiente: {}, escolhas: { ap: 2, sw: 1, sa: 1, cab: 1, kp: 1, kr: 1, t: 1 },
      itens: [], descontoPct: 0, impostoPct: 0, pagamento: '', condicoes: '', observacoes: '',
    };
  }
  let S = novoEstado();
  function gerarItensIniciais() { S.itens = definicoes(S).map(itemDe); }
  function recalcular() {
    const defs = Object.fromEntries(definicoes(S).map((d) => [d.id, d]));
    const existentes = new Set(S.itens.map((i) => i.id));
    for (const d of Object.values(defs)) if (!existentes.has(d.id)) S.itens.push(itemDe(d));
    for (const it of S.itens) {
      const d = defs[it.id];
      if (!d || !it.auto) continue;
      const novo = itemDe(d);
      it.grupo = novo.grupo; it.nome = novo.nome; it.espec = novo.espec; it.unidade = novo.unidade;
      it.qtd = novo.qtd; it.ref = novo.ref; it.chave = novo.chave; it.tipo = novo.tipo;
      if (!it.valorManual) it.valorUnit = novo.valorUnit;
    }
  }

  /* ---------- campos gerais ---------- */
  let ligado = false;
  function bindCampos() {
    if (ligado) return; ligado = true;
    $$('[data-k]').forEach((el) => {
      el.value = S[el.dataset.k] ?? '';
      el.addEventListener('input', () => { S[el.dataset.k] = el.type === 'number' ? (num(el.value) ?? '') : el.value; atualizarTotais(); rascunho(); });
    });
    $$('[data-c]').forEach((el) => {
      el.value = S.cliente[el.dataset.c] ?? '';
      el.addEventListener('input', () => { S.cliente[el.dataset.c] = el.value; rascunho(); });
    });
    $$('[data-l]').forEach((el) => {
      el.value = S.local[el.dataset.l] ?? '';
      el.addEventListener('input', () => { S.local[el.dataset.l] = el.value; recalcular(); renderModelos(); renderItens(); atualizarTotais(); rascunho(); });
    });
  }

  /* ---------- modelos (5 níveis) ---------- */
  function renderModelos() {
    const box = $('#modelos');
    if (!box) return;
    box.innerHTML = CATS.map((cat) => {
      const grp = cat.k === 't' ? (S.local.tablet === '10.1' ? 't10' : 't8') : cat.k;
      const lista = NIVEIS[grp] || [];
      const sel = cat.k === 't' ? (parseInt(S.escolhas.t) || 1) : (parseInt(S.escolhas[cat.k]) || 1);
      const opts = lista.map((ch, i) => {
        const pr = P[ch] || { rotulo: ch, valor: null, nota: '', fonte: '' };
        return `<label class="nivel ${sel === i + 1 ? 'sel' : ''}">
          <input type="radio" name="m_${cat.k}" value="${i + 1}" ${sel === i + 1 ? 'checked' : ''}>
          <span class="nivel-n">${i + 1}</span>
          <span class="nivel-txt"><b>${esc(pr.rotulo)}</b><small>${esc(pr.nota || '')}</small></span>
          <span class="nivel-preco">${pr.valor === null ? 'a definir' : BRL(pr.valor)}<small>${esc(pr.unidade || '')} · ${esc(NIVEL_TAG[i])}</small></span>
        </label>`;
      }).join('');
      return `<div class="modelo"><h3>${esc(cat.t)}</h3><p class="hint">${esc(cat.hint)}</p><div class="niveis">${opts}</div></div>`;
    }).join('');
    $$('#modelos input[type=radio]').forEach((r) => r.addEventListener('change', () => {
      const cat = r.name.replace('m_', '');
      S.escolhas[cat] = parseInt(r.value);
      recalcular(); renderModelos(); renderItens(); atualizarTotais(); rascunho();
    }));
  }

  /* ---------- situação atual ---------- */
  function renderAmbiente() {
    const box = $('#ambiente');
    if (!box) return;
    box.innerHTML = AMB.map((p) => {
      const val = S.ambiente[p.k] ?? '';
      let ctrl;
      if (p.t === 'sn') ctrl = `<div class="seg" data-q="${p.k}"><button type="button" data-v="sim" class="${val === 'sim' ? 'on' : ''}">Sim</button><button type="button" data-v="nao" class="${val === 'nao' ? 'on' : ''}">Não</button></div>`;
      else if (p.t === 'esc') ctrl = `<div class="seg" data-q="${p.k}">${p.opts.map((o) => `<button type="button" data-v="${o}" class="${val === o ? 'on' : ''}">${o}</button>`).join('')}</div>`;
      else ctrl = `<div class="txt"><input data-txt="${p.k}" value="${esc(val)}" placeholder="${esc(p.ph || '')}"></div>`;
      const nota = p.nota && p.nota[val] ? `<div class="sug">${esc(p.nota[val])}</div>` : '';
      return `<div class="q"><span>${esc(p.q)}</span>${ctrl}${nota}</div>`;
    }).join('');
    $$('[data-q]').forEach((g) => g.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const k = g.dataset.q, v = b.dataset.v;
      S.ambiente[k] = v;
      aplicarSugestao(k, v);
      renderAmbiente(); renderItens(); atualizarTotais(); rascunho();
    }));
    $$('[data-txt]').forEach((i) => i.addEventListener('input', () => { S.ambiente[i.dataset.txt] = i.value; rascunho(); }));
  }
  function aplicarSugestao(k, v) {
    const p = AMB.find((x) => x.k === k);
    if (!p || !p.sug) return;
    const map = p.sug[v === 'sim' ? 'sim' : (v === 'nao' ? 'nao' : null)];
    if (!map) return;
    const st = { h: 'possui', p: 'precisa', n: 'nao' };
    for (const [id, code] of Object.entries(map)) { const it = S.itens.find((x) => x.id === id); if (it) it.status = st[code]; }
  }

  /* ---------- tabela de itens ---------- */
  const STATUS = [['precisa', 'Precisa (orçar)'], ['possui', 'Cliente já possui'], ['nao', 'Não se aplica']];
  function linhaTotal(it) {
    if (it.status !== 'precisa' || it.valorUnit === null || it.valorUnit === '' || !Number.isFinite(Number(it.valorUnit))) return null;
    return Number(it.valorUnit) * (Number(it.qtd) || 0);
  }
  function renderItens() {
    const body = $('#itensBody'); if (!body) return;
    let html = '', grupo = null;
    S.itens.forEach((it, idx) => {
      if (it.grupo !== grupo) { grupo = it.grupo; html += `<tr class="grp"><td colspan="8">${esc(grupo)}</td></tr>`; }
      const off = it.status !== 'precisa';
      const t = linhaTotal(it);
      const pend = (it.status === 'precisa' && (Number(it.qtd) || 0) > 0 && (it.valorUnit === null || it.valorUnit === '')) ? '<span class="pend">sem valor</span>' : '';
      html += `<tr class="${off ? 'off' : ''}">
        <td><span class="nm">${esc(it.nome)}</span><span class="espec">${esc(it.espec || '')}</span>${it.ref ? `<span class="ref">${esc(it.ref)}</span>` : ''}${it.tipo === 'mensal' ? '<span class="tag">mensal</span>' : ''}</td>
        <td class="c"><select data-i="${idx}" data-f="status">${STATUS.map(([v, l]) => `<option value="${v}" ${it.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
        <td class="c"><input class="qt" type="number" min="0" step="1" data-i="${idx}" data-f="qtd" value="${esc(it.qtd)}">${it.auto ? '' : '<span class="lock" title="Quantidade ajustada manualmente">✎</span>'}</td>
        <td>${esc(it.unidade)}</td>
        <td class="r"><input class="num" type="number" min="0" step="0.01" data-i="${idx}" data-f="valorUnit" value="${it.valorUnit ?? ''}" placeholder="—" ${off ? 'disabled' : ''}>${it.valorManual ? '<span class="lock" title="Valor digitado manualmente">✎</span>' : ''}</td>
        <td class="r calc" data-tot="${idx}">${t === null ? '—' : BRL(t)} ${pend}</td>
        <td><input data-i="${idx}" data-f="obs" value="${esc(it.obs || '')}" placeholder="Observação"></td>
        <td><button class="del" type="button" data-i="${idx}" data-del title="Marcar como não se aplica">×</button></td>
      </tr>`;
    });
    body.innerHTML = html;
    $$('#itensBody [data-f]').forEach((el) => {
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
        const it = S.itens[+el.dataset.i], f = el.dataset.f;
        if (f === 'qtd') { it.qtd = num(el.value) ?? 0; it.auto = false; }
        else if (f === 'valorUnit') { it.valorUnit = el.value === '' ? null : num(el.value); it.valorManual = true; }
        else if (f === 'status') it.status = el.value;
        else if (f === 'obs') it.obs = el.value;
        if (f === 'status' || f === 'qtd') renderItens();
        else { const c = $(`[data-tot="${el.dataset.i}"]`); const t = linhaTotal(it); if (c) c.innerHTML = (t === null ? '—' : BRL(t)) + ((it.status === 'precisa' && (Number(it.qtd) || 0) > 0 && it.valorUnit === null) ? ' <span class="pend">sem valor</span>' : ''); }
        atualizarTotais(); rascunho();
      });
    });
    $$('#itensBody [data-del]').forEach((b) => b.addEventListener('click', () => { S.itens[+b.dataset.i].status = 'nao'; renderItens(); atualizarTotais(); rascunho(); }));
  }

  /* ---------- totais ---------- */
  function calcular(D = S) {
    let sub = 0, pend = 0, mensal = 0;
    for (const it of D.itens) {
      if (it.status !== 'precisa') continue;
      const q = Number(it.qtd) || 0;
      if (it.valorUnit === null || it.valorUnit === '' || !Number.isFinite(Number(it.valorUnit))) { if (q > 0) pend++; continue; }
      if (it.tipo === 'mensal') mensal += Number(it.valorUnit) * q; else sub += Number(it.valorUnit) * q;
    }
    const desc = sub * ((Number(D.descontoPct) || 0) / 100);
    const imp = (sub - desc) * ((Number(D.impostoPct) || 0) / 100);
    return { sub, desc, imp, tot: sub - desc + imp, pend, mensal };
  }
  function atualizarTotais() {
    const r = calcular();
    $('#tSub').textContent = BRL(r.sub);
    $('#tDesc').textContent = BRL(r.desc);
    $('#tImp').textContent = BRL(r.imp);
    $('#tTot').textContent = r.sub > 0 ? BRL(r.tot) : 'a preencher';
    $('#tMens').textContent = r.mensal > 0 ? BRL(r.mensal) + ' /mês' : 'a preencher';
    $('#tPend').textContent = r.pend;
  }

  /* ---------- rascunho e salvamento ---------- */
  let tRasc = null;
  function rascunho() { clearTimeout(tRasc); tRasc = setTimeout(() => { try { localStorage.setItem('neon-orc-rascunho', JSON.stringify(S)); } catch (e) {} }, 400); }
  let memId = null, curId = null, curToken = null;
  function msg(html, ok) { $('#saveBox').innerHTML = `<div class="${ok ? 'ok' : ''}">${html}</div>`; }
  async function api(url, opts = {}) {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) }, method: opts.method || 'GET', body: opts.body, credentials: 'same-origin' });
    let j = {}; try { j = await r.json(); } catch (e) {}
    if (!r.ok) throw Object.assign(new Error(j.erro || 'Erro ao comunicar com o servidor.'), { status: r.status });
    return j;
  }
  function payload() {
    const d = JSON.parse(JSON.stringify(S));
    d.titulo = d.titulo || ('Orçamento · ' + (d.cliente.nome || 'sem cliente'));
    d.precosUsados = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, v.valor]));
    return d;
  }
  async function salvar() {
    const dados = payload();
    try {
      if (memId) { await api('/api/memoria/' + memId, { method: 'PUT', body: JSON.stringify({ dados }) }); msg(`Atualizado na memória (#${memId}).`, true); }
      else if (curId && curToken) { const r = await api('/api/orcamentos/' + curId, { method: 'PUT', headers: { 'X-Token': curToken }, body: JSON.stringify({ dados }) }); msg(`Salvo · versão ${r.versao}. Número <b>#${curId}</b>.`, true); }
      else {
        const r = await api('/api/orcamentos', { method: 'POST', body: JSON.stringify({ dados }) });
        curId = r.id; curToken = r.token;
        localStorage.setItem('neon-orc-atual', JSON.stringify({ id: curId, token: curToken }));
        msg(`Salvo na memória como <b>#${curId}</b>. Guarde este código de edição: <code>${esc(curToken)}</code>`, true);
      }
    } catch (e) { msg(esc(e.message), false); }
  }
  async function baixar(url, nome) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dados: payload() }) });
      if (!r.ok) { let j = {}; try { j = await r.json(); } catch (e) {} throw new Error(j.erro || 'Falha ao exportar.'); }
      const blob = await r.blob();
      const m = /filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') || '');
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = m ? m[1] : nome;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) { msg(esc(e.message), false); }
  }

  /* ---------- PDF (padrão da proposta) ---------- */
  function propostaHTML(d) {
    const c = contexto(d.local);
    const itens = (d.itens || []).filter((i) => i.status !== 'nao');
    const r = calcular(d);
    const logo = location.origin + '/assets/logo-neon.png';
    const grupos = [...new Set(itens.map((i) => i.grupo))];
    const linhas = (g) => itens.filter((i) => i.grupo === g).map((i) => {
      const sit = i.status === 'possui' ? '<span class="pill ok">Cliente já possui</span>' : '<span class="pill">Precisa</span>';
      const t = linhaTotal(i);
      const vu = i.status === 'precisa' && i.valorUnit !== null && i.valorUnit !== '' ? BRL(i.valorUnit) : (i.status === 'possui' ? '—' : '<span class="blank">R$ ________</span>');
      const tt = t !== null ? BRL(t) : (i.status === 'possui' ? '—' : '<span class="blank">R$ ________</span>');
      return `<tr><td><b>${esc(i.nome)}</b><br><span class="sm">${esc(i.espec || '')}</span></td><td>${sit}</td><td class="c">${esc(i.qtd)} ${esc(i.unidade)}</td><td class="r">${vu}</td><td class="r">${tt}</td></tr>`;
    }).join('');
    const ambRows = AMB.map((p) => { const v = (d.ambiente || {})[p.k]; return `<tr><td>${esc(p.q)}</td><td>${esc(v === 'sim' ? 'Sim' : v === 'nao' ? 'Não' : (v || '—'))}</td></tr>`; }).join('');
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(d.titulo || 'Pré-orçamento')}</title>
<style>
@page{size:A4;margin:12mm 14mm 16mm}
body{font:9.6pt/1.5 Inter,Arial,sans-serif;color:#1c2233;margin:0}
h1{font:700 21pt/1.12 'Space Grotesk',Arial,sans-serif;color:#0b1122;margin:0 0 3mm}
h2{font:700 13pt 'Space Grotesk',Arial,sans-serif;color:#0b1122;border-bottom:2px solid #f97316;padding-bottom:1.5mm;margin:7mm 0 3mm;page-break-after:avoid}
.cover{background:linear-gradient(160deg,#070b16,#0f1830);color:#fff;margin:-12mm -14mm 0;padding:18mm 16mm 14mm;border-radius:0 0 6mm 6mm}
.cover img{height:24mm;margin-bottom:9mm}
.eyebrow{font:600 11pt Inter;color:#f9a03f;letter-spacing:.14em;text-transform:uppercase}
.cover h1{color:#fff;font-size:26pt;margin:3mm 0}.cover .s{color:#9aa6c4;font-size:10.5pt}
.aviso{background:#fff4e8;border:1px solid #f9c48a;border-left:4px solid #f97316;padding:3mm 4mm;border-radius:2mm;font-size:9pt;margin:6mm 0}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:3mm;margin:4mm 0}.meta div{border:1px solid #e3e7f0;border-radius:2mm;padding:3mm 4mm}.meta small{display:block;color:#6b7697;font-size:7.8pt;text-transform:uppercase;letter-spacing:.08em}.meta b{font-size:10pt}
table{width:100%;border-collapse:collapse;margin:2mm 0 3mm;font-size:8.6pt}
th{background:#0b1122;color:#fff;text-align:left;padding:2mm 2.2mm;font-weight:600}
td{padding:1.8mm 2.2mm;border-bottom:1px solid #e3e7f0;vertical-align:top}
tr:nth-child(even) td{background:#f7f9fc}
td.r,th.r{text-align:right;white-space:nowrap}td.c,th.c{text-align:center}
.sm{color:#4b5570;font-size:8pt}.blank{color:#9aa6c4;font-style:italic;white-space:nowrap}
.pill{display:inline-block;font-size:7.8pt;padding:.5mm 2mm;border-radius:6px;background:#eef2f9;color:#334155}.pill.ok{background:#dcfce7;color:#14803c}
.tot{margin-top:3mm;margin-left:auto;width:78mm}.tot div{display:flex;justify-content:space-between;padding:1.6mm 0;border-bottom:1px solid #e3e7f0}
.tot .g{font:700 12pt 'Space Grotesk';color:#0b1122;border-bottom:none;padding-top:2.5mm}
ul{margin:1mm 0 2mm 4mm;padding:0}li{margin:.6mm 0}
.grp{font:700 10pt 'Space Grotesk';color:#f97316;margin:4mm 0 1mm;text-transform:uppercase;letter-spacing:.06em}
.foot{position:fixed;bottom:0;left:0;right:0;font-size:7.4pt;color:#6b7697;border-top:1px solid #e3e7f0;padding-top:1.5mm;display:flex;justify-content:space-between}
</style></head><body>
<div class="cover"><img src="${logo}" alt="Neon Sistemas"><div class="eyebrow">Proposta de pré-orçamento</div>
<h1>${esc(d.titulo || 'Pré-orçamento')}</h1>
<div class="s">Estimativa de equipamentos, instalação e serviços. ${esc(d.local.suites)} suítes em ${esc(d.local.alas)} alas.</div></div>
<div class="aviso"><b>Este documento é uma proposta de pré-orçamento, não é um orçamento oficial.</b> Serve para dar uma ideia do investimento. Valores em branco serão preenchidos após a revisão técnica. Preços de referência vêm de pesquisa de mercado (nov/2026) e de estimativas, e devem ser confirmados antes da contratação.</div>
<div class="meta">
<div><small>Cliente</small><b>${esc(d.cliente.nome || '—')}</b></div>
<div><small>Local</small><b>${esc([d.cliente.cidade, d.cliente.uf].filter(Boolean).join(' / ') || '—')}</b></div>
<div><small>Responsável</small><b>${esc(d.cliente.responsavel || '—')}</b></div>
<div><small>Data · validade</small><b>${esc(d.data || '—')} · ${esc(d.validade || '—')} dias</b></div></div>

<h2>1. Premissas</h2>
<table><tr><th>Item</th><th>Premissa</th></tr>
<tr><td>Suítes</td><td>${esc(d.local.suites)} suítes, em ${esc(d.local.alas)} alas</td></tr>
<tr><td>Recepção</td><td>Computador do Neon Motel, servidor do PABX e ramal da recepção</td></tr>
<tr><td>Tablets</td><td>Um por suíte no Painel Neon (${d.local.tablet === '10.1' ? '10,1"' : esc(d.local.tablet) + '"'})</td></tr>
<tr><td>Ramais PABX</td><td>${esc(d.local.ramais)} ramais no celular, sem custo de ligação interna</td></tr>
<tr><td>Rede</td><td>Cabeamento Cat6 até cada suíte, com Wi-Fi nas alas e na recepção (${c.aps} access points estimados)</td></tr>
<tr><td>Operação</td><td>Instalação por ala, sem parar o motel</td></tr></table>

<h2>2. Situação atual do cliente</h2>
<table><tr><th>Pergunta</th><th>Resposta</th></tr>${ambRows}</table>

<h2>3. Equipamentos, sistemas e serviços</h2>
${grupos.map((g) => `<div class="grp">${esc(g)}</div><table><tr><th>Item</th><th>Situação</th><th class="c">Qtd</th><th class="r">Unitário</th><th class="r">Total</th></tr>${linhas(g)}</table>`).join('')}

<h2>4. Investimento</h2>
<div class="tot">
<div><span>Investimento inicial</span><span>${r.sub > 0 ? BRL(r.sub) : '<span class="blank">R$ ________</span>'}</span></div>
<div><span>Desconto (${esc(d.descontoPct || 0)}%)</span><span>${r.desc > 0 ? BRL(r.desc) : '—'}</span></div>
<div><span>Impostos (${esc(d.impostoPct || 0)}%)</span><span>${r.imp > 0 ? BRL(r.imp) : '—'}</span></div>
<div class="g"><span>Total inicial</span><span>${r.sub > 0 ? BRL(r.tot) : '<span class="blank">R$ ________</span>'}</span></div>
<div><span>Mensalidade (por mês)</span><span>${r.mensal > 0 ? BRL(r.mensal) : '<span class="blank">R$ ________</span>'}</span></div>
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
<ol><li>Revisão deste pré-orçamento e confirmação das quantidades e dos modelos.</li><li>Visita técnica para medir as alas e confirmar os pontos.</li><li>Proposta final com valores preenchidos e cronograma.</li></ol>
<div class="foot"><span>Neon Sistemas · neonsistemas.com</span><span>WhatsApp (34) 98430-2083 · contato@neonsistemas.com</span></div>
</body></html>`;
  }
  function imprimirPDF(dados = S) {
    const w = window.open('', '_blank');
    if (!w) { msg('O navegador bloqueou a janela. Permita pop-ups deste site e tente de novo.', false); return; }
    w.document.open(); w.document.write(propostaHTML(dados)); w.document.close();
    w.onload = () => setTimeout(() => { w.focus(); w.print(); }, 350);
  }

  /* ---------- memória ---------- */
  function fmtDT(s) { return s ? String(s).replace('T', ' ').slice(0, 16) : '—'; }
  let MEM = [];
  async function memCarregar() {
    try {
      const j = await api('/api/memoria/lista');
      MEM = j.data || [];
      $('#memLogin').classList.add('hidden'); $('#memPainel').classList.remove('hidden');
      memRender(); admCarregar();
    } catch (e) { $('#memPainel').classList.add('hidden'); $('#memLogin').classList.remove('hidden'); }
  }
  function memRender() {
    const q = ($('#memBusca').value || '').toLowerCase();
    const rows = MEM.filter((o) => !q || [o.titulo, o.cliente, o.status].join(' ').toLowerCase().includes(q));
    $('#memBody').innerHTML = rows.length ? rows.map((o) => `<tr><td>#${o.id}</td><td>${esc(o.titulo)}</td><td>${esc(o.cliente || '—')}</td>
      <td><span class="badge ${o.status === 'aprovado' ? 'b-ok' : o.status === 'recusado' ? 'b-bad' : 'b-mid'}">${esc(o.status)}</span></td>
      <td class="r">${o.total ? BRL(o.total) : '—'}</td><td>${fmtDT(o.atualizado_em)}</td>
      <td><button class="btn ghost" data-abrir="${o.id}" type="button">Abrir</button></td></tr>`).join('') : '<tr><td colspan="7" class="c">Nenhum orçamento salvo.</td></tr>';
    $$('#memBody [data-abrir]').forEach((b) => b.addEventListener('click', () => memAbrir(+b.dataset.abrir)));
  }
  async function memAbrir(id) {
    try {
      const o = await api('/api/memoria/' + id);
      const det = $('#memDetalhe'); det.classList.remove('hidden');
      det.innerHTML = `<h2>#${o.id} · ${esc(o.titulo)}</h2>
        <p class="hint">Cliente: <b>${esc(o.cliente || '—')}</b> · Status: <b>${esc(o.status)}</b> · Total inicial: <b>${o.total ? BRL(o.total) : 'a preencher'}</b> · Versão ${o.versao} · atualizado em ${fmtDT(o.atualizado_em)}</p>
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
      $('#memEditar').onclick = () => { S = o.dados; memId = o.id; curId = null; curToken = null; localStorage.removeItem('neon-orc-atual'); preencherTudo(); mostrar('editor'); msg(`Editando o orçamento #${o.id} (memória). Ao salvar, entra como nova versão.`, true); };
      $('#memPdf').onclick = () => imprimirPDF(o.dados);
      $('#memXlsx').onclick = () => exportarDados(o.dados, '/api/exportar/xlsx', 'orcamento.xlsx');
      $('#memDocx').onclick = () => exportarDados(o.dados, '/api/exportar/docx', 'orcamento.docx');
      $('#memApagar').onclick = async () => { if (!confirm('Apagar este orçamento da memória? Não pode ser desfeito.')) return; await api('/api/memoria/' + o.id, { method: 'DELETE' }); det.classList.add('hidden'); memCarregar(); };
      $$('#memDetalhe [data-v]').forEach((b) => b.addEventListener('click', async () => {
        const v = await api(`/api/memoria/${o.id}/versao/${b.dataset.v}`);
        imprimirPDF(v.dados);
        $('#memMsg').textContent = `Versão ${v.versao} (${fmtDT(v.criado_em)}) aberta para PDF.`;
      }));
    } catch (e) { alert(e.message); }
  }
  async function exportarDados(dados, url, nome) { const antes = S; S = dados; await baixar(url, nome); S = antes; }

  /* ---------- modo admin: tabela de preços ---------- */
  let ADM = [];
  function admRender() {
    const box = $('#admBody'); if (!box) return;
    let grp = null, html = '';
    ADM.forEach((p, i) => {
      if (p.grupo !== grp) { grp = p.grupo; html += `<tr class="grp"><td colspan="6">${esc(grp)}</td></tr>`; }
      html += `<tr><td>${esc(p.rotulo)}<span class="espec">${esc(p.nota || '')}</span></td>
        <td class="c"><span class="fonte f-${esc(p.fonte)}">${esc(p.fonte)}</span></td>
        <td>${esc(p.unidade)}</td>
        <td class="r"><input class="num" type="number" min="0" step="0.01" data-adm="${i}" value="${p.valor ?? ''}" placeholder="a definir"></td>
        <td class="calc" data-admtot="${i}">${p.valor === null ? '—' : BRL(p.valor)}</td>
        <td class="c"><span class="lock" data-dirty="${i}" style="visibility:hidden">alterado</span></td></tr>`;
    });
    box.innerHTML = html;
    $$('#admBody [data-adm]').forEach((inp) => inp.addEventListener('input', () => {
      const i = +inp.dataset.adm; const v = inp.value === '' ? null : num(inp.value);
      ADM[i].valor = v; ADM[i].alterado = true;
      $(`[data-admtot="${i}"]`).textContent = v === null ? '—' : BRL(v);
      $(`[data-dirty="${i}"]`).style.visibility = 'visible';
    }));
  }
  async function admCarregar() {
    try {
      const j = await api('/api/precos');
      ADM = j.data.map((p) => ({ ...p, valor: p.valor === null ? null : Number(p.valor), alterado: false }));
      admRender();
    } catch (e) { /* sem tabela */ }
  }
  async function admSalvar() {
    const mudados = ADM.filter((p) => p.alterado).map((p) => ({ chave: p.chave, valor: p.valor }));
    if (!mudados.length) { $('#admMsg').textContent = 'Nenhuma alteração para salvar.'; return; }
    try {
      await api('/api/admin/precos', { method: 'PUT', body: JSON.stringify({ precos: mudados }) });
      $('#admMsg').textContent = `${mudados.length} preço(s) salvo(s). Os novos orçamentos já usam os valores atualizados.`;
      await carregarPrecos(); recalcular(); renderModelos(); renderItens(); atualizarTotais();
      admCarregar();
    } catch (e) { $('#admMsg').textContent = e.message; }
  }
  async function carregarPrecos() {
    const j = await api('/api/precos');
    P = Object.fromEntries(j.data.map((p) => [p.chave, { ...p, valor: p.valor === null ? null : Number(p.valor) }]));
    NIVEIS = j.niveis || {};
  }

  /* ---------- navegação e inicialização ---------- */
  function mostrar(v) {
    $$('.view').forEach((s) => s.classList.toggle('on', s.id === v));
    $$('nav a').forEach((a) => a.classList.toggle('on', a.dataset.go === v));
    if (v === 'memoria') memCarregar();
  }
  function preencherTudo() {
    bindCampos();
    $$('[data-k]').forEach((el) => { el.value = S[el.dataset.k] ?? ''; });
    $$('[data-c]').forEach((el) => { el.value = S.cliente[el.dataset.c] ?? ''; });
    $$('[data-l]').forEach((el) => { el.value = S.local[el.dataset.l] ?? ''; });
    renderAmbiente(); recalcular(); renderModelos(); renderItens(); atualizarTotais();
  }
  async function init() {
    try { const r = localStorage.getItem('neon-orc-rascunho'); if (r) { const d = JSON.parse(r); if (d && d.itens) S = d; } } catch (e) {}
    try { const c = JSON.parse(localStorage.getItem('neon-orc-atual') || 'null'); if (c) { curId = c.id; curToken = c.token; } } catch (e) {}
    if (!S.escolhas) S.escolhas = novoEstado().escolhas;
    if (!S.itens || !S.itens.length) gerarItensIniciais();
    for (const it of S.itens) { if (it.auto === undefined) it.auto = true; if (it.valorManual === undefined) it.valorManual = false; }
    try { await carregarPrecos(); } catch (e) { msg('Não foi possível carregar a tabela de preços. Recarregue a página.', false); }
    preencherTudo();

    $$('nav a').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); mostrar(a.dataset.go); history.replaceState(null, '', '#' + a.dataset.go); }));
    if (location.hash === '#memoria') mostrar('memoria');

    $('#addItem').addEventListener('click', () => {
      const n = prompt('Nome do item:'); if (!n) return;
      S.itens.push({ id: 'x' + Date.now(), grupo: 'Itens próprios', nome: n, espec: '', unidade: 'un', qtd: 1, ref: '', chave: null, tipo: 'unico', status: 'precisa', valorUnit: null, valorManual: true, obs: '', auto: false });
      renderItens(); atualizarTotais(); rascunho();
    });
    $('#resetAuto').addEventListener('click', async () => {
      if (!confirm('Restaurar quantidades e preços de referência? Ajustes manuais de quantidade e valor serão perdidos.')) return;
      await carregarPrecos();
      S.itens.forEach((it) => { if (it.id[0] !== 'x') { it.auto = true; it.valorManual = false; } });
      recalcular(); renderModelos(); renderItens(); atualizarTotais(); rascunho();
    });
    $('#btnSalvar').addEventListener('click', salvar);
    $('#btnPdf').addEventListener('click', () => imprimirPDF(S));
    $('#btnXlsx').addEventListener('click', () => baixar('/api/exportar/xlsx', 'orcamento.xlsx'));
    $('#btnDocx').addEventListener('click', () => baixar('/api/exportar/docx', 'orcamento.docx'));
    $('#btnNovo').addEventListener('click', () => {
      if (!confirm('Começar um orçamento novo? O atual continua salvo na memória, se já foi salvo.')) return;
      S = novoEstado(); gerarItensIniciais(); memId = null; curId = null; curToken = null;
      localStorage.removeItem('neon-orc-atual'); localStorage.removeItem('neon-orc-rascunho');
      preencherTudo(); msg('Orçamento novo iniciado.', true);
    });
    $('#formMem').addEventListener('submit', async (e) => {
      e.preventDefault(); $('#memErr').textContent = '';
      try { await api('/api/memoria/entrar', { method: 'POST', body: JSON.stringify({ senha: $('#memSenha').value }) }); $('#memSenha').value = ''; memCarregar(); }
      catch (err) { $('#memErr').textContent = err.message; }
    });
    $('#memSair').addEventListener('click', async () => { await api('/api/memoria/sair', { method: 'POST' }); $('#memPainel').classList.add('hidden'); $('#memLogin').classList.remove('hidden'); });
    $('#memBusca').addEventListener('input', memRender);
    $('#admSalvar').addEventListener('click', admSalvar);
    $('#admRestaurar').addEventListener('click', async () => {
      if (!confirm('Restaurar a tabela de preços padrão? Os valores atuais serão substituídos.')) return;
      await api('/api/admin/precos/restaurar', { method: 'POST' }); await carregarPrecos(); admCarregar(); recalcular(); renderModelos(); renderItens(); atualizarTotais();
    });
  }
  document.addEventListener('DOMContentLoaded', init);
})();
