const floats = $$('.float, .chip-float');
  const stage = document.getElementById('stage');
  const heroCv = document.getElementById('heroCanvas'), heroGlow = document.querySelector('.glow-hero');
  const base = { 'f-tablet': -5, 'f-map': 4, 'f-phone': -3 };
  const clamp = (v, m = 1) => Math.max(-m, Math.min(m, v));
  const fine = matchMedia('(pointer:fine)').matches;
  // alvo (-1..1), estado com mola (inércia e balanço), giroscópio
  let tgx = 0, tgy = 0, mx = 0, my = 0, gx = 0, gy = 0, gyroOn = false, drag = null, T = null, mexeu = false;
  const P = { x: 0, y: 0, vx: 0, vy: 0 };
  // mouse: posição na tela inteira (forte) e arraste dentro do palco
  addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; mx = (e.clientX / innerWidth - 0.5) * 2; my = (e.clientY / innerHeight - 0.5) * 2;
    if (drag) { tgx = clamp(drag.bx + (e.clientX - drag.x) / 160, 1.6); tgy = clamp(drag.by + (e.clientY - drag.y) / 160, 1.6); } }, { passive: true });
  stage.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse' || e.target.closest('button,input,a,.dial,.h-toggles span')) return;
    drag = { x: e.clientX, y: e.clientY, bx: P.x, by: P.y }; stage.classList.add('grabbing'); e.preventDefault(); });
  addEventListener('pointerup', () => { if (drag) { drag = null; stage.classList.remove('grabbing'); } });
  // dedo: arraste para os lados move as telas; para cima/baixo rola a página
  const pedirGiro = () => { try { if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission && !pedirGiro.f) { pedirGiro.f = 1; DeviceOrientationEvent.requestPermission().catch(() => {}); } } catch (e) {} };
  stage.addEventListener('touchstart', (e) => { if (e.touches.length !== 1 || e.target.closest('button,input,a,.dial,.h-toggles span')) { T = null; return; }
    const t = e.touches[0]; T = { x: t.clientX, y: t.clientY, bx: P.x, by: P.y, l: null }; }, { passive: true });
  stage.addEventListener('touchmove', (e) => { if (!T || e.touches.length !== 1) return; const t = e.touches[0], dx = t.clientX - T.x, dy = t.clientY - T.y;
    if (!T.l) { if (Math.hypot(dx, dy) < 6) return; T.l = Math.abs(dx) > Math.abs(dy) * 0.9 ? 'h' : 'v'; }
    if (T.l !== 'h') return; if (e.cancelable) e.preventDefault();
    tgx = clamp(T.bx + dx / 110, 1.25); tgy = clamp(T.by + dy / 110, 1.1);
    if (!mexeu) { mexeu = true; stage.classList.add('mexeu'); } }, { passive: false });
  const solta = () => { if (T && T.l === 'h') { tgx = 0; tgy = 0; } T = null; pedirGiro(); };
  stage.addEventListener('touchend', solta); stage.addEventListener('touchcancel', solta);
  // celular inclinado (giroscópio)
  addEventListener('deviceorientation', (e) => { if (e.gamma == null) return; gyroOn = true;
    gx = clamp((e.gamma || 0) / 22); gy = clamp(((e.beta || 45) - 45) / 22); }, { passive: true });
  floats.forEach((f, i) => {
    f._tx = 0; f._ty = 0; f._rx = 0; f._ry = 0; f._i = i;
    f._rot = base[[...f.classList].find((c) => base[c] !== undefined)] || 0;
    f._side = f.classList.contains('f-tablet') || f.classList.contains('c2') ? -1 : 1;
    if (!f.classList.contains('float')) return;
    f.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return;
      const r = f.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      f._rx = (0.5 - y) * 22; f._ry = (x - 0.5) * 26;
      f.style.setProperty('--gx', (x * 100) + '%'); f.style.setProperty('--gy', (y * 100) + '%'); f.style.zIndex = 8; });
    f.addEventListener('pointerleave', () => { f._rx = 0; f._ry = 0; f.style.zIndex = ''; });
  });
  // limites de cada tela: nunca sair da área visível (laterais da tela e altura do topo do site)
  const heroSec = stage.closest('.hero') || stage;
  const medir = () => {
    const vw = document.documentElement.clientWidth, h = heroSec.getBoundingClientRect();
    floats.forEach((f) => {
      const old = f.style.transform; f.style.transform = 'none'; const r = f.getBoundingClientRect(); f.style.transform = old;
      if (!r.width) { f._xmin = f._xmax = f._ymin = f._ymax = 0; return; }
      const m = 10 + r.width * 0.05, mv = 8 + r.height * 0.05;
      f._xmin = Math.min(0, m - r.left); f._xmax = Math.max(0, vw - m - r.right);
      f._ymin = Math.min(0, h.top + mv - r.top); f._ymax = Math.max(0, h.bottom - mv - r.bottom);
    });
  };
  medir(); addEventListener('resize', medir); addEventListener('load', medir); setTimeout(medir, 1200);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(medir);
  let last = performance.now();
  function heroLoop(now) {
    const dt = Math.min(0.05, (now - last) / 1000) || 0.016; last = now; const k = dt * 60;
    // alvo final: arraste > mouse > giroscópio
    let ax = tgx, ay = tgy;
    if (!drag && !(T && T.l === 'h')) { if (fine) { ax = mx * 0.9; ay = my * 0.9; } else if (gyroOn) { ax = gx; ay = gy; } }
    // mola com balanço
    P.vx += (ax - P.x) * 0.075 * k; P.vy += (ay - P.y) * 0.075 * k;
    P.vx *= Math.pow(0.82, k); P.vy *= Math.pow(0.82, k);
    P.x += P.vx * k; P.y += P.vy * k;
    const rs = stage.getBoundingClientRect();
    const s = Math.max(0, Math.min(700, innerHeight * 0.45 - (rs.top + rs.height / 2))), t = now / 1000, sp = Math.hypot(P.vx, P.vy);
    floats.forEach((f) => {
      const d = Number(f.dataset.depth || 20), chip = !f.classList.contains('float');
      f._tx += (f._rx - f._tx) * 0.12 * k; f._ty += (f._ry - f._ty) * 0.12 * k;
      const bob = Math.sin(t * 0.9 + f._i * 1.7) * (chip ? 7 : 5);
      const X = Math.max(f._xmin || 0, Math.min(f._xmax || 0, P.x * d * 1.9 + f._side * s * d / 260)) + (f._cx || 0);
      const Y = Math.max(f._ymin || 0, Math.min(f._ymax || 0, P.y * d * 1.5 + bob)) - s * d / 75;
      const rx = f._tx - P.y * 13 - P.vy * 40, ry = f._ty + P.x * 17 + P.vx * 50;
      const rz = f._rot + P.x * (chip ? 4 : 2.5) + f._side * s * 0.012;
      const sc = 1 + Math.min(0.02, sp * 0.25);
      f.style.transform = `translate3d(${X.toFixed(1)}px, ${Y.toFixed(1)}px, 0) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) rotate(${rz.toFixed(2)}deg) scale(${sc.toFixed(3)})`;
    });
    // correção fina: mede a posição real (já inclinada) e puxa de volta se passar da borda
    const vwN = document.documentElement.clientWidth;
    floats.forEach((f) => {
      const r = f.getBoundingClientRect(); if (!r.width) return;
      let c = f._cx || 0;
      if (r.right > vwN - 6) c -= r.right - (vwN - 6); else if (r.left < 6) c += 6 - r.left; else c *= 0.9;
      f._cx = Math.abs(c) < 0.2 ? 0 : c;
    });
    px = clamp(P.x * 0.5, 0.8); py = clamp(P.y * 0.5, 0.8);
    if (heroCv) heroCv.style.transform = `translate3d(${(-P.x * 26).toFixed(1)}px, ${(-P.y * 16).toFixed(1)}px, 0) scale(1.08)`;
    if (heroGlow) heroGlow.style.transform = `translate3d(${(P.x * 40).toFixed(1)}px, ${(P.y * 26).toFixed(1)}px, 0)`;
    requestAnimationFrame(heroLoop);
  }
