
// ---- Comando de voz do Painel Neon (demonstração) ----
(function(){
var box=document.getElementById('vozBox');if(!box)return;
var L=function(){return window.NEON_LANG||'pt';};
var W='Neon';
// [frase dita, resposta] por idioma
var V={
pt:{luz_off:['apagar as luzes','Luzes apagadas'],luz_on:['acender as luzes','Luzes acesas'],luz_dim:['diminuir a luz','Luz suave'],hidro_on:['ligar a hidromassagem','Hidromassagem ligada'],hidro_off:['desligar a hidromassagem','Hidromassagem desligada'],cort_close:['fechar a cortina','Cortina fechada'],cort_open:['abrir a cortina','Cortina aberta'],dnd_on:['não perturbe','Não perturbe ativado'],dnd_off:['desativar não perturbe','Não perturbe desativado'],tv_on:['ligar a TV','TV ligada'],tv_off:['desligar a TV','TV desligada'],som_up:['aumentar o som','Volume aumentado'],som_down:['abaixar o som','Volume reduzido'],temp:['ar em {n} graus','Ar-condicionado em {n} graus'],romantica:['cena romântica','Cena romântica ativada'],relax:['cena relax','Cena relax ativada'],dormir:['hora de dormir','Boa noite. Cena dormir ativada'],festa:['modo festa','Modo festa ativado'],chegada:['cena de chegada','Bem-vindos. Cena de chegada ativada'],nao:['','Não entendi. Tente: Neon, apagar as luzes'],ouvindo:'Ouvindo…',dica:'Toque e diga: “Neon, …”',tit:'Comando de voz · sem internet',semmic:'Seu navegador não liberou o microfone. Toque num dos comandos abaixo.'},
en:{luz_off:['turn off the lights','Lights off'],luz_on:['turn on the lights','Lights on'],luz_dim:['dim the lights','Soft lighting'],hidro_on:['turn on the hot tub','Hot tub on'],hidro_off:['turn off the hot tub','Hot tub off'],cort_close:['close the curtain','Curtain closed'],cort_open:['open the curtain','Curtain open'],dnd_on:['do not disturb','Do not disturb on'],dnd_off:['turn off do not disturb','Do not disturb off'],tv_on:['turn on the TV','TV on'],tv_off:['turn off the TV','TV off'],som_up:['turn up the volume','Volume up'],som_down:['turn down the volume','Volume down'],temp:['set the A/C to {n} degrees','Air conditioning set to {n} degrees'],romantica:['romantic scene','Romantic scene on'],relax:['relax scene','Relax scene on'],dormir:['time to sleep','Good night. Sleep scene on'],festa:['party mode','Party mode on'],chegada:['arrival scene','Welcome. Arrival scene on'],nao:['','Sorry, I did not get that. Try: Neon, turn off the lights'],ouvindo:'Listening…',dica:'Tap and say: “Neon, …”',tit:'Voice control · no internet',semmic:'Your browser did not allow the microphone. Tap one of the commands below.'},
es:{luz_off:['apagar las luces','Luces apagadas'],luz_on:['encender las luces','Luces encendidas'],luz_dim:['bajar la luz','Luz suave'],hidro_on:['encender el hidromasaje','Hidromasaje encendido'],hidro_off:['apagar el hidromasaje','Hidromasaje apagado'],cort_close:['cerrar la cortina','Cortina cerrada'],cort_open:['abrir la cortina','Cortina abierta'],dnd_on:['no molestar','No molestar activado'],dnd_off:['desactivar no molestar','No molestar desactivado'],tv_on:['encender la tele','TV encendida'],tv_off:['apagar la tele','TV apagada'],som_up:['subir el volumen','Volumen subido'],som_down:['bajar el volumen','Volumen bajado'],temp:['aire a {n} grados','Aire acondicionado a {n} grados'],romantica:['escena romántica','Escena romántica activada'],relax:['escena relax','Escena relax activada'],dormir:['hora de dormir','Buenas noches. Escena dormir activada'],festa:['modo fiesta','Modo fiesta activado'],chegada:['escena de llegada','Bienvenidos. Escena de llegada activada'],nao:['','No entendí. Pruebe: Neon, apagar las luces'],ouvindo:'Escuchando…',dica:'Toque y diga: “Neon, …”',tit:'Control por voz · sin internet',semmic:'Su navegador no habilitó el micrófono. Toque uno de los comandos abajo.'},
fr:{luz_off:['éteins les lumières','Lumières éteintes'],luz_on:['allume les lumières','Lumières allumées'],luz_dim:['baisse la lumière','Lumière tamisée'],hidro_on:['allume la balnéo','Balnéo allumée'],hidro_off:['éteins la balnéo','Balnéo éteinte'],cort_close:['ferme le rideau','Rideau fermé'],cort_open:['ouvre le rideau','Rideau ouvert'],dnd_on:['ne pas déranger','Ne pas déranger activé'],dnd_off:['désactive ne pas déranger','Ne pas déranger désactivé'],tv_on:['allume la télé','Télé allumée'],tv_off:['éteins la télé','Télé éteinte'],som_up:['monte le son','Volume augmenté'],som_down:['baisse le son','Volume baissé'],temp:['clim à {n} degrés','Climatisation à {n} degrés'],romantica:['scène romantique','Scène romantique activée'],relax:['scène détente','Scène détente activée'],dormir:['heure de dormir','Bonne nuit. Scène dormir activée'],festa:['mode fête','Mode fête activé'],chegada:["scène d'arrivée","Bienvenue. Scène d'arrivée activée"],nao:['',"Je n'ai pas compris. Essayez : Neon, éteins les lumières"],ouvindo:'J’écoute…',dica:'Touchez et dites : « Neon, … »',tit:'Commande vocale · sans internet',semmic:"Votre navigateur n'a pas autorisé le micro. Touchez une des commandes ci-dessous."},
de:{luz_off:['Licht aus','Licht ist aus'],luz_on:['Licht an','Licht ist an'],luz_dim:['Licht dimmen','Sanftes Licht'],hidro_on:['Whirlpool an','Whirlpool ist an'],hidro_off:['Whirlpool aus','Whirlpool ist aus'],cort_close:['Vorhang zu','Vorhang geschlossen'],cort_open:['Vorhang auf','Vorhang geöffnet'],dnd_on:['bitte nicht stören','Bitte nicht stören aktiv'],dnd_off:['nicht stören aus','Bitte nicht stören aus'],tv_on:['Fernseher an','Fernseher ist an'],tv_off:['Fernseher aus','Fernseher ist aus'],som_up:['lauter','Lautstärke erhöht'],som_down:['leiser','Lautstärke verringert'],temp:['Klima auf {n} Grad','Klimaanlage auf {n} Grad'],romantica:['romantische Szene','Romantische Szene aktiv'],relax:['Entspannungsszene','Entspannungsszene aktiv'],dormir:['Schlafenszeit','Gute Nacht. Schlafszene aktiv'],festa:['Partymodus','Partymodus aktiv'],chegada:['Ankunftsszene','Willkommen. Ankunftsszene aktiv'],nao:['','Das habe ich nicht verstanden. Versuchen Sie: Neon, Licht aus'],ouvindo:'Ich höre zu…',dica:'Tippen und sagen: „Neon, …“',tit:'Sprachsteuerung · ohne Internet',semmic:'Ihr Browser hat das Mikrofon nicht freigegeben. Tippen Sie auf einen der Befehle unten.'},
zh:{luz_off:['关灯','灯已关闭'],luz_on:['开灯','灯已打开'],luz_dim:['调暗灯光','柔和灯光'],hidro_on:['打开按摩浴缸','按摩浴缸已开启'],hidro_off:['关闭按摩浴缸','按摩浴缸已关闭'],cort_close:['关上窗帘','窗帘已关闭'],cort_open:['打开窗帘','窗帘已打开'],dnd_on:['请勿打扰','请勿打扰已开启'],dnd_off:['取消请勿打扰','请勿打扰已关闭'],tv_on:['打开电视','电视已打开'],tv_off:['关闭电视','电视已关闭'],som_up:['调大音量','音量已调大'],som_down:['调小音量','音量已调小'],temp:['空调调到{n}度','空调已调到{n}度'],romantica:['浪漫场景','浪漫场景已开启'],relax:['放松场景','放松场景已开启'],dormir:['我要睡觉了','晚安，睡眠场景已开启'],festa:['派对模式','派对模式已开启'],chegada:['迎宾场景','欢迎光临，迎宾场景已开启'],nao:['','没听清。试试说：Neon，关灯'],ouvindo:'正在聆听…',dica:'点击后说：“Neon，……”',tit:'语音控制 · 无需联网',semmic:'浏览器未允许使用麦克风，请点击下方的指令。'}
};
var CHIPS=[['luz_off'],['romantica'],['hidro_on'],['temp',20],['cort_close'],['dnd_on'],['som_up']];
var SL={pt:'pt-BR',en:'en-US',es:'es-ES',fr:'fr-FR',de:'de-DE',zh:'zh-CN'};
var $=function(id){return document.getElementById(id);};
var mic=$('vozMic'),line=$('vozLine'),hint=$('vozHint'),chips=$('vozChips');
function T(){return V[L()]||V.pt;}
function frase(c,n){var t=T()[c];return (t?t[0]:'').replace('{n}',n);}
function resp(c,n){var t=T()[c];return (t?t[1]:'').replace('{n}',n);}
function drawChips(){chips.innerHTML=CHIPS.map(function(x){return '<button type="button" data-c="'+x[0]+'"'+(x[1]?' data-n="'+x[1]+'"':'')+'>“'+W+', '+frase(x[0],x[1])+'”</button>';}).join('');
 if(!busy){hint.textContent=T().dica;line.textContent=T().tit;}}
var busy=false,tmr=[];
function clear(){tmr.forEach(clearTimeout);tmr=[];}
function speak(txt){try{if(!('speechSynthesis' in window))return;speechSynthesis.cancel();var u=new SpeechSynthesisUtterance(txt);u.lang=SL[L()];u.rate=1.05;
 var vs=speechSynthesis.getVoices(),v=vs.find(function(x){return x.lang.replace('_','-').toLowerCase()===u.lang.toLowerCase();})||vs.find(function(x){return x.lang.slice(0,2)===u.lang.slice(0,2);});if(v)u.voice=v;speechSynthesis.speak(u);}catch(e){}}
function exec(c,n){var api=window.NeonSuite;if(!api||!api.cmd)return;
 if(['romantica','relax','dormir','festa','chegada'].indexOf(c)>-1)api.cmd('cena',c);else api.cmd(c,n);}
function run(c,n,dito){clear();busy=true;box.classList.add('on');box.classList.remove('ok');hint.textContent=T().ouvindo;line.textContent='';
 var s='“'+(dito||(W+', '+frase(c,n)))+'”',t0=performance.now(),dur=Math.min(900,s.length*28);
 (function type(){var k=Math.min(s.length,Math.ceil((performance.now()-t0)/dur*s.length));line.textContent=s.slice(0,k);
  if(k<s.length)tmr.push(setTimeout(type,30));else tmr.push(setTimeout(done,300));})();
 function done(){box.classList.remove('on');if(c==='nao'){hint.textContent='';line.textContent=resp('nao');speak(resp('nao'));busy=false;return;}
  exec(c,n);box.classList.add('ok');hint.textContent='✓ '+resp(c,n);speak(resp(c,n));
  tmr.push(setTimeout(function(){box.classList.remove('ok');busy=false;},2600));}}
chips.addEventListener('click',function(e){var b=e.target.closest('button[data-c]');if(!b)return;run(b.dataset.c,b.dataset.n?+b.dataset.n:undefined);});
// interpretação do que foi dito (todos os idiomas)
function N(s){return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');}
function parse(raw){var s=N(raw),m;
 var off=/apag|deslig|\boff\b|\baus\b|eteins|eteind|关|cerr|fech|close|ferme|schlie|\bzu\b|取消|desativ|desactiv/.test(s),on=/\blig|acend|\bon\b|\ban\b|encend|allum|开|abr|open|ouvr|offn|\bauf\b|打开/.test(s);
 if(/perturb|disturb|molest|derang|storen|stoeren|打扰/.test(s))return [/desativ|desactiv|turn off|switch off|\baus\b|取消/.test(s)?'dnd_off':'dnd_on'];
 if(/romant|浪漫/.test(s))return ['romantica'];if(/relax|detente|entspann|放松/.test(s))return ['relax'];if(/dormir|sleep|schlaf|睡/.test(s))return ['dormir'];
 if(/festa|party|fiesta|fete|派对/.test(s))return ['festa'];if(/chegada|arrival|llegada|arrivee|ankunft|迎宾/.test(s))return ['chegada'];
 if((m=s.match(/(\d{2})/))&&/\bar\b|ar-?cond|aire|\bac\b|a\/c|clim|klima|空调|grau|degre|grado|\bgrad|度/.test(s))return ['temp',+m[1]];
 if(/cortina|curtain|rideau|vorhang|窗帘/.test(s))return [on&&!off?'cort_open':'cort_close'];
 if(/hidro|banheira|jacuzzi|hot ?tub|whirlpool|balneo|浴缸|按摩/.test(s))return [off?'hidro_off':'hidro_on'];
 if(/\btv\b|televis|tele\b|fernseh|电视/.test(s))return [off?'tv_off':'tv_on'];
 if(/som\b|music|musica|volume|volumen|sonido|\bson\b|musik|lauter|leiser|音/.test(s))return [/diminu|baix|down|menos|less|leiser|bajar|baisse|小/.test(s)?'som_down':'som_up'];
 if(/luz|luces|light|lumiere|licht|灯/.test(s)){if(/diminu|abaix|suave|fraca|\bdim|bajar|baisse|dimm|暗/.test(s))return ['luz_dim'];return [off?'luz_off':'luz_on'];}
 return ['nao'];}
var SR=window.SpeechRecognition||window.webkitSpeechRecognition,rec=null;
mic.addEventListener('click',function(){
 if(!SR){clear();hint.textContent='';line.textContent=T().semmic;box.classList.add('pulse');setTimeout(function(){box.classList.remove('pulse');},1200);return;}
 try{if(rec)rec.abort();rec=new SR();rec.lang=SL[L()];rec.interimResults=true;rec.maxAlternatives=1;
  clear();box.classList.add('on');hint.textContent=T().ouvindo;line.textContent='';
  var fim='';rec.onresult=function(e){var t='';for(var i=0;i<e.results.length;i++)t+=e.results[i][0].transcript;fim=t;line.textContent='“'+t+'”';};
  rec.onerror=function(){box.classList.remove('on');hint.textContent='';line.textContent=T().semmic;};
  rec.onend=function(){box.classList.remove('on');if(!fim)return;var r=parse(fim);run(r[0],r[1],fim);};
  rec.start();}catch(e){line.textContent=T().semmic;}
});
// botão da seção de apresentação
document.addEventListener('click',function(e){var a=e.target.closest('[data-voz-ir]');if(!a)return;e.preventDefault();
 var t=$('tablet')||box;var y=t.getBoundingClientRect().top+scrollY-90;window.scrollTo({top:y,behavior:'smooth'});
 setTimeout(function(){box.classList.add('pulse');setTimeout(function(){box.classList.remove('pulse');},1600);},700);});
window.NEON_VOZ=drawChips;drawChips();
// animação da apresentação (balões que se alternam)
var st=$('vozStage');if(st){var k=0,seq=[['luz_off'],['romantica'],['temp',22],['hidro_on'],['cort_close'],['dnd_on']];
 function cyc(){var x=seq[k++%seq.length];var q=st.querySelector('.vq'),a=st.querySelector('.va');
  st.classList.remove('show');setTimeout(function(){q.textContent='“'+W+', '+frase(x[0],x[1])+'”';a.textContent='✓ '+resp(x[0],x[1]);st.classList.add('show');},380);}
 cyc();setInterval(cyc,3600);}
})();
