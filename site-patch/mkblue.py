import sys, os, json, base64, re
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from dec import dec
src, out = sys.argv[1], sys.argv[2]
s, m, k, d = dec(src)
RGB = [((255,106,0),(37,99,235)), ((255,140,40),(59,130,246)), ((234,88,12),(29,78,216)), ((255,162,58),(56,189,248)),
       ((249,115,22),(59,130,246)), ((160,40,0),(20,40,140)), ((255,60,0),(29,78,216))]
HEX = {'#ff6a00':'#2563eb','#ffa23a':'#38bdf8','#c2410c':'#1e40af','#ea580c':'#1d4ed8','#ff7a1a':'#3b82f6','#f97316':'#3b82f6',
       '#f9a03f':'#60a5fa','#ffd29a':'#bfe3ff','#ff8a1f':'#3b82f6','#ff5a00':'#1d4ed8','#ff8a00':'#3b82f6','#160900':'#ffffff'}
def recolor(t, css=False):
    for (a,b_) in RGB:
        t = re.sub(r'rgba?\(\s*%d\s*,\s*%d\s*,\s*%d' % a, lambda mm, b_=b_: mm.group(0).split('(')[0] + '(%d, %d, %d' % b_, t)
    for a, b_ in HEX.items():
        t = re.sub(re.escape(a) + r'\b', b_, t, flags=re.I)
    if css:
        t = re.sub(r'#ff3d8b\b', '#8b5cf6', t, flags=re.I)
    return t
d['c'] = recolor(d['c'], True)
d['b'] = recolor(d['b']).replace('background:#ff3d8b"></i>','background:#7c3aed"></i>')
d['j'] = recolor(d['j'])
d['c'] += """
/* prévia azul: logo e ícone com o mesmo tom */
.logo img,footer img,.panel-top img,.win-title img,.f-tablet img,.dev-top img{filter:hue-rotate(198deg) saturate(1.15)}
html[data-theme=light] .logo img,html[data-theme=light] footer img{filter:hue-rotate(198deg) saturate(1.15)}
.btn.primary,.tbtn.primary{color:#fff}
.btn.primary svg{stroke:#fff}
"""
raw = json.dumps(d, ensure_ascii=False, separators=(',', ':')).encode()
enc = bytes(x ^ k[i % len(k)] ^ ((i * 131 + 17) & 255) for i, x in enumerate(raw))
s = s[:m.start(2)] + base64.b64encode(enc).decode() + s[m.end(2):]
s = re.sub(r'<meta name="robots" content="[^"]*">', '<meta name="robots" content="noindex, nofollow">', s, count=1)
s = re.sub(r'<link rel="canonical"[^>]*>', '', s, count=1)
s = s.replace('<meta name="theme-color" content="#05070f">', '<meta name="theme-color" content="#05070f">', 1)
os.makedirs(os.path.dirname(out), exist_ok=True)
open(out, 'w', encoding='utf-8').write(s)
print('ok', out)
