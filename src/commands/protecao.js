const cfg = require('../config');
const db = require('../lib/db');
const U = require('../lib/utils');
const guard = require('../lib/guard');
const { C, T, M } = require('../lib/cmd');

exports.priority = 10;

const URL_RE = /(https?:\/\/|www\.|chat\.whatsapp\.com\/|wa\.me\/|\b[a-z0-9-]{2,}\.(com|net|org|info|xyz|link|me|co\.mz)\b)/i;
function looksLikeTable(t) {
  const lines = t.split('\n');
  const mb = lines.filter(l => /\d+\s*(gb|mb)/i.test(l)).length;
  const mt = lines.filter(l => /\d+\s*(mt|mzn|meticais)/i.test(l)).length;
  return mb >= 3 && mt >= 2;
}
function looksLikeAd(t) {
  return /(vend[oa]|vendemos|revend|promo[cç][aã]o|megas?\s+(baratos|ilimitad)|pacotes?)/i.test(t) &&
    /(\d+\s*(gb|mb)|megas)/i.test(t) && /\b8[2-7]\d{7}\b/.test(t.replace(/\s/g, ''));
}

exports.onMessage = async (c) => {
  const { sock, jid, sender, text, g, m, owner } = c;
  if (owner) return false;
  const u = U.num(sender);

  if (g.muted.includes(u)) { await sock.sendMessage(jid, { delete: m.key }).catch(() => {}); return true; }

  const type = U.msgType(m);
  const checks = [];
  if (g.on.antiaudio && (type === 'audioMessage')) checks.push(['audio', null]);
  if (g.on.antilink && URL_RE.test(text)) checks.push(['antilink', 'link não permitido']);
  if (g.on.antipalavra && g.words.some(w => U.norm(text).includes(U.norm(w)))) checks.push(['antipalavra', 'palavra proibida']);
  if (g.on.antitabela && looksLikeTable(text)) checks.push(['antitabela', 'tabela de preços de outro vendedor']);
  if (g.on.anticoncorrencia && looksLikeAd(text)) checks.push(['anticoncorrencia', 'divulgação de concorrência']);
  if (!checks.length) return false;
  if (await c.isAdmin()) return false;

  const [t, why] = checks[0];
  if (t === 'audio') { await sock.sendMessage(jid, { delete: m.key }).catch(() => {}); return true; }
  await guard.punish(c, t, why);
  return true;
};

exports.onParticipants = async ({ sock, jid, g, action, list }) => {
  const rm = (p) => sock.groupParticipantsUpdate(jid, [p], 'remove').catch(() => {});
  for (const p of list) {
    const n = U.num(p);
    if (action === 'add') {
      g.joined[n] = Date.now();
      if (g.banned.includes(n)) { await rm(p); continue; }
      if (g.on.antiestrangeiro && p.endsWith('@s.whatsapp.net') && !n.startsWith(g.prefix)) {
        (g.logs.antiest = g.logs.antiest || []).push({ u: n, at: Date.now(), why: 'prefixo' });
        await sock.sendMessage(jid, { text: `🌍 @${n} removido: apenas números +${g.prefix} são permitidos.`, mentions: [p] }).catch(() => {});
        await rm(p);
        if (g.mode.antiest === 'ban' && !g.banned.includes(n)) g.banned.push(n);
        db.save();
      }
    }
    if (action === 'demote' && g.admfixo.includes(n)) {
      await sock.groupParticipantsUpdate(jid, [p], 'promote').catch(() => {});
    }
  }
  db.save();
};

const report = (type, titulo) => async (c) => {
  const l = c.g.logs[type] || [];
  if (!l.length) return c.reply(`📋 ${titulo}: nenhum registro.`);
  const cnt = {}; l.forEach(x => cnt[x.u] = (cnt[x.u] || 0) + 1);
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 10);
  await c.reply(`📋 *${titulo}*\nTotal: ${l.length} ocorrências · ${top.length} usuários\n\n` + top.map(([u, n]) => `• ${u} — ${n}x`).join('\n') + `\n\nÚltima: ${U.dayKey(l[l.length - 1].at)} ${U.hm(l[l.length - 1].at)}`);
};
const banToggle = (names, type, label) => C(names, 'admin', `${label}: alterna entre BANIR direto e avisar. Uso: .${names} [on/off]`, async (c) => {
  const a = U.norm(c.args[0] || '');
  const ban = a ? a === 'on' : c.g.mode[type] !== 'ban';
  c.g.mode[type] = ban ? 'ban' : 'aviso'; db.save();
  await c.reply(ban ? `🔨 ${label}: infrator é banido na hora.` : `⚠️ ${label}: infrator recebe avisos (máx. ${c.g.cfg[type + 'tent'] || c.g.maxavisos}).`);
});

exports.commands = [
  C('prefixo', 'admin', 'Define o prefixo de pais permitido (anti-estrangeiro). Uso: .prefixo 258', async (c) => {
    const p = (c.args[0] || '').replace(/\D/g, '');
    if (!p) return c.reply(`Prefixo atual: +${c.g.prefix}\nUso: .prefixo 258`);
    c.g.prefix = p; db.save(); await c.reply(`🌍 Prefixo permitido: +${p}`);
  }),
  T(['antiestrangeiro', 'antifake'], 'antiestrangeiro', 'Anti-estrangeiro'),
  banToggle('antiestban', 'antiest', 'Anti-estrangeiro (ban)'),
  C('antiestrelatorio', 'admin', 'Relatorio de estrangeiros removidos.', report('antiest', 'ANTI-ESTRANGEIRO')),
  C('antiestreset', 'admin', 'Zera o relatorio de estrangeiros.', async (c) => { c.g.logs.antiest = []; db.save(); await c.reply('🧹 Relatório zerado.'); }),

  T('antipalavra', 'antipalavra', 'Anti-palavra'),
  banToggle('antipalavraban', 'antipalavra', 'Anti-palavra'),
  C('antipalavrarelatorio', 'admin', 'Relatorio de palavras proibidas.', report('antipalavra', 'ANTI-PALAVRA')),
  C('palavra', 'admin', 'Adiciona palavra proibida. Uso: .palavra golpe', async (c) => {
    const w = c.text.replace(/^\S+\s*/, '').trim();
    if (!w) return c.reply('Uso: .palavra golpe');
    if (!c.g.words.includes(w)) c.g.words.push(w);
    db.save(); await c.reply(`🚫 Palavra proibida: "${w}" (${c.g.words.length} no total)${c.g.on.antipalavra ? '' : '\n⚠️ Ligue com .antipalavra on'}`);
  }),
  C('palavraslist', 'admin', 'Lista as palavras proibidas.', async (c) => c.reply(c.g.words.length ? '🚫 *PALAVRAS*\n' + c.g.words.map(w => '• ' + w).join('\n') : 'Nenhuma palavra cadastrada.')),
  C('palavraslimpar', 'admin', 'Apaga todas as palavras proibidas.', async (c) => { c.g.words = []; db.save(); await c.reply('🧹 Lista apagada.'); }),

  T('antilink', 'antilink', 'Anti-link'),
  C('antilinktentativas', 'admin', 'Quantos avisos antes de banir por link. Uso: .antilinktentativas 3', async (c) => {
    const n = parseInt(c.args[0], 10);
    if (!n || n < 1) return c.reply('Uso: .antilinktentativas 3');
    c.g.cfg.antilinktent = n; db.save(); await c.reply(`🔗 Anti-link: ban após ${n} aviso(s).`);
  }),
  banToggle('antilinkban', 'antilink', 'Anti-link'),
  M('antilinkaviso', 'antilink', 'aviso', 'Anti-link: apaga, avisa e bane após as tentativas'),
  M('antilinknormal', 'antilink', 'normal', 'Anti-link: apenas apaga o link, sem avisos'),

  T('antitabela', 'antitabela', 'Anti-tabela'),
  M('antitabnormal', 'antitabela', 'normal', 'Anti-tabela: apenas apaga a tabela de outros'),
  banToggle('antitabban', 'antitabela', 'Anti-tabela'),
  T('antiaudio', 'antiaudio', 'Anti-áudio'),
  T('anticoncorrencia', 'anticoncorrencia', 'Anti-concorrência'),
  T('antiburlador', 'antiburlador', 'Anti-burlador (comprovativos falsos/repetidos)'),
  T('soadmin', 'soadmin', 'Modo só-admin (bot ignora comandos de membros comuns)'),
  C('maxavisos', 'admin', 'Define o maximo de avisos antes do ban. Uso: .maxavisos 3', async (c) => {
    const n = parseInt(c.args[0], 10);
    if (!n || n < 1) return c.reply(`Máx. atual: ${c.g.maxavisos}. Uso: .maxavisos 3`);
    c.g.maxavisos = n; db.save(); await c.reply(`⚠️ Máximo de avisos: ${n}`);
  })
];
