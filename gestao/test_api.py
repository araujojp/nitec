import json, os, uuid, hashlib, urllib.request, urllib.error
import setup as S
from setup import call
from urllib.parse import quote

S.login()
OUT = json.load(open(os.path.join(S.HERE, os.environ.get('OUT_FILE', 'out.json'))))
demo = OUT.get('demo_token')
assert demo, 'sem token demo'

# 1) admin: sobe arquivo de teste e publica versão 1.0.1 do Neon Motel
content = b'Pacote de teste da Neon Sistemas - Neon Motel 1.0.1\n'
sha = hashlib.sha256(content).hexdigest()
s, r = call('GET', '/items/versoes?filter[numero][_eq]=1.0.1&limit=1')
if not r['data']:
    b = uuid.uuid4().hex
    body = (f'--{b}\r\nContent-Disposition: form-data; name="folder"\r\n\r\n{OUT["folders"]["Neon Motel"]}\r\n'
            f'--{b}\r\nContent-Disposition: form-data; name="title"\r\n\r\nNeon Motel 1.0.1 (teste)\r\n'
            f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="neon-motel-1.0.1-teste.zip"\r\nContent-Type: application/zip\r\n\r\n').encode() + content + f'\r\n--{b}--\r\n'.encode()
    s, f = call('POST', '/files', raw=body, ctype=f'multipart/form-data; boundary={b}')
    s, pr = call('GET', '/items/produtos?filter[codigo][_eq]=neon-motel')
    call('POST', '/items/versoes', {'produto': pr['data'][0]['id'], 'numero': '1.0.1', 'canal': 'estavel', 'publicada': True,
                                    'obrigatoria': False, 'arquivo': f['data']['id'], 'sha256': sha, 'data_lancamento': '2026-11-18',
                                    'notas': 'Versão de **teste** criada na instalação. Pode apagar.'})

# 2) como equipamento
S.TOKEN = demo
q = ('/items/versoes?filter[produto][codigo][_eq]=neon-motel&filter[canal][_eq]=estavel'
     '&sort=-date_created&limit=1&fields=numero,obrigatoria,sha256,notas,arquivo.id,arquivo.filename_download,arquivo.filesize')
s, r = call('GET', q); print('consulta versão:', s, json.dumps(r.get('data'), ensure_ascii=False)[:300])
fid = r['data'][0]['arquivo']['id']
req = urllib.request.Request(f'{S.BASE}/assets/{fid}?download', headers={'Authorization': 'Bearer ' + demo, 'User-Agent': 'neon-gestao-setup/1.0'})
data = urllib.request.urlopen(req, context=S.CTX).read()
print('download:', len(data), 'bytes, sha confere:', hashlib.sha256(data).hexdigest() == r['data'][0]['sha256'])
s, r = call('GET', '/items/licencas?fields=chave,status,vencimento'); print('licenças visíveis:', s, len(r['data']))
s, r = call('GET', '/items/instalacoes?fields=codigo,canal,versao_instalada'); print('instalações visíveis:', s, r['data'])
s, r = call('POST', '/items/checkins', {'codigo_instalacao': 'DEMO-01', 'versao': '1.0.1', 'evento': 'atualizado', 'mensagem': 'Teste da instalação'}); print('sinal enviado:', s)
for path in ['/items/clientes', '/items/cobrancas', '/items/chamados', '/users', '/files?fields=title']:
    s, r = call('GET', path, quiet=True); print('bloqueado?', path, s, (len(r['data']) if isinstance(r, dict) else ''))
s, r = call('GET', '/files?fields=id,filename_download', quiet=True); print('arquivos visíveis:', [x['filename_download'] for x in r['data']])

# 3) admin confere a automação
import time; time.sleep(3)
S.login()
s, r = call('GET', '/items/instalacoes?filter[codigo][_eq]=DEMO-01&fields=codigo,ultimo_contato,versao_instalada')
print('instalação após sinal:', r['data'])
