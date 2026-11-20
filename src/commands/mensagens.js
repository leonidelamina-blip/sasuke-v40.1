const U = require('../lib/utils');
const { C, botAdminMsg } = require('../lib/cmd');

exports.commands = [
  C('hidetag', 'admin', 'Marca todos sem mostrar os @ (a mensagem aparece normal). Uso: .hidetag texto', async (c) => {
    const mt = await U.meta(c.sock, c.jid);
    const t = c.text.replace(/^\S+\s*/, '').trim() || (U.getQuoted(c.m) || {}).text;
    if (!t) return c.reply('Uso: .hidetag texto   (ou responda a uma mensagem)');
    await c.sock.sendMessage(c.jid, { text: t, mentions: mt.participants.map(p => p.id), noWm: true });
  }),

  C('dectetor', 'admin', 'Analisa a mensagem citada: tipo, autor, hora e se e de visualizacao unica. Uso: responda com .dectetor', async (c) => {
    const ci = U.ctxInfo(c.m);
    if (!ci.quotedMessage) return c.reply('Responda a uma mensagem com .dectetor');
    const q = ci.quotedMessage, inner = U.unwrap(q);
    const tipo = Object.keys(inner)[0] || 'desconhecido';
    const vo = !!(q.viewOnceMessage || q.viewOnceMessageV2 || q.viewOnceMessageV2Extension);
    const tx = inner.conversation || inner.extendedTextMessage?.text || inner.imageMessage?.caption || inner.videoMessage?.caption || '';
    await c.reply(`🔎 *DETETOR*\n\n📨 Tipo: ${tipo}\n👤 Autor: ${U.num(ci.participant || '')}\n🆔 ID: ${ci.stanzaId || '—'}\n👁️ Visualização única: ${vo ? 'SIM' : 'não'}\n🔁 Encaminhada: ${inner[tipo]?.contextInfo?.isForwarded ? 'sim' : 'não'}\n📝 Caracteres: ${tx.length}`);
  }),

  C('revelar', 'admin', 'Revela uma foto/video de visualizacao unica (so admins). Uso: responda a ela com .revelar', async (c) => {
    const ci = U.ctxInfo(c.m), q = ci.quotedMessage;
    const inner = q && (q.viewOnceMessage?.message || q.viewOnceMessageV2?.message || q.viewOnceMessageV2Extension?.message);
    if (!inner) return c.reply('Responda a uma mensagem de visualização única com .revelar');
    try {
      const { downloadMediaMessage } = require('@whiskeysockets/baileys');
      const fake = { key: { remoteJid: c.jid, id: ci.stanzaId, participant: ci.participant, fromMe: false }, message: inner };
      const buf = await downloadMediaMessage(fake, 'buffer', {}, { reuploadRequest: c.raw.updateMediaMessage });
      const cap = `👁️ Revelado por @${U.num(c.sender)}`;
      const base = { caption: cap, mentions: [c.sender] };
      if (inner.imageMessage) await c.sock.sendMessage(c.jid, { image: buf, ...base }, { quoted: c.m });
      else if (inner.videoMessage) await c.sock.sendMessage(c.jid, { video: buf, ...base }, { quoted: c.m });
      else if (inner.audioMessage) await c.sock.sendMessage(c.jid, { audio: buf, mimetype: 'audio/mp4' }, { quoted: c.m });
      else await c.reply('Tipo de mídia não suportado.');
    } catch (e) { await c.reply('❌ Não consegui abrir essa mensagem (expirou ou já foi vista).'); }
  })
];
