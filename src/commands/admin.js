const cfg = require('../config');
const db = require('../lib/db');
const U = require('../lib/utils');
const guard = require('../lib/guard');
const { C, botAdminMsg } = require('../lib/cmd');

const mention = (ids) => ids.map(i => '@' + U.num(i)).join(' ');
const withTargets = (usage, fn) => async (c) => {
  if (!c.targets.length) return c.reply(`Marque ou responda a pessoa. Ex.: ${usage}`);
  try { await fn(c, c.targets); } catch { await c.reply(botAdminMsg); }
};
const setting = (names, value, msg, desc) => C(names, 'admin', desc, async (c) => {
  try { await c.sock.groupSettingUpdate(c.jid, value); await c.reply(msg); } catch { await c.reply(botAdminMsg); }
});

exports.commands = [
  C('bot', 'admin', 'Mostra ou liga/desliga o bot no grupo. Uso: .bot  |  .bot on/off', async (c) => {
    const a = U.norm(c.args[0] || '');
    if (a === 'on' || a === 'off') { c.g.on.bot = a === 'on'; db.save(); return c.reply(`🤖 Bot ${a === 'on' ? '✅ ligado' : '❌ desligado'} neste grupo.`); }
    await c.reply(`🤖 *${c.S.name}* está ${c.g.on.bot ? '✅ ligado' : '❌ desligado'} neste grupo.\nValidade: ${c.S.until ? U.left(c.S.until) + ' dia(s)' : 'ilimitada'}`);
  }),

  C(['ban', 'kick', 'banir'], 'admin', 'Remove e bane alguem. Uso: .ban @pessoa', withTargets('.ban @pessoa', async (c, t) => {
    for (const j of t) { if (U.isMaster(j)) continue; await guard.banUser(c, j); }
    U.invalidate(c.sock, c.jid); await c.reply('🔨 Removido e banido (não consegue voltar).');
  })),
  C('unban', 'admin', 'Tira alguem da lista de banidos. Uso: .unban @pessoa  ou  .unban 84xxxxxxx', async (c) => {
    const n = c.targets.length ? U.num(c.targets[0]) : U.normNum(c.args[0]);
    if (!c.g.banned.includes(n)) return c.reply('Esse número não está banido. Veja: .banlist');
    c.g.banned = c.g.banned.filter(x => x !== n); db.save(); await c.reply(`✅ ${n} desbanido.`);
  }),
  C('banlist', 'admin', 'Lista os banidos do grupo.', async (c) => c.reply(c.g.banned.length ? '🔨 *BANIDOS*\n' + c.g.banned.map(n => '• ' + n).join('\n') : 'Ninguém banido.')),

  C(['promover'], 'admin', 'Promove a admin. Uso: .promover @pessoa', withTargets('.promover @pessoa', async (c, t) => {
    await c.sock.groupParticipantsUpdate(c.jid, t, 'promote'); await c.reply('⬆️ Promovido a admin.');
  })),
  C(['despromover', 'rebaixar'], 'admin', 'Remove o cargo de admin. Uso: .despromover @pessoa', withTargets('.despromover @pessoa', async (c, t) => {
    await c.sock.groupParticipantsUpdate(c.jid, t.filter(j => !c.g.admfixo.includes(U.num(j))), 'demote'); await c.reply('⬇️ Rebaixado (admins fixos não são rebaixados).');
  })),
  C(['mute', 'mutar'], 'admin', 'Silencia (apaga as mensagens) de alguem. Uso: .mute @pessoa', withTargets('.mute @pessoa', async (c, t) => {
    t.forEach(j => { const n = U.num(j); if (!c.g.muted.includes(n)) c.g.muted.push(n); }); db.save();
    await c.reply('🔇 Silenciado: as mensagens serão apagadas.');
  })),
  C(['unmute', 'desmute', 'desmutar'], 'admin', 'Remove o silencio. Uso: .unmute @pessoa', withTargets('.unmute @pessoa', async (c, t) => {
    const ns = t.map(U.num); c.g.muted = c.g.muted.filter(n => !ns.includes(n)); db.save(); await c.reply('🔊 Liberado.');
  })),

  setting(['abrir', 'open'], 'not_announcement', '🔓 Grupo aberto: todos podem falar.', 'Abre o grupo para todos falarem.'),
  setting(['fechar', 'close', 'fecha'], 'announcement', '🔒 Grupo fechado: só admins falam.', 'Fecha o grupo (so admins falam).'),
  C('grupo', 'admin', 'Abre/fecha o grupo. Uso: .grupo a (abrir) | .grupo f (fechar)', async (c) => {
    const a = U.norm(c.args[0] || '')[0];
    if (a !== 'a' && a !== 'f') return c.reply('Uso: .grupo a  (abrir)   ou   .grupo f  (fechar)');
    try { await c.sock.groupSettingUpdate(c.jid, a === 'a' ? 'not_announcement' : 'announcement'); await c.reply(a === 'a' ? '🔓 Grupo aberto.' : '🔒 Grupo fechado.'); } catch { await c.reply(botAdminMsg); }
  }),

  C(['todos', 'marcar'], 'admin', 'Marca todos os membros. Uso: .todos Mensagem', async (c) => {
    const mt = await U.meta(c.sock, c.jid);
    await c.sock.sendMessage(c.jid, { text: `📢 ${c.args.join(' ') || 'Atenção pessoal!'}`, mentions: mt.participants.map(p => p.id) });
  }),

  C('sobre', 'all', 'Sobre este bot.', async (c) => c.reply(`🤖 *${c.S.name}* · V${cfg.versao} · ${cfg.core}\nBot de gestão e vendas de megas.\n👑 Dono: wa.me/${c.S.ownerPhone || cfg.owners[0]}\n⏳ Validade: ${c.S.until ? U.left(c.S.until) + ' dia(s)' : 'ilimitada'}\n📋 Comandos: ${require('../lib/handler').list.length}\n🆘 Suporte: ${cfg.contato}`)),
  C(['linkgp', 'link'], 'admin', 'Mostra o link de convite do grupo.', async (c) => {
    try { await c.reply('🔗 https://chat.whatsapp.com/' + await c.sock.groupInviteCode(c.jid)); } catch { await c.reply(botAdminMsg); }
  }),
  C('novolink', 'admin', 'Gera um novo link (o antigo deixa de funcionar).', async (c) => {
    try { const code = await c.sock.groupRevokeInvite(c.jid); await c.reply('🔗 Novo link: https://chat.whatsapp.com/' + code); } catch { await c.reply(botAdminMsg); }
  }),
  C('uptime', 'all', 'Tempo que o bot esta ligado.', async (c) => {
    const s = Math.floor(process.uptime()), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
    await c.reply(`⏱️ Online há ${d ? d + 'd ' : ''}${h}h ${m}min`);
  }),
  C('ping', 'all', 'Latencia real, uptime e estado do bot.', async (c) => {
    const t0 = Date.now();
    const sent = await c.raw.sendMessage(c.jid, { text: '⚡ ...' }, { quoted: c.m });
    const ms = Date.now() - t0;
    const s = Math.floor(process.uptime());
    const text = `🏓 *PING*\n\n⚡ Latência: ${ms} ms\n⏳ Uptime: ${Math.floor(s / 86400)}d ${Math.floor(s % 86400 / 3600)}h ${Math.floor(s % 3600 / 60)}m\n🟢 Estado: online\n🌀 Versão: ${cfg.versao} · ${cfg.core}\n💾 RAM: ${Math.round(process.memoryUsage().rss / 1048576)} MB`;
    if (sent && sent.key) { try { return await c.sock.sendMessage(c.jid, { text, edit: sent.key }); } catch {} }
    await c.reply(text);
  }, { group: false }),
  C('horas', 'all', 'Data e hora atuais.', async (c) =>
    c.reply('🕐 ' + new Intl.DateTimeFormat('pt-PT', { timeZone: cfg.tz, dateStyle: 'full', timeStyle: 'short' }).format(Date.now()) + ` (${cfg.tz})`), { group: false }),
  C('id', 'all', 'Mostra o ID do grupo e o seu.', async (c) => c.reply(`🆔 Grupo: ${c.jid}\n👤 Você: ${U.num(c.sender)}`)),

  C('inativos', 'admin', 'Membros sem falar ha X dias. Uso: .inativos [dias]', async (c) => {
    const d = parseInt(c.args[0], 10) || 7;
    const mt = await U.meta(c.sock, c.jid);
    const l = mt.participants.filter(p => !p.admin).map(p => U.num(p.phoneNumber || p.id))
      .filter(n => Date.now() - ((c.g.activity[n] || {}).last || 0) > U.days(d));
    await c.reply(`💤 *INATIVOS (+${d} dias)*: ${l.length}\n\n` + l.slice(0, 40).map(n => '• ' + n).join('\n') + (l.length > 40 ? `\n… e mais ${l.length - 40}` : '') + '\n\nℹ️ Conta apenas mensagens vistas desde que o bot entrou.');
  }),
  C('ativos', 'admin', 'Quem falou nas ultimas 24h.', async (c) => {
    const l = Object.entries(c.g.activity).filter(([, a]) => Date.now() - a.last < U.days(1)).sort((a, b) => b[1].count - a[1].count);
    await c.reply(`🟢 *ATIVOS (24h)*: ${l.length}\n\n` + l.slice(0, 20).map(([n, a], i) => `${i + 1}. ${n} — ${a.count} msgs`).join('\n'));
  }),
  C('online', 'all', 'Quem falou nos ultimos 10 minutos.', async (c) => {
    const l = Object.entries(c.g.activity).filter(([, a]) => Date.now() - a.last < 600000).map(([n]) => n);
    await c.reply(`🟢 *ONLINE (últimos 10 min)*: ${l.length}\n` + l.slice(0, 30).map(n => '• ' + n).join('\n'));
  }),
  C('rank', 'all', 'Ranking dos membros que mais falam.', async (c) => {
    const l = Object.entries(c.g.activity).sort((a, b) => b[1].count - a[1].count).slice(0, 10);
    await c.reply('💬 *RANK DE MENSAGENS*\n\n' + l.map(([n, a], i) => `${['🥇', '🥈', '🥉'][i] || (i + 1) + '°'} ${n} — ${a.count}`).join('\n'));
  }),
  C('admins', 'all', 'Marca os admins do grupo.', async (c) => {
    const mt = await U.meta(c.sock, c.jid); const ids = mt.participants.filter(p => p.admin).map(p => p.id);
    await c.sock.sendMessage(c.jid, { text: '👑 *ADMINS*\n' + mention(ids), mentions: ids });
  }),
  C('membros', 'all', 'Total de membros e admins.', async (c) => {
    const mt = await U.meta(c.sock, c.jid);
    await c.reply(`👥 Membros: ${mt.participants.length}\n👑 Admins: ${mt.participants.filter(p => p.admin).length}`);
  }),
  C('infogp', 'all', 'Informacoes do grupo.', async (c) => {
    const mt = await U.meta(c.sock, c.jid);
    await c.reply(`ℹ️ *${mt.subject}*\n\n👥 Membros: ${mt.participants.length}\n👑 Admins: ${mt.participants.filter(p => p.admin).length}\n📅 Criado: ${mt.creation ? U.dayKey(mt.creation * 1000) : '—'}\n📝 ${mt.desc || 'Sem descrição'}`);
  }),
  C('nome', 'admin', 'Muda o nome do grupo. Uso: .nome Novo Nome', async (c) => {
    const t = c.args.join(' '); if (!t) return c.reply('Uso: .nome Novo Nome');
    try { await c.sock.groupUpdateSubject(c.jid, t); await c.reply('✅ Nome alterado.'); } catch { await c.reply(botAdminMsg); }
  }),
  C('desc', 'admin', 'Muda a descricao do grupo. Uso: .desc Texto', async (c) => {
    const t = c.text.replace(/^\S+\s*/, ''); if (!t) return c.reply('Uso: .desc Texto da descrição');
    try { await c.sock.groupUpdateDescription(c.jid, t); await c.reply('✅ Descrição alterada.'); } catch { await c.reply(botAdminMsg); }
  }),
  C('delete', 'admin', 'Apaga uma mensagem (responda a ela com .delete).', async (c) => {
    const q = U.getQuoted(c.m);
    if (!q) return c.reply('Responda à mensagem que quer apagar com .delete');
    try { await c.sock.sendMessage(c.jid, { delete: { remoteJid: c.jid, fromMe: false, id: q.id, participant: q.participant } }); } catch { await c.reply(botAdminMsg); }
  }),
  C('limparchat', 'admin', 'Empurra o historico para cima com uma mensagem em branco.', async (c) => {
    await c.sock.sendMessage(c.jid, { text: '\u200E\n'.repeat(60) + '🧹 Chat limpo.' });
  }),

  C('config', 'admin', 'Mostra as configuracoes do grupo (e valores como mbpreco).', async (c) => {
    const g = c.g;
    await c.reply(`⚙️ *CONFIG*\n\nprefixo de país: +${g.prefix}\nmáx. avisos: ${g.maxavisos}\nsem-compra: ${g.semDias} dias\nabrir às: ${g.sched.open || '—'} · fechar às: ${g.sched.close || '—'}\n\n*Valores extras (.editarconfig chave valor):*\n` +
      (Object.entries(g.cfg).filter(([k]) => !k.startsWith('hit_')).map(([k, v]) => `• ${k} = ${v}`).join('\n') || '—') + '\n\nChaves úteis: mbpreco, maxavisos');
  }),
  C('editarconfig', 'admin', 'Edita uma configuracao. Uso: .editarconfig mbpreco 0.04', async (c) => {
    const [k, ...v] = c.args;
    if (!k || !v.length) return c.reply('Uso: .editarconfig chave valor\nEx.: .editarconfig mbpreco 0.04');
    const val = v.join(' ');
    if (k === 'maxavisos') c.g.maxavisos = parseInt(val, 10) || c.g.maxavisos; else c.g.cfg[k] = isNaN(val) ? val : Number(val);
    db.save(); await c.reply(`✅ ${k} = ${val}`);
  }),
  C('removerconfig', 'admin', 'Remove uma configuracao. Uso: .removerconfig mbpreco', async (c) => {
    if (!(c.args[0] in c.g.cfg)) return c.reply('Chave não encontrada. Veja .config');
    delete c.g.cfg[c.args[0]]; db.save(); await c.reply(`🗑️ ${c.args[0]} removido.`);
  }),

  C('perfil', 'all', 'Seu perfil no grupo. Uso: .perfil [@pessoa]', async (c) => {
    const u = (c.targets[0] && U.num(c.targets[0])) || U.num(c.sender);
    const a = c.g.activity[u] || { count: 0, last: 0 }, b = c.g.buyers[u] || { count: 0, total: 0, mb: 0 };
    const adm = c.g.admfixo.includes(u) ? '👑 admin fixo\n' : '';
    await c.reply(`👤 *PERFIL ${u}*\n${adm}\n💬 Mensagens: ${a.count}\n🕐 Última: ${a.last ? U.dayKey(a.last) + ' ' + U.hm(a.last) : '—'}\n🛍️ Compras: ${b.count} · ${U.fmtMB(b.mb)}\n💰 Gasto: ${U.fmt(b.total)} ${cfg.moeda}\n💼 Saldo: ${U.fmt(c.g.wallet[u] || 0)} ${cfg.moeda}`);
  }),
  C('foto', 'all', 'Mostra a foto de perfil. Uso: .foto [@pessoa]', async (c) => {
    const j = c.targets[0] || c.sender;
    try { const url = await c.sock.profilePictureUrl(j, 'image'); await c.sock.sendMessage(c.jid, { image: { url }, caption: '🖼️ ' + U.num(j) }, { quoted: c.m }); }
    catch { await c.reply('Essa pessoa não tem foto visível.'); }
  }),

  C('alugueis', 'owner', 'Mostra a validade do bot (a plataforma ve todos os clientes).', async (c) => {
    if (c.master) {
      const l = Object.values(db.data.sessions).map(s => `• ${s.name} (${s.ownerPhone || s.phone || s.id}) — ${s.until ? (s.until > Date.now() ? U.left(s.until) + 'd' : 'EXPIRADO') : '∞'} · ${s.status}`);
      return c.reply('📅 *ALUGUÉIS*\n\n' + l.join('\n'));
    }
    await c.reply(`📅 Validade do bot *${c.S.name}*: ${c.S.until ? (c.S.until > Date.now() ? U.left(c.S.until) + ' dia(s)' : 'EXPIRADO') : 'ilimitada'}\nRenovar: ${cfg.contato}`);
  }, { group: false })
];
