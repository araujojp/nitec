# Paleta azul (oficial) gerada a partir do CSS laranja original
import re
RGB = [((255,106,0),(37,99,235)), ((255,140,40),(59,130,246)), ((234,88,12),(29,78,216)), ((255,162,58),(56,189,248)),
       ((249,115,22),(59,130,246)), ((160,40,0),(20,40,140)), ((255,60,0),(29,78,216))]
HEX = {'#ff6a00':'#2563eb','#ffa23a':'#38bdf8','#c2410c':'#1e40af','#ea580c':'#1d4ed8','#ff7a1a':'#3b82f6','#f97316':'#3b82f6',
       '#f9a03f':'#60a5fa','#ffd29a':'#bfe3ff','#ff8a1f':'#3b82f6','#ff5a00':'#1d4ed8','#ff8a00':'#3b82f6','#160900':'#ffffff'}
def recolor_css(t):
    for (a, b_) in RGB:
        t = re.sub(r'rgba?\(\s*%d\s*,\s*%d\s*,\s*%d' % a, lambda mm, b_=b_: mm.group(0).split('(')[0] + '(%d, %d, %d' % b_, t)
    for a, b_ in HEX.items():
        t = re.sub(re.escape(a) + r'\b', b_, t, flags=re.I)
    t = re.sub(r'#ff3d8b\b', '#8b5cf6', t, flags=re.I)
    return t
BLUE_EXTRA = """
.logo img,footer img,.panel-top img,.win-title img,.f-tablet img,.dev-top img{filter:hue-rotate(198deg) saturate(1.15)}
.btn.primary,.tbtn.primary{color:#fff}
.btn.primary svg{stroke:#fff}
#gArc{stroke:#3b82f6}
.glow-bg i{background-color:inherit}
"""
# Cores usadas pelo JavaScript (canvas e simulações) — trocadas em tempo real
JS_VARS = {'255,106,0': '__o1', '255,140,40': '__o3', '255,162,58': '__o2'}
def js_dynamic(j):
    def rep(mm):
        rgb = re.sub(r'\s', '', mm.group(1)); v = JS_VARS[rgb]
        i = mm.start(); q = None
        while i > 0:
            i -= 1
            if j[i] in "'`\"": q = j[i]; break
        if q == '`': return 'rgba(${window.%s},' % v
        return "rgba(' + window.%s + '," % v if q == "'" else 'rgba(" + window.%s + ",' % v
    j = re.sub(r'rgba\(\s*(255,\s*106,\s*0|255,\s*140,\s*40|255,\s*162,\s*58)\s*,', rep, j)
    j = j.replace("ctx.shadowColor = '#ff6a00'", "ctx.shadowColor = window.__o1h")
    j = j.replace("ctx.fillStyle = '#ffa23a'", "ctx.fillStyle = window.__o2h").replace("g.addColorStop(0, '#ffa23a')", "g.addColorStop(0, window.__o2h)")
    return j
def body_dynamic(b):
    b = b.replace('background:#ff6a00;', 'background:var(--o);')
    b = b.replace('drop-shadow(0 0 4px #ff6a00)', 'drop-shadow(0 0 4px var(--o))')
    b = b.replace('background:#ff3d8b"></i>', 'background:var(--pink)"></i>')
    return b
