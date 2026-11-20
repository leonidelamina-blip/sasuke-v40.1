const cfg = require('../config');
const db = require('../lib/db');
const U = require('../lib/utils');
const S = require('../lib/sales');
const { C, T, botAdminMsg } = require('../lib/cmd');

const PER = { dia: 'dia', semana: 'semana', mensal: 'mes' };
const goalCmds = Object.entries(PER).flatMap(([n, k]) => [
  C('definirmeta' + n, 'admin', `Define a meta (${n}). Uso: .definirmeta${n} 10GB`, async (c) => {
    const mb = U.parseMB(c.args.join('') || '');
    if (!mb) return c.reply(`Uso: .definirmeta${n} ${n === 'dia' ? '1GB' : n === 'semana' ? '10GB' : '50GB'}`);
    c.g.goals[k] = mb; db.save(); await c.reply(`🎯 Meta ${n}: ${U.fmtMB(mb)}`);
  }),
  C('vermeta' + n, 'admin', `Mostra o progresso da meta (${n}).`, async (c) => {
    const g = S.goal(c.g, k);
    await c.reply(g ? `🎯 *Meta ${n}*\n${S.bar(g.pct)} ${g.pct}%\n${U.fmtMB(g.done)} / ${U.fmtMB(g.target)}` : `Sem meta ${n}. Use .definirmeta${n}`);
  }),
  C('apagarmeta' + n, 'admin', `Apaga a meta (${n}).`, async (c) => { delete c.g.goals[k]; db.save(); await c.reply(`🗑️ Meta ${n} apagada.`); })
]);

// ---------- sem compra ----------
async function semCompra(c) {
  const mt = await U.meta(c.sock, c.jid);
  const last = {}; S.live(c.g).forEach(s => last[s.user] = Math.max(last[s.user] || 0, s.at));
  const out = [];
  for (const p of mt.participants) {
    if (p.admin) continue;
    const n = U.num(p.phoneNumber || p.id);
    if (U.num(c.sock.user?.id || '') === n || c.g.admfixo.includes(n)) continue;
    if (!c.g.joined[n]) c.g.joined[n] = Date.now();
    const ref = last[n] || c.g.joined[n];
    if (Date.now() - ref > U.days(c.g.semDias)) out.push({ n, jid: p.phoneNumber || p.id, dias: Math.floor((Date.now() - ref) / 864e5) });
  }
  c.g.semList = out; db.save();
  return out;
}
async function removeList(c, list, ban) {
  let ok = 0;
  for (const x of list) {
    try { await c.sock.groupParticipantsUpdate(c.jid, [x.jid], 'remove'); ok++; if (ban && !c.g.banned.includes(x.n)) c.g.banned.push(x.n); await U.sleep(1200); } catch {}
  }
  db.save(); U.invalidate(c.sock, c.jid);
  return ok;
}

exports.tick = async ({ sock, jid, g }) => {
  const hm = U.hm(), dk = U.dayKey();
  // anuncios diarios
  if (g.ann.on) for (const [nome, it] of Object.entries(g.ann.items))
    if (it.time === hm && it.last !== dk) { it.last = dk; db.save(); await sock.sendMessage(jid, { text: it.text }).catch(() => {}); }
  // abrir / fechar por horario
  for (const [k, setting, msg] of [['open', 'not_announcement', '🔓 Grupo aberto automaticamente.'], ['close', 'announcement', '🔒 Grupo fechado automaticamente.']])
    if (g.sched[k] === hm && g.sched['last' + k] !== dk) {
      g.sched['last' + k] = dk; db.save();
      await sock.groupSettingUpdate(jid, setting).then(() => sock.sendMessage(jid, { text: msg })).catch(() => {});
    }
  // sem-compra automatico (1x por dia, 04:00)
  if (g.on.semcompra && hm === '04:00' && g.lastSem !== dk) {
    g.lastSem = dk;
    const c = { sock, jid, g };
    const l = await semCompra(c).catch(() => []);
    if (l.length) { const ok = await removeList(c, l, false); await sock.sendMessage(jid, { text: `👥 Sem-compra: ${ok} membro(s) sem comprar há mais de ${g.semDias} dias foram removidos.` }).catch(() => {}); }
  }
};

exports.commands = [
  ...goalCmds,
  C('vermetas', 'admin', 'Mostra o progresso de todas as metas.', async (c) => {
    const l = [['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês']].map(([k, n]) => { const g = S.goal(c.g, k); return g ? `🎯 ${n}: ${S.bar(g.pct)} ${g.pct}% (${U.fmtMB(g.done)}/${U.fmtMB(g.target)})` : `▫️ ${n}: sem meta`; });
    await c.reply('🎯 *METAS*\n\n' + l.join('\n'));
  }),

  T('semcompra', 'semcompra', 'Remoção automática de quem não compra'),
  C('semcompratime', 'admin', 'Dias sem comprar para entrar na lista. Uso: .semcompratime 7', async (c) => {
    const n = parseInt(c.args[0], 10);
    if (!n) return c.reply(`Atual: ${c.g.semDias} dias. Uso: .semcompratime 7`);
    c.g.semDias = n; db.save(); await c.reply(`⏳ Sem-compra: ${n} dia(s).`);
  }),
  C('listasemcompra', 'admin', 'Lista membros que nao compram ha X dias (admins ficam de fora).', async (c) => {
    const l = await semCompra(c);
    await c.reply(l.length ? `👥 *SEM COMPRA (+${c.g.semDias} dias)*\n\n` + l.slice(0, 50).map((x, i) => `${i + 1}. ${x.n} — ${x.dias}d`).join('\n') + '\n\nRemover: .semcomprarm 1,2  ou  .semcompraban' : `✅ Ninguém está há mais de ${c.g.semDias} dias sem comprar.`);
  }),
  C('semcomprarm', 'admin', 'Remove da lista pelos numeros. Uso: .semcomprarm 1,2', async (c) => {
    const idx = (c.args.join(',').match(/\d+/g) || []).map(Number);
    const l = idx.map(i => c.g.semList[i - 1]).filter(Boolean);
    if (!l.length) return c.reply('Use .listasemcompra primeiro. Depois: .semcomprarm 1,2');
    await c.reply(`🧹 ${await removeList(c, l, false)} removido(s).`);
  }),
  C('semcompraban', 'admin', 'Remove e bane TODOS da lista sem-compra.', async (c) => {
    const l = await semCompra(c);
    if (!l.length) return c.reply('Lista vazia.');
    await c.reply(`🔨 ${await removeList(c, l, true)} removido(s) e banido(s).`);
  }),
  C('semcomprareset', 'admin', 'Reinicia a contagem: todos passam a contar de hoje.', async (c) => {
    const mt = await U.meta(c.sock, c.jid);
    mt.participants.forEach(p => c.g.joined[U.num(p.phoneNumber || p.id)] = Date.now());
    c.g.semList = []; db.save(); await c.reply('🔄 Contagem reiniciada para todos.');
  }),

  // ---------- anunciar ----------
  C('anunciar', 'admin', 'Anuncio diario automatico. Uso: .anunciar nome 08:00 Texto | listar | remover nome | limpar | on | off', async (c) => {
    const a = U.norm(c.args[0] || '');
    if (a === 'on' || a === 'off') { c.g.ann.on = a === 'on'; db.save(); return c.reply(`📆 Anúncios ${a === 'on' ? '✅ ligados' : '❌ desligados'}.`); }
    if (a === 'listar') { const it = Object.entries(c.g.ann.items); return c.reply(it.length ? '📆 *ANÚNCIOS*\n\n' + it.map(([n, x]) => `• *${n}* — ${x.time}\n${x.text.slice(0, 60)}${x.text.length > 60 ? '…' : ''}`).join('\n\n') : 'Nenhum anúncio.'); }
    if (a === 'limpar') { c.g.ann.items = {}; db.save(); return c.reply('🧹 Anúncios apagados.'); }
    if (a === 'remover') { const n = c.args[1]; if (!c.g.ann.items[n]) return c.reply('Uso: .anunciar remover nome'); delete c.g.ann.items[n]; db.save(); return c.reply(`🗑️ "${n}" removido.`); }
    const [nome, hora, ...t] = c.args;
    const texto = t.join(' ') || (U.getQuoted(c.m) || {}).text;
    if (!nome || !/^([01]?\d|2[0-3]):[0-5]\d$/.test(hora || '') || !texto) return c.reply('Uso: .anunciar nome 08:00 Texto do anúncio\n(ou responda a uma mensagem)');
    const hh = hora.padStart(5, '0');
    c.g.ann.items[nome] = { time: hh, text: texto, last: '' }; db.save();
    await c.reply(`📆 Anúncio "${nome}" salvo: todos os dias às ${hh} (${cfg.tz}).`);
  }),

  C('abrirhorario', 'admin', 'Abre o grupo todo dia no horario. Uso: .abrirhorario 06:00 (ou off)', async (c) => schedCmd(c, 'open', 'Abertura')),
  C('fecharhorario', 'admin', 'Fecha o grupo todo dia no horario. Uso: .fecharhorario 22:00 (ou off)', async (c) => schedCmd(c, 'close', 'Fechamento')),

  // ---------- admins fixos ----------
  C('add', 'admin', 'Adiciona membro ou admin fixo. Uso: .add 258841234567  |  .add admfixo @pessoa', async (c) => {
    if (U.norm(c.args[0]) === 'admfixo') {
      const t = c.targets[0] ? U.num(c.targets[0]) : U.normNum(c.args[1]);
      if (!t) return c.reply('Uso: .add admfixo @pessoa');
      if (!c.g.admfixo.includes(t)) c.g.admfixo.push(t); db.save();
      await c.sock.groupParticipantsUpdate(c.jid, [U.jidOf(t)], 'promote').catch(() => {});
      return c.reply(`👑 ${t} é admin fixo: usa os comandos de admin e é re-promovido se for rebaixado.`);
    }
    const n = U.normNum(c.args[0]);
    if (n.length < 10) return c.reply('Uso: .add 258841234567');
    try {
      const r = await c.sock.groupParticipantsUpdate(c.jid, [U.jidOf(n)], 'add');
      const st = String(r?.[0]?.status || '200');
      await c.reply(st === '200' ? `✅ ${n} adicionado.` : st === '403' ? `⚠️ ${n} bloqueia convites de grupo. Envie o link com .linkgp` : `⚠️ Não foi possível adicionar (${st}).`);
    } catch { await c.reply(botAdminMsg); }
  }),
  C('remover', 'admin', 'Remove admin fixo. Uso: .remover admfixo @pessoa  (para tirar membro use .ban)', async (c) => {
    if (U.norm(c.args[0]) !== 'admfixo') return c.reply('Uso: .remover admfixo @pessoa\nPara tirar um membro do grupo use .ban @pessoa');
    const t = c.targets[0] ? U.num(c.targets[0]) : U.normNum(c.args[1]);
    c.g.admfixo = c.g.admfixo.filter(x => x !== t); db.save();
    await c.reply(`🗑️ ${t || '—'} não é mais admin fixo.`);
  }),
  C('listadmfixo', 'admin', 'Lista os admins fixos.', async (c) => c.reply(c.g.admfixo.length ? '👑 *ADMINS FIXOS*\n' + c.g.admfixo.map(x => '• ' + x).join('\n') : 'Nenhum admin fixo.')),
  C('limparadmfixo', 'admin', 'Remove todos os admins fixos.', async (c) => { c.g.admfixo = []; db.save(); await c.reply('🧹 Admins fixos removidos.'); })
];

async function schedCmd(c, k, nome) {
  const a = (c.args[0] || '').trim();
  if (U.norm(a) === 'off') { delete c.g.sched[k]; db.save(); return c.reply(`🗑️ ${nome} automática desativada.`); }
  if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(a)) return c.reply(`${nome} atual: ${c.g.sched[k] || 'nenhuma'}\nUso: .${k === 'open' ? 'abrir' : 'fechar'}horario HH:MM  (ou off)`);
  c.g.sched[k] = a.padStart(5, '0'); db.save();
  await c.reply(`⏰ ${nome} automática: todos os dias às ${c.g.sched[k]} (${cfg.tz}).`);
}
