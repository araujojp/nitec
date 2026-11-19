/* Neon Gestão — Asaas: configuração (Configurações → Asaas) e boleto/Pix na cobrança */

async function carregarAsaas() { try { store.asaas = await get('asaas/estado'); } catch { store.asaas = { ativo: false }; } }

const AsaasConfig = defineComponent({
  setup() {
    const d = ref(null); const f = reactive({}); const ocupado = ref('');
    async function load() { try { d.value = await get('asaas/config'); Object.assign(f, { ambiente: d.value.ambiente, api_key: d.value.api_key, tipo: d.value.tipo, automatico: d.value.automatico, notificar_cliente: d.value.notificar_cliente, multa: d.value.multa, juros: d.value.juros, ativo: d.value.ativo }); } catch (e) { erro(e); } }
    onMounted(load);
    const fazer = async (k, fn, ok) => { ocupado.value = k; try { const r = await fn(); if (ok) toast(typeof ok === 'function' ? ok(r) : ok); await load(); await carregarAsaas(); } catch (e) { erro(e); } finally { ocupado.value = ''; } };
    const sw = (k, on, off) => h('div', { class: 'toggle', onClick: () => { f[k] = !f[k]; } }, [h('span', { class: 'switch' + (f[k] ? ' on' : '') }), h('span', null, f[k] ? on : off)]);
    const campo = (k, label, extra = {}) => h('div', { class: 'field' + (extra.full ? ' full' : '') }, [h('label', null, label), h('input', { value: f[k] ?? '', type: extra.type || 'text', inputmode: extra.inputmode, autocomplete: 'off', placeholder: extra.ph, onInput: (e) => { f[k] = e.target.value; } }), extra.help ? h('div', { class: 'help' }, extra.help) : null]);
    return () => {
      const v = d.value; if (!v) return h('div', { class: 'skeleton', style: { height: '300px' } });
      const prod = f.ambiente === 'producao';
      return h('div', { class: 'stack', style: { maxWidth: '980px' } }, [
        h('div', { class: 'callout' + (v.ativo ? ' ok' : '') }, [h(Icon, { n: v.ativo ? 'check' : 'info' }), h('div', null, v.ativo
          ? [h('b', null, `Asaas ligado (${v.ambiente === 'producao' ? 'PRODUÇÃO — cobranças reais' : 'ambiente de testes'})`), v.conta ? ` · conta ${v.conta.nome || v.conta.email}` : '', ` · ${v.emitidas} cobrança(s) emitida(s)`, v.erros ? ` · ${v.erros} com erro` : '']
          : 'Asaas desligado: as cobranças continuam manuais, como sempre. Ligue para gerar boleto/Pix e receber a baixa automática quando o cliente pagar.')]),
        h('div', { class: 'grid g2' }, [
          h('div', { class: 'card stack' }, [h('h2', { class: 'sec' }, [h(Icon, { n: 'plug' }), 'Conexão']),
            h('div', { class: 'seg' }, [['sandbox', 'Testes (sandbox)'], ['producao', 'Produção']].map(([k, l]) => h('button', { class: f.ambiente === k ? 'on' : '', onClick: () => { f.ambiente = k; } }, l))),
            prod && v.ambiente !== 'producao' ? h('div', { class: 'callout warn' }, [h(Icon, { n: 'alert' }), 'Em produção as cobranças são reais. Use a chave da conta de produção. Ao trocar de ambiente, os clientes são recriados na conta nova.']) : null,
            h('div', { class: 'form' }, [campo('api_key', 'Chave de API', { full: true, ph: prod ? '$aact_prod_…' : '$aact_hmlg_…', help: v.tem_chave ? 'Já salva. Deixe como está para manter.' : 'No Asaas: Minha conta → Integrações → Gerar chave de API.' })]),
            sw('ativo', 'Ligado', 'Desligado'),
            h('div', { class: 'row gap-s', style: { flexWrap: 'wrap' } }, [
              h('button', { class: 'btn primary', disabled: !!ocupado.value, onClick: () => fazer('s', () => post('asaas/config', f), 'Configuração salva.') }, 'Salvar'),
              h('button', { class: 'btn', disabled: !!ocupado.value || !v.tem_chave, onClick: () => fazer('t', () => post('asaas/testar'), (r) => `Conectado: ${r.conta}`) }, 'Testar conexão'),
              h('button', { class: 'btn', disabled: !!ocupado.value || !v.tem_chave, onClick: () => fazer('w', () => post('asaas/webhook'), (r) => 'Aviso de pagamento configurado: ' + r.url) }, v.webhook_id ? 'Reconfigurar aviso de pagamento' : 'Configurar aviso de pagamento'),
            ]),
            h('div', { class: 'small muted' }, v.webhook_id ? ['✅ O Asaas avisa este painel quando o cliente paga: ', h('span', { class: 'mono' }, v.webhook_url)] : '⚠️ Falta configurar o aviso de pagamento (webhook): sem ele, a baixa não é automática.'),
          ]),
          h('div', { class: 'card stack' }, [h('h2', { class: 'sec' }, [h(Icon, { n: 'money' }), 'Como cobrar']),
            h('div', { class: 'field' }, [h('label', null, 'Forma de pagamento'), h('div', { class: 'seg' }, [['UNDEFINED', 'Cliente escolhe'], ['PIX', 'Só Pix'], ['BOLETO', 'Boleto + Pix']].map(([k, l]) => h('button', { class: f.tipo === k ? 'on' : '', onClick: () => { f.tipo = k; } }, l))), h('div', { class: 'help' }, '"Cliente escolhe" abre uma página com boleto, Pix e cartão.')]),
            h('div', { class: 'form' }, [campo('multa', 'Multa por atraso (%)', { inputmode: 'decimal', help: 'Máximo 2%.' }), campo('juros', 'Juros ao mês (%)', { inputmode: 'decimal', help: 'Máximo 1% ao mês.' })]),
            sw('automatico', 'Gerar boleto/Pix sozinho para as cobranças novas', 'Gerar só quando eu clicar na cobrança'),
            sw('notificar_cliente', 'O Asaas avisa o cliente (e-mail/SMS de cobrança e lembretes)', 'O Asaas não avisa o cliente'),
            h('button', { class: 'btn primary', disabled: !!ocupado.value, onClick: () => fazer('s2', () => post('asaas/config', f), 'Configuração salva.') }, 'Salvar'),
          ]),
        ]),
        h('div', { class: 'card stack' }, [h('h2', { class: 'sec' }, [h(Icon, { n: 'info' }), 'Passo a passo']),
          h('ol', { class: 'muted', style: { margin: 0, paddingLeft: '20px', lineHeight: 1.8 } }, [
            h('li', null, ['Crie uma conta de testes em ', h('a', { href: 'https://sandbox.asaas.com', target: '_blank', rel: 'noopener' }, 'sandbox.asaas.com'), ' (é grátis e não movimenta dinheiro).']),
            h('li', null, 'No Asaas: Minha conta → Integrações → Gerar chave de API. Cole a chave aqui, salve e clique em "Testar conexão".'),
            h('li', null, 'Clique em "Configurar aviso de pagamento" e ligue a integração.'),
            h('li', null, 'Abra uma cobrança, clique em "Gerar boleto/Pix" e pague pelo próprio sandbox: a cobrança fica paga sozinha aqui.'),
            h('li', null, 'Tudo certo? Crie a conta de produção no Asaas, troque para "Produção", cole a chave nova e configure o aviso de novo.'),
          ]),
          h('div', { class: 'small muted' }, 'O cliente precisa ter CNPJ ou CPF preenchido para receber boleto/Pix.'),
        ]),
        h('div', { class: 'card pad0' }, [h('div', { class: 'card-head' }, [h(Icon, { n: 'activity' }), h('h3', null, 'Últimos avisos do Asaas')]),
          v.eventos.length ? h('div', { class: 'list' }, v.eventos.map((e) => h('div', { class: 'li' }, [h('div', { class: 'grow' }, [h('div', { class: 't mono small' }, e.evento), h('div', { class: 's' }, `${fmt.dt(e.created_at)} · ${e.pagamento || ''} · ${e.resultado || ''}`)])]))) : h('div', { class: 'empty', style: { padding: '24px' } }, 'Nenhum aviso recebido ainda.')]),
      ]);
    };
  },
});

const ASAAS_STATUS = { PENDING: 'Aguardando pagamento', OVERDUE: 'Vencida no Asaas', RECEIVED: 'Paga', CONFIRMED: 'Paga (confirmada)', RECEIVED_IN_CASH: 'Paga por fora', REFUNDED: 'Estornada', DELETED: 'Cancelada no Asaas', CRIANDO: 'Gerando…', ERRO: 'Erro ao gerar' };

const AsaasCobranca = defineComponent({
  props: { cobranca: Object }, emits: ['change'],
  setup(p, { emit }) {
    const ocupado = ref(''); const pix = ref(null);
    const fazer = async (k, fn, ok) => { ocupado.value = k; try { const r = await fn(); if (ok) toast(typeof ok === 'function' ? ok(r) : ok); emit('change'); } catch (e) { erro(e); emit('change'); } finally { ocupado.value = ''; } };
    return () => {
      const r = p.cobranca;
      if (!store.asaas?.ativo && !r.asaas_id) return null;
      const st = r.asaas_status;
      return h('div', { class: 'card', style: { marginBottom: '16px' } }, [
        h('div', { class: 'row wrap' }, [
          h('div', { class: 'grow' }, [h('div', { class: 'muted small' }, 'Boleto / Pix (Asaas)'),
            h('b', null, r.asaas_id ? (ASAAS_STATUS[st] || st || 'Emitida') : st === 'ERRO' ? 'Erro ao gerar' : 'Ainda não gerado'),
            r.asaas_erro ? h('div', { class: 'small', style: { color: 'var(--red)' } }, r.asaas_erro) : null]),
          !r.asaas_id && can.write() && !['pago', 'cancelado'].includes(r.status) ? h('button', { class: 'btn primary', disabled: !!ocupado.value, onClick: () => fazer('e', () => post(`asaas/cobrancas/${r.id}/emitir`), 'Boleto/Pix gerado!') }, [h(Icon, { n: 'zap', s: 16 }), ocupado.value === 'e' ? 'Gerando…' : st === 'ERRO' ? 'Tentar de novo' : 'Gerar boleto/Pix']) : null,
          r.asaas_url ? h('a', { class: 'btn', href: r.asaas_url, target: '_blank', rel: 'noopener' }, [h(Icon, { n: 'link', s: 16 }), 'Abrir fatura']) : null,
          r.asaas_url ? h('button', { class: 'btn', onClick: () => copiar(r.asaas_url, 'Link da fatura copiado!') }, [h(Icon, { n: 'copy', s: 16 }), 'Copiar link']) : null,
          r.asaas_id && !['pago', 'cancelado'].includes(r.status) ? h('button', { class: 'btn', disabled: !!ocupado.value, onClick: () => fazer('p', async () => { pix.value = await get(`asaas/cobrancas/${r.id}/pix`); }) }, 'Pix copia e cola') : null,
          r.asaas_id ? h('button', { class: 'btn ghost', disabled: !!ocupado.value, title: 'Conferir no Asaas', onClick: () => fazer('a', () => post(`asaas/cobrancas/${r.id}/atualizar`), (x) => `Asaas: ${ASAAS_STATUS[x.status] || x.status}`) }, [h(Icon, { n: 'refresh', s: 16 }), 'Conferir']) : null,
        ]),
        pix.value ? h('div', { class: 'row wrap', style: { marginTop: '14px', alignItems: 'flex-start' } }, [
          pix.value.imagem ? h('img', { src: pix.value.imagem, alt: 'QR Code Pix', style: { width: '150px', background: '#fff', borderRadius: '10px', padding: '6px' } }) : null,
          h('div', { class: 'grow', style: { minWidth: '220px' } }, h(CodeBlock, { code: pix.value.copia_e_cola })),
        ]) : null,
      ]);
    };
  },
});
