const cfg = require('../config');
const U = require('../lib/utils');
const menu = require('../lib/menu');
const db = require('../lib/db');
const photo = require('../lib/photo');
const { C } = require('../lib/cmd');

async function sendCard(c, nome, numero, titulo) {
  const caption = `${titulo}\n\n👤 *Nome:* ${nome}\n📞 *Número:* ${U.fmtPhone(numero)}\n🔗 wa.me/${numero}\n🤖 *Bot:* ${c.S.name}\n\n💬 Fale com o dono para alugar o bot no seu grupo.`;
  const ph = await photo.owner(c.raw, numero);
  if (ph) await c.sock.sendMessage(c.jid, { ...ph, caption }, { quoted: c.m });
  else await c.reply(caption + '\n\n🥀 Foto não encontrada: assets/dono.jpg.');
  const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${nome}\nTEL;type=CELL;waid=${numero}:${U.fmtPhone(numero)}\nEND:VCARD`;
  await c.raw.sendMessage(c.jid, { contacts: { displayName: nome, contacts: [{ vcard }] } }).catch(() => {});
}

const SC = { all: '👥 todos', admin: '🛡️ admins', owner: '👑 dono do bot', master: '🛰️ plataforma' };
const chunk = (a, n) => a.reduce((r, x, i) => (i % n ? r[r.length - 1].push(x) : r.push([x]), r), []);
const all = () => require('../lib/handler').list;

// blocos <= max caracteres, quebrando entre secoes
function chunks(text, max) {
  const out = []; let cur = '';
  for (const b of text.split('\n\n')) {
    if (cur && (cur + '\n\n' + b).length > max) { out.push(cur); cur = b; } else cur = cur ? cur + '\n\n' + b : b;
  }
  if (cur) out.push(cur);
  return out;
}
const TITULOS = { 'vendas.js': '💰 VENDAS', 'stats.js': '📊 ESTATÍSTICAS', 'compras.js': '🛒 COMPRAS', 'admin.js': '🛡️ ADMIN', 'protecao.js': '🔒 PROTEÇÕES',
  'protecao2.js': '🔒 PROTEÇÕES+', 'auto.js': '🤖 AUTOMAÇÃO', 'gestao.js': '🎯 GESTÃO', 'textos.js': '📝 TEXTOS', 'nano.js': '🧩 NANO', 'permissoes.js': '🔑 PERMISSÕES',
  'mensagens.js': '💬 MENSAGENS', 'anime.js': '🎌 ANIME', 'diversao.js': '🎮 DIVERSÃO', 'teste.js': '🎁 TESTE', 'modelos.js': '🧾 COMPROVATIVO', 'config.js': '⚙️ CONFIG', 'aluguer.js': '💎 ALUGUER', 'donos.js': '👑 DONO', 'info.js': '📚 INFO' };
// menu "compacto" (style-menu 2): gerado a partir dos comandos carregados
function compacto(S, master) {
  const by = {};
  for (const x of all()) { if (x.scope === 'master' && !master) continue; (by[x.file] = by[x.file] || []).push('.' + x.names[0]); }
  const blocos = Object.entries(by).map(([f, l]) => `┌──〔 ${TITULOS[f] || f} 〕\n│ ${l.join(' ')}\n└──────────────`);
  return `🩸 *${S.name}* · V${cfg.versao} · ${cfg.core}\n⏳ Validade: ${S.until ? U.left(S.until) + ' dia(s)' : 'Ilimitada'} · Prefixo: "${cfg.prefix}"\n\n` + blocos.join('\n\n');
}

exports.commands = [
  C(['menu', 'ajuda', 'help'], 'all', 'Mostra o menu completo com a foto do menu.', async (c) => {
    const compact = c.S.menuStyle === 'compacto';
    const completo = compact ? compacto(c.S, c.master) : menu(c.S);
    const ph = await photo.menu(c.raw, c.sid === 'main');
    const max = (cfg.menu && cfg.menu.legendaMax) || 3000;
    // a FOTO do menu leva o inicio do menu na legenda; o resto segue nas mensagens seguintes (a marca d'agua so no fim)
    const partes = chunks(completo, max);
    if (ph) await c.sock.sendMessage(c.jid, { ...ph, caption: partes[0], ...(partes.length > 1 ? { noWm: true } : {}) }, { quoted: c.m });
    else await c.reply(partes[0] + (c.sid === 'main' ? '\n\n🥀 Foto não encontrada: assets/menu.jpg (nenhuma imagem foi enviada).' : ''));
    for (let i = 1; i < partes.length; i++) await c.sock.sendMessage(c.jid, { text: partes[i], ...(i < partes.length - 1 ? { noWm: true } : {}) });
  }, { group: false }),

  C('style-menu', 'owner', 'Troca o estilo do menu. Uso: .style-menu 1 (caixas) | .style-menu 2 (compacto)', async (c) => {
    const a = (c.args[0] || '').trim();
    if (a !== '1' && a !== '2') return c.reply(`🎨 Estilo atual: ${c.S.menuStyle === 'compacto' ? '2 (compacto)' : '1 (caixas)'}\nUse .style-menu 1  ou  .style-menu 2`);
    c.S.menuStyle = a === '2' ? 'compacto' : 'caixa'; db.save();
    await c.reply(`🎨 Menu agora no estilo ${a === '2' ? '2 (compacto)' : '1 (caixas)'}. Teste com .menu`);
  }, { group: false }),

  C(['canal', 'channel'], 'all', 'Mostra o link do canal oficial do bot (unico lugar onde o link aparece, alem do aviso de aluguel expirado).', async (c) =>
    c.reply(`📢 *CANAL OFICIAL*\n\nNovidades, atualizações e avisos do ${c.S.name}:\n${cfg.canal}`), { group: false }),

  C('cmdinfo', 'all', 'Explica um comando. Uso: .cmdinfo compra', async (c) => {
    const n = U.norm((c.args[0] || '').replace(/^\./, ''));
    const cmd = all().find(x => x.names.some(a => U.norm(a) === n));
    if (!n || !cmd) return c.reply('Use: .cmdinfo nome   (ex.: .cmdinfo compra)\nVeja todos com .cmdlist');
    await c.reply(`ℹ️ *.${cmd.names[0]}*\n${cmd.desc}\n\n🔑 Quem usa: ${SC[cmd.scope]}` +
      (cmd.names.length > 1 ? `\n🔁 Apelidos: ${cmd.names.slice(1).map(x => '.' + x).join(' ')}` : ''));
  }, { group: false }),

  C('cmdlist', 'all', 'Lista todos os comandos disponiveis.', async (c) => {
    const names = [...new Set(all().filter(x => x.scope !== 'master' || c.master).map(x => x.names[0]))].sort();
    await c.reply(`📚 *${names.length} comandos*\n\n` + chunk(names, 4).map(r => r.map(n => '.' + n).join('  ')).join('\n') +
      '\n\nDetalhes: .cmdinfo nome');
  }, { group: false }),

  C('dono', 'all', 'Mostra os dados (e a foto) do dono deste bot.', async (c) => {
    const isMain = c.sid === 'main' || (c.S.until > 0 && c.S.until < Date.now());
    await sendCard(c, isMain ? cfg.owner.nome : (c.S.ownerName || 'Dono'), isMain ? cfg.owner.numero : (c.S.ownerPhone || cfg.owner.numero), '👑 DONO');
  }, { group: false }),

  C('criador', 'all', 'Mostra os dados (e a foto) do criador/dono da plataforma.', async (c) =>
    sendCard(c, cfg.owner.nome, cfg.owner.numero, '🛰️ CRIADOR'), { group: false }),

  C('menugestor', 'admin', 'Menu so com os comandos de admin.', async (c) => {
    const names = [...new Set(all().filter(x => x.scope === 'admin').map(x => x.names[0]))].sort();
    await c.reply('🛡️ *MENU GESTOR*\n\n' + chunk(names, 4).map(r => r.map(n => '.' + n).join('  ')).join('\n'));
  }),

  C('menudono', 'owner', 'Menu so com os comandos do dono.', async (c) => {
    const names = [...new Set(all().filter(x => x.scope === 'owner' || (c.master && x.scope === 'master')).map(x => x.names[0]))].sort();
    await c.reply('👑 *MENU DONO*\n\n' + chunk(names, 4).map(r => r.map(n => '.' + n).join('  ')).join('\n') +
      (c.master ? '\n\n🛰️ Plataforma: .conectar 258... 30 Nome · .qrcode 30 Nome' : ''));
  })
];
