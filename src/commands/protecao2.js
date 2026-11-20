// Protecoes extra: antilinkhard anticanal antifoto antivideo antisticker antidoc antiviewonce antiflood antipalavrao antidelete automover
const U = require('../lib/utils');
const guard = require('../lib/guard');
const { C, T } = require('../lib/cmd');

exports.priority = 12;

const URL_RE = /(https?:\/\/|www\.|chat\.whatsapp\.com\/|wa\.me\/|\b[a-z0-9-]{2,}\.(com|net|org|info|xyz|link|me|co\.mz)\b)/i;
const PALAVROES = ['caralho', 'porra', 'merda', 'puta', 'putas', 'fdp', 'vsf', 'fodase', 'foda-se', 'arrombado', 'cuzao', 'otario', 'idiota', 'imbecil', 'cabrao', 'bosta'];
const MEDIA = { antifoto: ['imageMessage', 'foto'], antivideo: ['videoMessage', 'vídeo'], antisticker: ['stickerMessage', 'sticker'], antidoc: ['documentMessage', 'documento'] };
const flood = new Map();        // jid|user -> [timestamps]
const cache = new Map();        // jid -> Map(id -> {u, text})

exports.onMessage = async (c) => {
  const { sock, jid, sender, text, g, m, owner } = c;
  const u = U.num(sender);

  // ---- antidelete: guarda o texto e devolve o que o autor apagar ----
  if (g.on.antidelete) {
    const pm = U.unwrap(m.message).protocolMessage;
    if (pm && pm.type === 0 && pm.key && pm.key.id) {
      const o = (cache.get(jid) || new Map()).get(pm.key.id);
      if (o && o.u === u)   // so quando foi o proprio autor a apagar
        await sock.sendMessage(jid, { text: `🗑️ @${o.u} apagou uma mensagem:\n\n${o.text}`, mentions: [U.jidOf(o.u)] });
      return false;
    }
    if (text && !text.startsWith('.')) {
      const mp = cache.get(jid) || cache.set(jid, new Map()).get(jid);
      mp.set(m.key.id, { u, text }); if (mp.size > 300) mp.delete(mp.keys().next().value);
    }
  }
  if (owner) return false;

  const raw = m.message || {};
  const checks = [];
  if (g.on.antilinkhard && URL_RE.test(text)) checks.push(['antilinkhard', 'link (modo hard)', { mode: 'ban' }]);
  if (g.on.anticanal && /whatsapp\.com\/channel\//i.test(text)) checks.push(['anticanal', 'link de canal não permitido']);
  if (g.on.antipalavrao && text) {
    const w = new Set(U.norm(text).split(/[^a-z0-9-]+/));
    if (PALAVROES.some(p => w.has(p))) checks.push(['antipalavrao', 'linguagem imprópria']);
  }
  const type = U.msgType(m);
  for (const [flag, [t, nome]] of Object.entries(MEDIA)) if (g.on[flag] && type === t) checks.push([flag, `${nome} não permitido`, { silent: true }]);
  if (g.on.antiviewonce && (raw.viewOnceMessage || raw.viewOnceMessageV2 || raw.viewOnceMessageV2Extension)) checks.push(['antiviewonce', 'visualização única não permitida', { silent: true }]);
  if (g.on.antiflood) {
    const k = jid + '|' + u, now = Date.now();
    const arr = (flood.get(k) || []).filter(t => now - t < 8000); arr.push(now); flood.set(k, arr);
    if (arr.length >= (g.cfg.floodmax || 6)) { flood.set(k, []); checks.push(['antiflood', 'flood (mensagens demais)', { keep: true }]); }
  }
  if (!checks.length) return false;
  if (await c.isAdmin()) return false;

  const [t, why, o = {}] = checks[0];
  if (o.silent) { await sock.sendMessage(jid, { delete: m.key }).catch(() => {}); return true; }
  await guard.punish(c, t, why, o);
  return true;
};

exports.commands = [
  T('antilinkhard', 'antilinkhard', 'Anti-link HARD (apaga e bane na hora)'),
  T('anticanal', 'anticanal', 'Anti-canal (links de canais do WhatsApp)'),
  T('antifoto', 'antifoto', 'Anti-foto'),
  T('antivideo', 'antivideo', 'Anti-vídeo'),
  T('antisticker', 'antisticker', 'Anti-sticker'),
  T('antidoc', 'antidoc', 'Anti-documento'),
  T('antiviewonce', 'antiviewonce', 'Anti-visualização única'),
  T('antiflood', 'antiflood', 'Anti-flood'),
  T('antipalavrao', 'antipalavrao', 'Anti-palavrão (lista interna)'),
  T('antidelete', 'antidelete', 'Anti-delete (devolve mensagens apagadas)'),
  T('automover', 'automover', 'Automover: remove automaticamente quem atinge o máximo de avisos')
];
