
// ---- tradução dinâmica das simulações ----
(function(){
var X=__X__,PT=__P__,IX={en:0,es:1,fr:2,de:3,zh:4},SL={pt:'pt-BR',en:'en-US',es:'es-ES',fr:'fr-FR',de:'de-DE',zh:'zh-CN'};
var P=PT.map(function(r){return [new RegExp(r[0]),r[1]];});
var lang=function(){return window.NEON_LANG||'pt';};
var cache={};
function tr(s,l){
 if(X[s])return X[s][IX[l]];
 if(D[s]&&D[s][l])return D[s][l];
 var m=s.match(/^([^A-Za-zÀ-ÿ0-9#(]+)(.+)$/);
 if(m){var r=tr(m[2],l);return r==null?null:m[1]+r;}
 m=s.match(/^(.+?)(\s+[^A-Za-zÀ-ÿ0-9.)]+)$/);
 if(m){var r2=tr(m[1],l);return r2==null?null:r2+m[2];}
 for(var i=0;i<P.length;i++){var mm=s.match(P[i][0]);if(!mm)continue;
  var tpl=P[i][1][IX[l]],bad=false;
  var out=tpl.replace(/([$@&])(\d)/g,function(_,k,n){var v=mm[+n];if(v==null)return '';if(k==='$')return v;var t=tr(v,l);if(t==null){if(k==='@'&&/[a-zà-ÿ]{3,}/.test(v)&&i>=P.length-1)bad=true;return v;}return t;});
  if(!bad)return out;}
 var parts=s.split(' · ');
 if(parts.length>1){var ch=false,o=parts.map(function(p){var t=tr(p,l);if(t!=null){ch=true;return t;}return p;});return ch?o.join(' · '):null;}
 return null;
}
function T(s,l){l=l||lang();if(l==='pt'||!s)return s;var core=s.trim();if(!core)return s;var k=l+'\u0001'+core;
 var r=cache.hasOwnProperty(k)?cache[k]:(cache[k]=tr(core,l));return r==null?s:s.replace(core,r);}
window.NEON_T=T;window.NEON_SL=function(){return SL[lang()];};
var SCOPE='#painel-neon,#neon-motel,#pabx-neon,.drawer,.hero .stage,.toast,.toasts,#toasts';
var orig=new WeakMap(),mine=new WeakMap();
function doText(n){var cur=n.nodeValue;if(mine.get(n)!==cur)orig.set(n,cur);var o=orig.get(n);var t=T(o);if(t!==cur){mine.set(n,t);n.nodeValue=t;}else mine.set(n,cur);}
var AT=['placeholder','title','aria-label'];
function doEl(e){AT.forEach(function(a){if(!e.hasAttribute(a))return;var v=e.getAttribute(a),key='__o_'+a,mk='__m_'+a;if(e[mk]!==v)e[key]=v;var t=T(e[key]);if(t!==v){e[mk]=t;e.setAttribute(a,t);}else e[mk]=v;});}
function inScope(el){return el&&el.closest&&el.closest(SCOPE);}
function walk(root){if(root.nodeType===3){if(inScope(root.parentElement))doText(root);return;}
 if(root.nodeType!==1||!inScope(root)&&!root.querySelector)return;
 var w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),n;while(n=w.nextNode()){if(n.nodeValue.trim()&&inScope(n.parentElement))doText(n);}
 if(inScope(root))doEl(root);root.querySelectorAll&&root.querySelectorAll('[placeholder],[title],[aria-label]').forEach(function(e){if(inScope(e))doEl(e);});}
var busy=false;
var mo=new MutationObserver(function(ms){if(busy||lang()==='pt')return;busy=true;try{ms.forEach(function(m){if(m.type==='characterData')walk(m.target);else if(m.type==='attributes')walk(m.target);else m.addedNodes.forEach(walk);});}finally{busy=false;}});
mo.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:AT});
window.NEON_RETR=function(){busy=true;try{document.querySelectorAll(SCOPE).forEach(walk);}finally{busy=false;}};
})();
