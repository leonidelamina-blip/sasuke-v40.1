// Textos configurados POR GRUPO (nada vem por defeito). Cada grupo ve so o que ele mesmo configurou.
const cfg = require('../config');
const db = require('../lib/db');
const U = require('../lib/utils');
const S = require('../lib/sales');
const F = require('../lib/fonte');
const { C } = require('../lib/cmd');

const TIPOS = { pagamento: '💰', contas: '🏦', carteira: '👛', compra: '🛍️', loja: '🛒' };
const body = (c) => c.text.replace(/^\S+\s*/, '').trim();
const quoted = (c) => (U.getQuoted(c.m) || {}).text || '';
const fd = (ms) => `${U.dayKey(ms)} ${U.hm(ms)}`;

exports.commands = [
  // ---- configurar (admin): .setpagamento .setcontas .setcarteira .setcompra .setloja ----
  ...Object.keys(TIPOS).map(t => C('set' + t, 'admin', `Configura o texto "${t}" deste grupo. Uso: .set${t} texto (ou responda a uma mensagem)`, async (c) => {
    const tx = (body(c) || quoted(c)).trim();
    if (!tx) return c.reply(`Falta o conteúdo. Use .set${t} [CONFIGURE-AQUI] ou responda a uma mensagem com .set${t}`);
    if (tx.length > cfg.limiteTexto) return c.reply(`Texto demasiado longo (máx. ${cfg.limiteTexto} caracteres).`);
    c.g.txt[t] = tx; c.g.txtMeta[t] = { por: U.num(c.sender), nome: c.m.pushName || '', em: Date.now() }; db.save();
    await c.reply(`✅ O Sharingan guardou: ${t}.\n⚫ Só este grupo vê esta informação.\n👁️ Use .${t === 'compra' ? 'compra' : t} para ver.`);
  })),

  // ---- consultas (todos) ----
  ...['contas', 'loja'].map(t => C(t, 'all', `Mostra "${t}" configurado neste grupo.`, async (c) =>
    c.g.txt[t] ? c.reply(`${TIPOS[t]} ${F.f(c.g, `*${t.toUpperCase()}*`)}\n\n${c.g.txt[t]}`, { raw: true }) : c.reply(U.nc(t === 'contas' ? 'as contas' : 'a loja')))),

  C('megas', 'all', 'Mostra os megas configurados neste grupo.', async (c) => {
    if (c.g.txt.megas) return c.reply(`📶 ${F.f(c.g, '*MEGAS*')}\n\n${c.g.txt.megas}`, { raw: true });
    const rows = Object.values(c.g.table);
    if (rows.length) return c.reply('📶 *MEGAS*\n\n' + rows.map(r => `▪️ ${r.label} — ${U.fmt(r.price)} ${cfg.moeda}`).join('\n'));
    await c.reply('Pode mandar o valor\nSe precisar da tabela\ndigite: Tabela ou 01\nFormas de pagamento\ndigite: Pagamento ou 02');
  }),

  C('carteira', 'all', 'Mostra a carteira do grupo e o seu saldo. Admin pode ver de outro: .carteira @cliente', async (c) => {
    const u = (c.targets[0] && (await c.isAdmin()) && U.num(c.targets[0])) || U.num(c.sender);
    await c.reply((c.g.txt.carteira ? '👛 *CARTEIRA*\n\n' + c.g.txt.carteira + '\n\n' : '') + `💼 Saldo de ${u}: *${U.fmt(c.g.wallet[u] || 0)} ${cfg.moeda}*\nO saldo é usado automaticamente em .compra.`);
  }),
  C('saldo', 'all', 'Mostra o seu saldo neste grupo.', async (c) => {
    const u = U.num(c.sender);
    await c.reply(`💰 @${u}, o teu saldo neste grupo é: *${U.fmt(c.g.wallet[u] || 0)} ${cfg.moeda}*`, { mentions: [c.sender] });
  }),

  // ---- admin: ver com autor e data ----
  C('verloja', 'admin', 'Mostra a loja guardada, com autor e data.', async (c) => {
    const tx = c.g.txt.loja;
    if (!tx) return c.reply(U.nc('a loja'));
    const m = c.g.txtMeta.loja;
    await c.reply(`🛒 *VER LOJA*\n${m ? `ℹ️ Configurada por ${m.nome || m.por} em ${fd(m.em)} • ${tx.length} caracteres` : `ℹ️ ${tx.length} caracteres`}\n\n${tx}`);
  })
];
