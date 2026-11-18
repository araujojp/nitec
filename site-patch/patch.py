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
EXCSS=open(HERE+'/extra.css',encoding='utf-8').read()
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
    b2='<!-- CONTATO -->'; assert B.count(b2)==1; B=B.replace(b2,FAQHTML+'\n  '+b2)
    b3='<a href="#contato">Contato</a></div>'; assert B.count(b3)==1
    B=B.replace(b3,'<a href="#contato">Contato</a><a href="#perguntas">Perguntas frequentes</a><a href="#calculadora">Calculadora</a><a href="/privacidade/">Privacidade</a></div><span class="priv">Sem cookies de rastreamento.</span>')
    B='<a class="skip" href="#topo">Pular para o conteúdo</a>'+B
    d['b']=B
    J=d['j']; a6='var NAMES='; assert J.count(a6)==1
    J=J.replace(a6,'Object.assign(D,'+json.dumps(NEWD,ensure_ascii=False)+');\n'+a6)
    J=J.replace("if(window.NEON_RETR)NEON_RETR();","if(window.NEON_RETR)NEON_RETR();if(window.NEON_CALC)NEON_CALC();")
    d['j']=J+'\n'+EXJS
    if 'm' in d:
        c1='Ct=mt(1.3,dt+.65,9)'; c2='be.position.x=_e?-.65:.65'
        assert d['m'].count(c1)==1 and d['m'].count(c2)==1
        d['m']=d['m'].replace(c1,'Ct=mt(1.6,dt+.65,9)').replace(c2,'be.position.x=_e?.8:-.8').replace('let tt=re(1,.28,D.cort)','let tt=re(1,.2,D.cort)').replace('Math.min(.05,(B-ot)/1e3)','Math.min(.1,(B-ot)/1e3)').replace('D.cort=re(D.cort,C.cortina?1:0,Math.min(1,B*1.2))','D.cort=re(D.cort,C.cortina?1:0,Math.min(1,B*2.2))')
        mod=d.pop('m').encode()
        K3=[(i*73+29)%251 for i in range(64)]
        enc3=bytes(x^K3[i%64]^((i*37+11)&255) for i,x in enumerate(mod))
        root=p.split('/')[0]; os.makedirs(root+'/assets',exist_ok=True)
        open(root+'/assets/s3d.bin','wb').write(enc3)
    OLDL="if(d.m){var ms=document.createElement('script');ms.type='module';ms.textContent=d.m;document.body.appendChild(ms);}"
    NEWL=("var rm=document.getElementById('room');function L3(){if(L3.d)return;L3.d=1;fetch('/assets/s3d.bin?v=2').then(function(r){return r.arrayBuffer();}).then(function(a){var b=new Uint8Array(a),k=[];for(var i=0;i<64;i++)k.push((i*73+29)%251);"
          "for(var i=0;i<b.length;i++)b[i]^=k[i%64]^((i*37+11)&255);var ms=document.createElement('script');ms.type='module';ms.textContent=new TextDecoder().decode(b);document.body.appendChild(ms);});}"
          "if(rm&&'IntersectionObserver' in window){var io=new IntersectionObserver(function(e){if(e[0].isIntersecting){io.disconnect();L3();}},{rootMargin:'1200px 0px'});io.observe(rm);}else L3();")
    assert s.count(OLDL)==1
    s=s.replace(OLDL,NEWL)
    raw=json.dumps(d,ensure_ascii=False,separators=(',',':')).encode()
    enc=bytes(x^k[i%len(k)]^((i*131+17)&255) for i,x in enumerate(raw))
    lang=re.search(r'data-page="(\w+)"',s).group(1)
    assert s.count('</head>\n<body>')==1
    s=s.replace('</head>\n<body>',_faqld(lang)+'</head>\n<body>',1)
    m=re.search(r"K=\[([0-9,]+)\],P='([A-Za-z0-9+/=]+)'",s)
    s2=s[:m.start(2)]+base64.b64encode(enc).decode()+s[m.end(2):]
    open(p,'w',encoding='utf-8').write(s2); print('ok',p)
