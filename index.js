const {
  default: makeWASocket, useMultiFileAuthState, DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const cfg = require('./config');
const db = require('./src/db');
const { commands } = require('./src/commands');

const jidNumber = jid => (jid || '').split('@')[0].replace(/\D/g,'');
const normalize = n => n.startsWith('258') ? n : `258${n}`;

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth');
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    version, auth: state, logger: pino({ level: 'silent' }),
    printQRInTerminal: false, browser: ['V8 Bot','Chrome','1.0.0']
  });

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', ({connection,lastDisconnect,qr}) => {
    if(qr) qrcode.generate(qr,{small:true});
    if(connection==='open') console.log('V8 conectado ao WhatsApp.');
    if(connection==='close') {
      const code=lastDisconnect?.error?.output?.statusCode;
      if(code!==DisconnectReason.loggedOut) start();
      else console.log('Sessão terminada. Apague auth apenas se quiser voltar a emparelhar.');
    }
  });

  sock.ev.on('messages.upsert', async ({messages,type}) => {
    if(type!=='notify') return;
    for(const msg of messages) {
      if(!msg.message || msg.key.fromMe) continue;
      const chat=msg.key.remoteJid;
      const sender=msg.key.participant || chat;
      const isGroup=chat.endsWith('@g.us');
      const body=msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        msg.message.videoMessage?.caption || '';
      if(!body.startsWith(cfg.PREFIX)) continue;

      const [raw,...args]=body.slice(cfg.PREFIX.length).trim().split(/\s+/);
      const name=(raw||'').toLowerCase();
      const command=commands.get(name);
      if(!command) continue;

      try {
        const metadata=isGroup ? await sock.groupMetadata(chat) : null;
        const admins=(metadata?.participants||[]).filter(p=>p.admin).map(p=>p.id);
        const mentions=msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const quotedText=msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.conversation || '';
        const ctx={
          sock, chat, sender, args, isGroup,
          isGroupAdmin: admins.includes(sender),
          groupAdmins: admins, mentions, quotedText,
          reply: async (text, mentioned=[]) => sock.sendMessage(chat,{text,mentions:mentioned},{quoted:msg})
        };
        if(command.ownerOnly && sender.split('@')[0]!==cfg.OWNER_NUMBER) {
          await ctx.reply('Comando exclusivo do proprietário.'); continue;
        }
        if(db.state.settings.maintenance && sender.split('@')[0]!==cfg.OWNER_NUMBER) {
          await ctx.reply('V8 está em manutenção.'); continue;
        }
        await command.fn(ctx);
      } catch(err) {
        console.error('Erro no comando',name,err);
        await sock.sendMessage(chat,{text:'Ocorreu um erro ao executar este comando.'},{quoted:msg});
      }
    }
  });

  // Boas-vindas e anti-link básicos, configurados separadamente por grupo.
  sock.ev.on('group-participants.update', async ev => {
    const g=db.group(ev.id);
    if(g.config.welcome && ev.action==='add') {
      const text=g.config.welcomeText || 'Bem-vindo(a) ao grupo!';
      for(const id of ev.participants) await sock.sendMessage(ev.id,{text:text.replace('{user',`@${id.split('@')[0]}`),mentions:[id]});
    }
  });
}
start().catch(console.error);
