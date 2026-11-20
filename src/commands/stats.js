const cfg = require('../config');
const U = require('../lib/utils');
const S = require('../lib/sales');
const { C } = require('../lib/cmd');

const money = (n) => `${U.fmt(n)} ${cfg.moeda}`;
const line = (r, i) => `${S.medal(i)} ${r.user} — ${U.fmtMB(r.mb)} · ${money(r.total)} (${r.count}x)`;
const topPeriod = (p, titulo) => C('top' + p.cmd, 'all', `Top compradores ${titulo}.`, async (c) => {
  const top = S.ranking(S.period(c.g, p.k), 10);
  await c.reply(top.length ? `🏆 *TOP ${titulo.toUpperCase()}*\n\n` + top.map(line).join('\n') : `Sem vendas ${titulo}.`);
});
const who = async (c) => (c.targets[0] && (await c.isAdmin()) && U.num(c.targets[0])) || U.num(c.sender);

exports.commands = [
  C(['resumo'], 'all', 'Resumo geral das vendas do grupo.', async (c) => {
    const v = S.live(c.g), h = S.period(c.g, 'dia');
    await c.reply(`📊 *RESUMO GERAL*\n\n🛍️ Vendas: ${v.length}\n📦 Total: ${U.fmtMB(S.sum(v, s => s.mb))}\n💰 Faturado: ${money(S.sum(v, s => s.price))}\n👥 Clientes: ${new Set(v.map(s => s.user)).size}\n\n📅 Hoje: ${h.length} vendas · ${U.fmtMB(S.sum(h, s => s.mb))} · ${money(S.sum(h, s => s.price))}`);
  }),

  C(['top', 'ranking'], 'all', 'Top 10 compradores de todos os tempos (por MB).', async (c) => {
    const top = Object.entries(c.g.buyers).map(([user, b]) => ({ user, ...b })).filter(b => b.mb > 0 || b.total > 0)
      .sort((a, b) => b.mb - a.mb || b.total - a.total).slice(0, 10);
    await c.reply(top.length ? '🏆 *TOP COMPRADORES*\n\n' + top.map(line).join('\n') : 'Ainda sem compras neste grupo.');
  }),

  C('estatistica', 'all', 'Estatisticas: ticket medio, pacote campeao, melhor dia da semana.', async (c) => {
    const v = S.live(c.g);
    if (!v.length) return c.reply('Ainda sem vendas.');
    const cnt = (f) => { const m = {}; v.forEach(s => { const k = f(s); m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1])[0]; };
    const pk = cnt(s => s.label), wd = cnt(s => U.weekday(s.at));
    await c.reply(`📈 *ESTATÍSTICAS*\n\n🧾 Ticket médio: ${money(S.sum(v, s => s.price) / v.length)}\n📦 Média por venda: ${U.fmtMB(S.sum(v, s => s.mb) / v.length)}\n🥇 Pacote campeão: ${pk[0]} (${pk[1]}x)\n📅 Melhor dia da semana: ${wd[0]} (${wd[1]} vendas)\n💼 Pagos com saldo: ${v.filter(s => s.via === 'saldo').length}\n✅ Enviados: ${v.filter(s => s.status === 'enviado').length}/${v.length}`);
  }),

  C('resumohoje', 'all', 'Resumo das vendas de hoje.', async (c) => {
    const h = S.period(c.g, 'dia');
    const top = S.ranking(h, 3);
    await c.reply(`📅 *HOJE* (${U.dayKey()})\n\n🛍️ Vendas: ${h.length}\n📦 Total: ${U.fmtMB(S.sum(h, s => s.mb))}\n💰 Faturado: ${money(S.sum(h, s => s.price))}\n\n` + (top.length ? top.map(line).join('\n') : 'Sem vendas ainda.'));
  }),

  C('clientes', 'admin', 'Lista os clientes e quantas compras fizeram.', async (c) => {
    const all = Object.entries(c.g.buyers).filter(([, b]) => b.count > 0).sort((a, b) => b[1].count - a[1].count);
    const rec = all.filter(([, b]) => b.count >= 2).length;
    await c.reply(`👥 *CLIENTES*: ${all.length} (🔁 ${rec} recorrentes)\n\n` + (all.slice(0, 20).map(([u, b]) => `• ${u} — ${b.count}x · ${money(b.total)}`).join('\n') || 'Nenhum ainda.'));
  }),

  C('historico', 'all', 'Ultimas compras. Admin ve do grupo; cliente ve as suas. Uso: .historico [@cliente]', async (c) => {
    const adm = await c.isAdmin();
    const u = c.targets[0] && adm ? U.num(c.targets[0]) : (adm ? null : U.num(c.sender));
    const v = S.live(c.g).filter(s => !u || s.user === u).slice(-10).reverse();
    await c.reply(v.length ? `🧾 *HISTÓRICO${u ? ' de ' + u : ''}*\n\n` + v.map(s => `#${s.id} ${U.dayKey(s.at)} ${U.hm(s.at)} · ${s.user} · ${s.label} · ${money(s.price)} ${s.status === 'enviado' ? '✅' : '⏳'}`).join('\n') : 'Sem compras.');
  }),

  C('extrato', 'all', 'Extrato do cliente (compras + saldo). Uso: .extrato [@cliente]', async (c) => {
    const u = await who(c);
    const v = S.live(c.g).filter(s => s.user === u);
    const b = c.g.buyers[u] || { count: 0, total: 0, mb: 0 };
    await c.reply(`📄 *EXTRATO de ${u}*\n\n🛍️ Compras: ${b.count}\n📦 Total: ${U.fmtMB(b.mb)}\n💰 Gasto: ${money(b.total)}\n💼 Saldo: ${money(c.g.wallet[u] || 0)}\n\nÚltimas:\n` + (v.slice(-5).reverse().map(s => `• ${U.dayKey(s.at)} ${s.label} — ${money(s.price)}`).join('\n') || '—'));
  }),

  C('desempenho', 'admin', 'Compara hoje x ontem x media da semana e mostra as metas.', async (c) => {
    const v = S.live(c.g), now = Date.now();
    const ontemKey = U.dayKey(now - U.days(1));
    const hoje = S.sum(S.period(c.g, 'dia'), s => s.mb);
    const ontem = S.sum(v.filter(s => U.dayKey(s.at) === ontemKey), s => s.mb);
    const sem = S.sum(v.filter(s => now - s.at <= U.days(7)), s => s.mb) / 7;
    const arrow = (a, b) => b ? (a >= b ? '📈 +' : '📉 ') + Math.round((a / b - 1) * 100) + '%' : '—';
    let t = `⚡ *DESEMPENHO*\n\nHoje: ${U.fmtMB(hoje)}\nOntem: ${U.fmtMB(ontem)} (${arrow(hoje, ontem)})\nMédia 7 dias: ${U.fmtMB(sem)} (${arrow(hoje, sem)})`;
    for (const [k, n] of [['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês']]) {
      const g = S.goal(c.g, k); if (g) t += `\n\n🎯 Meta ${n}: ${S.bar(g.pct)} ${g.pct}%\n${U.fmtMB(g.done)} / ${U.fmtMB(g.target)}`;
    }
    await c.reply(t);
  }),

  C('picos', 'admin', 'Horarios e dias de maior venda.', async (c) => {
    const v = S.live(c.g);
    if (!v.length) return c.reply('Ainda sem vendas.');
    const top = (f, n) => { const m = {}; v.forEach(s => { const k = f(s); m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n); };
    await c.reply('⏰ *PICOS DE VENDA*\n\nHorários:\n' + top(s => U.hour(s.at), 3).map(([h, n]) => `• ${String(h).padStart(2, '0')}h — ${n} vendas`).join('\n') +
      '\n\nDias:\n' + top(s => U.weekday(s.at), 3).map(([d, n]) => `• ${d} — ${n} vendas`).join('\n'));
  }),

  topPeriod({ cmd: 'dia', k: 'dia' }, 'do dia'),
  topPeriod({ cmd: 'semana', k: 'semana' }, 'da semana (7 dias)'),
  topPeriod({ cmd: 'mes', k: 'mes' }, 'do mês'),

  C('topmelhor', 'all', 'Recordes: melhor cliente, melhor dia e pacote mais vendido.', async (c) => {
    const v = S.live(c.g);
    if (!v.length) return c.reply('Ainda sem vendas.');
    const byDay = {}; v.forEach(s => { const k = U.dayKey(s.at); byDay[k] = (byDay[k] || 0) + s.mb; });
    const best = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];
    const cli = S.ranking(v, 1)[0];
    const pk = {}; v.forEach(s => pk[s.label] = (pk[s.label] || 0) + 1);
    const pkb = Object.entries(pk).sort((a, b) => b[1] - a[1])[0];
    await c.reply(`🏅 *RECORDES*\n\n👑 Melhor cliente: ${cli.user} — ${U.fmtMB(cli.mb)} (${cli.count}x)\n📅 Melhor dia: ${best[0]} — ${U.fmtMB(best[1])}\n📦 Pacote mais vendido: ${pkb[0]} (${pkb[1]}x)`);
  })
];
