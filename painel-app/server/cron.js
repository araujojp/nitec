// Interpretador simples de expressões cron (5 campos), no fuso de Brasília (UTC-3).
const TZ_OFFSET_MIN = -180;
const RANGES = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];
const NOMES = ['minuto', 'hora', 'dia', 'mês', 'dia da semana'];

function parseField(expr, i) {
  const [min, max] = RANGES[i];
  const out = new Set();
  for (const part of expr.split(',')) {
    const m = part.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);
    if (!m) throw new Error(`campo "${NOMES[i]}" inválido (${part})`);
    let lo = min, hi = max;
    if (m[1] !== '*') { const [a, b] = m[1].split('-').map(Number); lo = a; hi = b ?? (m[2] ? max : a); }
    const step = m[2] ? Number(m[2]) : 1;
    if (lo < min || hi > max || lo > hi || step < 1) throw new Error(`campo "${NOMES[i]}" fora do intervalo (${part})`);
    for (let v = lo; v <= hi; v += step) out.add(i === 4 && v === 7 ? 0 : v);
  }
  return out;
}

function parse(expr) {
  const parts = String(expr || '').trim().split(/\s+/);
  if (parts.length !== 5) throw new Error('use 5 campos: minuto hora dia mês dia-da-semana');
  return parts.map(parseField);
}

// Próxima execução depois de "from" (Date), devolvida em texto SQL UTC
function nextRun(expr, from = new Date()) {
  const [mi, ho, di, me, ds] = parse(expr);
  const domAll = expr.trim().split(/\s+/)[2] === '*';
  const dowAll = expr.trim().split(/\s+/)[4] === '*';
  // trabalha em "hora local" deslocando o relógio
  let t = new Date(Math.floor((from.getTime() + TZ_OFFSET_MIN * 60e3) / 60e3) * 60e3 + 60e3);
  for (let i = 0; i < 366 * 24 * 60; i++) {
    const okDay = domAll && dowAll ? true : domAll ? ds.has(t.getUTCDay()) : dowAll ? di.has(t.getUTCDate()) : (di.has(t.getUTCDate()) || ds.has(t.getUTCDay()));
    if (me.has(t.getUTCMonth() + 1) && okDay && ho.has(t.getUTCHours()) && mi.has(t.getUTCMinutes())) {
      const utc = new Date(t.getTime() - TZ_OFFSET_MIN * 60e3);
      return utc.toISOString().slice(0, 19).replace('T', ' ');
    }
    // pula horas/dias inteiros quando possível
    if (!me.has(t.getUTCMonth() + 1) || !okDay) { t = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1)); continue; }
    if (!ho.has(t.getUTCHours())) { t = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), t.getUTCHours() + 1)); continue; }
    t = new Date(t.getTime() + 60e3);
  }
  throw new Error('a expressão nunca executa');
}

module.exports = { nextRun, parse };
