
// ---- efeitos sonoros de interface (sintetizados, sem arquivos) ----
(function(){
var AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
var ac=null,out=null,wet=null;
function ctx(){if(!ac){ac=new AC();out=ac.createGain();out.gain.value=0.55;
  var comp=ac.createDynamicsCompressor();comp.threshold.value=-18;comp.ratio.value=4;out.connect(comp);comp.connect(ac.destination);
  // eco curto e brilhante (dá o ar "tecnológico")
  wet=ac.createGain();wet.gain.value=0.16;var dl=ac.createDelay();dl.delayTime.value=0.085;var fb=ac.createGain();fb.gain.value=0.28;
  var hp=ac.createBiquadFilter();hp.type='highpass';hp.frequency.value=1400;wet.connect(hp);hp.connect(dl);dl.connect(fb);fb.connect(dl);dl.connect(out);}
 if(ac.state==='suspended')ac.resume();return ac;}
function tone(f,o){o=o||{};var a=ctx(),t=a.currentTime+(o.at||0),d=o.d||0.09,g=a.createGain(),os=a.createOscillator();
 os.type=o.type||'sine';os.frequency.setValueAtTime(f,t);if(o.to)os.frequency.exponentialRampToValueAtTime(o.to,t+d);
 var v=(o.v||0.06);g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(v,t+(o.atk||0.004));g.gain.exponentialRampToValueAtTime(0.0001,t+d);
 var lp=a.createBiquadFilter();lp.type='lowpass';lp.frequency.value=o.lp||7000;os.connect(lp);lp.connect(g);g.connect(out);if(o.echo!==false)g.connect(wet);
 os.start(t);os.stop(t+d+0.02);}
function noise(o){o=o||{};var a=ctx(),t=a.currentTime+(o.at||0),d=o.d||0.05,n=Math.floor(a.sampleRate*d),b=a.createBuffer(1,n,a.sampleRate),c=b.getChannelData(0);
 for(var i=0;i<n;i++)c[i]=(Math.random()*2-1)*(1-i/n);var s=a.createBufferSource();s.buffer=b;var bp=a.createBiquadFilter();bp.type='bandpass';bp.frequency.setValueAtTime(o.f||3000,t);if(o.to)bp.frequency.exponentialRampToValueAtTime(o.to,t+d);bp.Q.value=o.q||1.2;
 var g=a.createGain();g.gain.value=o.v||0.05;s.connect(bp);bp.connect(g);g.connect(out);s.start(t);}
var S={
 // toque leve: links do menu, chips, abas
 tick:function(){tone(2350,{d:0.045,v:0.035,type:'triangle',echo:false});noise({d:0.018,f:6000,v:0.02});},
 // botão principal (CTA): confirmação em dois tons, brilhante
 cta:function(){tone(880,{d:0.12,v:0.05,type:'sine'});tone(1318.5,{at:0.06,d:0.22,v:0.045,type:'sine'});tone(2637,{at:0.06,d:0.18,v:0.012,type:'sine'});},
 // botão secundário
 sec:function(){tone(660,{d:0.08,v:0.045,type:'triangle'});tone(990,{at:0.045,d:0.1,v:0.03,type:'sine'});},
 // logo / troca de tema: brilho ascendente (claro) ou descendente (escuro)
 tema:function(cl){var b=cl?[523.25,659.25,783.99,1046.5]:[1046.5,783.99,659.25,523.25];b.forEach(function(f,i){tone(f,{at:i*0.055,d:0.32,v:0.035,type:'sine'});});noise({d:0.25,f:cl?2000:6000,to:cl?8000:1500,v:0.012,q:0.7});},
 // menu (hambúrguer): varredura
 menuAbre:function(){tone(420,{to:980,d:0.16,v:0.04,type:'triangle'});noise({d:0.12,f:1200,to:5000,v:0.02});},
 menuFecha:function(){tone(980,{to:420,d:0.14,v:0.035,type:'triangle'});noise({d:0.1,f:5000,to:1200,v:0.016});},
 // seletor de idioma: abre / escolhe
 idiomaAbre:function(){tone(1567.98,{d:0.06,v:0.035});tone(2093,{at:0.045,d:0.08,v:0.03});},
 idioma:function(){[1046.5,1318.5,1567.98].forEach(function(f,i){tone(f,{at:i*0.045,d:0.16,v:0.035});});},
 // perguntas frequentes
 abre:function(){tone(740,{to:1110,d:0.09,v:0.04,type:'triangle'});},
 fecha:function(){tone(1110,{to:740,d:0.08,v:0.032,type:'triangle'});},
 // carrossel de depoimentos
 desliza:function(){noise({d:0.14,f:900,to:4500,v:0.03,q:0.8});tone(1975.5,{at:0.06,d:0.06,v:0.02,echo:false});},
 // WhatsApp: "bolha" amigável
 whats:function(){tone(523.25,{to:1046.5,d:0.09,v:0.05,type:'sine'});tone(1568,{at:0.08,d:0.14,v:0.035});},
 // campos de formulário / calculadora
 foco:function(){tone(3135.96,{d:0.03,v:0.018,echo:false});},
 // simulação do Neon Motel: clique de sistema bem curto
 sis:function(){tone(1760,{d:0.03,v:0.025,type:'square',lp:3500,echo:false});}
};
window.NEON_SOM=S;
function play(k,arg){try{S[k](arg);}catch(e){}}
// fora destas áreas: a suíte/painel, o comando de voz do painel e o PABX já têm áudio próprio
var EXCL='#painel-neon,#pabx-neon,#room,.drawer';
document.addEventListener('click',function(e){var el=e.target;if(!el||!el.closest||el.closest(EXCL))return;
 if(el.closest('.logo')){var H=document.documentElement,cur=H.getAttribute('data-theme')+'-'+H.getAttribute('data-cor');return play('tema',cur==='light-azul'||cur==='dark-laranja');}
 if(el.closest('.burger'))return play(document.querySelector('.nav.open')?'menuFecha':'menuAbre');
 if(el.closest('.lgm button'))return play('idioma');
 if(el.closest('.lgt'))return play('idiomaAbre');
 if(el.closest('.wa-float,a[href*="wa.me"]'))return play('whats');
 if(el.closest('.depo-nav button,.dn-dots i'))return play('desliza');
 if(el.closest('#neon-motel'))return el.closest('button,a,[data-n],.suite')?play('sis'):0;
 if(el.closest('.faq summary'))return play(el.closest('details').open?'fecha':'abre');
 var bt=el.closest('.btn,button,a,summary,[role=button]');if(!bt)return;
 if(bt.matches('.btn.primary,.tbtn.primary'))return play('cta');
 if(bt.matches('.btn'))return play('sec');
 play('tick');
},true);
document.addEventListener('focusin',function(e){var el=e.target;if(el&&el.matches&&el.matches('input,select,textarea')&&!el.closest(EXCL))play('foco');});
})();
