/* Neon Gestão — Configurações → Alertas (cada pessoa) e administração dos alertas */

// ---------- Notificação no celular (push) ----------
const pushApoio = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const instalado = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function b64ParaBytes(b64) { const p = '='.repeat((4 - (b64.length % 4)) % 4); const raw = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); }
async function swRegistro() { return navigator.serviceWorker.register('/sw.js', { scope: '/' }); }
async function pushAtual() { if (!pushApoio()) return null; const r = await navigator.serviceWorker.getRegistration('/'); return r ? r.pushManager.getSubscription() : null; }
async function ativarPush() {
  if (!pushApoio()) throw new Error(ehIOS() && !instalado() ? 'No iPhone, primeiro adicione o painel à Tela de Início (Compartilhar → Adicionar à Tela de Início) e abra por lá.' : 'Este navegador não aceita notificações.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Permissão negada. Libere as notificações deste site nas configurações do navegador.');
  const reg = await swRegistro(); await navigator.serviceWorker.ready;
  const { chave } = await get('alertas/push/chave');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ParaBytes(chave) });
  await post('alertas/push/inscrever', { inscricao: sub.toJSON() });
}
async function desativarPush() {
  const sub = await pushAtual();
  if (sub) { await post('alertas/push/remover', { endpoint: sub.endpoint }); await sub.unsubscribe().catch(() => {}); }
}
// Mantém a inscrição do aparelho em dia (o navegador pode trocar o endereço)
async function sincronizarPush() {
  try { if (!pushApoio() || Notification.permission !== 'granted') return; const sub = await pushAtual(); if (sub) await post('alertas/push/inscrever', { inscricao: sub.toJSON() }); } catch { /* ok */ }
}

const CANAL_ICONE = { telegram: 'send', email: 'mail', push: 'bell' };

const AlertasMeus = defineComponent({
  setup() {
    const d = ref(null); const prefs = reactive({}); const neste = ref(false); const ocupado = ref(''); const chatManual = ref(''); const vinc = ref(null);
    async function load() {
      try {
        d.value = await get('alertas/meus'); Object.keys(prefs).forEach((k) => delete prefs[k]); Object.assign(prefs, JSON.parse(JSON.stringify(d.value.prefs)));
        neste.value = !!(await pushAtual().catch(() => null));
      } catch (e) { erro(e); }
    }
    onMounted(load);
    const fazer = async (k, fn, ok) => { ocupado.value = k; try { await fn(); if (ok) toast(ok); await load(); } catch (e) { erro(e); } finally { ocupado.value = ''; } };
    function marcar(ev, c) { const a = prefs[ev] || (prefs[ev] = []); const i = a.indexOf(c); if (i >= 0) a.splice(i, 1); else a.push(c); }
    const salvar = () => fazer('salvar', () => post('alertas/meus', { prefs }), 'Preferências salvas.');
    const testar = (canal) => fazer('teste' + (canal || ''), async () => {
      const r = await post('alertas/teste', canal ? { canal } : {});
      if (r.falhas?.length) toast(r.falhas.join('\n'), 'err', 9000); else toast(`Teste enviado (${r.enviados} canal${r.enviados > 1 ? 'is' : ''}). Confira!`);
    });
    const vincular = () => fazer('tg', async () => { vinc.value = await post('alertas/telegram/vincular'); if (vinc.value.link) window.open(vinc.value.link, '_blank'); });
    const salvarChat = () => fazer('tgchat', () => post('alertas/telegram/chat', { chat_id: chatManual.value }), 'Telegram vinculado.');
    const desvincular = () => fazer('tgdel', () => del('alertas/telegram'), 'Telegram desvinculado.');

    const canalCard = (k, titulo, corpo) => h('div', { class: 'card stack' }, [h('h2', { class: 'sec' }, [h(Icon, { n: CANAL_ICONE[k] }), titulo]), ...corpo]);
    const estado = (ok, txt) => h('div', { class: 'callout' + (ok ? ' ok' : '') }, [h(Icon, { n: ok ? 'check' : 'info' }), h('div', null, txt)]);
    return () => {
      const v = d.value; if (!v) return h('div', { class: 'skeleton', style: { height: '260px' } });
      const c = v.canais;
      return h('div', { class: 'stack' }, [
        !v.ativo ? h('div', { class: 'callout' }, [h(Icon, { n: 'alert' }), 'Os alertas estão desligados para a empresa toda. Um administrador pode ligar abaixo.']) : null,
        h('div', { class: 'grid g3' }, [
          canalCard('telegram', 'Telegram', [
            !c.telegram.configurado ? estado(false, 'O robô do Telegram ainda não foi configurado (Marketing → Integrações → Telegram).')
              : c.telegram.vinculado ? estado(true, 'Vinculado. Os alertas chegam no seu Telegram.') : estado(false, 'Ainda não vinculado.'),
            c.telegram.configurado && !c.telegram.vinculado ? h('button', { class: 'btn primary', disabled: ocupado.value === 'tg', onClick: vincular }, [h(Icon, { n: 'send', s: 16 }), 'Vincular meu Telegram']) : null,
            vinc.value && !c.telegram.vinculado ? h('div', { class: 'small muted' }, vinc.value.link ? ['Abriu o Telegram? Toque em ', h('b', null, 'Iniciar'), '. Se não abriu: ', h('a', { href: vinc.value.link, target: '_blank' }, 'abrir o robô'), '. Depois volte aqui e ', h('a', { href: '#', onClick: (e) => { e.preventDefault(); load(); } }, 'atualize'), '.'] : `Mande para o robô: /start v_${vinc.value.codigo}`) : null,
            c.telegram.configurado && !c.telegram.vinculado ? h('details', null, [h('summary', { class: 'small muted', style: { cursor: 'pointer' } }, 'Já sei o ID do meu chat'), h('div', { class: 'row gap-s', style: { marginTop: '8px' } }, [h('input', { class: 'input', placeholder: 'Ex.: 123456789', value: chatManual.value, onInput: (e) => { chatManual.value = e.target.value; } }), h('button', { class: 'btn', onClick: salvarChat }, 'Salvar')])]) : null,
            c.telegram.vinculado ? h('div', { class: 'row gap-s', style: { flexWrap: 'wrap' } }, [h('button', { class: 'btn', disabled: !!ocupado.value, onClick: () => testar('telegram') }, 'Testar'), h('button', { class: 'btn ghost', onClick: desvincular }, 'Desvincular')]) : null,
          ]),
          canalCard('email', 'E-mail', [
            c.email.configurado ? estado(true, ['Os alertas vão para ', h('b', null, c.email.endereco), '.']) : estado(false, 'O e-mail de avisos ainda não foi configurado pelo administrador.'),
            c.email.configurado ? h('button', { class: 'btn', disabled: !!ocupado.value, onClick: () => testar('email') }, 'Testar') : null,
          ]),
          canalCard('push', 'Notificação no celular', [
            neste.value ? estado(true, 'Ativada neste aparelho.') : c.push.aparelhos ? estado(true, `Ativada em ${c.push.aparelhos} aparelho(s). Ative também neste, se quiser.`) : estado(false, 'Receba avisos na tela do celular ou do computador, mesmo com o painel fechado.'),
            ehIOS() && !instalado() ? h('div', { class: 'small muted' }, 'iPhone: primeiro toque em Compartilhar → "Adicionar à Tela de Início" e abra o painel pelo ícone.') : null,
            h('div', { class: 'row gap-s', style: { flexWrap: 'wrap' } }, [
              !neste.value ? h('button', { class: 'btn primary', disabled: ocupado.value === 'push', onClick: () => fazer('push', ativarPush, 'Notificações ativadas neste aparelho!') }, [h(Icon, { n: 'bell', s: 16 }), 'Ativar neste aparelho'])
                : h('button', { class: 'btn ghost', onClick: () => fazer('push', desativarPush, 'Desativado neste aparelho.') }, 'Desativar aqui'),
              c.push.aparelhos ? h('button', { class: 'btn', disabled: !!ocupado.value, onClick: () => testar('push') }, 'Testar') : null,
            ]),
          ]),
        ]),
        h('div', { class: 'card pad0' }, [
          h('div', { class: 'card-head' }, [h(Icon, { n: 'bell' }), h('h3', null, 'O que eu quero receber'), h('div', { class: 'actions' }, [h('button', { class: 'btn sm', disabled: !!ocupado.value, onClick: () => testar() }, 'Testar todos'), h('button', { class: 'btn sm primary', disabled: ocupado.value === 'salvar', onClick: salvar }, 'Salvar')])]),
          h('div', { class: 'list' }, Object.entries(v.eventos).map(([ev, def]) => h('div', { class: 'li', style: { flexWrap: 'wrap', rowGap: '10px' } }, [
            h('div', { class: 'grow', style: { minWidth: '220px' } }, [h('div', { class: 't' }, def.nome), h('div', { class: 's' }, def.desc)]),
            h('div', { class: 'row gap-s', style: { flexWrap: 'wrap' } }, Object.entries(v.canais_nomes).map(([cn, nome]) => {
              const on = (prefs[ev] || []).includes(cn);
              return h('button', { class: 'chip' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', onClick: () => marcar(ev, cn) }, [h(Icon, { n: on ? 'check' : CANAL_ICONE[cn], s: 14 }), cn === 'push' ? 'Celular' : nome]);
            })),
          ]))),
        ]),
        can.admin() ? h(AlertasAdmin) : null,
      ]);
    };
  },
});

const NOMES_EVENTO = { teste: 'Teste' };
const AlertasAdmin = defineComponent({
  setup() {
    const d = ref(null); const geral = reactive({}); const email = reactive({}); const para = ref(''); const ocupado = ref('');
    async function load() { try { d.value = await get('alertas/config'); Object.assign(geral, d.value.geral); Object.assign(email, d.value.email); } catch (e) { erro(e); } }
    onMounted(load);
    const fazer = async (k, fn, ok) => { ocupado.value = k; try { await fn(); if (ok) toast(ok); await load(); } catch (e) { erro(e); } finally { ocupado.value = ''; } };
    const campo = (obj, k, label, extra = {}) => h('div', { class: 'field' + (extra.full ? ' full' : '') }, [h('label', null, label), h('input', { value: obj[k] ?? '', type: extra.type || 'text', inputmode: extra.inputmode, placeholder: extra.ph, autocomplete: extra.type === 'password' ? 'new-password' : 'off', onInput: (e) => { obj[k] = e.target.value; } }), extra.help ? h('div', { class: 'help' }, extra.help) : null]);
    return () => {
      const v = d.value; if (!v) return null;
      return h('div', { class: 'stack' }, [
        h('h2', { style: { margin: '10px 0 0' } }, 'Administração dos alertas'),
        h('div', { class: 'grid g2' }, [
          h('div', { class: 'card stack' }, [h('h2', { class: 'sec' }, [h(Icon, { n: 'settings' }), 'Regras']),
            h('div', { class: 'toggle', onClick: () => { geral.ativo = !geral.ativo; } }, [h('span', { class: 'switch' + (geral.ativo ? ' on' : '') }), h('span', null, geral.ativo ? 'Alertas ligados' : 'Alertas desligados (ninguém recebe)')]),
            h('div', { class: 'form' }, [
              campo(geral, 'offline_horas', 'Avisar sem sinal depois de (horas)', { inputmode: 'numeric' }),
              campo(geral, 'resumo_hora', 'Hora do resumo do dia (Brasília)', { inputmode: 'numeric', help: 'De 0 a 23. Ex.: 8 = 8h da manhã.' }),
              campo(geral, 'licenca_dias', 'Avisar licença faltando (dias)', { full: true, help: 'Separe por vírgula. Ex.: 7,3,0 (0 = no dia).' }),
            ]),
            h('div', { class: 'row gap-s', style: { flexWrap: 'wrap' } }, [h('button', { class: 'btn primary', disabled: !!ocupado.value, onClick: () => fazer('g', () => post('alertas/config', { geral }), 'Regras salvas.') }, 'Salvar regras'), h('button', { class: 'btn', disabled: !!ocupado.value, onClick: () => fazer('r', async () => { const r = await post('alertas/resumo/enviar'); toast(r.enviados ? 'Resumo enviado para você.' : 'Nenhum canal seu está pronto para o resumo.', r.enviados ? 'ok' : 'err'); }) }, 'Mandar o resumo agora (para mim)')]),
          ]),
          h('div', { class: 'card stack' }, [h('h2', { class: 'sec' }, [h(Icon, { n: 'mail' }), 'E-mail de avisos']),
            h('p', { class: 'muted small', style: { margin: 0 } }, ['Caixa que envia os alertas: ', h('b', null, 'contato@neonsistemas.com'), '. Coloque aqui a senha dessa caixa (a mesma do webmail da Hostinger). Ela fica guardada só no servidor.']),
            h('div', { class: 'form' }, [
              campo(email, 'usuario', 'E-mail (usuário)', { ph: 'contato@neonsistemas.com' }),
              campo(email, 'senha', 'Senha da caixa', { type: 'password' }),
              campo(email, 'nome', 'Nome do remetente'),
              campo(email, 'host', 'Servidor SMTP', { help: 'Hostinger: smtp.hostinger.com' }),
              campo(email, 'porta', 'Porta', { inputmode: 'numeric', help: '465 (SSL)' }),
            ]),
            h('div', { class: 'row gap-s', style: { flexWrap: 'wrap' } }, [
              h('button', { class: 'btn primary', disabled: !!ocupado.value, onClick: () => fazer('e', () => post('alertas/config', { email }), 'E-mail salvo.') }, 'Salvar'),
              h('input', { class: 'input', style: { maxWidth: '230px' }, placeholder: 'enviar teste para…', value: para.value, onInput: (e) => { para.value = e.target.value; } }),
              h('button', { class: 'btn', disabled: !!ocupado.value, onClick: () => fazer('t', async () => { const r = await post('alertas/email/testar', { para: para.value }); toast('E-mail de teste enviado para ' + r.para); }) }, 'Enviar teste'),
            ]),
          ]),
        ]),
        h('div', { class: 'card pad0' }, [
          h('div', { class: 'card-head' }, [h(Icon, { n: 'activity' }), h('h3', null, 'Últimos alertas enviados'), h('div', { class: 'actions' }, h('button', { class: 'btn sm ghost', onClick: load }, 'Atualizar'))]),
          v.log.length ? h('div', { class: 'list' }, v.log.map((l) => h('div', { class: 'li' }, [
            h('div', { class: 'grow' }, [h('div', { class: 't' }, l.titulo), h('div', { class: 's' }, `${v.eventos[l.evento]?.nome || NOMES_EVENTO[l.evento] || l.evento} · ${fmt.dt(l.created_at)} · ${l.enviados} envio(s)`), l.falhas ? h('div', { class: 'small', style: { color: 'var(--red)', whiteSpace: 'pre-line' } }, l.falhas) : null]),
          ]))) : h('div', { class: 'empty', style: { padding: '28px' } }, 'Nenhum alerta enviado ainda.'),
        ]),
      ]);
    };
  },
});
