
// ---- WhatsApp: o visitante escolhe para qual número enviar ----
(function(){
var NUMS=[['5534984302083','(34) 98430-2083'],['5562992147679','(62) 99214-7679']];
var TX={pt:['Para qual WhatsApp deseja enviar?','Escolha um dos nossos atendimentos.','Cancelar'],en:['Which WhatsApp would you like to message?','Choose one of our contacts.','Cancel'],es:['¿A qué WhatsApp desea enviar?','Elija uno de nuestros contactos.','Cancelar'],fr:['Sur quel WhatsApp voulez-vous écrire ?','Choisissez l’un de nos contacts.','Annuler'],de:['An welches WhatsApp möchten Sie schreiben?','Wählen Sie einen unserer Kontakte.','Abbrechen'],zh:['您想发送到哪个 WhatsApp？','请选择我们的联系人之一。','取消']};
var ICO='<svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><path d="M20.5 3.5A11 11 0 0 0 3.2 17.4L2 22l4.7-1.2A11 11 0 0 0 20.5 3.5zM12 20a8 8 0 0 1-4.1-1.1l-.3-.2-2.8.7.8-2.7-.2-.3A8 8 0 1 1 12 20zm4.4-6c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.5 6.5 0 0 1-3.2-2.8c-.2-.4.2-.4.7-1.2.1-.2 0-.3 0-.4l-.7-1.7c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1 5 5 0 0 0 1 2.6 11 11 0 0 0 4.3 3.8c1.6.7 2.2.7 3 .6.5-.1 1.4-.6 1.6-1.1.2-.6.2-1 .1-1.1l-.4-.2z"/></svg>';
var bg=document.createElement('div');bg.className='wa-pick';bg.setAttribute('role','dialog');bg.setAttribute('aria-modal','true');document.body.appendChild(bg);
var texto='';
function fechar(){bg.classList.remove('on');}
function abrir(t){texto=t||'';var l=TX[window.NEON_LANG||'pt']||TX.pt;
 bg.innerHTML='<div class="wa-card"><div class="wa-ic">'+ICO+'</div><h3>'+l[0]+'</h3><p>'+l[1]+'</p>'+
  NUMS.map(function(n,i){return '<button type="button" class="wa-opt" data-i="'+i+'"><span class="wa-n">'+(i+1)+'</span><b>'+n[1]+'</b><i>›</i></button>';}).join('')+
  '<button type="button" class="wa-x">'+l[2]+'</button></div>';
 bg.classList.add('on');var f=bg.querySelector('.wa-opt');if(f)f.focus();}
bg.addEventListener('click',function(e){if(e.target===bg||e.target.closest('.wa-x'))return fechar();var o=e.target.closest('.wa-opt');if(!o)return;
 var n=NUMS[+o.dataset.i][0],url='https://wa.me/'+n+(texto?'?text='+encodeURIComponent(texto):'');fechar();
 if(window.NEON_STAT)NEON_STAT('whatsapp','numero'+(+o.dataset.i+1));
 var w=window.open(url,'_blank','noopener');if(!w)location.href=url;});
addEventListener('keydown',function(e){if(e.key==='Escape'&&bg.classList.contains('on'))fechar();});
window.NEON_WA=abrir;
// qualquer link de WhatsApp do site abre a escolha
document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href*="wa.me/"]');if(!a)return;e.preventDefault();
 var t='';try{t=new URL(a.href).searchParams.get('text')||'';}catch(err){}abrir(t);},false);
})();
