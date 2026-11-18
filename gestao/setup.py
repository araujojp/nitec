import json, os, sys, secrets, urllib.request, urllib.error, ssl

HERE = os.path.dirname(os.path.abspath(__file__))
C = json.load(open(os.path.join(HERE, 'cred.json')))
BASE = 'https://' + C['HOST']
CTX = ssl.create_default_context(cafile='/root/.ccr/ca-bundle.crt')
TOKEN = None
LOG = []

def call(method, path, data=None, ok=(200, 201, 204), quiet=False, raw=None, ctype='application/json'):
    body = raw if raw is not None else (json.dumps(data).encode() if data is not None else None)
    req = urllib.request.Request(BASE + path, data=body, method=method)
    req.add_header('Content-Type', ctype)
    if TOKEN:
        req.add_header('Authorization', 'Bearer ' + TOKEN)
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=60) as r:
            txt = r.read().decode() or '{}'
            return r.status, json.loads(txt) if txt.strip().startswith(('{', '[')) else txt
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        if not quiet:
            print('  !', method, path, e.code, txt[:400])
        return e.code, txt

def login():
    global TOKEN
    s, r = call('POST', '/auth/login', {'email': C['ADMIN_EMAIL'], 'password': C['ADMIN_PASSWORD']})
    TOKEN = r['data']['access_token']

def exists(path):
    s, _ = call('GET', path, quiet=True)
    return s == 200

# ---------- helpers de campos ----------
def tr(pt, en=None):
    return [{'language': 'pt-BR', 'translation': pt}] + ([{'language': 'en-US', 'translation': en}] if en else [])

def F(field, ftype, label, iface='input', width='half', required=False, note=None, options=None,
      display=None, display_options=None, special=None, default=None, unique=False, hidden=False, readonly=False, choices=None):
    meta = {'interface': iface, 'width': width, 'required': required, 'translations': tr(label),
            'hidden': hidden, 'readonly': readonly}
    if note: meta['note'] = note
    if options: meta['options'] = options
    if choices:
        meta['options'] = {**(options or {}), 'choices': [{'text': t, 'value': v, **({'color': c} if c else {})} for v, t, c in choices]}
        meta['display'] = 'labels'
        meta['display_options'] = {'showAsDot': True, 'choices': meta['options']['choices']}
    if display: meta['display'] = display
    if display_options: meta['display_options'] = display_options
    if special: meta['special'] = special
    schema = {'is_nullable': not required}
    if default is not None: schema['default_value'] = default
    if unique: schema['is_unique'] = True
    return {'field': field, 'type': ftype, 'meta': meta, 'schema': schema}

def PK():
    return {'field': 'id', 'type': 'integer', 'meta': {'hidden': True, 'readonly': True, 'interface': 'input'},
            'schema': {'is_primary_key': True, 'has_auto_increment': True}}

def STAMPS():
    return [
        {'field': 'date_created', 'type': 'timestamp', 'meta': {'special': ['date-created'], 'interface': 'datetime', 'readonly': True, 'hidden': True, 'width': 'half', 'display': 'datetime', 'display_options': {'relative': True}, 'translations': tr('Criado em')}, 'schema': {}},
        {'field': 'date_updated', 'type': 'timestamp', 'meta': {'special': ['date-updated'], 'interface': 'datetime', 'readonly': True, 'hidden': True, 'width': 'half', 'display': 'datetime', 'display_options': {'relative': True}, 'translations': tr('Atualizado em')}, 'schema': {}},
        {'field': 'user_created', 'type': 'uuid', 'meta': {'special': ['user-created'], 'interface': 'select-dropdown-m2o', 'readonly': True, 'hidden': True, 'width': 'half', 'translations': tr('Criado por')}, 'schema': {}},
    ]

def M2O(field, label, related, template, required=False, width='half'):
    return F(field, 'integer', label, iface='select-dropdown-m2o', width=width, required=required,
             options={'template': template}, display='related-values', display_options={'template': template}, special=['m2o'])

def collection(name, label, icon, note, template, fields, sort=None, color=None, group=None, archive=None):
    if exists(f'/collections/{name}'):
        print('  (já existe)', name); return
    meta = {'icon': icon, 'note': note, 'display_template': template, 'translations': [
        {'language': 'pt-BR', 'translation': label, 'singular': label, 'plural': label}], 'color': color, 'sort': sort,
        'accountability': 'all'}
    if group: meta['group'] = group
    if archive:
        meta.update({'archive_field': archive[0], 'archive_value': archive[1], 'unarchive_value': archive[2], 'archive_app_filter': True})
    s, r = call('POST', '/collections', {'collection': name, 'meta': meta, 'schema': {}, 'fields': [PK()] + fields + STAMPS()})
    print('  coleção', name, s)

def relation(coll, field, related, one_field=None, on_delete='SET NULL'):
    data = {'collection': coll, 'field': field, 'related_collection': related, 'schema': {'on_delete': on_delete}, 'meta': {}}
    if one_field: data['meta'] = {'one_field': one_field, 'sort_field': None}
    s, r = call('POST', '/relations', data, quiet=True)
    print('  relação', coll + '.' + field, '->', related, s if s in (200, 201, 204) else r[:160])

def o2m(coll, field, label, template, width='full'):
    if exists(f'/fields/{coll}/{field}'): return
    s, r = call('POST', f'/fields/{coll}', {'field': field, 'type': 'alias', 'meta': {
        'special': ['o2m'], 'interface': 'list-o2m', 'width': width, 'translations': tr(label),
        'options': {'template': template, 'enableSearchFilter': True, 'enableLink': True},
        'display': 'related-values', 'display_options': {'template': template}}})
    print('  lista', coll + '.' + field, s)

STATUS_CLIENTE = [('lead', 'Lead', '#6B7697'), ('negociacao', 'Em negociação', '#F59E0B'), ('ativo', 'Ativo', '#22C55E'),
                  ('suspenso', 'Suspenso', '#EF4444'), ('cancelado', 'Cancelado', '#334155')]

def build():
    print('== Configurações do projeto')
    call('PATCH', '/settings', {'project_name': 'Neon Sistemas', 'project_descriptor': 'Gestão de clientes',
                                'project_color': '#F97316', 'default_language': 'pt-BR',
                                'default_appearance': 'dark', 'project_url': 'https://neonsistemas.com'})
    call('PATCH', '/users/me', {'first_name': 'Neon', 'last_name': 'Sistemas', 'language': 'pt-BR', 'appearance': 'dark'})

    print('== Coleções')
    collection('produtos', 'Produtos', 'inventory_2', 'Produtos da Neon (Painel Neon, Neon Motel, PABX Neon).', '{{nome}}', [
        F('nome', 'string', 'Nome', required=True),
        F('codigo', 'string', 'Código (usado na API)', required=True, unique=True, note='Ex.: neon-motel. Sem espaços nem acentos.'),
        F('descricao', 'text', 'Descrição', iface='input-multiline', width='full'),
        F('ativo', 'boolean', 'Ativo', iface='boolean', default=True, display='boolean'),
    ], sort=8, color='#F97316')

    collection('clientes', 'Clientes', 'storefront', 'Cadastro de clientes e leads.', '{{nome_fantasia}} · {{cidade}}/{{uf}}', [
        F('status', 'string', 'Status', iface='select-dropdown', required=True, default='lead', choices=STATUS_CLIENTE),
        F('tipo', 'string', 'Tipo de estabelecimento', iface='select-dropdown', choices=[
            ('motel', 'Motel', None), ('hotel', 'Hotel', None), ('pousada', 'Pousada', None), ('flat', 'Flat / Apart-hotel', None),
            ('hospital', 'Hospital', None), ('empresa', 'Empresa', None), ('outro', 'Outro', None)]),
        F('nome_fantasia', 'string', 'Nome fantasia', required=True),
        F('razao_social', 'string', 'Razão social'),
        F('documento', 'string', 'CNPJ / CPF'),
        F('suites', 'integer', 'Nº de suítes / quartos'),
        F('responsavel', 'string', 'Responsável'),
        F('telefone', 'string', 'Telefone'),
        F('whatsapp', 'string', 'WhatsApp', note='Com DDD. Ex.: 34984302083'),
        F('email', 'string', 'E-mail'),
        F('cep', 'string', 'CEP'),
        F('endereco', 'string', 'Endereço', width='full'),
        F('cidade', 'string', 'Cidade'),
        F('uf', 'string', 'UF', options={'trim': True}),
        F('origem', 'string', 'Como nos conheceu', iface='select-dropdown', choices=[
            ('site', 'Site', None), ('whatsapp', 'WhatsApp', None), ('indicacao', 'Indicação', None),
            ('google', 'Google', None), ('redes', 'Redes sociais', None), ('visita', 'Visita', None), ('outro', 'Outro', None)]),
        F('cliente_desde', 'date', 'Cliente desde', iface='datetime', display='datetime'),
        F('observacoes', 'text', 'Observações', iface='input-rich-text-md', width='full'),
    ], sort=1, color='#3B82F6', archive=('status', 'cancelado', 'ativo'))

    collection('instalacoes', 'Instalações', 'router', 'Cada sistema instalado em um cliente.', '{{codigo}} · {{produto.nome}} · {{cliente.nome_fantasia}}', [
        M2O('cliente', 'Cliente', 'clientes', '{{nome_fantasia}}', required=True),
        M2O('produto', 'Produto', 'produtos', '{{nome}}', required=True),
        F('codigo', 'string', 'Código da instalação', required=True, unique=True, note='Identificador único que o equipamento envia para a API. Ex.: MOTEL-PARAISO-01'),
        F('status', 'string', 'Status', iface='select-dropdown', default='implantacao', choices=[
            ('implantacao', 'Em implantação', '#F59E0B'), ('ativa', 'Ativa', '#22C55E'), ('manutencao', 'Em manutenção', '#3B82F6'),
            ('inativa', 'Inativa', '#334155')]),
        F('versao_instalada', 'string', 'Versão instalada'),
        F('canal', 'string', 'Canal de atualização', iface='select-dropdown', default='estavel', choices=[
            ('estavel', 'Estável', '#22C55E'), ('beta', 'Beta', '#F59E0B')]),
        F('ip_local', 'string', 'IP na rede do cliente'),
        F('acesso_remoto', 'string', 'Acesso remoto (VPN/AnyDesk)', note='Não guarde senhas aqui.'),
        F('data_instalacao', 'date', 'Data da instalação', iface='datetime', display='datetime'),
        F('ultimo_contato', 'timestamp', 'Último contato do equipamento', iface='datetime', readonly=True, display='datetime', display_options={'relative': True}),
        F('observacoes', 'text', 'Observações', iface='input-rich-text-md', width='full'),
    ], sort=2, color='#22D3EE')

    collection('licencas', 'Licenças e contratos', 'verified', 'Licenças/contratos de cada instalação.', '{{chave}} · {{instalacao.codigo}}', [
        M2O('instalacao', 'Instalação', 'instalacoes', '{{codigo}}', required=True),
        F('chave', 'string', 'Chave da licença', required=True, unique=True, note='Gerada automaticamente se ficar vazia (veja o manual).'),
        F('plano', 'string', 'Plano', iface='select-dropdown', choices=[
            ('mensal', 'Mensal', None), ('anual', 'Anual', None), ('vitalicia', 'Vitalícia', None), ('teste', 'Teste', None)]),
        F('valor_mensal', 'decimal', 'Valor mensal (R$)', options={'iconLeft': 'attach_money'}),
        F('inicio', 'date', 'Início', iface='datetime', display='datetime'),
        F('vencimento', 'date', 'Vencimento', iface='datetime', display='datetime'),
        F('status', 'string', 'Status', iface='select-dropdown', default='ativa', choices=[
            ('ativa', 'Ativa', '#22C55E'), ('suspensa', 'Suspensa', '#EF4444'), ('expirada', 'Expirada', '#334155'), ('teste', 'Em teste', '#F59E0B')]),
        F('contrato', 'uuid', 'Contrato (PDF)', iface='file', special=['file'], display='file'),
        F('observacoes', 'text', 'Observações', iface='input-multiline', width='full'),
    ], sort=3, color='#22C55E')

    collection('versoes', 'Atualizações', 'system_update', 'Versões dos sistemas disponíveis para download pela API.', '{{produto.nome}} {{numero}}', [
        M2O('produto', 'Produto', 'produtos', '{{nome}}', required=True),
        F('numero', 'string', 'Número da versão', required=True, note='Formato 1.4.2 (maior.menor.correção).'),
        F('canal', 'string', 'Canal', iface='select-dropdown', default='estavel', choices=[
            ('estavel', 'Estável', '#22C55E'), ('beta', 'Beta', '#F59E0B')]),
        F('publicada', 'boolean', 'Publicada (liberada para download)', iface='boolean', default=False, display='boolean'),
        F('obrigatoria', 'boolean', 'Atualização obrigatória', iface='boolean', default=False, display='boolean'),
        F('arquivo', 'uuid', 'Arquivo da atualização', iface='file', special=['file'], display='file', required=True,
          options={'folder': None}),
        F('sha256', 'string', 'SHA-256 do arquivo', note='Opcional. Usado pelo equipamento para conferir o download.', width='full'),
        F('data_lancamento', 'date', 'Data de lançamento', iface='datetime', display='datetime'),
        F('notas', 'text', 'Notas da versão (o que mudou)', iface='input-rich-text-md', width='full'),
    ], sort=4, color='#8B5CF6')

    collection('chamados', 'Chamados de suporte', 'support_agent', 'Atendimentos e suporte técnico.', '#{{id}} {{titulo}}', [
        M2O('cliente', 'Cliente', 'clientes', '{{nome_fantasia}}', required=True),
        M2O('instalacao', 'Instalação', 'instalacoes', '{{codigo}}'),
        F('titulo', 'string', 'Título', required=True, width='full'),
        F('prioridade', 'string', 'Prioridade', iface='select-dropdown', default='normal', choices=[
            ('baixa', 'Baixa', '#6B7697'), ('normal', 'Normal', '#3B82F6'), ('alta', 'Alta', '#F59E0B'), ('urgente', 'Urgente', '#EF4444')]),
        F('status', 'string', 'Status', iface='select-dropdown', default='aberto', choices=[
            ('aberto', 'Aberto', '#EF4444'), ('andamento', 'Em andamento', '#F59E0B'), ('aguardando', 'Aguardando cliente', '#8B5CF6'),
            ('resolvido', 'Resolvido', '#22C55E')]),
        F('canal', 'string', 'Canal', iface='select-dropdown', choices=[
            ('whatsapp', 'WhatsApp', None), ('telefone', 'Telefone', None), ('email', 'E-mail', None), ('remoto', 'Acesso remoto', None), ('visita', 'Visita', None)]),
        F('responsavel', 'uuid', 'Responsável', iface='select-dropdown-m2o', special=['m2o'], display='user'),
        F('descricao', 'text', 'Descrição', iface='input-rich-text-md', width='full'),
        F('solucao', 'text', 'Solução aplicada', iface='input-rich-text-md', width='full'),
        F('resolvido_em', 'timestamp', 'Resolvido em', iface='datetime', display='datetime'),
        F('anexos', 'alias', 'Anexos', iface='files', special=['files'], width='full'),
    ], sort=5, color='#EF4444')

    collection('cobrancas', 'Cobranças', 'payments', 'Mensalidades e pagamentos.', '{{competencia}} · {{cliente.nome_fantasia}}', [
        M2O('cliente', 'Cliente', 'clientes', '{{nome_fantasia}}', required=True),
        M2O('licenca', 'Licença', 'licencas', '{{chave}}'),
        F('competencia', 'string', 'Competência', note='Ex.: 2026-12', required=True),
        F('valor', 'decimal', 'Valor (R$)', required=True),
        F('vencimento', 'date', 'Vencimento', iface='datetime', display='datetime', required=True),
        F('status', 'string', 'Status', iface='select-dropdown', default='pendente', choices=[
            ('pendente', 'Pendente', '#F59E0B'), ('pago', 'Pago', '#22C55E'), ('atrasado', 'Atrasado', '#EF4444'), ('cancelado', 'Cancelado', '#334155')]),
        F('pago_em', 'date', 'Pago em', iface='datetime', display='datetime'),
        F('forma_pagamento', 'string', 'Forma de pagamento', iface='select-dropdown', choices=[
            ('pix', 'Pix', None), ('boleto', 'Boleto', None), ('cartao', 'Cartão', None), ('transferencia', 'Transferência', None), ('dinheiro', 'Dinheiro', None)]),
        F('comprovante', 'uuid', 'Comprovante', iface='file', special=['file'], display='file'),
        F('observacoes', 'text', 'Observações', iface='input-multiline', width='full'),
    ], sort=6, color='#F59E0B')

    collection('interacoes', 'Histórico de contatos', 'forum', 'Ligações, mensagens, visitas e reuniões com cada cliente.', '{{tipo}} · {{data}}', [
        M2O('cliente', 'Cliente', 'clientes', '{{nome_fantasia}}', required=True),
        F('tipo', 'string', 'Tipo', iface='select-dropdown', choices=[
            ('ligacao', 'Ligação', None), ('whatsapp', 'WhatsApp', None), ('email', 'E-mail', None), ('visita', 'Visita', None),
            ('reuniao', 'Reunião', None), ('demonstracao', 'Demonstração', None)]),
        F('data', 'timestamp', 'Data', iface='datetime', display='datetime', required=True),
        F('resumo', 'text', 'Resumo', iface='input-rich-text-md', width='full', required=True),
        F('proximo_passo', 'string', 'Próximo passo', width='full'),
        F('lembrete', 'date', 'Lembrar em', iface='datetime', display='datetime'),
    ], sort=7, color='#6B7697')

    collection('checkins', 'Sinais dos equipamentos', 'sensors', 'Registros enviados automaticamente pelos equipamentos (via API).', '{{codigo_instalacao}} · {{versao}}', [
        F('codigo_instalacao', 'string', 'Código da instalação', required=True),
        F('versao', 'string', 'Versão em uso'),
        F('evento', 'string', 'Evento', iface='select-dropdown', default='heartbeat', choices=[
            ('heartbeat', 'Online', '#22C55E'), ('atualizado', 'Atualizou', '#3B82F6'), ('erro', 'Erro', '#EF4444'), ('inicio', 'Iniciou', '#8B5CF6')]),
        F('mensagem', 'text', 'Mensagem', iface='input-multiline', width='full'),
        F('detalhes', 'json', 'Detalhes técnicos', iface='input-code', width='full', options={'language': 'JSON'}, special=['cast-json']),
    ], sort=9, color='#334155')

    print('== Relações')
    relation('instalacoes', 'cliente', 'clientes', 'instalacoes', on_delete='NO ACTION')
    relation('instalacoes', 'produto', 'produtos', None, on_delete='NO ACTION')
    relation('licencas', 'instalacao', 'instalacoes', 'licencas', on_delete='CASCADE')
    relation('licencas', 'contrato', 'directus_files')
    relation('versoes', 'produto', 'produtos', 'versoes', on_delete='NO ACTION')
    relation('versoes', 'arquivo', 'directus_files')
    relation('chamados', 'cliente', 'clientes', 'chamados', on_delete='CASCADE')
    relation('chamados', 'instalacao', 'instalacoes', 'chamados')
    relation('chamados', 'responsavel', 'directus_users')
    relation('cobrancas', 'cliente', 'clientes', 'cobrancas', on_delete='CASCADE')
    relation('cobrancas', 'licenca', 'licencas', None)
    relation('cobrancas', 'comprovante', 'directus_files')
    relation('interacoes', 'cliente', 'clientes', 'interacoes', on_delete='CASCADE')
    for c in ['produtos', 'clientes', 'instalacoes', 'licencas', 'versoes', 'chamados', 'cobrancas', 'interacoes', 'checkins']:
        relation(c, 'user_created', 'directus_users')

    # anexos (M2M com arquivos) para chamados
    if not exists('/collections/chamados_arquivos'):
        call('POST', '/collections', {'collection': 'chamados_arquivos', 'meta': {'hidden': True, 'icon': 'import_export'}, 'schema': {},
                                      'fields': [PK(), {'field': 'chamados_id', 'type': 'integer', 'schema': {}, 'meta': {'hidden': True}},
                                                 {'field': 'directus_files_id', 'type': 'uuid', 'schema': {}, 'meta': {'hidden': True}}]})
        call('POST', '/relations', {'collection': 'chamados_arquivos', 'field': 'directus_files_id', 'related_collection': 'directus_files',
                                    'meta': {'one_field': None, 'junction_field': 'chamados_id'}, 'schema': {'on_delete': 'SET NULL'}})
        call('POST', '/relations', {'collection': 'chamados_arquivos', 'field': 'chamados_id', 'related_collection': 'chamados',
                                    'meta': {'one_field': 'anexos', 'junction_field': 'directus_files_id'}, 'schema': {'on_delete': 'SET NULL'}})

    print('== Listas dentro do cliente')
    o2m('clientes', 'instalacoes', 'Instalações', '{{codigo}} · {{produto.nome}} · {{status}}')
    o2m('clientes', 'chamados', 'Chamados', '#{{id}} {{titulo}} · {{status}}')
    o2m('clientes', 'cobrancas', 'Cobranças', '{{competencia}} · R$ {{valor}} · {{status}}')
    o2m('clientes', 'interacoes', 'Histórico de contatos', '{{data}} · {{tipo}} · {{resumo}}')
    o2m('instalacoes', 'licencas', 'Licenças', '{{chave}} · {{status}} · vence {{vencimento}}')
    o2m('instalacoes', 'chamados', 'Chamados', '#{{id}} {{titulo}} · {{status}}')
    o2m('produtos', 'versoes', 'Versões', '{{numero}} · {{canal}} · publicada: {{publicada}}')

if __name__ == '__main__':
    login()
    build()
