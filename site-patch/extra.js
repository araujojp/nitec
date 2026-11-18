
// ---- calculadora de ganho ----
(function(){var f=document.getElementById('calcForm');if(!f)return;
var g=function(id){return document.getElementById(id);};
var U={pt:['horas/mês','por ano'],en:['hours/month','per year'],es:['horas/mes','por año'],fr:['heures/mois','par an'],de:['Std./Monat','pro Jahr'],zh:['小时/月','每年']};
function money(v){return 'R$ '+Math.round(v).toLocaleString('pt-BR');}
var usou=false;
function calc(){var l=window.NEON_LANG||'pt',u=U[l]||U.pt;
 var s=Math.max(0,+g('cSuites').value||0),gi=Math.max(0,+g('cGiro').value||0),fr=Math.max(0,+g('cFrigo').value||0),en=Math.max(0,+g('cEnergia').value||0);
 var ent=s*gi*30,e=en*.15,r=ent*fr*.08,h=ent*2/60,tot=e+r;
 g('rEnergia').textContent=money(e);g('rFrigo').textContent=money(r);
 g('rHoras').textContent=Math.round(h).toLocaleString('pt-BR')+' '+u[0];
 g('rTotal').textContent=money(tot);g('rAno').textContent=money(tot*12)+' '+u[1];
 var msg='Olá! Usei a calculadora do site da Neon: '+s+' suítes, '+gi+' entradas por suíte/dia. Ganho estimado: '+money(tot)+' por mês. Quero um estudo para o meu motel.';
 g('calcWa').href='https://wa.me/5534984302083?text='+encodeURIComponent(msg);}
f.addEventListener('input',function(){calc();if(!usou){usou=true;if(window.NEON_STAT)NEON_STAT('calculadora');}});
window.NEON_CALC=calc;calc();})();
// ---- estatísticas próprias (sem cookies, sem IP) ----
(function(){if(/bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|whatsapp|telegram/i.test(navigator.userAgent))return;
if(!/^https?:$/.test(location.protocol)||location.hostname!=='neonsistemas.com')return;
var E='https://orcamento.neonsistemas.com/api/stats',ref='';
try{var h=document.referrer?new URL(document.referrer).hostname:'';if(h&&h!==location.hostname)ref=h.replace(/^www\./,'');var us=new URLSearchParams(location.search).get('utm_source');if(us)ref=us.slice(0,60);}catch(e){}
function send(t,x){try{var b=JSON.stringify({t:t,p:window.NEON_LANG||'pt',d:innerWidth<820?'m':'d',r:ref,x:x||''});if(navigator.sendBeacon)navigator.sendBeacon(E,b);else fetch(E,{method:'POST',body:b,keepalive:true,mode:'no-cors'});}catch(e){}}
window.NEON_STAT=send;
var nova=true;try{nova=!sessionStorage.getItem('nv');sessionStorage.setItem('nv','1');}catch(e){}
send(nova?'visita':'pagina');
document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a');if(!a)return;var hr=a.getAttribute('href')||'';
 if(/wa\.me|whatsapp/i.test(hr))send('whatsapp',a.id||(a.classList.contains('wa-float')?'flutuante':'link'));else if(hr==='#contato')send('agendar');},true);
document.addEventListener('submit',function(e){if(e.target&&e.target.id!=='calcForm')send('formulario');},true);
if('IntersectionObserver' in window){var vistos={};var io=new IntersectionObserver(function(es){es.forEach(function(x){var id=x.target.id;if(x.isIntersecting&&!vistos[id]){vistos[id]=1;send('secao',id);io.unobserve(x.target);}});},{threshold:.35});
 ['painel-neon','neon-motel','pabx-neon','calculadora','comparativo','perguntas','contato'].forEach(function(id){var el=document.getElementById(id);if(el)io.observe(el);});}
})();
