// Modelos de arte prontos (sem IA): a foto cai na moldura e o texto no lugar certo.
const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const FONTS = path.join(__dirname, 'fonts');
let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  for (const w of ['400', '700', '800']) {
    GlobalFonts.registerFromPath(path.join(FONTS, `inter-latin-${w}-normal.woff2`), 'NeonText');
    try { GlobalFonts.registerFromPath(path.join(FONTS, `inter-latin-ext-${w}-normal.woff2`), 'NeonText'); } catch { /* opcional */ }
  }
  GlobalFonts.registerFromPath(path.join(FONTS, 'space-grotesk-latin-700-normal.woff2'), 'NeonTitle');
  fontsReady = true;
}

const LOGO = path.join(__dirname, '..', 'public', 'img', 'logo.png');
const ORANGE = '#ff6a00', ORANGE2 = '#ffa23a', DARK = '#070b16';

const MODELOS = {
  destaque: { nome: 'Destaque', descricao: 'Foto em tela cheia com título grande embaixo', w: 1080, h: 1080, foto: true, campos: ['titulo', 'subtitulo', 'cta'] },
  moldura: { nome: 'Moldura Neon', descricao: 'Foto dentro de uma moldura com brilho neon', w: 1080, h: 1080, foto: true, campos: ['titulo', 'subtitulo', 'cta'] },
  oferta: { nome: 'Oferta', descricao: 'Foto + bloco laranja com a oferta em destaque', w: 1080, h: 1080, foto: true, campos: ['destaque', 'titulo', 'subtitulo', 'cta'] },
  depoimento: { nome: 'Depoimento / Frase', descricao: 'Texto grande sobre fundo da marca (foto opcional como avatar)', w: 1080, h: 1080, foto: false, campos: ['titulo', 'subtitulo'] },
  lancamento: { nome: 'Lançamento', descricao: 'Selo "NOVO" com a foto do produto em destaque', w: 1080, h: 1080, foto: true, campos: ['destaque', 'titulo', 'subtitulo', 'cta'] },
  story: { nome: 'Story / Reels (vertical)', descricao: 'Formato 9:16 para Stories, Reels e TikTok', w: 1080, h: 1920, foto: true, campos: ['titulo', 'subtitulo', 'cta'] },
};

const CAMPOS = {
  titulo: 'Título', subtitulo: 'Texto de apoio', destaque: 'Destaque (ex.: 20% OFF, NOVO)', cta: 'Chamada (ex.: Fale no WhatsApp)',
};

// ---------- utilidades de desenho ----------
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function cover(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s, sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}
function wrap(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/).filter(Boolean); const lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur); return lines;
}
// Escreve texto ajustando o tamanho para caber em N linhas
function fitText(ctx, text, { x, y, maxW, maxLines, size, minSize = 28, weight = 800, family = 'NeonTitle', color = '#fff', align = 'left', lh = 1.12, shadow = false }) {
  if (!text) return y;
  let s = size, lines;
  for (; s >= minSize; s -= 2) { ctx.font = `${weight} ${s}px ${family}`; lines = wrap(ctx, text, maxW); if (lines.length <= maxLines) break; }
  if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '…'); }
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'top';
  if (shadow) { ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 3; }
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * s * lh));
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  return y + lines.length * s * lh;
}
function pill(ctx, text, x, y, { size = 34, padX = 34, h = 78, align = 'left' } = {}) {
  if (!text) return;
  ctx.font = `800 ${size}px NeonText`;
  const w = ctx.measureText(text).width + padX * 2;
  const px = align === 'center' ? x - w / 2 : x;
  const g = ctx.createLinearGradient(px, 0, px + w, 0); g.addColorStop(0, ORANGE); g.addColorStop(1, ORANGE2);
  ctx.shadowColor = 'rgba(255,106,0,.55)'; ctx.shadowBlur = 30;
  roundRect(ctx, px, y, w, h, h / 2); ctx.fillStyle = g; ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#111'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, px + padX, y + h / 2 + 2);
}
function bgBrand(ctx, w, h) {
  ctx.fillStyle = DARK; ctx.fillRect(0, 0, w, h);
  const g1 = ctx.createRadialGradient(w * 0.85, h * 0.1, 10, w * 0.85, h * 0.1, w * 0.8); g1.addColorStop(0, 'rgba(255,106,0,.35)'); g1.addColorStop(1, 'rgba(255,106,0,0)');
  ctx.fillStyle = g1; ctx.fillRect(0, 0, w, h);
  const g2 = ctx.createRadialGradient(w * 0.1, h * 0.95, 10, w * 0.1, h * 0.95, w * 0.7); g2.addColorStop(0, 'rgba(56,120,255,.22)'); g2.addColorStop(1, 'rgba(56,120,255,0)');
  ctx.fillStyle = g2; ctx.fillRect(0, 0, w, h);
  // grade sutil
  ctx.strokeStyle = 'rgba(255,255,255,.035)'; ctx.lineWidth = 1;
  for (let i = 0; i < w; i += 54) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); }
  for (let j = 0; j < h; j += 54) { ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(w, j); ctx.stroke(); }
}
async function drawLogo(ctx, x, y, hgt) {
  try { const img = await loadImage(fs.readFileSync(LOGO)); const w = (img.width / img.height) * hgt; ctx.drawImage(img, x, y, w, hgt); return w; } catch { return 0; }
}
function footer(ctx, w, h, rodape) {
  if (!rodape) return;
  ctx.fillStyle = 'rgba(7,11,22,.82)'; ctx.fillRect(0, h - 74, w, 74);
  const g = ctx.createLinearGradient(0, 0, w, 0); g.addColorStop(0, ORANGE); g.addColorStop(1, ORANGE2);
  ctx.fillStyle = g; ctx.fillRect(0, h - 74, w, 4);
  ctx.font = '700 30px NeonText'; ctx.fillStyle = '#e8edf8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(rodape, w / 2, h - 36);
}
function placeholder(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, '#1a2440'); g.addColorStop(1, '#0d1326');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.font = '700 34px NeonText'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('Sua foto aqui', x + w / 2, y + h / 2);
}

// ---------- desenho de cada modelo ----------
const DRAW = {
  async destaque(ctx, d, w, h, img) {
    if (img) cover(ctx, img, 0, 0, w, h); else { bgBrand(ctx, w, h); placeholder(ctx, 0, 0, w, h * 0.62); }
    const g = ctx.createLinearGradient(0, h * 0.35, 0, h); g.addColorStop(0, 'rgba(7,11,22,0)'); g.addColorStop(0.55, 'rgba(7,11,22,.82)'); g.addColorStop(1, 'rgba(7,11,22,.97)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    await drawLogo(ctx, 56, 52, 72);
    const bottom = d.rodape ? h - 74 : h;
    let y = bottom - 70 - (d.cta ? 100 : 0) - (d.subtitulo ? 120 : 0) - 210;
    y = fitText(ctx, d.titulo, { x: 64, y, maxW: w - 128, maxLines: 3, size: 82, shadow: true });
    if (d.subtitulo) y = fitText(ctx, d.subtitulo, { x: 64, y: y + 18, maxW: w - 128, maxLines: 3, size: 38, minSize: 26, weight: 400, family: 'NeonText', color: '#d4dbec' });
    pill(ctx, d.cta, 64, y + 34);
    footer(ctx, w, h, d.rodape);
  },
  async moldura(ctx, d, w, h, img) {
    bgBrand(ctx, w, h);
    await drawLogo(ctx, 56, 48, 64);
    let y = fitText(ctx, d.titulo, { x: 64, y: 150, maxW: w - 128, maxLines: 2, size: 66 });
    const fy = y + 30, fh = h - fy - (d.rodape ? 74 : 0) - (d.cta ? 150 : 70) - (d.subtitulo ? 70 : 0), fx = 64, fw = w - 128;
    ctx.save(); ctx.shadowColor = 'rgba(255,106,0,.75)'; ctx.shadowBlur = 50;
    roundRect(ctx, fx - 6, fy - 6, fw + 12, fh + 12, 40); const gb = ctx.createLinearGradient(fx, fy, fx + fw, fy + fh); gb.addColorStop(0, ORANGE); gb.addColorStop(1, '#ffcf7a'); ctx.fillStyle = gb; ctx.fill(); ctx.restore();
    ctx.save(); roundRect(ctx, fx, fy, fw, fh, 34); ctx.clip(); if (img) cover(ctx, img, fx, fy, fw, fh); else placeholder(ctx, fx, fy, fw, fh); ctx.restore();
    let yy = fy + fh + 26;
    if (d.subtitulo) yy = fitText(ctx, d.subtitulo, { x: w / 2, y: yy, maxW: w - 160, maxLines: 2, size: 34, minSize: 24, weight: 400, family: 'NeonText', color: '#d4dbec', align: 'center' });
    if (d.cta) pill(ctx, d.cta, w / 2, yy + 22, { align: 'center' });
    footer(ctx, w, h, d.rodape);
  },
  async oferta(ctx, d, w, h, img) {
    bgBrand(ctx, w, h);
    const ph = Math.round(h * 0.5);
    if (img) cover(ctx, img, 0, 0, w, ph); else placeholder(ctx, 0, 0, w, ph);
    ctx.fillStyle = 'rgba(7,11,22,.25)'; ctx.fillRect(0, 0, w, ph);
    await drawLogo(ctx, 48, 44, 60);
    // faixa diagonal laranja
    ctx.save(); ctx.beginPath(); ctx.moveTo(0, ph - 40); ctx.lineTo(w, ph - 120); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
    const g = ctx.createLinearGradient(0, ph, w, h); g.addColorStop(0, ORANGE); g.addColorStop(1, '#ff8f1f'); ctx.fillStyle = g; ctx.fill(); ctx.restore();
    let y = ph - 10;
    y = fitText(ctx, d.destaque || 'OFERTA', { x: 64, y, maxW: w - 128, maxLines: 1, size: 150, minSize: 70, color: '#111' });
    y = fitText(ctx, d.titulo, { x: 64, y: y + 4, maxW: w - 128, maxLines: 2, size: 58, color: '#111' });
    if (d.subtitulo) y = fitText(ctx, d.subtitulo, { x: 64, y: y + 10, maxW: w - 128, maxLines: 2, size: 32, minSize: 24, weight: 700, family: 'NeonText', color: '#2a1300' });
    if (d.cta) {
      const by = Math.min(y + 26, h - (d.rodape ? 74 : 0) - 100);
      ctx.font = '800 34px NeonText'; const tw = ctx.measureText(d.cta).width + 68;
      roundRect(ctx, 64, by, tw, 78, 39); ctx.fillStyle = DARK; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(d.cta, 98, by + 41);
    }
    footer(ctx, w, h, d.rodape);
  },
  async depoimento(ctx, d, w, h, img) {
    bgBrand(ctx, w, h);
    await drawLogo(ctx, 56, 52, 64);
    ctx.font = '800 300px NeonTitle'; ctx.fillStyle = 'rgba(255,106,0,.9)'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('“', 48, 120);
    let y = fitText(ctx, d.titulo, { x: 80, y: 330, maxW: w - 160, maxLines: 6, size: 64, minSize: 34, weight: 700, family: 'NeonText' });
    const ay = Math.min(y + 50, h - (d.rodape ? 74 : 0) - 150);
    let ax = 80;
    if (img) { ctx.save(); ctx.beginPath(); ctx.arc(80 + 48, ay + 48, 48, 0, Math.PI * 2); ctx.clip(); cover(ctx, img, 80, ay, 96, 96); ctx.restore(); ctx.strokeStyle = ORANGE; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(128, ay + 48, 50, 0, Math.PI * 2); ctx.stroke(); ax = 200; }
    if (d.subtitulo) fitText(ctx, d.subtitulo, { x: ax, y: ay + 26, maxW: w - ax - 80, maxLines: 2, size: 36, minSize: 24, weight: 700, family: 'NeonText', color: ORANGE2 });
    footer(ctx, w, h, d.rodape);
  },
  async lancamento(ctx, d, w, h, img) {
    bgBrand(ctx, w, h);
    await drawLogo(ctx, 56, 48, 64);
    const cx = w / 2, cy = 395, r = 235;
    ctx.save(); ctx.shadowColor = 'rgba(255,106,0,.8)'; ctx.shadowBlur = 70; ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, Math.PI * 2); ctx.fillStyle = ORANGE; ctx.fill(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip(); if (img) cover(ctx, img, cx - r, cy - r, r * 2, r * 2); else placeholder(ctx, cx - r, cy - r, r * 2, r * 2); ctx.restore();
    // selo
    ctx.save(); ctx.translate(cx + r * 0.72, cy - r * 0.78); ctx.rotate(-0.22);
    ctx.font = '800 46px NeonTitle'; const t = (d.destaque || 'NOVO').toUpperCase(); const tw = ctx.measureText(t).width + 60;
    roundRect(ctx, -tw / 2, -40, tw, 80, 20); ctx.fillStyle = '#fff'; ctx.fill(); ctx.fillStyle = ORANGE; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, 0, 3); ctx.restore();
    let y = fitText(ctx, d.titulo, { x: cx, y: cy + r + 36, maxW: w - 140, maxLines: 2, size: 60, align: 'center' });
    if (d.subtitulo) y = fitText(ctx, d.subtitulo, { x: cx, y: y + 8, maxW: w - 160, maxLines: d.cta ? 1 : 2, size: 32, minSize: 24, weight: 400, family: 'NeonText', color: '#d4dbec', align: 'center' });
    if (d.cta) pill(ctx, d.cta, cx, Math.min(y + 22, h - (d.rodape ? 74 : 0) - 92), { align: 'center' });
    footer(ctx, w, h, d.rodape);
  },
  async story(ctx, d, w, h, img) {
    bgBrand(ctx, w, h);
    const ph = Math.round(h * 0.6);
    if (img) cover(ctx, img, 0, 0, w, ph); else placeholder(ctx, 0, 0, w, ph);
    const g = ctx.createLinearGradient(0, ph - 400, 0, ph + 10); g.addColorStop(0, 'rgba(7,11,22,0)'); g.addColorStop(1, DARK);
    ctx.fillStyle = g; ctx.fillRect(0, ph - 400, w, 410);
    await drawLogo(ctx, w / 2 - 130, 90, 92);
    let y = fitText(ctx, d.titulo, { x: w / 2, y: ph - 60, maxW: w - 140, maxLines: 4, size: 96, align: 'center' });
    if (d.subtitulo) y = fitText(ctx, d.subtitulo, { x: w / 2, y: y + 24, maxW: w - 160, maxLines: 4, size: 44, minSize: 28, weight: 400, family: 'NeonText', color: '#d4dbec', align: 'center' });
    if (d.cta) pill(ctx, d.cta, w / 2, Math.min(y + 60, h - 260), { align: 'center', size: 42, h: 96, padX: 46 });
    footer(ctx, w, h, d.rodape);
  },
};

// dados: { titulo, subtitulo, destaque, cta, rodape, foto (Buffer) }
async function render(modelo, dados = {}) {
  ensureFonts();
  const m = MODELOS[modelo] || MODELOS.destaque;
  const canvas = createCanvas(m.w, m.h);
  const ctx = canvas.getContext('2d');
  let img = null;
  if (dados.foto) { try { img = await loadImage(dados.foto); } catch { img = null; } }
  await DRAW[MODELOS[modelo] ? modelo : 'destaque'](ctx, dados, m.w, m.h, img);
  return canvas.encode('jpeg', 90);
}

module.exports = { MODELOS, CAMPOS, render };
