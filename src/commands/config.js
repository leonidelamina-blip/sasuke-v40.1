// CONFIGURACAO POR GRUPO: tudo guardado pelo ID do grupo (nunca global).
const cfg = require('../config');
const db = require('../lib/db');
const U = require('../lib/utils');
const vars = require('../lib/vars');
const A = require('../lib/aluguer');
const { C } = require('../lib/cmd');

const body = (c) => c.text.replace(/^\S+\s*/, '').trim() || (U.getQuoted(c.m) || {}).text || '';
const setter = (cmd, chave, rotulo, uso, extra) => C(cmd, 'admin', `Define ${rotulo} DESTE grupo. Uso: ${uso}`, async (c) => {
  const t = body(c).trim();
  if (!t) return c.reply(`Falta o conteúdo. Uso: ${uso}`);
  if (t.length > cfg.limiteTexto) return c.reply(`Texto demasiado longo (máx. ${cfg.limiteTexto} caracteres).`);
  c.g.conf[chave] = t; if (extra) extra(c.g, t); db.save();
  await c.reply(`✅ ${rotulo[0].toUpperCase() + rotulo.slice(1)} deste grupo guardado: ${t.length > 80 ? t.slice(0, 80) + '…' : t}`);
});

exports.commands = [
  setter('setdono', 'dono', 'o nome do dono', '.setdono Nome do dono'),
  setter('setnumero', 'numero', 'o número / M-Pesa / E-Mola', '.setnumero M-Pesa 84xxxxxxx · E-Mola 87xxxxxxx',
    (g, t) => { g.conf.nums = [...new Set([...t.matchAll(/(?<!\d)(?:258)?(8[2-7]\d{7})(?!\d)/g)].map(m => m[1]))]; }),
  setter('setnome', 'nome', 'o nome da loja', '.setnome NOME_DA_LOJA'),
  setter('setsuporte', 'suporte', 'o número de suporte', '.setsuporte 84xxxxxxx'),

  C('setilimitado', 'admin', 'Define a tabela de ilimitado DESTE grupo. Uso: .setilimitado texto', async (c) => {
    const t = body(c).trim();
    if (!t) return c.reply('Falta o conteúdo. Uso: .setilimitado [texto da tabela de ilimitado]');
    c.g.txt.ilimitado = t; db.save();
    await c.reply('✅ Tabela de ilimitado deste grupo guardada. Os clientes veem com: ilimitado ou 04');
  }),

  C('fonte', 'admin', 'Liga/desliga a fonte estilizada (𝗲𝘀𝘀𝗮) nas mensagens do bot NESTE grupo. Uso: .fonte on/off', async (c) => {
    const a = U.norm(c.args[0] || '');
    if (a !== 'on' && a !== 'off') return c.reply(`Fonte do bot neste grupo: ${c.g.on.fonte !== false ? '✅ ligada' : '❌ desligada'}\nUse .fonte on/off`);
    c.g.on.fonte = a === 'on'; db.save();
    await c.reply(`Fonte do bot ${a === 'on' ? '✅ ligada' : '❌ desligada'} neste grupo.`);
  }),

  C('verconfig', 'admin', 'Mostra a configuração atual DESTE grupo.', async (c) => {
    const g = c.g, ok = (b) => b ? '✅' : '❌ não configurado';
    const e = c.sid === 'main' ? A.estado(g) : { st: 'ativo' };
    const aluguer = e.st === 'sem' ? '❌ sem aluguer' : e.st === 'expirado' ? '⛔ expirado' : e.infinito ? '♾️ sem expiração' : `${g.rent && g.rent.trial ? '🎁 teste · ' : ''}${e.dias} dia(s)`;
    const nanos = Object.keys(g.nano.comandos).length;
    await c.reply(`⚙️ *CONFIGURAÇÃO DESTE GRUPO*\n\n🏪 Loja: ${g.conf.nome || '❌ (.setnome)'}\n👤 Dono: ${g.conf.dono || '❌ (.setdono)'}\n📱 Número: ${g.conf.numero || '❌ (.setnumero)'}\n🆘 Suporte: ${g.conf.suporte || '❌ (.setsuporte)'}\n\n📦 Tabela: ${ok(g.tableText || Object.keys(g.table).length)}${Object.keys(g.table).length ? ` (${Object.keys(g.table).length} pacotes)` : ''}\n💳 Pagamento: ${ok(vars.pagamentoTexto(g))}\n📶 Megas: ${g.txt.megas ? '✅ texto próprio' : 'padrão'}\n♾️ Ilimitado: ${ok(g.txt.ilimitado)}\n👋 Boas-vindas: ${g.on.boasvindas === false ? '❌ desligada' : g.texts.boas ? '✅ personalizada' : '✅ padrão'}\n🧩 Nanos: ${nanos}\n💎 Aluguer: ${aluguer}\n\nCada grupo tem a sua própria configuração.`);
  }),

  C('limparconfig', 'admin', 'Limpa a configuração DESTE grupo (loja, dono, número, suporte, tabela, pagamento, textos). Não apaga vendas nem nanos.', async (c) => {
    const g = c.g;
    g.conf = {}; g.tableText = ''; g.table = {}; g.pay = {}; g.txt = {}; g.txtMeta = {};
    for (const k of ['boas', 'saida', 'saudacao', 'nano']) delete g.texts[k];
    db.save();
    await c.reply('🧹 Configuração deste grupo limpa (loja, dono, número, suporte, tabela, pagamento e textos). Vendas e nanos foram mantidos.');
  })
];
