// Automações que rodam sozinhas a cada 15 minutos.
const { q } = require('./db');
const { todaySql } = require('./util');

async function runAutomations() {
  const hoje = todaySql();
  const r = {};

  // 1) Cobranças vencidas e não pagas ficam "Atrasado"
  r.atrasadas = (await q("UPDATE cobrancas SET status='atrasado' WHERE status='pendente' AND vencimento < ?", [hoje])).affectedRows;

  // 2) Licenças com vencimento passado ficam "Vencida"
  r.licencas_vencidas = (await q("UPDATE licencas SET status='vencida' WHERE status='ativa' AND vencimento IS NOT NULL AND vencimento < ?", [hoje])).affectedRows;

  // 3) Gera a mensalidade do mês para licenças ativas com cobrança automática
  const comp = hoje.slice(0, 7);
  const [ano, mes] = comp.split('-').map(Number);
  const lics = await q(`SELECT l.id, l.cliente_id, l.valor_mensal, l.dia_vencimento FROM licencas l
    WHERE l.status='ativa' AND l.gerar_cobranca=1 AND l.valor_mensal > 0 AND l.cliente_id IS NOT NULL
      AND (l.inicio IS NULL OR l.inicio <= LAST_DAY(?))
      AND NOT EXISTS (SELECT 1 FROM cobrancas c WHERE c.licenca_id=l.id AND c.competencia=?)`, [hoje, comp]);
  let geradas = 0;
  for (const l of lics) {
    const dia = Math.min(Math.max(Number(l.dia_vencimento) || 10, 1), 28);
    const venc = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    const status = venc < hoje ? 'atrasado' : 'pendente';
    try {
      await q('INSERT INTO cobrancas (cliente_id, licenca_id, competencia, valor, vencimento, status, observacoes) VALUES (?,?,?,?,?,?,?)',
        [l.cliente_id, l.id, comp, l.valor_mensal, venc, status, 'Gerada automaticamente']);
      geradas++;
    } catch (e) { if (e.code !== 'ER_DUP_ENTRY') throw e; }
  }
  r.mensalidades_geradas = geradas;

  // 4) Limpa sinais com mais de 180 dias
  r.sinais_limpos = (await q('DELETE FROM checkins WHERE created_at < UTC_TIMESTAMP() - INTERVAL 180 DAY')).affectedRows;

  return r;
}

let timer;
function startAutomations() {
  const tick = async () => {
    try {
      await runAutomations();
      await require('./files').cleanupPartial();
    } catch (e) { console.error('automações:', e.message); }
  };
  setTimeout(tick, 5000);
  timer = setInterval(tick, 15 * 60e3);
  timer.unref();
}

module.exports = { runAutomations, startAutomations };
