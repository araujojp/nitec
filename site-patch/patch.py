import sys,json,base64,re,os
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from dec import dec
CSS='''
/* fix mobile sim */
.dbtns .btn{white-space:nowrap;min-width:0;padding:0 12px}
.win-title{white-space:nowrap;flex:none}
.seg button{white-space:nowrap}
.opt small{display:block;line-height:1.35}
@media (max-width:820px){
 .drawer.mob{position:fixed;z-index:100000;padding:16px}
 .dcard{max-height:calc(100dvh - 32px);overflow:auto;padding:18px}
 .dcard h3{font-size:21px}
 .opt{padding:10px}.opt small{font-size:12.5px}
 .win-bar{gap:10px;padding:0 12px}
 .win-search svg{flex:none}.win-search{min-width:0}.win-search input{min-width:0;width:100%}
 .toolbar{flex-direction:column;align-items:stretch}
 .toolbar .seg{flex-wrap:wrap;gap:6px;border:0;overflow:visible;border-radius:0}
 .toolbar .seg button{flex:1 1 auto;border:1px solid var(--line2);border-radius:7px;padding:8px 10px}
 .toolbar .seg button:last-child{border-right:1px solid var(--line2)}
 .toolbar .tbtn{white-space:nowrap;align-self:flex-start}
}
@media (max-width:560px){ .win-search{display:none} .win-ico{margin-left:auto} }
@media (max-width:400px){
 .nav .wrap{gap:10px} .nav .logo img{height:32px}
 .lgbox{margin-right:4px} .lgt{height:36px;padding:0 8px;gap:4px}
 .burger{width:40px;height:40px}
 .f-tablet{max-width:calc(100vw - 28px)}
 .win-bar .dots{display:none}
 .app-main .suite{padding:10px}
 .app-main .suite .n{font-size:19px}
 .app-main .suite .top{gap:4px;flex-wrap:wrap;row-gap:4px}
 .app-main .suite .pill{font-size:9px;letter-spacing:.02em;padding-left:5px;padding-right:5px;white-space:nowrap}
}
@media (max-width:820px){
 .app-nav{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;overflow:visible;padding:8px}
 .app-nav button{flex-direction:column;justify-content:center;gap:3px;white-space:normal;text-align:center;padding:8px 2px 7px;font-size:11px;line-height:1.15;min-width:0;border:1px solid var(--line)}
 .app-nav button.on{box-shadow:inset 0 -2px 0 var(--o);border-color:rgba(255,106,0,.45)}
 .app-nav .ic{width:auto;font-size:17px;line-height:1}
 .app-nav .nm{flex:none}
 .app-nav em{position:absolute;top:3px;right:3px;font-size:9.5px;padding:0 5px;line-height:15px}
}
@media (max-width:360px){ .app-nav button{font-size:10px} }
@media (max-width:420px){ .app-main .kpi b{font-size:19px;white-space:nowrap} }
.app-main .suite .top{gap:4px;flex-wrap:wrap;row-gap:4px}
html,body{overflow-x:clip}
'''
OLD_BTN='data-a="ok">Liberar suíte</button>'
NEW_BTN='data-a="ok">Alugar suíte</button>'
OLD_DR="const drawer = $('drawer'), card = $('dcard');"
NEW_DR=OLD_DR+" if (matchMedia('(max-width:820px)').matches) { document.body.appendChild(drawer); drawer.classList.add('mob'); }"
OLD_NM='<span class="nm">${nome}</span>'
NEW_NM='<span class="nm">${k === \'config\' && innerWidth <= 820 ? \'Ajustes\' : nome}</span>'
def _num(m):
    v=round(float(m.group(1))*0.8*2)/2
    return (('%g'%v))+m.group(2)
def _decl(m):
    return m.group(1)+re.sub(r'(\d*\.?\d+)(px|rem|em)\b',_num,m.group(2))
def shrink(t):
    t=re.sub(r'(border(?:-[a-z]+)*-radius\s*:\s*)([^;}"]+)',_decl,t)
    t=re.sub(r'(--r\s*:\s*)([^;}]+)',_decl,t)
    return t
HERE=os.path.dirname(os.path.abspath(__file__))
def _simtr():
    X={}
    for ln in open(HERE+'/simtr.tsv',encoding='utf-8'):
        c=ln.rstrip('\n').split('\t')
        if len(c)==6: X[c[0]]=c[1:]
    P=[]
    for ln in open(HERE+'/simpat.tsv',encoding='utf-8'):
        c=ln.rstrip('\n').split('\t')
        if len(c)==6: P.append([c[0],c[1:]])
    js=open(HERE+'/simtr.js',encoding='utf-8').read()
    return js.replace('__X__',json.dumps(X,ensure_ascii=False)).replace('__P__',json.dumps(P,ensure_ascii=False))
SIMTR=_simtr()
def _tsv(fn,n):
    out=[]
    for ln in open(HERE+'/'+fn,encoding='utf-8'):
        c=ln.rstrip('\n').split('\t')
        if len(c)==n: out.append(c)
    return out
NEWD={c[0]:dict(zip(['en','es','fr','de','zh'],c[1:])) for c in _tsv('newtr.tsv',6)}
FAQ=_tsv('faq.tsv',2)
import html as _h
FAQHTML='''
  <!-- PERGUNTAS -->
  <section class="sec" id="perguntas" style="padding-top:20px">
    <div class="wrap">
      <div class="sec-head"><span class="eyebrow rv">Perguntas frequentes</span><h2 class="rv d1">Tudo o que você precisa <span class="grad">saber.</span></h2></div>
      <div class="faq rv">'''+''.join('<details><summary>%s</summary><p>%s</p></details>'%(_h.escape(q),_h.escape(a)) for q,a in FAQ)+'''</div>
    </div>
  </section>
'''
NEWSEC=open(HERE+'/newsec.html',encoding='utf-8').read()
EXJS=open(HERE+'/extra.js',encoding='utf-8').read()
RASTROJS=open(HERE+'/rastro.js',encoding='utf-8').read()
EXCSS=open(HERE+'/extra.css',encoding='utf-8').read()+open(HERE+'/voz.css',encoding='utf-8').read()+open(HERE+'/depo.css',encoding='utf-8').read()+open(HERE+'/wa.css',encoding='utf-8').read()+open(HERE+'/light.css',encoding='utf-8').read()
import palette as PAL
HEROJS=open(HERE+'/hero.js',encoding='utf-8').read()
DEPOHTML=open(HERE+'/depo.html',encoding='utf-8').read()
DEPOJS=open(HERE+'/depo.js',encoding='utf-8').read()+open(HERE+'/theme.js',encoding='utf-8').read()+open(HERE+'/sons.js',encoding='utf-8').read()+open(HERE+'/wa.js',encoding='utf-8').read()
VOZJS=open(HERE+'/voz.js',encoding='utf-8').read()
VOZSEC=open(HERE+'/vozsec.html',encoding='utf-8').read()
VOZAPI="""
  // API de comando de voz (usada pelo módulo de voz)
  window.NeonSuite.cmd = (c, n) => {
    try { audio.unlock(); } catch (e) {}
    mexeu = true;
    if (c === 'cena') { aplicarCena(n); return; }
    const on = (k, v) => { S[k] = v; S.cena = null; };
    switch (c) {
      case 'luz_off': on('luzOn', false); break;
      case 'luz_on': on('luzOn', true); if (S.luz < 10) S.luz = 70; break;
      case 'luz_dim': on('luzOn', true); S.luz = 25; break;
      case 'hidro_on': on('hidro', true); break;
      case 'hidro_off': on('hidro', false); break;
      case 'cort_close': on('cortina', false); break;
      case 'cort_open': on('cortina', true); break;
      case 'dnd_on': on('dnd', true); break;
      case 'dnd_off': on('dnd', false); break;
      case 'tv_on': on('tvOn', true); break;
      case 'tv_off': on('tvOn', false); break;
      case 'som_up': on('somOn', true); S.vol = Math.min(100, S.vol + 20); break;
      case 'som_down': S.vol = Math.max(0, S.vol - 20); break;
      case 'temp': on('arOn', true); S.temp = Math.max(16, Math.min(30, n || 22)); break;
      default: return;
    }
    render();
  };
"""
VOZTAB='''<div class="voz-box" id="vozBox"><button type="button" class="voz-mic" id="vozMic" aria-label="Comando de voz"><span class="vr"></span><span class="vr"></span><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#160900" stroke-width="2.4" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button><div class="voz-txt"><small id="vozHint"></small><b id="vozLine"></b></div></div><div class="voz-chips" id="vozChips"></div>'''
def _faqld(lang):
    ents=[]
    for q,a in FAQ:
        qq=q if lang=='pt' else NEWD[q][lang]; aa=a if lang=='pt' else NEWD[a][lang]
        ents.append({"@type":"Question","name":qq,"acceptedAnswer":{"@type":"Answer","text":aa}})
    ld=[{"@context":"https://schema.org","@type":"FAQPage","mainEntity":ents},
        {"@context":"https://schema.org","@type":"WebSite","name":"Neon Sistemas","url":"https://neonsistemas.com/","inLanguage":["pt-BR","en","es","fr","de","zh-Hans"]}]
    return ''.join('<script type="application/ld+json">%s</script>\n'%json.dumps(x,ensure_ascii=False) for x in ld)
for p in sys.argv[1:]:
    s,m,k,d=dec(p)
    assert d['j'].count(OLD_BTN)==1 and d['j'].count(OLD_DR)==1
    assert d['j'].count(OLD_NM)==1
    d['j']=d['j'].replace(OLD_NM,NEW_NM).replace(OLD_BTN,NEW_BTN).replace(OLD_DR,NEW_DR)
    d['c']+=CSS
    J=d['j']
    a1="function apply(l){cur=l;var i=l;"
    assert J.count(a1)==1; J=J.replace(a1,a1+"window.NEON_LANG=l;")
    a2=" try{localStorage.setItem('neon-lang',l);}catch(e){}"
    assert J.count(a2)==1; J=J.replace(a2,a2+"if(window.NEON_RETR)NEON_RETR();")
    a3="// seletor\nfunction buildSelector(){"
    assert J.count(a3)==1; J=J.replace(a3,SIMTR+a3)
    a4="const u = new SpeechSynthesisUtterance(txt); u.lang = 'pt-BR';"
    assert J.count(a4)==1; J=J.replace(a4,"const u = new SpeechSynthesisUtterance(window.NEON_T ? NEON_T(txt) : txt); u.lang = window.NEON_SL ? NEON_SL() : 'pt-BR';")
    a5="/pt(-|_)BR/i.test(x.lang)"
    assert J.count(a5)==1; J=J.replace(a5,"x.lang.replace('_', '-').toLowerCase() === u.lang.toLowerCase()) || speechSynthesis.getVoices().find((x) => x.lang.slice(0, 2).toLowerCase() === u.lang.slice(0, 2).toLowerCase()")
    d['j']=J
    d['c']=shrink(d['c']); d['j']=shrink(d['j'])
    d['c']+=EXCSS
    B=d['b']
    b1='<!-- NOVIDADES -->'; assert B.count(b1)==1; B=B.replace(b1,NEWSEC+'\n  '+b1)
    b2='<!-- CONTATO -->'; assert B.count(b2)==1; B=B.replace(b2,DEPOHTML+FAQHTML+'\n  '+b2)
    b3='<a href="#contato">Contato</a></div>'; assert B.count(b3)==1
    B=B.replace(b3,'<a href="#contato">Contato</a><a href="#perguntas">Perguntas frequentes</a><a href="#calculadora">Calculadora</a><a href="/privacidade/">Privacidade</a></div><span class="priv">Sem cookies de rastreamento.</span>')
    B='<a class="skip" href="#topo">Pular para o conteúdo</a>'+B
    v1='<div class="clock" id="clock">--:--</div></div>'; assert B.count(v1)==1; B=B.replace(v1,v1+VOZTAB)
    v2='<!-- NEON MOTEL -->'; assert B.count(v2)==1; B=B.replace(v2,VOZSEC+'\n  '+v2)
    B=B.replace('/assets/icon.png"','/assets/icon.png?v=2"')
    B=B.replace('>Tecnologia para motéis, hotéis e pousadas<','>Tecnologia em automação para motéis, hotéis e pousadas<')
    w1='📱 (34) 98430-2083<br>'; assert B.count(w1)==1
    B=B.replace(w1,'📱 WhatsApp: <a href="https://wa.me/5534984302083">(34) 98430-2083</a> · <a href="https://wa.me/5562992147679">(62) 99214-7679</a><br>')
    w2='<span class="priv">Sem cookies de rastreamento.</span>'; assert B.count(w2)==1
    B=B.replace(w2,'<span class="wa-nums">WhatsApp: <a href="https://wa.me/5534984302083">(34) 98430-2083</a> · <a href="https://wa.me/5562992147679">(62) 99214-7679</a></span>'+w2)
    d['b']=B
    J=d['j']; a6='var NAMES='; assert J.count(a6)==1
    J=J.replace(a6,'Object.assign(D,'+json.dumps(NEWD,ensure_ascii=False)+');\n'+a6)
    J=J.replace("if(window.NEON_RETR)NEON_RETR();","if(window.NEON_RETR)NEON_RETR();if(window.NEON_CALC)NEON_CALC();")
    h1="const floats = $$('.float, .chip-float');"; h2='if (!reduce) heroLoop();'
    ha=J.find(h1); hb=J.find(h2); assert ha>0 and hb>ha and J.count(h1)==1
    J=J[:ha]+'let px = 0, py = 0;\n  {\n  '+HEROJS+'\n  if (!reduce) requestAnimationFrame(heroLoop);\n  }'+J[hb+len(h2):]
    # desempenho: animações param quando estão fora da tela
    g1="(function loopGlow() { gx += (tx - gx) * 0.12; gy += (ty - gy) * 0.12; glow.style.left = gx + 'px'; glow.style.top = gy + 'px'; requestAnimationFrame(loopGlow); })();"
    assert J.count(g1)==1
    J=J.replace(g1,"if (matchMedia('(pointer:fine)').matches) { let gRun = false; glow.style.left = '0px'; glow.style.top = '0px'; const gStep = () => { gx += (tx - gx) * 0.12; gy += (ty - gy) * 0.12; glow.style.transform = 'translate3d(' + (gx - 240).toFixed(1) + 'px,' + (gy - 240).toFixed(1) + 'px,0)'; if (Math.abs(tx - gx) + Math.abs(ty - gy) > 0.6) requestAnimationFrame(gStep); else gRun = false; }; addEventListener('pointermove', () => { if (!gRun) { gRun = true; requestAnimationFrame(gStep); } }, { passive: true }); } else glow.style.display = 'none';")
    g2="setInterval(() => wb.forEach((b) => {"; assert J.count(g2)==1
    J=J.replace(g2,"setInterval(() => window.__heroVis !== false && wb.forEach((b) => {")
    g3="function loop(t) {\n    requestAnimationFrame(loop);"; assert J.count(g3)==1
    J=J.replace(g3,"let pVis = true; if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { pVis = e.isIntersecting; }, { rootMargin: '150px 0px' }).observe(document.getElementById('painel-neon'));\n  function loop(t) {\n    requestAnimationFrame(loop);\n    if (!pVis || document.hidden) return;")
    g4="    dpr = Math.min(devicePixelRatio || 1, 2); W = cv.clientWidth; H = cv.clientHeight;"; assert J.count(g4)==1
    J=J.replace(g4,"    if (W && cv.clientWidth === W && Math.abs(cv.clientHeight - H) < 160) return;\n    dpr = cv.clientWidth < 820 ? 1 : Math.min(devicePixelRatio || 1, 1.5); W = cv.clientWidth; H = cv.clientHeight;")
    g6='length: Math.min(90, Math.floor(W / 14))'; assert J.count(g6)==1
    J=J.replace(g6,'length: Math.floor(Math.min(90, Math.floor(W / 14)) * (W < 820 ? 0.5 : 1))')
    g5="function draw(t) {\n    requestAnimationFrame(draw);\n    if (!visible) return;"; assert J.count(g5)==1
    J=J.replace(g5,"function draw(t) {\n    requestAnimationFrame(draw);\n    if (!visible || document.hidden) return;\n    if (W < 820) { if (t - (draw.l || 0) < 31) return; draw.l = t; }")
    v3="window.dispatchEvent(new Event('neonsuite'));"; assert J.count(v3)==1; J=J.replace(v3,VOZAPI+'  '+v3)
    J=J.replace("if(window.NEON_CALC)NEON_CALC();","if(window.NEON_CALC)NEON_CALC();if(window.NEON_VOZ)NEON_VOZ();if(window.NEON_DEPO)NEON_DEPO();")
    d['j']=J+'\n'+EXJS+'\n'+VOZJS+'\n'+DEPOJS+'\n'+RASTROJS
    f1="const w = window.open(url, '_blank', 'noopener');"; assert d['j'].count(f1)==1
    d['j']=d['j'].replace(f1,"if (window.NEON_WA) { NEON_WA(txt); return; }\n    "+f1)
    d['j']=PAL.js_dynamic(d['j']); d['b']=PAL.body_dynamic(d['b'])
    d['c2']=PAL.recolor_css(d['c'])+PAL.BLUE_EXTRA
    if 'm' in d:
        c1='Ct=mt(1.3,dt+.65,9)'; c2='be.position.x=_e?-.65:.65'
        assert d['m'].count(c1)==1 and d['m'].count(c2)==1
        assert d['m'].count('{rootMargin:"700px 0px"}')==1
        d['m']=d['m'].replace('{rootMargin:"700px 0px"}','{rootMargin:"3000px 0px"}')
        t1='Be.addEventListener("pointerdown",B=>{Se='; t2='addEventListener("pointercancel",()=>{Se=null});'
        assert d['m'].count(t1)==1 and d['m'].count(t2)==1
        TOUCH=('{let T0=null;Be.addEventListener("touchstart",B=>{if(B.touches.length!==1){T0=null;return}let t=B.touches[0];T0={x:t.clientX,y:t.clientY,l:null};ne.mexeu=!0},{passive:!0});'
               'Be.addEventListener("touchmove",B=>{if(!T0||B.touches.length!==1)return;let t=B.touches[0],dx=t.clientX-T0.x,dy=t.clientY-T0.y;if(!T0.l){if(Math.abs(dx)<6&&Math.abs(dy)<6)return;T0.l=Math.abs(dx)>Math.abs(dy)*.8?"h":"v"}if(T0.l!=="h")return;B.cancelable&&B.preventDefault();T0.x=t.clientX;T0.y=t.clientY;ne.ty=xe(ne.ty-dx*.0048,-le.yaw,le.yaw)},{passive:!1});'
               'Be.addEventListener("touchend",()=>{T0=null});Be.addEventListener("touchcancel",()=>{T0=null})}')
        d['m']=d['m'].replace(t1,'Be.addEventListener("pointerdown",B=>{if(B.pointerType==="touch")return;Se=').replace(t2,t2+TOUCH)
        p1='h.position.set(f.x+Math.sin(ne.yaw)*Math.cos(ne.pitch)*ne.r,f.y+Math.sin(ne.pitch)*ne.r+.05,f.z+Math.cos(ne.yaw)*Math.cos(ne.pitch)*ne.r)'
        p2='le={yaw:.55,'
        assert d['m'].count(p1)==1 and d['m'].count(p2)==1
        d['m']=d['m'].replace(p1,'((rr)=>h.position.set(f.x+Math.sin(ne.yaw)*Math.cos(ne.pitch)*rr,f.y+Math.sin(ne.pitch)*rr+.05,f.z+Math.cos(ne.yaw)*Math.cos(ne.pitch)*rr))(Math.min(ne.r,3.2/Math.max(.01,Math.abs(Math.sin(ne.yaw)))))').replace(p2,'le={yaw:1.15,')
        d['m']=d['m'].replace(c1,'Ct=mt(1.6,dt+.65,9)').replace(c2,'be.position.x=_e?.8:-.8').replace('let tt=re(1,.28,D.cort)','let tt=re(1,.2,D.cort)').replace('Math.min(.05,(B-ot)/1e3)','Math.min(.1,(B-ot)/1e3)').replace('D.cort=re(D.cort,C.cortina?1:0,Math.min(1,B*1.2))','D.cort=re(D.cort,C.cortina?1:0,Math.min(1,B*2.2))')
        mod=d.pop('m').encode()
        K3=[(i*73+29)%251 for i in range(64)]
        enc3=bytes(x^K3[i%64]^((i*37+11)&255) for i,x in enumerate(mod))
        root=p.split('/')[0]; os.makedirs(root+'/assets',exist_ok=True)
        open(root+'/assets/s3d.bin','wb').write(enc3)
    OLDL="if(d.m){var ms=document.createElement('script');ms.type='module';ms.textContent=d.m;document.body.appendChild(ms);}"
    NEWL=("var rm=document.getElementById('room');function L3(){if(L3.d)return;L3.d=1;fetch('/assets/s3d.bin?v=5').then(function(r){return r.arrayBuffer();}).then(function(a){var b=new Uint8Array(a),k=[];for(var i=0;i<64;i++)k.push((i*73+29)%251);"
          "for(var i=0;i<b.length;i++)b[i]^=k[i%64]^((i*37+11)&255);var ms=document.createElement('script');ms.type='module';ms.textContent=new TextDecoder().decode(b);document.body.appendChild(ms);});}"
          "var gl=false;try{var cv=document.createElement('canvas');gl=!!(cv.getContext('webgl2')||cv.getContext('webgl'));}catch(e){}"
          "if(rm&&gl){rm.classList.add('w3d');setTimeout(function(){if(!rm.classList.contains('has3d'))rm.classList.remove('w3d');},25000);}"
          "if(rm&&'IntersectionObserver' in window){var io=new IntersectionObserver(function(e){if(e[0].isIntersecting){io.disconnect();L3();}},{rootMargin:'1200px 0px'});io.observe(rm);}else L3();"
          "function idle(){(window.requestIdleCallback||function(f){setTimeout(f,1200);})(L3);}if(document.readyState==='complete')idle();else window.addEventListener('load',idle);")
    assert s.count(OLDL)==1
    s=s.replace(OLDL,NEWL)
    LO="var st=document.createElement('style');st.textContent=d.c;document.head.appendChild(st);"
    assert s.count(LO)==1, 'loader'
    s=s.replace(LO,"var st=document.createElement('style');st.id='cssL';st.textContent=d.c;document.head.appendChild(st);if(d.c2){var s2=document.createElement('style');s2.id='cssA';s2.textContent=d.c2;document.head.appendChild(s2);}if(window.NEON_SET_TEMA)NEON_SET_TEMA(document.documentElement.getAttribute('data-theme')+'-'+document.documentElement.getAttribute('data-cor'));")
    raw=json.dumps(d,ensure_ascii=False,separators=(',',':')).encode()
    enc=bytes(x^k[i%len(k)]^((i*131+17)&255) for i,x in enumerate(raw))
    lang=re.search(r'data-page="(\w+)"',s).group(1)
    assert s.count('</head>\n<body>')==1
    s=s.replace('</head>\n<body>',_faqld(lang)+'</head>\n<body>',1)
    st0='<style>html,body{margin:0;background:#070a12}'; assert s.count(st0)==1
    s=s.replace(st0,"<script>(function(){var H=document.documentElement,P={azul:['37,99,235','56,189,248','59,130,246','#2563eb','#38bdf8'],laranja:['255,106,0','255,162,58','255,140,40','#ff6a00','#ffa23a']};window.NEON_SET_TEMA=function(v){var p=String(v).split('-'),t=p[0]==='light'?'light':'dark',c=p[1]==='laranja'?'laranja':'azul',k=P[c];H.setAttribute('data-theme',t);H.setAttribute('data-cor',c);window.__o1=k[0];window.__o2=k[1];window.__o3=k[2];window.__o1h=k[3];window.__o2h=k[4];var a=document.getElementById('cssA'),l=document.getElementById('cssL');if(a&&l){a.disabled=c!=='azul';l.disabled=c==='azul';}var mc=document.querySelector('meta[name=theme-color]');if(mc)mc.content=t==='light'?'#f6f7fb':'#05070f';};var v=null;try{v=localStorage.getItem('neon-tema2');}catch(e){}if(!/^(light|dark)-(azul|laranja)$/.test(v||''))v=((window.matchMedia&&matchMedia('(prefers-color-scheme: light)').matches)?'light':'dark')+'-azul';window.NEON_SET_TEMA(v);})();</script><style>html,body{margin:0;background:#070a12}html[data-theme=light],html[data-theme=light] body{background:#f6f7fb}",1)
    s=s.replace('href="/assets/icon.png"','href="/assets/icon.png?v=2"')
    m=re.search(r"K=\[([0-9,]+)\],P='([A-Za-z0-9+/=]+)'",s)
    s2=s[:m.start(2)]+base64.b64encode(enc).decode()+s[m.end(2):]
    open(p,'w',encoding='utf-8').write(s2); print('ok',p)
