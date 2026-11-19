
// ---- tema: segue o aparelho do visitante; tocar no logo alterna claro/escuro ----
(function(){var H=document.documentElement,tip=document.createElement('div');tip.className='theme-tip';document.body.appendChild(tip);
var T={pt:['Tema claro','Tema escuro'],en:['Light theme','Dark theme'],es:['Tema claro','Tema oscuro'],fr:['Thème clair','Thème sombre'],de:['Helles Design','Dunkles Design'],zh:['浅色主题','深色主题']};
var mq=window.matchMedia?matchMedia('(prefers-color-scheme: light)'):null;
var escolha=null;try{escolha=localStorage.getItem('neon-tema');}catch(e){}
function sistema(){return mq&&mq.matches?'light':'dark';}
function set(t,show){H.setAttribute('data-theme',t);
 var mc=document.querySelector('meta[name=theme-color]');if(mc)mc.content=t==='light'?'#f6f7fb':'#05070f';
 if(show){var l=T[window.NEON_LANG||'pt']||T.pt;tip.textContent=(t==='light'?'☀️ ':'🌙 ')+l[t==='light'?0:1];tip.classList.add('on');clearTimeout(set.t);set.t=setTimeout(function(){tip.classList.remove('on');},1400);}}
set(escolha==='light'||escolha==='dark'?escolha:sistema(),false);
if(mq){var f=function(){if(!escolha)set(sistema(),false);};if(mq.addEventListener)mq.addEventListener('change',f);else if(mq.addListener)mq.addListener(f);}
document.querySelectorAll('.logo').forEach(function(a){a.setAttribute('title','Tema claro / escuro');a.addEventListener('click',function(e){e.preventDefault();
 var n=H.getAttribute('data-theme')==='light'?'dark':'light';escolha=n;try{localStorage.setItem('neon-tema',n);}catch(err){}set(n,true);});});
})();
