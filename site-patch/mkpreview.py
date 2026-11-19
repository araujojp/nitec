import sys, os, json, base64, re
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from dec import dec
src, out = sys.argv[1], sys.argv[2]
s, m, k, d = dec(src)
d['c'] += open(os.path.join(HERE, 'light.css'), encoding='utf-8').read()
d['j'] += r"""
// ---- prévia: tocar no logo alterna claro/escuro ----
(function(){var H=document.documentElement,tip=document.createElement('div');tip.className='theme-tip';document.body.appendChild(tip);
var T={pt:['Tema claro','Tema escuro'],en:['Light theme','Dark theme'],es:['Tema claro','Tema oscuro'],fr:['Thème clair','Thème sombre'],de:['Helles Design','Dunkles Design'],zh:['浅色主题','深色主题']};
function set(t,show){H.setAttribute('data-theme',t);try{localStorage.setItem('neon-tema',t);}catch(e){}
 var mc=document.querySelector('meta[name=theme-color]');if(mc)mc.content=t==='light'?'#f6f7fb':'#05070f';
 if(show){var l=T[window.NEON_LANG||'pt']||T.pt;tip.textContent=(t==='light'?'☀️ ':'🌙 ')+l[t==='light'?0:1];tip.classList.add('on');clearTimeout(set.t);set.t=setTimeout(function(){tip.classList.remove('on');},1400);}}
var ini='light';try{ini=localStorage.getItem('neon-tema')||'light';}catch(e){}set(ini,false);
document.querySelectorAll('.logo').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();set(H.getAttribute('data-theme')==='light'?'dark':'light',true);});});
})();
"""
raw = json.dumps(d, ensure_ascii=False, separators=(',', ':')).encode()
enc = bytes(x ^ k[i % len(k)] ^ ((i * 131 + 17) & 255) for i, x in enumerate(raw))
s = s[:m.start(2)] + base64.b64encode(enc).decode() + s[m.end(2):]
s = re.sub(r'<meta name="robots" content="[^"]*">', '<meta name="robots" content="noindex, nofollow">', s, 1)
s = re.sub(r'<link rel="canonical"[^>]*>', '', s, 1)
s = s.replace('<html lang="pt-BR" data-page="pt">', '<html lang="pt-BR" data-page="pt" data-theme="light">', 1)
os.makedirs(os.path.dirname(out), exist_ok=True)
open(out, 'w', encoding='utf-8').write(s)
print('ok', out, 'noindex' in s)
