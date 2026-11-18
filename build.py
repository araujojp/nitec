"""Gera a versão publicada do site (pasta dist/) a partir de index.html.

- Uma página por idioma (/, /en/, /es/, /fr/, /de/, /zh/) com título, descrição,
  palavras-chave, hreflang, Open Graph e dados estruturados próprios (SEO).
- O conteúdo visual é cifrado e montado pelo navegador (proteção do código).
- sitemap.xml, robots.txt e .htaccess.

Uso:  python3 build.py            -> dist/
      python3 build.py --inline   -> neon-sistemas-preview.html (arquivo único)
"""
import base64, datetime, json, os, re, secrets, shutil, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ROOT, 'dist')
SITE = 'https://neonsistemas.com'
INLINE = '--inline' in sys.argv
SEO = json.load(open(os.path.join(ROOT, 'seo.json'), encoding='utf-8'))
TODAY = datetime.date.today().isoformat()

html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
head = html[html.index('<head>') + 6:html.index('</head>')]
css = re.search(r'<style>(.*?)</style>', head, re.S).group(1)
body = html[html.index('<body>') + 6:html.index('</body>')]
js = '\n;\n'.join(re.findall(r'<script>(.*?)</script>', body, re.S))
body = re.sub(r'<script>.*?</script>', '', body, flags=re.S)
body = re.sub(r'<!--.*?-->', '', body, flags=re.S)

squeeze = lambda t: '\n'.join(l.strip() for l in t.splitlines() if l.strip())
css, body = squeeze(css), squeeze(body)
js = '\n'.join(l for l in (x.rstrip() for x in js.splitlines()) if l.strip() and not l.strip().startswith('//'))

if INLINE:
    for f in ['logo-neon.png', 'icon-64.png', 'icon-180.png']:
        data = base64.b64encode(open(os.path.join(ROOT, 'assets', f), 'rb').read()).decode()
        body = body.replace('/assets/' + f, 'data:image/png;base64,' + data)

# ---------- conteúdo cifrado ----------
def encrypt():
    payload = json.dumps({'c': css, 'b': body, 'j': js}, ensure_ascii=False).encode('utf-8')
    key = secrets.token_bytes(48)
    enc = bytes(b ^ key[i % 48] ^ ((i * 131 + 17) & 0xFF) for i, b in enumerate(payload))
    return ','.join(map(str, key)), base64.b64encode(enc).decode()

key_js, blob = encrypt()

# Proteções. Robôs de busca e de pré-visualização não recebem as armadilhas
# (o conteúdo é o mesmo para todos; só não tentamos detectar DevTools neles).
guard = r"""
(function(){
var W=window,D=document,dead=false,BOT=/bot|crawl|spider|slurp|google|bing|yandex|duckduck|baidu|facebookexternalhit|whatsapp|telegram|linkedin|twitter|discord|slack|lighthouse|pagespeed|chrome-lighthouse|headless|preview/i.test(navigator.userAgent);
function kill(){if(dead||BOT)return;dead=true;try{D.documentElement.innerHTML='<head><meta charset="utf-8"><title>Neon Sistemas</title></head><body style="margin:0;background:#070b16;color:#9aa6c4;font:15px system-ui;display:grid;place-items:center;height:100vh">Conteúdo protegido · Neon Sistemas</body>';}catch(e){}try{console.clear();}catch(e){}}
if(W.top!==W.self){try{W.top.location=W.self.location;}catch(e){kill();}}
var inField=function(t){var el=t&&t.nodeType===3?t.parentElement:t;return!!(el&&el.closest&&el.closest('input,textarea,select'));};
D.addEventListener('contextmenu',function(e){e.preventDefault();},true);
['copy','cut','dragstart','selectstart'].forEach(function(n){D.addEventListener(n,function(e){if(!inField(e.target))e.preventDefault();},true);});
W.addEventListener('keydown',function(e){var k=(e.key||'').toLowerCase(),m=e.ctrlKey||e.metaKey;
 if(e.key==='F12'||(m&&e.shiftKey&&k&&'ijckem'.indexOf(k)>-1)||(e.metaKey&&e.altKey&&k&&'ijcu'.indexOf(k)>-1)||(m&&k&&'usp'.indexOf(k)>-1)||(m&&k&&'acx'.indexOf(k)>-1&&!inField(e.target))){e.preventDefault();e.stopImmediatePropagation();return false;}},true);
if(!BOT){
setInterval(function(){var t=performance.now();(function(){}).constructor('debugger')();if(performance.now()-t>120)kill();},900);
try{var p=new Image();Object.defineProperty(p,'id',{get:function(){kill();}});setInterval(function(){console.debug(p);console.clear();},1500);}catch(e){}
}
})();
"""

loader = r"""
(function(){
var K=[%s],P='%s';
var s=atob(P),n=s.length,u=new Uint8Array(n);
for(var i=0;i<n;i++)u[i]=s.charCodeAt(i)^K[i%%48]^((i*131+17)&255);
var d=JSON.parse(new TextDecoder().decode(u));
var st=document.createElement('style');st.textContent=d.c;document.head.appendChild(st);
document.body.innerHTML=d.b;
document.body.querySelectorAll('img').forEach(function(im){im.draggable=false;});
(0,eval)(d.j);
})();
""" % (key_js, blob)

mini = lambda t: '\n'.join(l.strip() for l in t.strip().splitlines())
esc = lambda t: t.replace('&', '&amp;').replace('"', '&quot;').replace('<', '&lt;')

# ---------- dados estruturados ----------
PRODUCTS = {
    'Painel Neon': ('#painel-neon', 'Painel touch de automação de suítes: iluminação, TV, música, climatização e cenas de ambiente para motéis e hotéis.'),
    'Neon Motel': ('#neon-motel', 'Sistema de gestão para motéis, hotéis e pousadas: mapa de suítes em tempo real, recepção, caixa, estoque, governança e relatórios.'),
    'PABX Neon': ('#pabx-neon', 'PABX VoIP para hotelaria e empresas: ramais no celular sem custo de ligação, servidor local, URA e integração com PMS.'),
}

def jsonld(lang):
    m = SEO[lang]; url = SITE + m['path']
    org = {'@type': 'Organization', '@id': SITE + '/#org', 'name': 'Neon Sistemas', 'url': SITE + '/',
           'logo': SITE + '/assets/icon-512.png', 'email': 'contato@neonsistemas.com', 'telephone': '+55-34-98430-2083',
           'contactPoint': [{'@type': 'ContactPoint', 'telephone': '+55-34-98430-2083', 'email': 'contato@neonsistemas.com',
                             'contactType': 'sales', 'areaServed': 'BR', 'availableLanguage': ['Portuguese']}]}
    site = {'@type': 'WebSite', '@id': SITE + '/#website', 'url': SITE + '/', 'name': 'Neon Sistemas',
            'publisher': {'@id': SITE + '/#org'}, 'inLanguage': [v['hl'] for v in SEO.values()]}
    page = {'@type': 'WebPage', '@id': url + '#page', 'url': url, 'name': m['title'], 'description': m['desc'],
            'inLanguage': m['hl'], 'isPartOf': {'@id': SITE + '/#website'}, 'about': {'@id': SITE + '/#org'},
            'primaryImageOfPage': SITE + '/assets/icon-512.png'}
    prods = [{'@type': 'Product', 'name': n, 'url': url + a, 'description': d, 'category': 'Software / Hotelaria',
              'brand': {'@type': 'Brand', 'name': 'Neon Sistemas'}, 'manufacturer': {'@id': SITE + '/#org'}}
             for n, (a, d) in PRODUCTS.items()]
    return json.dumps({'@context': 'https://schema.org', '@graph': [org, site, page] + prods}, ensure_ascii=False)

def page(lang):
    m = SEO[lang]; url = SITE + m['path']
    alts = '\n'.join(f'<link rel="alternate" hreflang="{v["hl"]}" href="{SITE + v["path"]}">' for v in SEO.values())
    alts += f'\n<link rel="alternate" hreflang="x-default" href="{SITE}/">'
    ogalt = '\n'.join(f'<meta property="og:locale:alternate" content="{v["og"]}">' for k, v in SEO.items() if k != lang)
    icons = '' if INLINE else '<link rel="icon" type="image/png" sizes="64x64" href="/assets/icon-64.png">\n<link rel="apple-touch-icon" href="/assets/icon-180.png">\n<link rel="manifest" href="/site.webmanifest">'
    return f"""<!doctype html>
<html lang="{m['hl']}" data-page="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(m['title'])}</title>
<meta name="description" content="{esc(m['desc'])}">
<meta name="keywords" content="{esc(m['kw'])}">
<meta name="author" content="Neon Sistemas">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, noarchive">
<link rel="canonical" href="{url}">
{alts}
<meta name="theme-color" content="#070b16">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Neon Sistemas">
<meta property="og:url" content="{url}">
<meta property="og:title" content="{esc(m['title'])}">
<meta property="og:description" content="{esc(m['desc'])}">
<meta property="og:image" content="{SITE}/assets/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Neon Sistemas">
<meta property="og:locale" content="{m['og']}">
{ogalt}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(m['title'])}">
<meta name="twitter:description" content="{esc(m['desc'])}">
<meta name="twitter:image" content="{SITE}/assets/og-image.png">
<meta name="geo.region" content="BR-MG">
{icons}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<script type="application/ld+json">{jsonld(lang)}</script>
<style>html,body{{margin:0;background:#070b16}}body{{-webkit-user-select:none;user-select:none}}@media print{{html,body{{display:none!important}}}}</style>
<script>{mini(guard)}</script>
</head>
<body>
<noscript><div style="max-width:720px;margin:0 auto;padding:48px 24px;color:#cfd8f3;font:16px/1.6 system-ui;background:#070b16"><h1 style="color:#fff">Neon Sistemas</h1><p>{esc(m['desc'])}</p><p>WhatsApp: +55 (34) 98430-2083 · contato@neonsistemas.com</p></div></noscript>
<script>{mini(loader)}</script>
</body>
</html>
"""

if INLINE:
    out = os.path.join(ROOT, 'neon-sistemas-preview.html')
    open(out, 'w', encoding='utf-8').write(page('pt'))
    print('prévia:', out)
    sys.exit()

shutil.rmtree(DIST, ignore_errors=True)
os.makedirs(os.path.join(DIST, 'assets'))
for lang, m in SEO.items():
    d = os.path.join(DIST, m['path'].strip('/'))
    os.makedirs(d, exist_ok=True)
    open(os.path.join(d, 'index.html'), 'w', encoding='utf-8').write(page(lang))
for f in ['logo-neon.png', 'icon-64.png', 'icon-180.png', 'icon-512.png', 'og-image.png']:
    shutil.copy(os.path.join(ROOT, 'assets', f), os.path.join(DIST, 'assets', f))
shutil.copy(os.path.join(ROOT, 'htaccess.txt'), os.path.join(DIST, '.htaccess'))

# sitemap com versões de idioma
urls = []
for lang, m in SEO.items():
    alt = ''.join(f'\n    <xhtml:link rel="alternate" hreflang="{v["hl"]}" href="{SITE + v["path"]}"/>' for v in SEO.values())
    alt += f'\n    <xhtml:link rel="alternate" hreflang="x-default" href="{SITE}/"/>'
    urls.append(f'  <url>\n    <loc>{SITE + m["path"]}</loc>\n    <lastmod>{TODAY}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>{"1.0" if lang == "pt" else "0.8"}</priority>{alt}\n  </url>')
open(os.path.join(DIST, 'sitemap.xml'), 'w', encoding='utf-8').write(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
    + '\n'.join(urls) + '\n</urlset>\n')
open(os.path.join(DIST, 'robots.txt'), 'w').write(f'User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n')
open(os.path.join(DIST, 'site.webmanifest'), 'w').write(json.dumps({
    'name': 'Neon Sistemas', 'short_name': 'Neon', 'start_url': '/', 'display': 'browser',
    'background_color': '#070b16', 'theme_color': '#070b16',
    'icons': [{'src': '/assets/icon-180.png', 'sizes': '180x180', 'type': 'image/png'},
              {'src': '/assets/icon-512.png', 'sizes': '512x512', 'type': 'image/png'}]}))
print('dist pronto:', sorted(os.listdir(DIST)))
