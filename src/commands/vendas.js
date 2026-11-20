const cfg = require('../config');
const db = require('../lib/db');
const U = require('../lib/utils');
const S = require('../lib/sales');
const guard = require('../lib/guard');
const deliver = require('../lib/deliver');
const CP = require('../lib/comprovativo');
const loja = require('../lib/loja');
const F = require('../lib/fonte');
const { C } = require('../lib/cmd');

exports.priority = 60;

// ---------- leitura do comprovativo (SMS M-Pesa / e-Mola colado no grupo) ----------
const KEYWORDS = /(confirmado|transferiste|chave\s*:|id da transac)/i;
function parseReceipt(text) {
  const txid = (text.match(/Chave\s*:\s*([A-Z0-9.\-]+)/i) || text.match(/ID da transac[aã]o\s*[:\-]?\s*([A-Z0-9.]+)/i) || text.match(/Confirmado\s+([A-Z0-9]+)/i) || [])[1];
  if (!txid) return null;
  const amt = (text.match(/Transferiste\s+([\d.,]+)\s*MT/i) || text.match(/Valor\s*:?\s*([\d.,]+)\s*MT/i) || text.match(/(\d+[.,]\d{2})\s*MT/i) || [])[1];
  const account = (text.match(/\bpara\s+(?:a\s+)?(?:conta\s+)?\+?(?:258)?(\d{9})\b/i) || text.match(/conta\s+(?:258)?(\d{6,9})\b/i) || [])[1];
  const nome = (text.match(/nome\s*:\s*([^,.\n]+)/i) || text.match(/\s-\s+([^\n\-]{3,40}?)\s+aos\b/i) || [])[1];
  const nums = [...text.matchAll(/(?<!\d)(?:258)?(8[2-7]\d{7})(?!\d)/g)].map(m => m[1]).filter(n => n !== account);
  return {
    txid: txid.replace(/[.\-]$/, '').toUpperCase(), amount: amt ? parseFloat(amt.replace(',', '.')) : null, account,
    nome: nome && nome.trim(), receiver: nums[0] || null, provedor: /id da transac|e-?mola/i.test(text) ? 'E-Mola' : 'M-Pesa'
  };
}

async function goalsCheck(c) {
  for (const p of ['dia', 'semana', 'mes']) {
    const gl = S.goal(c.g, p);
    const k = 'hit_' + p;
    if (gl && gl.done >= gl.target && c.g.cfg[k] !== U.dayKey()) {
      c.g.cfg[k] = U.dayKey();
      await c.sock.sendMessage(c.jid, { text: `🎯 *Meta ${p === 'mes' ? 'mensal' : p === 'dia' ? 'do dia' : 'da semana'} atingida!* ${U.fmtMB(gl.done)} / ${U.fmtMB(gl.target)} 🔥` });
    }
  }
}

async function paid(c, user, order, txid, via) {
  const { sock, jid, g } = c;
  const sale = S.registerSale(g, user, order, txid, via);
  const b = g.buyers[user];
  const rank = Object.entries(g.buyers).sort((x, y) => y[1].mb - x[1].mb).findIndex(([u]) => u === user) + 1;
  const r = g.on.pagamento ? await deliver({ number: order.number, mb: sale.mb, label: sale.label }) : { manual: true };
  const delivered = !!(r && r.ok && !r.manual);
  if (delivered) sale.status = 'enviado';
  await sock.sendMessage(jid, {
    text: `✅ *Pagamento confirmado!*\n📦 ${sale.label} → ${order.number}\n` +
      (delivered ? '🚀 Megas enviados!' : '⏳ Um admin vai enviar os megas em instantes.') +
      `\n\n🛍️ Compra n° ${b.count} · Total: ${U.fmt(b.total)} ${cfg.moeda}\n🏆 Posição no ranking: ${rank}°`,
    mentions: [U.jidOf(user)]
  });
  if (!delivered) await S.notifyAdmins(c, `💰 Pedido #${sale.id} pago: ${sale.label} → ${order.number} (@${user}).\nDepois de enviar use *.enviar @${user}*`);
  await goalsCheck(c);
  db.save();
}

// A transferir: regista a venda e entrega (automatica se .pagamento on; senao um admin envia)
async function concluir(c, user, rc, pacote, numero) {
  c.g.txids.push(rc.txid); delete c.g.pendingRc[user];
  await c.sock.sendMessage(c.jid, { text: '⏳ A transferir...', mentions: [c.sender] });
  await paid(c, user, { label: pacote.label, price: pacote.price, mb: pacote.mb, number: numero }, rc.txid, 'comprovativo');
}

// DETECTOR DE COMPROVATIVO (M-Pesa / E-Mola). Sem nomes nem numeros fixos; mensagens PERSONALIZAVEIS por grupo (.setcomprovativo .setaguarde .setagradecimento).
//   fluxo padrao: detecta -> "aguarde, o adm confirma" -> o admin regista com  .compra 512MB  (respondendo ao cliente)
//   com pedido (.compra 5gb do cliente) ou com .pagamento on (entrega automatica): "A transferir..." e a venda e registada sozinha
exports.onMessage = async (c) => {
  const { sock, m, jid, sender, text, g } = c;
  if (!g.on.comprovativo || text.startsWith(cfg.prefix)) return false;
  const user = U.num(sender);
  const say = (t) => sock.sendMessage(jid, { text: t, mentions: [sender] }, { quoted: m });
  const enviar = async (chave, mapa) => sock.sendMessage(jid, { text: CP.render(g, chave, mapa, await loja.nomeGrupo(c)), mentions: [sender], raw: true }, { quoted: m });

  // o cliente ja mandou o comprovativo e agora envia so o numero que recebe os megas
  const pend = g.pendingRc[user];
  const soNumero = text.match(/^\s*(?:\+?258)?\s*(8[2-7]\d{7})\s*$/);
  if (pend && soNumero && Date.now() - pend.at < 10 * 60000) {
    const numero = U.normNum(soNumero[1]);
    if (pend.manual) {
      delete g.pendingRc[user]; if (g.recibos[user]) g.recibos[user].numero = numero; db.save();
      await sock.sendMessage(jid, { text: `${F.f(g, '📦 *Número para receber:*')} ${numero}`, mentions: [sender], raw: true }, { quoted: m });
      await enviar('aguarde', { CLIENTE: '@' + user, PROVEDOR: pend.provedor, CHAVE: pend.txid, DESTINO: pend.destino, VALOR: pend.valor != null ? U.fmt(pend.valor) + ' MT' : '—', HORA: U.hm(), NUMERO: numero });
      return true;
    }
    await concluir(c, user, { txid: pend.txid }, pend.pacote, numero);
    return true;
  }

  if (!KEYWORDS.test(text)) return false;
  const rc = parseReceipt(text);
  if (!rc) return false;
  const accs = [...S.payList(g).map(p => p.num), ...(g.conf.nums || [])];

  if (g.on.antiduplicado && g.txids.includes(rc.txid)) {
    await say('🚫 Esse comprovativo já foi usado antes.');
    if (g.on.antiburlador) await guard.punish(c, 'burla', 'comprovativo repetido (tentativa de burla)', { keep: true });
    return true;
  }
  if (accs.length && rc.account && !accs.includes(rc.account)) {
    await say(`🚫 A conta de destino (${rc.account}) não é a deste grupo.`);
    if (g.on.antiburlador) await guard.punish(c, 'burla', 'comprovativo de outra conta', { keep: true });
    return true;
  }
  const destinoOk = accs.length > 0 && !!rc.account && accs.includes(rc.account);
  const dono = g.conf.dono || rc.nome || 'conta do grupo';
  const order = g.pending[user];
  let pacote = order ? { label: order.label, price: order.price, mb: order.mb } : null;
  if (!pacote && rc.amount != null) {
    const p = Object.values(g.table).find(r => Math.abs(r.price - rc.amount) < 0.001);
    if (p) pacote = { label: p.label, price: p.price, mb: p.mb || U.parseMB(p.label) };
  }
  const auto = !!g.on.pagamento;
  const numero = rc.receiver ? U.normNum(rc.receiver) : (order && order.number) || null;
  const info = {
    CLIENTE: '@' + user, PROVEDOR: rc.provedor, CHAVE: rc.txid, DESTINO: dono,
    DESTINO_LINHA: destinoOk ? `${F.f(g, '🏦 *Destino validado:*')} ${dono}` : `${F.f(g, '⚠️ *Destino não validado*')}${accs.length ? '' : ' ' + F.f(g, '(este grupo ainda não configurou o pagamento)')}`,
    VALOR: rc.amount != null ? U.fmt(rc.amount) + ' MT' : '—', HORA: U.hm(), NUMERO: numero || F.f(g, '❓ envie o número que vai receber os megas')
  };
  await enviar('detectado', info);

  if (!destinoOk) { await S.notifyAdmins(c, `⚠️ Comprovativo de @${user} (${rc.txid}) sem destino validado. Confira antes de enviar.`); return true; }
  if (order && rc.amount !== null && Math.abs(rc.amount - order.price) > 0.001) {
    await say(`⚠️ Valor pago (${U.fmt(rc.amount)} ${cfg.moeda}) diferente do pedido (${U.fmt(order.price)} ${cfg.moeda}). Um admin vai conferir.`);
    await S.notifyAdmins(c, `⚠️ Divergência de valor de @${user}: pagou ${U.fmt(rc.amount)}, pedido ${U.fmt(order.price)}.`);
    return true;
  }
  if (order || (auto && pacote)) {            // pedido do cliente, ou entrega automatica ligada
    if (!numero) { g.pendingRc[user] = { txid: rc.txid, pacote, at: Date.now() }; db.save(); return true; }
    await concluir(c, user, rc, pacote, numero);
    return true;
  }
  // FLUXO PADRAO: o admin confirma e regista com  .compra 512MB  respondendo ao cliente
  g.txids.push(rc.txid);
  g.recibos[user] = { txid: rc.txid, valor: rc.amount, numero, provedor: rc.provedor, at: Date.now() };
  if (!numero) { g.pendingRc[user] = { manual: true, txid: rc.txid, provedor: rc.provedor, valor: rc.amount, destino: dono, at: Date.now() }; db.save(); return true; }
  db.save();
  await enviar('aguarde', info);
  return true;
};

// ADMIN: .compra 512MB  (respondendo ao cliente ou marcando @cliente) -> regista a compra e agradece com as estatisticas
async function registarCompraAdmin(c) {
  const { g, reply } = c;
  const alvo = c.targets[0], user = U.num(alvo);
  const arg = c.args.find(a => U.parseMB(a));
  if (!arg) return reply('Uso: .compra 512MB  (responda ao comprovativo do cliente ou marque @cliente)');
  const mb = U.parseMB(arg), p = S.priceFor(g, arg), rec = g.recibos[user];
  const quantidade = arg.toUpperCase().replace(',', '.');
  const sale = S.registerSale(g, user, { label: p ? p.label : quantidade, price: p ? p.price : 0, mb, number: (rec && rec.numero) || user }, (rec && rec.txid) || 'ADM-' + Date.now(), 'admin');
  sale.status = 'enviado'; delete g.recibos[user]; db.save();
  const mapa = CP.mapaAgradecimento(g, user, quantidade, '@' + user);
  await c.sock.sendMessage(c.jid, { text: CP.render(g, 'agradecimento', mapa, await loja.nomeGrupo(c)), mentions: [alvo], raw: true }, { quoted: c.m });
  await goalsCheck(c);
}

const target = (c) => { const t = c.targets[0]; return t && U.num(t); };

exports.commands = [
  C(['tabela'], 'all', 'Mostra a tabela de pacotes e precos.', async (c) => {
    const { g, reply } = c;
    if (g.tableText) return reply(g.tableText, { raw: true });   // texto do grupo: intacto
    const rows = Object.values(g.table);
    if (!rows.length) return reply(U.nc('a tabela'));
    await reply('📦 *TABELA DE MEGAS*\n\n' + rows.map(r => `▪️ ${r.label} — ${U.fmt(r.price)} ${cfg.moeda}`).join('\n') + '\n\nPara comprar: .compra <pacote> [numero]');
  }),

  C('setmegas', 'admin', 'Define a tabela. Uso: .setmegas 1GB=45, 2GB=80, 5GB=190', async (c) => {
    const body = c.text.replace(/^\S+\s*/, '');
    const table = {};
    for (const part of body.split(/[,\n]+/)) {
      const [label, price] = part.split('=').map(s => s && s.trim());
      if (label && price && !isNaN(parseFloat(price))) table[S.key(label)] = { label, price: parseFloat(price), mb: U.parseMB(label) };
    }
    if (!Object.keys(table).length) {
      const tx = (body || (U.getQuoted(c.m) || {}).text || '').trim();
      if (!tx) return c.reply('Falta o conteúdo. Use .setmegas [CONFIGURE-AQUI] (ou 1GB=45, 2GB=80 para criar pacotes) ou responda a uma mensagem.');
      c.g.txt.megas = tx; c.g.txtMeta.megas = { por: U.num(c.sender), nome: c.m.pushName || '', em: Date.now() }; db.save();
      return c.reply('✅ Texto de megas guardado. Só este grupo vê. Use .megas para ver.');
    }
    c.g.table = table; c.g.tableText = ''; db.save();
    await c.reply(`✅ Tabela salva com ${Object.keys(table).length} pacotes.`);
  }),

  C(['pagamento', 'payment', 'm-pesa'], 'all', 'Mostra as formas de pagamento. Admin: .pagamento on/off liga a entrega automatica.', async (c) => {
    const a = U.norm(c.args[0] || '');
    if (a === 'on' || a === 'off') {
      if (!(await c.isAdmin())) return c.reply('🚫 Só admins.');
      c.g.on.pagamento = a === 'on'; db.save();
      return c.reply(`⚡ Entrega automática ${a === 'on' ? 'ligada (usa lib/deliver.js)' : 'desligada: o admin envia com .enviar'}.`);
    }
    const info = S.payInfo(c.g);
    await c.reply(info ? '💳 *FORMAS DE PAGAMENTO*\n\n' + info : U.nc('o pagamento'));
  }),

  C(['compra', 'comprar'], 'all', 'Faz um pedido. Uso: .compra 5gb [numero]', async (c) => {
    const { g, args, sender, reply } = c;
    if (g.on.compras === false) return reply('🚫 As compras estão desativadas no momento.');
    const sub = U.norm(args[0] || '');
    const dados = Object.entries(g.buyers).map(([user, b]) => ({ user, ...b })).filter(b => b.count > 0 || b.mb > 0);
    if (sub === 'meus') {
      const b = g.buyers[U.num(sender)];
      if (!b || !b.count) return reply('🥀 Ainda não tens compras registadas neste grupo. Usa .compra <pacote>.');
      const rk = dados.sort((x, y) => y.mb - x.mb).findIndex(r => r.user === U.num(sender)) + 1;
      const ult = S.live(g).filter(s => s.user === U.num(sender)).slice(-5).reverse().map(s => `🔥 • ${s.label} (${U.dayKey(s.at)})`);
      return reply(`🩸 *MEUS COMPRAS*\n\nTotal acumulado: ${U.fmtMB(b.mb)}\nCompras: ${b.count}\n👑 Posição: nº ${rk} de ${dados.length}\n\n${ult.join('\n')}`);
    }
    if (sub === 'ranking' || sub === 'picos') {
      const top = dados.sort((x, y) => y.mb - x.mb).slice(0, 10);
      return reply(top.length ? '🏆 *RANKING DE COMPRADORES*\n\n' + top.map((r, i) => `${i === 0 ? '👑' : '🩸'} ${i + 1}. ${r.user} — ${U.fmtMB(r.mb)} (${r.count}x)`).join('\n') : '🥀 Ninguém comprou ainda neste grupo.');
    }
    if (args.length && c.targets.length && !['meus', 'ranking', 'picos'].includes(sub) && (await c.isAdmin())) return registarCompraAdmin(c);
    if (!args.length) return reply(g.txt.compra ? '🛍️ *COMPRA*\n\n' + g.txt.compra : U.nc('a compra'));
    const p = S.priceFor(g, args[0]);
    if (!p) return reply('Pacote não encontrado. Veja a lista com .tabela' + (g.on.mbmode ? '\nVocê também pode pedir em MB, ex.: .compra 1847mb' : ''));
    const user = U.num(sender);
    const number = U.normNum(args[1] || user);
    const order = { label: p.label, price: p.price, mb: p.mb, number, at: Date.now() };
    if ((g.wallet[user] || 0) >= p.price) {
      g.wallet[user] -= p.price;
      g.walletLog.push({ u: user, v: -p.price, at: Date.now(), why: 'compra ' + p.label });
      await reply(`💼 Pago com o seu saldo. Restante: ${U.fmt(g.wallet[user])} ${cfg.moeda}`);
      return paid(c, user, order, 'SALDO-' + Date.now(), 'saldo');
    }
    g.pending[user] = order; db.save();
    await reply(`🛒 Pedido: *${p.label}* → ${number}\n💰 Valor: ${U.fmt(p.price)} ${cfg.moeda}\n\n${S.payInfo(g) || U.nc('o pagamento')}\n\nDepois de pagar, cole aqui o comprovativo (SMS).` + (g.txt.compra ? '\n\n' + g.txt.compra : ''));
  }),

  C('enviar', 'admin', 'Marca o pedido como enviado e avisa o cliente. Uso: .enviar @cliente', async (c) => {
    const u = target(c);
    const sale = u && [...S.live(c.g)].reverse().find(s => s.user === u && s.status === 'pago');
    if (!sale) return c.reply('Marque (ou responda) o cliente que tem pedido pago aguardando envio. Ex.: .enviar @cliente');
    sale.status = 'enviado'; db.save();
    await c.sock.sendMessage(c.jid, { text: `📦 *Megas enviados!* @${u}\n${sale.label} → ${sale.number}\nObrigado pela compra! 🙏`, mentions: [U.jidOf(u)] });
  }),

  C('rejeitar', 'admin', 'Rejeita um pedido/pagamento. Uso: .rejeitar @cliente [motivo]', async (c) => {
    const u = target(c);
    if (!u) return c.reply('Marque o cliente. Ex.: .rejeitar @cliente motivo');
    const motivo = c.args.filter(a => !a.startsWith('@') && !/^\d{8,}$/.test(a)).join(' ') || 'não especificado';
    const sale = [...S.live(c.g)].reverse().find(s => s.user === u && s.status === 'pago');
    if (sale) S.voidSale(c.g, sale);
    delete c.g.pending[u]; db.save();
    await c.sock.sendMessage(c.jid, { text: `❌ Pedido de @${u} rejeitado.\nMotivo: ${motivo}`, mentions: [U.jidOf(u)] });
  }),

  C('anular', 'admin', 'Anula a ultima venda de um cliente (desfaz estatisticas). Uso: .anular @cliente. O dono da plataforma, no privado, anula um aluguel: .anular <numero|id>', async (c) => {
    if (!c.isGroup && !c.master) return c.reply('ℹ️ Use este comando dentro de um grupo.');
    if (c.master && c.args[0] && !c.isGroup) {
      const ss = require('../lib/sessions').find(c.args[0]);
      if (ss && ss.id !== 'main') { ss.until = Date.now() - 1000; db.save(); return c.reply(`🗑️ Aluguel de *${ss.name}* anulado: o bot foi congelado. Renove com .alugar.`); }
      return c.reply('Sessão não encontrada. Veja .sessoes');
    }
    const u = target(c);
    const sale = u && [...S.live(c.g)].reverse()[0] && [...S.live(c.g)].reverse().find(s => s.user === u);
    if (!sale) return c.reply('Marque o cliente. Ex.: .anular @cliente');
    S.voidSale(c.g, sale);
    await c.reply(`🗑️ Venda #${sale.id} (${sale.label}) anulada. Estatísticas corrigidas.`);
  }, { group: false }),

  C('relatorio', 'admin', 'Relatorio de pedidos pendentes e pagos aguardando envio.', async (c) => {
    const pend = Object.entries(c.g.pending).map(([u, o]) => `• ${u} — ${o.label} → ${o.number}`);
    const falta = S.live(c.g).filter(s => s.status === 'pago').map(s => `• #${s.id} ${s.user} — ${s.label} → ${s.number}`);
    const hoje = S.period(c.g, 'dia');
    await c.reply(`📋 *RELATÓRIO*\n\n⏳ Aguardando pagamento (${pend.length}):\n${pend.join('\n') || '—'}\n\n📦 Pagos, falta enviar (${falta.length}):\n${falta.join('\n') || '—'}\n\n📅 Hoje: ${hoje.length} vendas · ${U.fmtMB(S.sum(hoje, s => s.mb))} · ${U.fmt(S.sum(hoje, s => s.price))} ${cfg.moeda}`);
  }),

  C(['deposit', 'depositar'], 'admin', 'Adiciona saldo a um cliente. Uso: .deposit @cliente 100', async (c) => {
    const u = target(c);
    const v = parseFloat((c.args.find(a => /^\d+([.,]\d+)?$/.test(a) && a.replace(/\D/g, '').length < 8) || '').replace(',', '.'));
    if (!u || !v) return c.reply('Uso: .deposit @cliente 100');
    c.g.wallet[u] = (c.g.wallet[u] || 0) + v;
    c.g.walletLog.push({ u, v, at: Date.now(), why: 'deposito' }); db.save();
    await c.reply(`💼 +${U.fmt(v)} ${cfg.moeda} para ${u}. Saldo: ${U.fmt(c.g.wallet[u])} ${cfg.moeda}`);
  })
];
