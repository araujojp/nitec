/* Ajuda do Neon Gestão: monta o sumário */
(function () {
  var secoes = document.querySelectorAll('main section.parte');
  function montar(alvo) {
    if (!alvo) return;
    secoes.forEach(function (s) {
      var h2 = s.querySelector('h2'); if (!h2) return;
      var li = document.createElement('li');
      var a = document.createElement('a'); a.href = '#' + s.id; a.textContent = h2.textContent.replace(/^\d+/, function (n) { return n + '. '; });
      li.appendChild(a);
      var subs = s.querySelectorAll('h3[id]');
      if (subs.length) {
        var ol = document.createElement('ol');
        subs.forEach(function (h3) { var l = document.createElement('li'); var x = document.createElement('a'); x.href = '#' + h3.id; x.textContent = h3.textContent; l.appendChild(x); ol.appendChild(l); });
        li.appendChild(ol);
      }
      alvo.appendChild(li);
    });
  }
  montar(document.getElementById('toc-lista'));
  montar(document.getElementById('toc-lista-m'));
  document.querySelectorAll('#toc-lista-m a').forEach(function (a) { a.addEventListener('click', function () { var d = document.querySelector('details.toc-m'); if (d) d.open = false; }); });
})();

/* Busca na ajuda: digita, aparecem os trechos; toque para ir até lá */
(function () {
  var alvos = ['toc-lista', 'toc-lista-m'];
  var itens = [].slice.call(document.querySelectorAll('main h3, main h4, main p, main li, main td'));
  function semAcento(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function secaoDe(el) {
    var n = el; while (n && n !== document.body) { var p = n.previousElementSibling; while (p) { if (/^H[234]$/.test(p.tagName)) return p; p = p.previousElementSibling; } n = n.parentElement; }
    return null;
  }
  alvos.forEach(function (id, i) {
    var lista = document.getElementById(id); if (!lista) return;
    var caixa = document.createElement('div'); caixa.className = 'busca-ajuda';
    var inp = document.createElement('input'); inp.type = 'search'; inp.id = 'busca-ajuda-' + i; inp.placeholder = 'Buscar na ajuda…'; inp.setAttribute('aria-label', 'Buscar na ajuda');
    var res = document.createElement('ol'); res.className = 'resultados'; res.hidden = true;
    caixa.appendChild(inp); caixa.appendChild(res);
    lista.parentNode.insertBefore(caixa, lista);
    var t;
    inp.addEventListener('input', function () {
      clearTimeout(t); t = setTimeout(function () {
        var q = semAcento(inp.value.trim()); res.innerHTML = '';
        if (q.length < 3) { res.hidden = true; lista.hidden = false; return; }
        var vistos = 0;
        itens.forEach(function (el) {
          if (vistos >= 25) return;
          if (el.tagName === 'LI' && el.querySelector('li')) return;
          var txt = el.textContent.replace(/\s+/g, ' ').trim();
          var pos = semAcento(txt).indexOf(q); if (pos < 0) return;
          vistos++;
          var sec = /^H[34]$/.test(el.tagName) ? el : secaoDe(el);
          var li = document.createElement('li'); var a = document.createElement('a'); a.href = '#';
          var titulo = document.createElement('b'); titulo.textContent = sec ? sec.textContent.replace(/^\d+/, '') : 'Manual';
          var trecho = document.createElement('span'); var ini = Math.max(0, pos - 40);
          trecho.textContent = (ini ? '…' : '') + txt.slice(ini, pos + q.length + 60) + (pos + q.length + 60 < txt.length ? '…' : '');
          a.appendChild(titulo); a.appendChild(trecho);
          a.addEventListener('click', function (e) {
            e.preventDefault(); var d = document.querySelector('details.toc-m'); if (d) d.open = false;
            el.scrollIntoView({ block: 'center' }); el.classList.add('achado'); setTimeout(function () { el.classList.remove('achado'); }, 2500);
          });
          li.appendChild(a); res.appendChild(li);
        });
        if (!vistos) { var v = document.createElement('li'); v.className = 'vazio'; v.textContent = 'Nada encontrado. Tente outra palavra.'; res.appendChild(v); }
        res.hidden = false; lista.hidden = true;
      }, 150);
    });
  });
  // Abre já na parte pedida (o painel manda #ancora)
  if (location.hash) { var alvo = document.getElementById(location.hash.slice(1)); if (alvo) setTimeout(function () { alvo.scrollIntoView(); }, 50); }
})();
