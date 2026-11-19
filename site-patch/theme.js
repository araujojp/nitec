
// ---- 4 temas: abre em azul (claro/escuro conforme o aparelho); tocar no logo percorre o ciclo ----
(function(){var H=document.documentElement,tip=document.createElement('div');tip.className='theme-tip';document.body.appendChild(tip);
var CICLO=['light-azul','light-laranja','dark-azul','dark-laranja'];
var N={pt:{light:'Claro',dark:'Escuro',azul:'Azul',laranja:'Laranja'},en:{light:'Light',dark:'Dark',azul:'Blue',laranja:'Orange'},es:{light:'Claro',dark:'Oscuro',azul:'Azul',laranja:'Naranja'},fr:{light:'Clair',dark:'Sombre',azul:'Bleu',laranja:'Orange'},de:{light:'Hell',dark:'Dunkel',azul:'Blau',laranja:'Orange'},zh:{light:'浅色',dark:'深色',azul:'蓝色',laranja:'橙色'}};
var mq=window.matchMedia?matchMedia('(prefers-color-scheme: light)'):null;
var escolha=null;try{escolha=localStorage.getItem('neon-tema2');}catch(e){}
if(CICLO.indexOf(escolha)<0)escolha=null;
function sistema(){return (mq&&mq.matches?'light':'dark')+'-azul';}
function set(v,show){window.NEON_SET_TEMA(v);
 if(show){var l=N[window.NEON_LANG||'pt']||N.pt,p=v.split('-');tip.textContent=(p[0]==='light'?'☀️ ':'🌙 ')+l[p[0]]+' · '+l[p[1]];tip.classList.add('on');clearTimeout(set.t);set.t=setTimeout(function(){tip.classList.remove('on');},1500);}}
set(escolha||sistema(),false);
if(mq){var f=function(){if(!escolha)set(sistema(),false);};if(mq.addEventListener)mq.addEventListener('change',f);else if(mq.addListener)mq.addListener(f);}
document.querySelectorAll('.logo').forEach(function(a){a.setAttribute('title','Tema');a.addEventListener('click',function(e){e.preventDefault();
 var atual=H.getAttribute('data-theme')+'-'+H.getAttribute('data-cor'),i=CICLO.indexOf(atual),n=CICLO[(i+1)%CICLO.length];
 escolha=n;try{localStorage.setItem('neon-tema2',n);}catch(err){}set(n,true);});});
})();
