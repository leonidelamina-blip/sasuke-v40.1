const cfg = require('../config');
const db = require('../lib/db');
const U = require('../lib/utils');
const S = require('../lib/sales');
const { C, T } = require('../lib/cmd');

const numArg = (c) => U.normNum(c.args[0] || (c.targets[0] ? U.num(c.targets[0]) : ''));

exports.commands = [
  T('compras', 'compras', 'Compras no grupo'),

  C(['ativar', 'desativar'], 'admin', 'Ativa/desativa compra em MB livre. Uso: .ativar compra MB  (defina o preco com .editarconfig mbpreco 0.04)', async (c) => {
    const on = c.name === 'ativar';
    if (U.norm(c.args[0]) !== 'compra' || U.norm(c.args[1]) !== 'mb') return c.reply('Uso: .ativar compra MB   ou   .desativar compra MB');
    c.g.on.mbmode = on; db.save();
    await c.reply(on ? `✅ Compra em MB ativada. Preço por MB: ${c.g.cfg.mbpreco || 'NÃO DEFINIDO'}\nDefina com: .editarconfig mbpreco 0.04\nExemplo de cliente: .compra 1847mb`
                     : '❌ Compra em MB desativada.');
  }),

  C('limparhistorico', 'admin', 'Apaga todo o historico de vendas e totais de compradores.', async (c) => {
    const n = c.g.sales.length; c.g.sales = []; c.g.buyers = {}; db.save();
    await c.reply(`🧹 Histórico apagado (${n} vendas).`);
  }),

  C('limpar', 'admin', 'Com numero apaga o historico de UM cliente (.limpar 84xxxxxxx); sem numero limpa o chat.', async (c) => {
    if (!c.args.length && !c.targets.length) return c.sock.sendMessage(c.jid, { text: '\u200E\n'.repeat(60) + '🧹 Chat limpo.' });
    const u = numArg(c);
    if (u.length < 10) return c.reply('Uso: .limpar 84xxxxxxx');
    c.g.sales = c.g.sales.filter(s => s.user !== u); delete c.g.buyers[u]; db.save();
    await c.reply(`🧹 Histórico de ${u} apagado.`);
  }),

  C('limparhistoricomb', 'admin', 'Zera o contador de MB de todos os compradores (ranking).', async (c) => {
    Object.values(c.g.buyers).forEach(b => b.mb = 0); db.save();
    await c.reply('🧹 Contadores de MB zerados.');
  }),

  C('limparhistoricosaldo', 'admin', 'Zera os saldos (carteiras) e o historico de saldo de todos.', async (c) => {
    c.g.wallet = {}; c.g.walletLog = []; db.save();
    await c.reply('🧹 Saldos e histórico de saldo apagados.');
  }),

  C('limparmb', 'admin', 'Zera os MB de UM cliente. Uso: .limparmb 84xxxxxxx', async (c) => {
    const u = numArg(c);
    if (!c.g.buyers[u]) return c.reply('Cliente não encontrado. Uso: .limparmb 84xxxxxxx');
    c.g.buyers[u].mb = 0; db.save();
    await c.reply(`🧹 MB de ${u} zerado.`);
  }),

  C('limparsaldo', 'admin', 'Zera o saldo de UM cliente. Uso: .limparsaldo 84xxxxxxx', async (c) => {
    const u = numArg(c);
    if (u.length < 10) return c.reply('Uso: .limparsaldo 84xxxxxxx');
    c.g.wallet[u] = 0; c.g.walletLog.push({ u, v: 0, at: Date.now(), why: 'saldo zerado' }); db.save();
    await c.reply(`🧹 Saldo de ${u} zerado.`);
  }),

  C('status', 'admin', 'Status do grupo. Subcomandos: .status compra | .status anunciar. O dono, no privado, ve o estado das sessoes.', async (c) => {
    if (!c.isGroup) {
      if (!c.master) return c.reply('ℹ️ Use este comando dentro de um grupo.');
      const ss = require('../lib/sessions');
      const l = Object.values(db.data.sessions).map(s => `${ss.socks.get(s.id)?.user ? '🟢' : '🔴'} ${s.name} · ${s.status} · ${s.until ? (s.until > Date.now() ? U.left(s.until) + 'd' : 'EXPIRADO') : '∞'}`);
      return c.reply('🛰️ *STATUS DAS SESSÕES*\n\n' + l.join('\n'));
    }
    const a = U.norm(c.args[0] || ''), g = c.g;
    const ok = (b) => b ? '✅' : '❌';
    if (a === 'compra') {
      const pend = Object.keys(g.pending).length, falta = S.live(g).filter(s => s.status === 'pago').length;
      return c.reply(`🛒 *STATUS DE COMPRAS*\n\nCompras: ${ok(g.on.compras)}\nCompra em MB: ${ok(g.on.mbmode)} ${g.cfg.mbpreco ? `(${g.cfg.mbpreco} ${cfg.moeda}/MB)` : ''}\nEntrega automática: ${ok(g.on.pagamento)}\nLeitura de comprovativo: ${ok(g.on.comprovativo)}\nAnti-duplicado: ${ok(g.on.antiduplicado)}\nPacotes na tabela: ${Object.keys(g.table).length}\nPedidos aguardando: ${pend}\nPagos, falta enviar: ${falta}`);
    }
    if (a === 'anunciar') {
      const it = Object.entries(g.ann.items);
      return c.reply(`📆 *ANÚNCIOS* ${ok(g.ann.on)}\n\n` + (it.map(([n, x]) => `• ${n} — todos os dias às ${x.time}`).join('\n') || 'Nenhum anúncio.'));
    }
    const f = [['bot', 'Bot'], ['soadmin', 'Só admin'], ['autoreply', 'Autoreply'], ['saudacao', 'Saudação'], ['boasvindas', 'Boas-vindas'],
      ['antilink', 'Anti-link'], ['antipalavra', 'Anti-palavra'], ['antitabela', 'Anti-tabela'], ['antiaudio', 'Anti-áudio'],
      ['antiestrangeiro', `Anti-estrangeiro (+${g.prefix})`], ['anticoncorrencia', 'Anti-concorrência'], ['antiburlador', 'Anti-burlador'], ['semcompra', 'Sem-compra']];
    await c.reply(`⚙️ *STATUS DO GRUPO*\n\n` + f.map(([k, n]) => `${ok(g.on[k] !== false && g.on[k])} ${n}`).join('\n') +
      `\n\n🛒 ${ok(g.on.compras)} Compras · 💳 ${Object.keys(g.pay).length} forma(s) de pagamento\n⚠️ Máx. avisos: ${g.maxavisos}`);
  }, { group: false })
];
