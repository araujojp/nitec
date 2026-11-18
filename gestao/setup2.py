import json, os, secrets, uuid
import setup as S
from setup import call, exists, F, relation, tr

S.login()
OUT = {}

def first(path, **flt):
    from urllib.parse import quote
    q = '&'.join(f'filter[{k}][_eq]={quote(str(v))}' for k, v in flt.items())
    s, r = call('GET', f'{path}?{q}&limit=1', quiet=True)
    return r['data'][0] if s == 200 and r['data'] else None

# ---------- pastas ----------
def folder(name, parent=None):
    f = first('/folders', name=name)
    if f: return f['id']
    s, r = call('POST', '/folders', {'name': name, 'parent': parent})
    return r['data']['id']

print('== Pastas')
upd = folder('Atualizações')
sub = {n: folder(n, upd) for n in ['Painel Neon', 'Neon Motel', 'PABX Neon']}
contratos = folder('Contratos')
comprov = folder('Comprovantes')
anexos = folder('Anexos de chamados')
OUT['folders'] = {'atualizacoes': upd, **sub}
call('PATCH', '/fields/versoes/arquivo', {'meta': {'options': {'folder': upd}, 'note': 'Envie o pacote da atualização (.zip, .exe, .deb...). Fica na pasta Atualizações.'}})
call('PATCH', '/fields/licencas/contrato', {'meta': {'options': {'folder': contratos}}})
call('PATCH', '/fields/cobrancas/comprovante', {'meta': {'options': {'folder': comprov}}})
call('PATCH', '/fields/chamados/anexos', {'meta': {'options': {'folder': anexos}}})

# chave de licença gerada automaticamente
call('PATCH', '/fields/licencas/chave', {'meta': {'special': ['uuid'], 'required': False, 'readonly': True,
     'note': 'Gerada automaticamente ao salvar. Envie esta chave para configurar o equipamento.'}})

# ---------- produtos ----------
print('== Produtos')
for nome, cod, desc in [
    ('Painel Neon', 'painel-neon', 'Automação de suítes com painel touch.'),
    ('Neon Motel', 'neon-motel', 'Sistema de gestão para motéis, hotéis e pousadas.'),
    ('PABX Neon', 'pabx-neon', 'PABX VoIP com ramais no celular.')]:
    if not first('/items/produtos', codigo=cod):
        call('POST', '/items/produtos', {'nome': nome, 'codigo': cod, 'descricao': desc, 'ativo': True})

# ---------- vínculo instalação -> usuário da API ----------
if not exists('/fields/instalacoes/usuario_api'):
    call('POST', '/fields/instalacoes', F('usuario_api', 'uuid', 'Usuário da API (token do equipamento)', iface='select-dropdown-m2o',
         special=['m2o'], display='user', options={'template': '{{first_name}} {{last_name}}'},
         note='Usuário com função "Equipamento" cujo token vai configurado neste equipamento.'))
    relation('instalacoes', 'usuario_api', 'directus_users')

# ---------- políticas e funções ----------
def policy(name, **kw):
    p = first('/policies', name=name)
    if p: return p['id']
    s, r = call('POST', '/policies', {'name': name, **kw})
    return r['data']['id']

def role(name, icon, pol, desc):
    r0 = first('/roles', name=name)
    if r0: return r0['id']
    s, r = call('POST', '/roles', {'name': name, 'icon': icon, 'description': desc, 'policies': [{'policy': pol}]})
    if s not in (200, 201):
        s, r = call('POST', '/roles', {'name': name, 'icon': icon, 'description': desc})
        rid = r['data']['id']
        call('POST', '/access', {'role': rid, 'policy': pol})
        return rid
    return r['data']['id']

def perm(pol, coll, action, fields=('*',), filt=None, presets=None):
    data = {'policy': pol, 'collection': coll, 'action': action, 'fields': list(fields), 'permissions': filt or {}, 'validation': {}}
    if presets: data['presets'] = presets
    s, r = call('POST', '/permissions', data, quiet=True)
    if s not in (200, 201, 204): print('  ! permissão', coll, action, str(r)[:200])

print('== Política dos equipamentos')
pol_eq = policy('Equipamentos (API)', icon='router', app_access=False, admin_access=False,
                description='Acesso dos equipamentos instalados nos clientes: consultar e baixar atualizações, consultar a própria licença e enviar sinais.')
if not first('/permissions', policy=pol_eq):
    me = {'usuario_api': {'_eq': '$CURRENT_USER'}}
    perm(pol_eq, 'produtos', 'read', ['id', 'nome', 'codigo'])
    perm(pol_eq, 'versoes', 'read', ['id', 'produto', 'numero', 'canal', 'obrigatoria', 'arquivo', 'sha256', 'data_lancamento', 'notas', 'date_created'],
         {'publicada': {'_eq': True}})
    perm(pol_eq, 'directus_files', 'read', ['id', 'filename_download', 'filesize', 'type', 'uploaded_on'],
         {'_or': [{'folder': {'_eq': upd}}, {'folder': {'parent': {'_eq': upd}}}]})
    perm(pol_eq, 'instalacoes', 'read', ['id', 'codigo', 'produto', 'status', 'canal', 'versao_instalada'], me)
    perm(pol_eq, 'licencas', 'read', ['chave', 'plano', 'status', 'inicio', 'vencimento', 'instalacao'], {'instalacao': me})
    perm(pol_eq, 'checkins', 'create', ['codigo_instalacao', 'versao', 'evento', 'mensagem', 'detalhes'])
eq_role = role('Equipamento', 'router', pol_eq, 'Usuários técnicos: um por equipamento instalado. Usam apenas token.')

print('== Política da equipe')
pol_team = policy('Equipe Neon', icon='badge', app_access=True, admin_access=False,
                  description='Funcionários: cadastram clientes, instalações, licenças, chamados, cobranças e atualizações.')
if not first('/permissions', policy=pol_team):
    for c in ['clientes', 'instalacoes', 'licencas', 'versoes', 'chamados', 'cobrancas', 'interacoes', 'produtos', 'chamados_arquivos']:
        for a in ['create', 'read', 'update']:
            perm(pol_team, c, a)
    perm(pol_team, 'checkins', 'read')
    for a in ['create', 'read', 'update']:
        perm(pol_team, 'directus_files', a)
    perm(pol_team, 'directus_folders', 'read')
    perm(pol_team, 'directus_users', 'read', ['id', 'first_name', 'last_name', 'email', 'avatar', 'role'])
    perm(pol_team, 'directus_dashboards', 'read'); perm(pol_team, 'directus_panels', 'read')
team_role = role('Equipe', 'badge', pol_team, 'Funcionários da Neon Sistemas.')
OUT['roles'] = {'equipamento': eq_role, 'equipe': team_role}

# ---------- usuário de teste da API (equipamento de demonstração) ----------
print('== Equipamento de demonstração')
demo_user = first('/users', email='demo-equipamento@neonsistemas.com')
if not demo_user:
    tok = secrets.token_urlsafe(32)
    s, r = call('POST', '/users', {'first_name': 'Equipamento', 'last_name': 'Demonstração', 'email': 'demo-equipamento@neonsistemas.com',
                                   'role': eq_role, 'status': 'active', 'token': tok, 'language': 'pt-BR'})
    demo_user = r['data']; OUT['demo_token'] = tok
cli = first('/items/clientes', nome_fantasia='Cliente Demonstração (pode apagar)')
if not cli:
    s, r = call('POST', '/items/clientes', {'status': 'lead', 'tipo': 'motel', 'nome_fantasia': 'Cliente Demonstração (pode apagar)',
                                            'cidade': 'Uberlândia', 'uf': 'MG', 'observacoes': 'Cadastro de exemplo para testar a API. Pode apagar.'})
    cli = r['data']
prod = first('/items/produtos', codigo='neon-motel')
inst = first('/items/instalacoes', codigo='DEMO-01')
if not inst:
    s, r = call('POST', '/items/instalacoes', {'cliente': cli['id'], 'produto': prod['id'], 'codigo': 'DEMO-01', 'status': 'ativa',
                                               'canal': 'estavel', 'usuario_api': demo_user['id'], 'versao_instalada': '1.0.0',
                                               'observacoes': 'Instalação de exemplo ligada ao usuário "Equipamento Demonstração".'})
    inst = r['data']
if not first('/items/licencas', instalacao=inst['id']):
    call('POST', '/items/licencas', {'instalacao': inst['id'], 'plano': 'teste', 'status': 'teste', 'observacoes': 'Licença de exemplo.'})

# ---------- automações (Flows) ----------
print('== Automações')
def flow(name, desc, trigger, options, ops):
    if first('/flows', name=name): return
    s, r = call('POST', '/flows', {'name': name, 'description': desc, 'icon': 'bolt', 'color': '#F97316', 'status': 'active',
                                   'trigger': trigger, 'options': options, 'accountability': 'all'})
    fid = r['data']['id']
    prev = None
    for op in reversed(ops):
        body = {'flow': fid, 'name': op['name'], 'key': op['key'], 'type': op['type'], 'position_x': 19, 'position_y': 1,
                'options': op['options'], 'resolve': prev}
        s, r = call('POST', '/operations', body)
        prev = r['data']['id']
    call('PATCH', f'/flows/{fid}', {'operation': prev})

flow('Atualizar último contato do equipamento',
     'Quando um equipamento envia um sinal, grava o horário e a versão na instalação.',
     'event', {'type': 'action', 'scope': ['items.create'], 'collections': ['checkins']},
     [{'name': 'Data e hora atual', 'key': 'agora', 'type': 'exec', 'options': {
         'code': 'module.exports = async function () {\n  return { iso: new Date().toISOString() };\n};'}},
      {'name': 'Atualizar instalação', 'key': 'atualizar_instalacao', 'type': 'item-update', 'options': {
         'collection': 'instalacoes', 'permissions': '$full', 'emitEvents': False,
         'query': {'filter': {'codigo': {'_eq': '{{$trigger.payload.codigo_instalacao}}'}}},
         'payload': {'ultimo_contato': '{{agora.iso}}', 'versao_instalada': '{{$trigger.payload.versao}}'}}}])

# ---------- dashboard ----------
print('== Dashboard')
if not first('/dashboards', name='Visão geral'):
    s, r = call('POST', '/dashboards', {'name': 'Visão geral', 'icon': 'space_dashboard', 'color': '#F97316',
                                        'note': 'Resumo dos clientes, instalações, suporte e financeiro.'})
    did = r['data']['id']
    panels = [
        ('Clientes ativos', 'storefront', '#22C55E', 'metric', 1, 1, 12, 8, {'collection': 'clientes', 'field': 'id', 'function': 'count', 'filter': {'status': {'_eq': 'ativo'}}}),
        ('Leads e negociações', 'person_search', '#F59E0B', 'metric', 13, 1, 12, 8, {'collection': 'clientes', 'field': 'id', 'function': 'count', 'filter': {'status': {'_in': ['lead', 'negociacao']}}}),
        ('Instalações ativas', 'router', '#22D3EE', 'metric', 25, 1, 12, 8, {'collection': 'instalacoes', 'field': 'id', 'function': 'count', 'filter': {'status': {'_eq': 'ativa'}}}),
        ('Chamados abertos', 'support_agent', '#EF4444', 'metric', 37, 1, 12, 8, {'collection': 'chamados', 'field': 'id', 'function': 'count', 'filter': {'status': {'_neq': 'resolvido'}}}),
        ('Receita mensal das licenças', 'payments', '#22C55E', 'metric', 1, 9, 16, 8, {'collection': 'licencas', 'field': 'valor_mensal', 'function': 'sum', 'filter': {'status': {'_eq': 'ativa'}}, 'prefix': 'R$ ', 'minimumFractionDigits': 2, 'maximumFractionDigits': 2}),
        ('Cobranças pendentes ou atrasadas', 'warning', '#F59E0B', 'metric', 17, 9, 16, 8, {'collection': 'cobrancas', 'field': 'valor', 'function': 'sum', 'filter': {'status': {'_in': ['pendente', 'atrasado']}}, 'prefix': 'R$ ', 'minimumFractionDigits': 2, 'maximumFractionDigits': 2}),
        ('Licenças vencendo em 30 dias', 'event_busy', '#8B5CF6', 'metric', 33, 9, 16, 8, {'collection': 'licencas', 'field': 'id', 'function': 'count', 'filter': {'_and': [{'status': {'_eq': 'ativa'}}, {'vencimento': {'_lte': '$NOW(+30 days)'}}]}}),
        ('Últimos chamados', 'support_agent', '#EF4444', 'list', 1, 17, 24, 16, {'collection': 'chamados', 'displayTemplate': '#{{id}} {{titulo}} · {{cliente.nome_fantasia}} · {{status}}', 'sortField': 'date_created', 'sortDirection': 'desc', 'limit': 8, 'filter': {'status': {'_neq': 'resolvido'}}}),
        ('Equipamentos que deram sinal', 'sensors', '#22D3EE', 'list', 25, 17, 24, 16, {'collection': 'checkins', 'displayTemplate': '{{codigo_instalacao}} · v{{versao}} · {{evento}} · {{date_created}}', 'sortField': 'date_created', 'sortDirection': 'desc', 'limit': 8}),
        ('Novos clientes por mês', 'trending_up', '#3B82F6', 'time-series', 1, 33, 48, 14, {'collection': 'clientes', 'function': 'count', 'precision': 'month', 'dateField': 'date_created', 'valueField': 'id', 'range': '12 months', 'color': '#3B82F6'}),
    ]
    for name, icon, color, ptype, x, y, w, h, opts in panels:
        call('POST', '/panels', {'dashboard': did, 'name': name, 'icon': icon, 'color': color, 'type': ptype, 'show_header': True,
                                 'position_x': x, 'position_y': y, 'width': w, 'height': h, 'options': opts})
    OUT['dashboard'] = did

# ---------- logo do projeto ----------
print('== Logo')
st = first('/files', title='Neon Sistemas logo')
if not st:
    import mimetypes
    path = '/home/user/neon-site/assets/icon-512.png'
    boundary = uuid.uuid4().hex
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nNeon Sistemas logo\r\n'
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="neon.png"\r\nContent-Type: image/png\r\n\r\n').encode() \
        + open(path, 'rb').read() + f'\r\n--{boundary}--\r\n'.encode()
    s, r = call('POST', '/files', raw=body, ctype=f'multipart/form-data; boundary={boundary}')
    st = r['data']
call('PATCH', '/settings', {'project_logo': st['id'], 'public_foreground': st['id'], 'public_note': 'Gestão de clientes · Neon Sistemas'})

json.dump(OUT, open(os.path.join(S.HERE, 'out.json'), 'w'))
os.chmod(os.path.join(S.HERE, 'out.json'), 0o600)
print('ok', {k: v for k, v in OUT.items() if k != 'demo_token'})
