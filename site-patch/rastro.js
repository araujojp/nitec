// ---- registro de visitas (relatório por e-mail no Neon Gestão; ver /privacidade/) ----
(function(){
var UA=navigator.userAgent||'';
if(/bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|whatsapp|telegram/i.test(UA)||navigator.webdriver)return;
if(!/^https?:$/.test(location.protocol)||!/(^|\.)neonsistemas\.com$/.test(location.hostname))return;
var E='https://gestao.neonsistemas.com/publico/visitas',fila=[],meta=null,t0=Date.now(),ativo=0,desde=document.hidden?0:Date.now(),acabou=false;
function rid(){var a='abcdefghijklmnopqrstuvwxyz0123456789',s='';for(var i=0;i<16;i++)s+=a[Math.floor(Math.random()*36)];return s;}
var S,V,nova=false;
try{S=sessionStorage.getItem('nv_s');if(!S){S=rid();nova=true;sessionStorage.setItem('nv_s',S);}}catch(e){S=rid();nova=true;}
try{V=localStorage.getItem('nv_v');if(!V){V=rid();localStorage.setItem('nv_v',V);}}catch(e){V=null;}
function txt(s,n){return String(s==null?'':s).replace(/\s+/g,' ').trim().slice(0,n||80);}
function ev(k,o){o=o||{};o.k=k;o.t=Date.now();fila.push(o);if(fila.length>=40)envia();}
function envia(fim){
 if(!fila.length&&!meta)return;
 var b={s:S,v:V,e:fila.splice(0,200)};if(meta){b.m=meta;meta=null;}
 var c=JSON.stringify(b);
 try{if(fim&&navigator.sendBeacon&&navigator.sendBeacon(E,new Blob([c],{type:'text/plain'})))return;
  fetch(E,{method:'POST',body:c,keepalive:true,mode:'cors',credentials:'omit',headers:{'Content-Type':'text/plain'}}).catch(function(){});}catch(e){}
}
setInterval(function(){if(fila.length)envia();},4000);
// dados do aparelho e de onde veio (só na primeira página da visita)
var qs={};try{new URLSearchParams(location.search).forEach(function(v,k){if(/^(utm_\w+|gclid|fbclid|ref)$/.test(k))qs[k]=txt(v,120);});}catch(e){}
var refExt='';try{if(document.referrer&&new URL(document.referrer).hostname!==location.hostname)refExt=document.referrer.slice(0,400);}catch(e){}
if(nova){
 var cn=navigator.connection||{};
 meta={url:location.href.slice(0,400),ref:refExt,lang:window.NEON_LANG||document.documentElement.lang||'',tela:[screen.width,screen.height],dpr:window.devicePixelRatio||1,janela:[innerWidth,innerHeight],
  fuso:(Intl.DateTimeFormat().resolvedOptions()||{}).timeZone||'',idiomas:(navigator.languages||[navigator.language]).slice(0,5),toque:navigator.maxTouchPoints||0,
  memoria:navigator.deviceMemory||null,nucleos:navigator.hardwareConcurrency||null,rede:cn.effectiveType?{tipo:cn.effectiveType,mbps:cn.downlink,economia:!!cn.saveData}:null,
  escuro:window.matchMedia?matchMedia('(prefers-color-scheme: dark)').matches:null,utm:qs,cookies:navigator.cookieEnabled};
 try{if(navigator.userAgentData&&navigator.userAgentData.getHighEntropyValues)navigator.userAgentData.getHighEntropyValues(['model','platformVersion']).then(function(h){meta=meta||{};meta.ch={model:h.model||null,platformVersion:h.platformVersion||null};envia();}).catch(function(){});}catch(e){}
}
ev(nova?'inicio':'pagina',{url:location.pathname+location.search.slice(0,120),titulo:txt(document.title,120)});
envia();
// seções: tempo em que cada uma ficou na tela
var vis={},naTela={};
function fechaSec(id){if(vis[id]){var ms=Date.now()-vis[id];vis[id]=0;if(ms>=1500)ev('secao',{id:id,ms:ms});}}
function soltaSecs(){}
if('IntersectionObserver' in window){var io=new IntersectionObserver(function(es){es.forEach(function(x){var id=x.target.id;naTela[id]=x.isIntersecting;if(x.isIntersecting){if(!vis[id]&&!document.hidden)vis[id]=Date.now();}else fechaSec(id);});},{threshold:.35});
 [].forEach.call(document.querySelectorAll('section[id]'),function(s){io.observe(s);});}
// rolagem
var marcas=[25,50,75,100],feitas={};
addEventListener('scroll',function(){var h=document.documentElement,p=Math.round((scrollY+innerHeight)/Math.max(1,h.scrollHeight)*100);
 marcas.forEach(function(m){if(p>=m-1&&!feitas[m]){feitas[m]=1;ev('rolagem',{pct:m});}});},{passive:true});
// cliques em links e botões (o WhatsApp é registrado à parte)
document.addEventListener('click',function(e){
 var a=e.target.closest&&e.target.closest('a,button,summary,[role=button],[role=menuitemradio],.opt');if(!a)return;
 if(a.closest('#contactForm,#calcForm')&&a.type!=='submit')return;
 var hr=a.getAttribute('href')||'',t=txt(a.getAttribute('aria-label')||a.innerText||a.title||a.getAttribute('data-l')||'',80);
 if(/wa\.me|whatsapp/i.test(hr)){var n=(hr.match(/wa\.me\/(\d+)|phone=(\d+)/)||[]);ev('whatsapp',{numero:n[1]||n[2]||'',onde:txt(a.id||(a.className&&String(a.className).split(' ')[0])||t,40),texto:t});envia();return;}
 if(a.getAttribute('role')==='menuitemradio'&&a.getAttribute('data-l')){ev('idioma',{para:a.getAttribute('data-l')});return;}
 ev('clique',{texto:t,href:hr.slice(0,160),alvo:txt(a.id||'',40)});
},true);
// formulário de contato: quais campos foram preenchidos; o conteúdo só quando enviado
var tocados={};
document.addEventListener('change',function(e){var f=e.target;if(!f||!f.form)return;
 if(f.form.id==='contactForm'&&f.name&&!tocados[f.name]){tocados[f.name]=1;ev('form_campo',{campo:f.name,tam:(f.value||'').length});}
},true);
document.addEventListener('submit',function(e){var f=e.target;if(!f||f.id!=='contactForm')return;var c={};
 [].forEach.call(f.elements,function(x){if(x.name&&x.type!=='password'&&x.type!=='submit')c[x.name]=txt(x.value,1200);});ev('form_envio',{campos:c});envia();},true);
// calculadora
var tc;document.addEventListener('input',function(e){var f=e.target;if(!f||!f.form||f.form.id!=='calcForm')return;clearTimeout(tc);tc=setTimeout(function(){
 var v={};['cSuites','cGiro','cFrigo','cEnergia'].forEach(function(id){var x=document.getElementById(id);if(x)v[id]=x.value;});
 var r=document.getElementById('rTotal');ev('calculadora',{valores:v,resultado:r?txt(r.textContent,40):''});},2000);},true);
document.addEventListener('copy',function(){try{var s=txt(String(getSelection()),80);if(s)ev('copia',{texto:s});}catch(e){}});
var erros=0;addEventListener('error',function(e){if(erros++<3)ev('erro',{msg:txt(e.message,160)});});
// saída da aba e saída do site
document.addEventListener('visibilitychange',function(){
 if(document.hidden){if(desde){ativo+=Date.now()-desde;desde=0;}for(var id in vis)fechaSec(id);soltaSecs();ev('oculta');envia(true);}
 else{desde=Date.now();for(var id2 in naTela)vis[id2]=naTela[id2]?Date.now():0;ev('visivel');}
});
addEventListener('pagehide',function(){if(acabou)return;acabou=true;if(desde){ativo+=Date.now()-desde;desde=0;}for(var id in vis)fechaSec(id);soltaSecs();ev('fim',{total_ms:Date.now()-t0,ativo_ms:ativo});envia(true);});
})();
