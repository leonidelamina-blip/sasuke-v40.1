const QRCode = require('qrcode');
const cfg = require('../config');
const db = require('../lib/db');
const U = require('../lib/utils');
const sessions = require('../lib/sessions');
const { C } = require('../lib/cmd');

const fmtCode = (code) => (code.match(/.{1,4}/g) || [code]).join('-');
const dias = (s) => s.until ? (s.until > Date.now() ? U.left(s.until) + 'd' : 'EXPIRADO') : '∞';

exports.commands = [
  // ===== PLATAFORMA (so os donos, na sessao principal) =====
  C(['conectar', 'parear', 'pair', 'pairing', 'code'], 'master', 'Conecta o numero de um cliente por CODIGO de pareamento. Uso: .conectar 258841234567 [dias] [nome]', async (c) => {
    const phone = U.normNum(c.args[0]);
    if (phone.length < 10) return c.reply('Uso: .conectar 258841234567 [dias] [nome]\nEx.: .conectar 258841234567 30 BOT-JONAS');
    const d = parseInt(c.args[1], 10) || 30;
    const nome = c.args.slice(2).join(' ') || `${cfg.botName}-${phone.slice(-4)}`;
    const sid = 's' + phone;
    const ex = sessions.find(phone);
    if (ex || sessions.socks.has(sid)) return c.reply(`⚠️ Esse número já tem um bot${ex ? ' (' + ex.name + (ex.trial ? ', em teste grátis' : '') + ')' : ''}. Para dar dias use .alugar ${phone} <dias>; para refazer use .desconectar primeiro.`);
    db.ensureSession(sid, { name: nome, ownerPhone: phone, until: Date.now() + U.days(d), status: 'pareando' }); db.save();
    await c.reply(`⏳ Gerando código para +${phone}…`);
    await sessions.start(sid, {
      pairNumber: phone,
      onPair: (code) => c.sock.sendMessage(c.jid, { text: `🔑 *CÓDIGO DE PAREAMENTO*\n\n*${fmtCode(code)}*\n\nNo WhatsApp de +${phone}:\n1️⃣ Aparelhos conectados\n2️⃣ Conectar um aparelho\n3️⃣ *Conectar com número de telefone*\n4️⃣ Digite o código acima\n\n⏱️ O código expira em ~60 segundos.` }),
      onOpen: () => c.sock.sendMessage(c.jid, { text: `✅ *${nome}* conectado!\n📞 +${phone}\n⏳ Validade: ${d} dia(s)` }),
      onError: (e) => c.sock.sendMessage(c.jid, { text: `❌ Falha ao gerar o código: ${e.message}\nConfira o número (com 258) e tente de novo.` })
    });
  }),

  C(['qrcode', 'qr'], 'master', 'Conecta um cliente por QR CODE (imagem). Uso: .qrcode [dias] [nome]', async (c) => {
    const d = parseInt(c.args[0], 10) || 30;
    const nome = c.args.slice(1).join(' ') || `${cfg.botName}-${String(Date.now()).slice(-4)}`;
    const sid = 'q' + Date.now();
    db.ensureSession(sid, { name: nome, until: Date.now() + U.days(d), status: 'qr' }); db.save();
    let n = 0, ok = false;
    await c.reply('⏳ Gerando o QR Code…');
    await sessions.start(sid, {
      onQr: async (qr) => {
        if (ok) return;
        if (++n > 5) { await sessions.stop(sid, { purge: true }); delete db.data.sessions[sid]; db.save(); return c.sock.sendMessage(c.jid, { text: '⌛ O QR expirou sem ser escaneado. Use .qrcode de novo.' }); }
        const buf = await QRCode.toBuffer(qr, { scale: 8, margin: 2 });
        await c.sock.sendMessage(c.jid, { image: buf, caption: `📷 *QR do ${nome}* (${n}/5)\nWhatsApp > Aparelhos conectados > Conectar um aparelho.\n⏱️ Expira em ~20s; um novo QR chega automaticamente.` });
      },
      onOpen: (sock) => { ok = true; const S = db.session(sid); S.ownerPhone = S.phone; db.save(); c.sock.sendMessage(c.jid, { text: `✅ *${nome}* conectado!\n📞 +${S.phone}\n⏳ Validade: ${d} dia(s)` }); }
    });
  }),

  C(['sessoes', 'sessions'], 'master', 'Lista todos os bots (sessoes) conectados.', async (c) => {
    const l = Object.values(db.data.sessions).map(s => `${sessions.socks.get(s.id)?.user ? '🟢' : '🔴'} ${s.trial ? '🎁 ' : ''}*${s.name}*\n   id: ${s.id} · +${s.phone || s.ownerPhone || '—'}\n   validade: ${dias(s)} · grupos: ${Object.keys(s.groups).length}`);
    await c.reply(`🛰️ *SESSÕES* (${l.length})\n\n` + l.join('\n\n'));
  }),

  C('desconectar', 'master', 'Desconecta e apaga uma sessao. Uso: .desconectar <id|numero|nome>', async (c) => {
    const s = sessions.find(c.args[0]);
    if (!s || s.id === 'main') return c.reply('Sessão não encontrada. Veja .sessoes');
    await sessions.stop(s.id, { purge: true }); delete db.data.sessions[s.id]; db.save();
    await c.reply(`🔌 Sessão ${s.name} removida.`);
  }),

  C('tirardias', 'master', 'Remove dias de validade. Uso: .tirardias <id|numero|nome> <dias>', async (c) => {
    const s = sessions.find(c.args[0]), d = parseInt(c.args[1], 10);
    if (!s || !d || !s.until) return c.reply('Uso: .tirardias 258841234567 5');
    s.until -= U.days(d); db.save();
    await c.reply(`✅ ${s.name}: -${d} dia(s). Validade: ${dias(s)}`);
  }),
  C('setdonobot', 'master', 'Troca o dono de um bot de cliente (sessao). Uso: .setdonobot <id|nome> 258841234567', async (c) => {
    const s = sessions.find(c.args[0]), n = U.normNum(c.args[1]);
    if (!s || n.length < 10) return c.reply('Uso: .setdonobot <id> 258841234567');
    s.ownerPhone = n; db.save(); await c.reply(`👑 Dono de ${s.name}: +${n}`);
  }),

  // ===== DONO DO BOT (cliente) =====
  C('bangp', 'owner', 'Bane ESTE grupo: o bot sai e sai de novo sempre que for adicionado. Uso (no grupo): .bangp', async (c) => {
    if (!c.S.bannedGroups.includes(c.jid)) c.S.bannedGroups.push(c.jid); db.save();
    await c.reply('🚫 Grupo banido. O bot vai sair e não aceita voltar.');
    await U.sleep(1500); await c.raw.groupLeave(c.jid).catch(() => {});
  }, { group: true }),
  C('nomebot', 'owner', 'Muda o nome do seu bot (aparece no menu). Uso: .nomebot BOT-JONAS', async (c) => {
    const n = c.args.join(' ').trim();
    if (!n) return c.reply('Uso: .nomebot BOT-JONAS');
    c.S.name = n; db.save(); await c.reply(`✅ Nome do bot: ${n}`);
  }, { group: false }),
  C('grupos', 'owner', 'Lista os grupos onde o bot esta.', async (c) => {
    const all = await c.sock.groupFetchAllParticipating();
    const l = Object.values(all);
    await c.reply(`👥 *GRUPOS* (${l.length})\n\n` + l.slice(0, 40).map(g => `• ${g.subject} (${g.participants.length})`).join('\n'));
  }, { group: false }),
  C('sairgrupo', 'owner', 'Faz o bot sair do grupo atual.', async (c) => { await c.reply('👋 Saindo do grupo…'); await c.sock.groupLeave(c.jid); }, { group: true }),
  C('broadcast', 'owner', 'Envia um aviso para TODOS os grupos do bot. Uso: .broadcast texto', async (c) => {
    if (c.S.trial) return c.reply('💎 O broadcast só está disponível no plano alugado.');
    const t = c.text.replace(/^\S+\s*/, '').trim();
    if (!t) return c.reply('Uso: .broadcast texto');
    const ids = Object.keys(await c.sock.groupFetchAllParticipating());
    await c.reply(`📣 Enviando para ${ids.length} grupo(s)…`);
    let ok = 0;
    for (const id of ids) { try { await c.sock.sendMessage(id, { text: `📣 *AVISO*\n\n${t}` }); ok++; } catch {} await U.sleep(2500); }
    await c.reply(`✅ Enviado para ${ok}/${ids.length} grupo(s).`);
  }, { group: false })
];
