
// ---- depoimentos de clientes (vindos do Neon Gestão; a seção some se não houver nenhum) ----
(function(){
var sec=document.getElementById('depoimentos'),track=document.getElementById('depoTrack');if(!sec||!track)return;
var URL_='https://painel.neonsistemas.com/publico/depoimentos.json?limite=12';
var TX={pt:['avaliações','de média em','Cliente desde','suítes','clientes'],en:['reviews','average from','Client since','suites','clients'],es:['reseñas','de media en','Cliente desde','suites','clientes'],fr:['avis','de moyenne sur','Client depuis','suites','clients'],de:['Bewertungen','im Schnitt aus','Kunde seit','Suiten','Kunden'],zh:['条评价','平均分，共','客户始于','间客房','位客户']};
var PROD={painel:'Painel Neon',motel:'Neon Motel',pabx:'PABX Neon'};
var data=[];
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function stars(n){var h='';for(var i=1;i<=5;i++)h+='<i class="'+(i<=n?'on':'')+'">★</i>';return '<span class="depo-stars" aria-label="'+n+'/5">'+h+'</span>';}
function ini(n){var p=String(n||'').trim().split(/\s+/);return ((p[0]||'')[0]||'').toUpperCase()+((p.length>1?p[p.length-1][0]:'')||'').toUpperCase();}
function hue(s){var h=0;for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))%360;return h;}
function render(){if(!data.length)return;var l=window.NEON_LANG||'pt',t=TX[l]||TX.pt;
 var media=data.reduce(function(a,d){return a+d.nota;},0)/data.length;
 document.getElementById('depoMedia').innerHTML='<b>'+media.toLocaleString(l==='pt'?'pt-BR':l,{minimumFractionDigits:1,maximumFractionDigits:1})+'</b>'+stars(Math.round(media))+'<small>'+t[1]+' '+data.length+' '+t[0]+'</small>';
 track.innerHTML=data.map(function(d,i){
  var local=[d.cidade,d.uf].filter(Boolean).join(' · ');
  var quem=[d.cargo,d.estabelecimento].filter(Boolean).join(', ');
  var meta=[local,d.num_suites?d.num_suites+' '+t[3]:'',d.cliente_desde?t[2]+' '+d.cliente_desde:''].filter(Boolean).join(' · ');
  var av=d.foto_url?'<img src="'+esc(d.foto_url)+'" alt="" loading="lazy">':'<span style="--h:'+hue(d.nome||'')+'">'+esc(ini(d.nome))+'</span>';
  return '<article class="depo-card'+(d.destaque?' big':'')+'" style="--i:'+i+'"><div class="dq" aria-hidden="true">“</div>'+stars(d.nota)+
   (d.titulo?'<h3>'+esc(d.titulo)+'</h3>':'')+'<p>'+esc(d.texto)+'</p>'+
   ((d.produtos||[]).length?'<div class="depo-prod">'+d.produtos.map(function(p){return PROD[p]?'<span>'+PROD[p]+'</span>':'';}).join('')+'</div>':'')+
   '<footer><div class="depo-av">'+av+'</div><div><b>'+esc(d.nome)+'</b>'+(quem?'<small>'+esc(quem)+'</small>':'')+(meta?'<small class="m">'+esc(meta)+'</small>':'')+'</div></footer></article>';}).join('');
 var dots=document.getElementById('depoDots');dots.innerHTML=data.map(function(_,i){return '<i data-i="'+i+'"></i>';}).join('');
 sec.classList.add('tem');upd();}
function cards(){return track.querySelectorAll('.depo-card');}
function cur(){var cs=cards(),x=track.scrollLeft,b=0,bd=1e9;for(var i=0;i<cs.length;i++){var d=Math.abs(cs[i].offsetLeft-track.offsetLeft-x);if(d<bd){bd=d;b=i;}}return b;}
function go(i){var cs=cards();if(!cs.length)return;i=Math.max(0,Math.min(cs.length-1,i));track.scrollTo({left:cs[i].offsetLeft-track.offsetLeft,behavior:'smooth'});}
function upd(){var c=cur(),ds=document.querySelectorAll('#depoDots i');for(var i=0;i<ds.length;i++)ds[i].classList.toggle('on',i===c);
 var nav=document.getElementById('depoNav');nav.style.display=track.scrollWidth>track.clientWidth+4?'':'none';}
track.addEventListener('scroll',function(){clearTimeout(upd.t);upd.t=setTimeout(upd,80);},{passive:true});
addEventListener('resize',upd);
sec.querySelector('.dn-prev').addEventListener('click',function(){go(cur()-1);});
sec.querySelector('.dn-next').addEventListener('click',function(){go(cur()+1);});
document.getElementById('depoDots').addEventListener('click',function(e){var d=e.target.closest('i[data-i]');if(d)go(+d.dataset.i);});
window.NEON_DEPO=render;
var carregar=function(){fetch(URL_,{mode:'cors'}).then(function(r){return r.ok?r.json():{data:[]};}).then(function(j){data=(j&&j.data||[]).filter(function(d){return d&&d.texto&&d.nome;});render();}).catch(function(){});};
var idle=function(){(window.requestIdleCallback||function(f){setTimeout(f,2000);})(carregar,{timeout:4000});};if(document.readyState==='complete')idle();else addEventListener('load',idle);
})();
