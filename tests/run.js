// Testes de ponta a ponta com Baileys SIMULADO (sem internet, sem WhatsApp). Uso: npm test
const Module = require('module');
const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');
const os = require('os');
const BOT = path.join(__dirname, '..');

// ---- isolamento: base de dados temporaria, sem esperas ----
process.env.SASUKE_DB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sasuke-test-'));
process.env.SASUKE_PAIR_DELAY = '0';
global.fetch = async () => { throw new Error('sem rede (teste)'); };

// ---- Baileys & cia. simulados ----
const created = [];
const stubs = {
  '@whiskeysockets/baileys': {
    default: () => { const ev = new EventEmitter(); const s = { ev, user: { id: '258872698781:1@s.whatsapp.net' }, end() {}, requestPairingCode: async () => 'ABCD1234', sendMessage: async () => ({}) }; created.push(s); setTimeout(() => ev.emit('connection.update', { qr: 'QRDATA' }), 20); return s; },
    useMultiFileAuthState: async () => ({ state: { creds: { registered: false }, keys: {} }, saveCreds() {} }),
    makeCacheableSignalKeyStore: (k) => k, DisconnectReason: { loggedOut: 401, connectionReplaced: 440 },
    fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 1] }), Browsers: { ubuntu: () => ['x', 'y', 'z'] },
    downloadMediaMessage: async () => Buffer.from('midia')
  },
  '@hapi/boom': { Boom: class { constructor(e) { this.output = { statusCode: e && e.output && e.output.statusCode }; } } },
  pino: () => ({}), 'qrcode-terminal': { generate() {} }, qrcode: { toBuffer: async () => Buffer.from('png') }
};
const orig = Module._load;
Module._load = function (req, ...a) { return stubs[req] || orig.call(this, req, ...a); };

process.chdir(BOT);
const cfg = require(BOT + '/src/config');
cfg.human.on = false;
cfg.fonte = 'nenhuma';   // os testes antigos comparam texto normal; a fonte tem testes proprios mais abaixo
const db = require(BOT + '/src/lib/db');
const handler = require(BOT + '/src/lib/handler');
const U = require(BOT + '/src/lib/utils');
const menu = require(BOT + '/src/lib/menu');
const scheduler = require(BOT + '/src/services/messageScheduler');
const OFICIAIS = require(BOT + '/src/data/comandosOficiais');
const expiry = require(BOT + '/src/lib/expiry');

let pass = 0, fail = 0;
const ok = (c, msg) => { c ? pass++ : (fail++, console.log('  ❌ FALHOU:', msg)); };
const WM_MAIN = cfg.marca, WM_CLI = 'ᴄʟɪᴇɴᴛᴇ';

// ---- 1. cobertura de comandos ----
let nOficiais = 0; const faltam = [];
for (const n of OFICIAIS.lista().map(x => x.nome).concat(OFICIAIS.PAREAMENTO)) { nOficiais++; if (!handler.commands.has(U.norm(n))) faltam.push(n); }
ok(OFICIAIS.lista().length === 120, 'lista oficial tem 120 comandos: ' + OFICIAIS.lista().length);
ok(faltam.length === 0, 'comandos OFICIAIS em falta: ' + JSON.stringify(faltam));
const noMenu = []; let totalMenu = 0;
for (const ln of menu({ name: 'T', until: 0 }).split('\n')) {
  const mm = ln.match(/^│ • \.(.+)$/); if (!mm) continue;
  for (const part of mm[1].split(' / ')) { totalMenu++; const n = U.norm(part.trim().replace(/^\./, '').split(/\s+/)[0]); if (!handler.commands.has(n)) noMenu.push(n); }
}
ok(noMenu.length === 0, 'comandos do menu sem implementacao: ' + JSON.stringify(noMenu));
console.log(`Comandos: ${handler.list.length} (${handler.commands.size} nomes) | oficiais ${nOficiais} | menu ${totalMenu}`);

// ---- 2. socket simulado ----
const GJ = '1203630000@g.us', GJ2 = '1203639999@g.us';
const ADM = '258841111111@s.whatsapp.net', CLI = '258842222222@s.whatsapp.net', BAD = '258843333333@s.whatsapp.net', MEM = '258845555555@s.whatsapp.net';
const out = [], reacts = [], pres = [], calls = [];
const sock = {
  user: { id: '258872698781:1@s.whatsapp.net' },
  sendMessage: async (j, c) => { if (c.react) { reacts.push(c.react.text); return {}; } out.push({ j, ...c }); return { key: { id: 'K' + out.length } }; },
  profilePictureUrl: async () => 'http://x/p.jpg', readMessages: async () => {}, presenceSubscribe: async () => {},
  sendPresenceUpdate: async (st) => { pres.push(st); },
  groupMetadata: async () => ({ subject: 'Vendas Mega', participants: [{ id: ADM, admin: 'admin' }, { id: CLI }, { id: BAD }, { id: MEM }, { id: '258872698781@s.whatsapp.net', admin: 'admin' }] }),
  groupParticipantsUpdate: async (j, i, act) => { out.push({ j, rm: i, act }); return [{ status: '200' }]; },
  groupSettingUpdate: async (j, v) => { out.push({ j, setting: v }); },
  groupInviteCode: async () => 'XYZ', groupLeave: async (j) => { calls.push('leave:' + j); }
};
db.ensureSession('main', { name: 'Sasuke', ownerPhone: cfg.owner.numero, until: 0 });
db.ensureSession('s1', { name: 'CLIENTE', ownerPhone: '258849999999', until: Date.now() + 36 * 864e5 });

let n = 0;
const flat = () => out.map(o => o.text || o.caption || (o.rm ? 'RM:' + o.act : o.setting ? 'SET:' + o.setting : o.delete ? 'DEL' : o.contacts ? 'CONTACT' : '')).join(' | ');
const say = async (from, text, extra = {}, sid = 's1', jid = GJ) => {
  out.length = 0; reacts.length = 0;
  const key = { remoteJid: extra.dm ? from : jid, id: 'M' + (++n), fromMe: false, participant: extra.dm ? undefined : from, ...(extra.key || {}) };
  const msg = extra.msg || (extra.ctx ? { extendedTextMessage: { text, contextInfo: extra.ctx } } : { conversation: text });
  await handler.handle(sock, sid, { key, message: msg, messageTimestamp: Math.floor(Date.now() / 1000), pushName: 'Teste' }, 'notify');
  return flat();
};
const mention = (j) => ({ mentionedJid: [j] });
const quote = (message, participant = CLI) => ({ quotedMessage: message, participant, stanzaId: 'Q1' });

(async () => {
  let r;
  // ===== menu, foto, marca d'agua, estilo =====
  r = await say(CLI, '.menu');
  ok(out[0].image && out[0].caption.includes('Validade: 36') && out[0].caption.includes('cmdinfo') && out[0].caption.length <= 3000 && !out[0].caption.includes(WM_CLI), 'menu: foto com o inicio do menu na legenda (<= legendaMax)');
  ok(out.slice(1).every(o => o.text) && out.length >= 3, 'menu: resto em varias mensagens: ' + out.length);
  ok(out.slice(1).every(o => o.text) && out.map(o => o.text || o.caption).join('').includes('.verprazo'), 'menu: o menu completo chega inteiro (legenda + mensagens)');
  { const mm = out.map(o => o.text || o.caption).join('\n\n'); ok(['.nanoadd', '.alugar 258841234567 30', '.autocomprovativo on/off', '.setagradecimento', '.fonte on/off', '.teste', '.sasuke', '.daily'].every(x => mm.includes(x)), 'menu completo contem as secoes novas'); }
  ok(out[out.length - 1].text.endsWith(WM_CLI) && !out[1].text.includes(WM_CLI), 'marca dagua so no FINAL do menu');
  ok(reacts.includes('📜'), 'reacao ao .menu');
  ok(['antilinkhard', 'revelar', 'nanoadd', 'sasuke', 'daily', 'settabela'].every(x => out.map(o => o.text || '').join('').includes('.' + x)), 'menu lista os comandos novos');
  r = await say('258849999999@s.whatsapp.net', '.style-menu 2');
  ok(r.includes('compacto'), 'style-menu: ' + r);
  r = await say(CLI, '.menu'); ok(out.map(o => o.text || o.caption || '').join('').includes('┌──〔'), 'menu compacto');
  await say('258849999999@s.whatsapp.net', '.style-menu 1');

  // ===== regra do canal: so em .canal e no aviso de aluguel expirado =====
  const canal = cfg.canal.split('/').pop();
  let vazou = [];
  for (const cmd of ['.menu', '.dono', '.criador', '.sobre', '.ping', '.cmdlist', '.menugestor']) {
    await say(ADM, cmd); if (out.some(o => (o.text || o.caption || '').includes(canal))) vazou.push(cmd);
  }
  ok(vazou.length === 0, 'link do canal vazou em: ' + vazou);
  r = await say(CLI, '.canal'); ok(r.includes(canal), '.canal mostra o link');

  // ===== dono / criador =====
  r = await say(CLI, '.criador');
  ok(out[0].image && out[0].caption.includes('Leo') && out[0].caption.includes('+258 85 222 3969') && out[1].contacts, 'criador: foto + dados + contato');
  r = await say(CLI, '.dono'); ok(out[0].caption.includes('Número') && out[0].caption.includes(WM_CLI), 'dono da sessao cliente');

  // ===== nada configurado: frase exacta =====
  const NC = { '.tabela': 'a tabela', '.pagamento': 'o pagamento', '.contas': 'as contas', '.loja': 'a loja', '.compra': 'a compra', '.mpesa': 'o pagamento', '.formasdeplist': 'o pagamento', '.verloja': 'a loja' };
  for (const [cmd, item] of Object.entries(NC))
    { r = await say(ADM, cmd, {}, 's1', GJ2); ok(r.startsWith(`Este grupo ainda não configurou ${item}. Peça ao dono do grupo para configurar.`), 'frase exacta em ' + cmd + ': ' + r.slice(0, 80)); }
  r = await say(ADM, '.megas', {}, 's1', GJ2); ok(r.includes('Pode mandar o valor') && r.includes('Tabela ou 01'), '.megas texto padrao');

  // ===== configuracao e vendas =====
  r = await say(ADM, '.setmegas 1GB=45, 5GB=190, 10GB=350'); ok(r.includes('3 pacotes'), 'setmegas');
  r = await say(ADM, '.mpesa 841234567-Joao'); ok(r.includes('M-Pesa salvo'), 'mpesa: ' + r);
  r = await say(ADM, '.addmpesa 842223333-Ana'); ok(r.includes('2 conta'), 'addmpesa: ' + r);
  r = await say(ADM, '.addemola 871112222-Bia'); ok(r.includes('e-Mola adicionado'), 'addemola');
  r = await say(CLI, '.payment'); ok(r.includes('841234567') && r.includes('842223333') && r.includes('871112222'), 'pagamento lista todas as contas');
  r = await say(MEM, '.setloja nada'); ok(r.includes('administrador'), 'membro nao configura loja');
  r = await say(ADM, '.setloja 🛒 Loja do grupo: entrega rápida'); ok(r.includes('guardou'), 'setloja');
  r = await say(CLI, '.loja'); ok(r.includes('entrega rápida'), 'loja visivel');
  r = await say(CLI, '.loja', {}, 's1', GJ2); ok(r.startsWith(U.nc('a loja')), 'outro grupo nao ve a loja');
  r = await say(ADM, '.verloja'); ok(r.includes('Configurada por') && r.includes('caracteres'), 'verloja com meta: ' + r);
  r = await say(ADM, '.setcompra Pague e envie o comprovativo.'); r = await say(CLI, '.compra'); ok(r.includes('Pague e envie'), '.compra sem args mostra texto');
  r = await say(CLI, '.compra 5gb'); ok(r.includes('190.00') && r.includes('Pague e envie'), 'compra: ' + r.slice(0, 90));
  r = await say(CLI, 'ID da transacao PP261106.2018.R18243. Transferiste 190.00MT para conta 842223333, nome: ANA as 20:18');
  ok(r.includes('Pagamento confirmado') && r.includes('Pedido #1 pago'), 'comprovativo valido (2a conta): ' + r.slice(0, 80));
  r = await say(CLI, 'ID da transacao PP261106.2018.R18243. Transferiste 190.00MT para conta 842223333'); ok(r.includes('já foi usado'), 'duplicado barrado');
  await say(CLI, '.compra 1gb');
  r = await say(CLI, 'ID da transacao XX1. Transferiste 45.00MT para conta 849999999'); ok(r.includes('não é a deste grupo'), 'conta errada');
  r = await say(CLI, 'ID da transacao XX2. Transferiste 10.00MT para conta 841234567'); ok(r.includes('diferente do pedido'), 'valor errado');
  r = await say(ADM, '.enviar @c', { ctx: mention(CLI) }); ok(r.includes('Megas enviados'), 'enviar');
  r = await say(CLI, '.compra meus'); ok(r.includes('Total acumulado') && r.includes('Posição'), 'compra meus: ' + r);
  r = await say(CLI, '.compra ranking'); ok(r.includes('👑 1.'), 'compra ranking: ' + r);
  r = await say(CLI, '.top'); ok(r.includes('5 GB'), 'top');
  r = await say(ADM, '.resumo'); ok(r.includes('Vendas: 1'), 'resumo');
  r = await say(ADM, '.estatística'); ok(r.includes('Ticket médio'), 'estatistica (acento)');
  r = await say(ADM, '.anular @c', { ctx: mention(CLI) }); ok(r.includes('anulada'), 'anular venda');
  r = await say(ADM, '.deposit @c 200', { ctx: mention(CLI) }); ok(r.includes('Saldo: 200.00'), 'deposit');
  r = await say(CLI, '.compra 1gb'); ok(r.includes('Pago com o seu saldo'), 'compra com saldo');
  r = await say(CLI, '.saldo'); ok(r.includes('155.00'), 'saldo: ' + r);
  r = await say(ADM, '.setcarteira Deposite na conta do grupo'); r = await say(CLI, '.carteira'); ok(r.includes('Deposite') && r.includes('155.00'), 'carteira texto + saldo');
  r = await say(ADM, '.editarconfig mbpreco 0.04'); await say(ADM, '.ativar compra MB'); r = await say(BAD, '.compra 1847mb'); ok(r.includes('73.88') || r.includes('73.9'), 'compra MB livre: ' + r.slice(0, 60));
  // .compra NAO deixa inflar o ranking sem pagar
  const antes = JSON.stringify(db.group('s1', GJ).buyers); await say(MEM, '.compra 99999999mb'); ok(JSON.stringify(db.group('s1', GJ).buyers) === antes, '.compra sozinho nao altera o ranking');

  // ===== nano =====
  r = await say(ADM, '.nanoadd regras | Proibido spam e links!'); ok(r.includes('Nano criado') && r.includes('SEM ponto'), 'nanoadd: ' + r);
  r = await say(CLI, 'regras'); ok(r.includes('Proibido spam') && r.endsWith(WM_CLI), 'nano SEM ponto');
  r = await say(CLI, '.regras'); ok(r.includes('Proibido spam') && r.endsWith(WM_CLI) && reacts.includes('🧩'), 'comando nano responde + marca: ' + r);
  r = await say(ADM, '.nanoadd ban | x'); ok(r.includes('Nano criado'), 'nano pode ter nome de comando'); await say(ADM, '.nanodel ban');
  r = await say(CLI, '.nanolist'); ok(r.includes('• regras'), 'nanolist');
  r = await say(ADM, '.nanodel regras'); r = await say(CLI, 'regras'); ok(r === '', 'nanodel remove');

  // ===== permissoes =====
  r = await say(MEM, '.antilink on'); ok(r.includes('administrador'), 'membro bloqueado');
  r = await say(ADM, '.liberar promover @m', { ctx: mention(MEM) }); ok(r.includes('não pode ser liberado'), 'promover nao liberavel');
  await say(ADM, '.liberartodos antilink'); r = await say(MEM, '.antilink on'); ok(r.includes('ligado'), 'liberartodos funciona: ' + r);
  r = await say(ADM, '.permissoes'); ok(r.includes('.antilink'), 'permissoes');
  await say(ADM, '.bloqueartodos'); r = await say(MEM, '.antilink off'); ok(r.includes('administrador'), 'bloqueartodos');
  await say(ADM, '.modolivre on'); r = await say(MEM, '.antilink off'); ok(r.includes('desligado'), 'modolivre'); await say(ADM, '.modolivre off');

  // ===== protecoes =====
  await say(ADM, '.antilink on'); await say(ADM, '.antilinktentativas 2');
  r = await say(BAD, 'olha https://golpe.com'); ok(r.includes('aviso 1/2'), 'antilink aviso');
  r = await say(ADM, 'meu site https://ok.com'); ok(r === '', 'admin pode postar link');
  r = await say(BAD, 'chat.whatsapp.com/abc'); ok(r.includes('removido') && r.includes('RM:remove'), 'antilink remove no limite');
  r = await say(ADM, '.banlist'); ok(r.includes('258843333333'), 'banlist');
  await say(ADM, '.automover off'); await say(ADM, '.antipalavrao on');
  for (let i = 0; i < 3; i++) r = await say(MEM, 'seu idiota ' + i);
  ok(!r.includes('RM:') && r.includes('automover desligado'), 'automover off nao remove: ' + r);
  await say(ADM, '.automover on'); await say(ADM, '.anticanal on');
  r = await say(MEM, 'entra https://whatsapp.com/channel/0029Abc'); ok(r.includes('aviso') || r.includes('removido'), 'anticanal: ' + r);
  await say(ADM, '.antifoto on'); r = await say(MEM, '', { msg: { imageMessage: { caption: 'foto' } } }); ok(r === 'DEL', 'antifoto apaga: ' + r);
  await say(ADM, '.antisticker on'); r = await say(MEM, '', { msg: { stickerMessage: {} } }); ok(r === 'DEL', 'antisticker');
  await say(ADM, '.antiviewonce on'); r = await say(MEM, '', { msg: { viewOnceMessageV2: { message: { imageMessage: {} } } } }); ok(r === 'DEL', 'antiviewonce');
  await say(ADM, '.antiflood on'); for (let i = 0; i < 6; i++) r = await say(CLI, 'spam ' + i); ok(r.includes('flood'), 'antiflood: ' + r);
  await say(ADM, '.antilinkhard on'); r = await say(MEM, 'veja www.site.com'); ok(r.includes('RM:remove') || r.includes('removido'), 'antilinkhard bane na hora: ' + r);
  await say(ADM, '.antidelete on'); await say(CLI, 'mensagem secreta', { key: { id: 'DEL1' } });
  r = await say(CLI, '', { msg: { protocolMessage: { type: 0, key: { id: 'DEL1' } } } }); ok(r.includes('apagou') && r.includes('mensagem secreta'), 'antidelete devolve: ' + r);
  await say(ADM, '.antifake on'); ok(db.group('s1', GJ).on.antiestrangeiro === true, 'antifake = antiestrangeiro');

  // ===== mensagens =====
  r = await say(ADM, '.hidetag Atenção geral'); ok(out[0].text === 'Atenção geral' && out[0].mentions.length === 5, 'hidetag marca todos sem mostrar');
  r = await say(ADM, '.dectetor', { ctx: quote({ imageMessage: { caption: 'oi' } }) }); ok(r.includes('imageMessage'), 'dectetor: ' + r);
  r = await say(ADM, '.revelar', { ctx: quote({ viewOnceMessage: { message: { imageMessage: { caption: 'x' } } } }) }); ok(out[0] && out[0].image && out[0].caption.includes('Revelado'), 'revelar: ' + r);
  r = await say(MEM, '.revelar'); ok(r.includes('administrador'), 'revelar so admin');
  r = await say(ADM, '.limpar'); ok(r.includes('Chat limpo'), '.limpar sem argumentos limpa o chat');
  await say(ADM, '.nanosaida {nome} saiu'); out.length = 0; await handler.onParticipants(sock, 's1', { id: GJ, action: 'remove', participants: [MEM] }); ok(out.some(o => o.image && (o.caption || '').includes('saiu')), 'saida de membro com foto');

  await say(ADM, '.antiflood off');
  // ===== anime e diversao =====
  r = await say(CLI, '.sasuke'); ok(out[0].image && out[0].caption.includes('SASUKE') && out[0].caption.endsWith(WM_CLI), 'foto do sasuke');
  for (const x of ['naruto', 'itachi', 'madara', 'kakashi', 'sakura', 'obito']) { await say(CLI, '.' + x); ok(out[0] && out[0].image, 'foto de ' + x); }
  r = await say(CLI, '.hinata'); ok(!out[0].image && r.includes('Foto não encontrada'), 'hinata sem foto: erro explicito, nenhuma imagem: ' + r);
  r = await say(CLI, '.waifu'); ok(out[0] && out[0].image, 'waifu offline usa foto local');
  r = await say(CLI, '.quote'); ok(r.includes('🩸'), 'quote'); r = await say(CLI, '.amv sasuke'); ok(r.includes('youtube.com'), 'amv'); r = await say(CLI, '.otaku'); ok(r.includes('NÍVEL OTAKU'), 'otaku');
  r = await say(CLI, '.anime naruto'); ok(r.includes('Não consegui consultar'), 'anime sem rede: erro explicito');
  r = await say(CLI, '.dado'); ok(r.includes('Dado'), 'dado'); r = await say(CLI, '.moeda'); ok(/CARA|COROA/.test(r), 'moeda'); r = await say(CLI, '.8ball vou ganhar?'); ok(r.includes('🎱'), '8ball');
  r = await say(CLI, '.abraçar @b', { ctx: mention(BAD) }); ok(r.includes('abraçou'), 'abraçar (cedilha)'); r = await say(CLI, '.beijar @b', { ctx: mention(BAD) }); ok(r.includes('beijo'), 'beijar'); r = await say(CLI, '.socar @b', { ctx: mention(BAD) }); ok(r.includes('soco'), 'socar');
  r = await say(CLI, '.ship @b', { ctx: mention(BAD) }); ok(/\d+%/.test(r), 'ship'); r = await say(CLI, '.casal'); ok(r.includes('casal'), 'casal');
  r = await say(CLI, '.jutsu'); ok(r.includes('Rank'), 'jutsu'); r = await say(CLI, '.sharingan'); ok(/Sharingan|Mangekyō/.test(r), 'sharingan: ' + r);
  r = await say(CLI, '.daily'); ok(r.includes('+12 pontos'), 'daily: ' + r); r = await say(CLI, '.daily'); ok(r.includes('Já recebeste'), 'daily 1x por dia');

  // ===== permissoes basicas, soadmin, bot off =====
  r = await say(MEM, '.ban @b', { ctx: mention(BAD) }); ok(r.includes('administrador') && reacts.includes('🚫'), 'membro nao bane (reacao 🚫)');
  await say(ADM, '.soadmin on'); r = await say(MEM, '.tabela'); ok(r === '', 'soadmin'); await say(ADM, '.soadmin off');
  await say(ADM, '.bot off'); r = await say(CLI, '.tabela'); ok(r === '', 'bot off'); r = await say(ADM, '.bot on'); ok(r.includes('ligado'), 'bot on');
  r = await say(ADM, '.add admfixo @c', { ctx: mention(CLI) }); ok(r.includes('admin fixo'), 'admfixo'); r = await say(CLI, '.ban @b', { ctx: mention(BAD) }); ok(r.includes('banido'), 'admfixo age como admin');
  // LID: dono reconhecido pelo participantPn
  r = await say('99887766@lid', '.antiaudio on', { key: { participantPn: cfg.owner.numero + '@s.whatsapp.net' } }); ok(r.includes('ligado'), 'dono reconhecido via participantPn (LID): ' + r);

  // ===== validade expirada =====
  const OWN = '258849999999@s.whatsapp.net';
  db.session('s1').until = Date.now() - 1000;
  r = await say(CLI, '.tabela'); ok(r.includes('terminou') && r.includes(canal), 'expirado: aviso com link do canal: ' + r);
  r = await say(CLI, '.tabela'); ok(r === '', 'aviso nao repete em 10 min');
  r = await say(BAD, 'olha https://golpe.com'); ok(r === '', 'expirado: protecoes desligadas');
  out.length = 0; await handler.handle(sock, 's1', { key: { remoteJid: OWN, id: 'E' + (++n), fromMe: false }, message: { conversation: '.menu' }, messageTimestamp: 1 }, 'notify');
  ok(out.length === 1 && out[0].text.includes('terminou') && !out[0].image, 'expirado: nem o dono do bot usa o menu');
  r = await say(CLI, '.criador'); ok(out[0].caption.includes('Leo'), 'expirado: .criador livre'); r = await say(CLI, '.canal'); ok(r.includes(canal), 'expirado: .canal livre');
  const sent = [];
  const mk = (t) => ({ user: { id: 'x' }, sendMessage: async (j, c) => sent.push(t + ':' + j.split('@')[0] + ':' + c.text) });
  await expiry.check(new Map([['main', mk('main')], ['s1', mk('s1')]]));
  ok(sent.length === 2 && sent.some(x => x.startsWith('s1:258849999999') && x.includes(canal)), 'aviso de expiracao: ' + sent.length);
  db.session('s1').until = Date.now() + 864e5 * 5; r = await say(CLI, '.tabela'); ok(r !== '' && !r.includes('terminou'), 'renovado volta ao normal');

  // ===== plataforma: so o dono =====
  const dm = async (from, t, sid = 'main') => { out.length = 0; await handler.handle(sock, sid, { key: { remoteJid: from, id: 'D' + (++n), fromMe: false }, message: { conversation: t }, messageTimestamp: 1 }, 'notify'); await new Promise(r => setTimeout(r, 120)); return out.map(o => o.text || (o.image ? 'IMG:' + o.caption : '')).join(' | '); };
  const DONO = cfg.owner.numero + '@s.whatsapp.net', ESTR = '258845555555@s.whatsapp.net';
  // ===== TESTE GRATIS + ANUNCIOS =====
  const P1 = '258846000001@s.whatsapp.net', P2 = '258846000002@s.whatsapp.net';
  const canalLink = cfg.canal;
  cfg.teste.pareamento = true;   // testa tambem o teste por pareamento (opcional)
  r = await say(CLI, '.teste', {}, 'main'); ok(r.includes('Só admins'), 'teste em grupo: so admins pedem: ' + r.slice(0, 60));
  r = await say(CLI, '.teste'); ok(r.includes('bot principal'), 'teste so no bot principal');
  r = await dm(P1, '.teste'); ok(r.includes('TESTE GRÁTIS') && r.includes('ABCD-1234'), 'teste: codigo de pareamento: ' + r.slice(0, 120));
  const T1 = db.session('t258846000001');
  ok(T1 && T1.trial && T1.status === 'pareando' && db.data.trials['258846000001'], 'teste: sessao trial criada e registada');
  const stubT = created[created.length - 1];
  stubT.ev.emit('connection.update', { connection: 'open' }); await new Promise(r => setTimeout(r, 150));
  ok(T1.trialStart && Math.abs(T1.until - Date.now() - 24 * 3600e3) < 5000, 'teste: 24h contam a partir da ligacao');
  r = await dm(P1, '.teste'); ok(r.includes('teste ativo') || r.includes('já tem um bot'), 'teste: 2o pedido do mesmo numero: ' + r.slice(0, 60));
  r = await dm(P1, '.teste 258846000002'); ok(r.includes('já foi usado'), 'teste: 1 por pessoa: ' + r.slice(0, 80));
  r = await dm(P2, '.teste 258846000001'); ok(r.includes('já tem um bot') || r.includes('teste ativo'), 'teste: numero ja em uso');
  r = await dm(DONO, '.teste off'); ok(r.includes('desligado'), '.teste off'); r = await dm(P2, '.teste'); ok(r.includes('indisponível'), 'teste desligado'); await dm(DONO, '.teste on');
  r = await dm(DONO, '.testes'); ok(r.includes('+258846000001'), '.testes lista');

  // anuncios: a cada 7 comandos, so em bots de teste, nunca em .canal/.dono
  const SID = 't258846000001', ads = [];
  for (let i = 1; i <= 14; i++) { r = await say(CLI, '.moeda', {}, SID, GJ2); ads.push(out.some(o => (o.text || '').includes('PUBLICIDADE'))); if (i === 3) { r = await say(CLI, '.canal', {}, SID, GJ2); ok(!r.includes('PUBLICIDADE') && r.includes(canalLink), '.canal nao conta nem leva anuncio'); } }
  ok(ads.map((a, i) => a ? i + 1 : 0).filter(Boolean).join() === '7,14', 'anuncio exactamente no 7o e 14o comando: ' + ads.map((a, i) => a ? i + 1 : '').filter(Boolean));
  for (let i = 1; i <= 7; i++) r = await say(CLI, '.moeda', {}, SID, GJ2);
  ok(r.includes('PUBLICIDADE') && r.includes(canalLink) && r.includes('Teste grátis') && r.includes('Alugue o bot') && r.includes('DICA PRO') === false || r.includes('NÃO PERCA'), 'anuncio profissional: variante 3 com link do canal e rodape do teste');
  const prim = (await (async () => { for (let i = 1; i <= 7; i++) r = await say(CLI, '.moeda', {}, 't258846000001', '1203630555@g.us'); return r; })());
  ok(prim.includes('CANAL OFICIAL') && prim.includes('PUBLICIDADE'), 'cada chat tem o seu contador (1a variante no chat novo)');
  let pago = false; for (let i = 1; i <= 21; i++) { await say(CLI, '.moeda', {}, 's1', GJ2); if (out.some(o => (o.text || '').includes('PUBLICIDADE'))) pago = true; }
  ok(!pago, 'clientes pagantes nao veem anuncios');
  let prin = false; for (let i = 1; i <= 14; i++) { await say(CLI, '.moeda', {}, 'main', GJ2); if (out.some(o => (o.text || '').includes('PUBLICIDADE'))) prin = true; }
  ok(!prin, 'bot principal sem anuncios');
  r = await say('258846000001@s.whatsapp.net', '.broadcast oi', {}, SID, GJ2); ok(r.includes('plano alugado'), 'broadcast bloqueado em teste: ' + r.slice(0, 60));

  // fim do teste: aviso, congelamento, lead para o dono e limpeza
  T1.until = Date.now() + 2.5 * 3600e3; T1.warn = null; const sent2 = [];
  const mk2 = (t) => ({ user: { id: 'x' }, sendMessage: async (j, c) => sent2.push(t + ':' + j.split('@')[0] + ':' + c.text) });
  const socks2 = () => new Map([['main', mk2('main')], [SID, mk2('trial')]]);
  await expiry.check(socks2()); ok(sent2.length === 1 && sent2[0].startsWith('trial:258846000001') && sent2[0].includes('3 horas'), 'aviso 3h antes: ' + sent2);
  T1.until = Date.now() - 1000; sent2.length = 0; await expiry.check(socks2());
  ok(sent2.length === 2 && sent2.some(x => x.startsWith('trial:') && x.includes(canalLink) && x.includes('terminou')) && sent2.some(x => x.startsWith('main:258852223969') && x.includes('.alugar 258846000001')), 'fim do teste: aviso ao utilizador (com canal) e lead ao dono: ' + sent2.length);
  r = await say(CLI, '.moeda', {}, SID, GJ2); ok(r.includes('teste grátis') && r.includes('terminou') && r.includes(canalLink), 'teste expirado congela e avisa: ' + r.slice(0, 80));
  r = await dm(DONO, '.alugar 258846000001 30'); ok(r.includes('convertido') && T1.trial === false && T1.until > Date.now(), 'alugar converte o teste em aluguel: ' + r);
  r = await say(CLI, '.moeda', {}, SID, GJ2); ok(/CARA|COROA/.test(r), 'depois de alugar volta a funcionar');
  // limpeza: nunca ligou -> apaga e devolve o direito ao teste; expirou ha dias -> apaga a sessao
  r = await dm(P2, '.teste'); ok(r.includes('ABCD-1234'), 'P2 pede teste'); const T2 = db.session('t258846000002'); T2.createdAt = Date.now() - 3600e3;
  await expiry.check(new Map()); ok(!db.session('t258846000002') && !db.data.trials['258846000002'], 'teste que nunca ligou: limpo e direito devolvido');
  const T3 = db.ensureSession('t258846000009', { name: 'X', ownerPhone: '258846000009', trial: true, trialStart: Date.now() - 5 * 864e5, until: Date.now() - 4 * 864e5 }); db.data.trials['258846000009'] = { at: 1, by: '258846000009', sid: T3.id };
  await expiry.check(new Map()); ok(!db.session('t258846000009') && db.data.trials['258846000009'], 'teste expirado ha dias: sessao apagada, registo mantido');
  cfg.teste.pareamento = false;
  r = await dm(DONO, '.resetteste 258846000009'); ok(r.includes('pode pedir outro'), '.resetteste');

  // ===================== ALUGUER POR GRUPO (bot principal) =====================
  const AL = require(BOT + '/src/lib/aluguer');
  const GM = '1203631111@g.us', GR2 = '1203631112@g.us', GR3 = '1203631113@g.us', GX = '1203633333@g.us', GN = '1203632222@g.us', GT = '1203634444@g.us', GN2 = '1203635555@g.us';
  const M = (jid, from, t, extra = {}) => say(from, t, extra, 'main', jid);
  const hojeMais = (d) => AL.fmtData(Date.now() + d * 864e5);

  r = await M(GM, CLI, '.tabela'); ok(r.includes('ainda não tem aluguer'), 'grupo sem aluguer avisa: ' + r.slice(0, 60));
  r = await M(GM, CLI, 'tabela'); ok(r === '', 'grupo sem aluguer: nao responde sem ponto');
  r = await M(GM, CLI, '.tabela'); ok(r === '', 'aviso de grupo sem aluguer nao repete');
  r = await M(GM, ADM, '.alugar 258841234567 30'); ok(r === '', '.alugar de admin de grupo e ignorado');
  r = await M(GM, CLI, '.verprazo'); ok(r.includes('ainda não tem aluguer'), '.verprazo livre em grupo sem aluguer');
  // --- .alugar: erros e formas ---
  r = await M(GM, DONO, '.alugar'); ok(r.includes('Quantos dias? Uso: .alugar numero dias'), 'alugar sem nada: ' + r.slice(0, 70));
  r = await M(GM, DONO, '.alugar 258841234567'); ok(r.includes('Quantos dias? Uso: .alugar numero dias - Ex: .alugar 258841234567 2'), 'sem dias (numero)');
  r = await M(GM, DONO, '.alugar @258842222222', { ctx: mention(CLI) }); ok(r.includes('Quantos dias? Uso: .alugar @usuario 2'), 'sem dias (mencao): ' + r.slice(0, 60));
  for (const d of ['0', '-5', 'abc', '2.5']) { r = await M(GM, DONO, '.alugar 258841234567 ' + d); ok(r.includes('Dias inválidos. Escolhe um número maior que 0. Ex: .alugar 258841234567 5'), 'dias invalidos ' + d + ': ' + r.slice(0, 50)); }
  ok(!db.session('main').groups[GM].rent, 'nada foi alugado com dias invalidos');
  r = await M(GM, DONO, '.alugar 258841234567 2'); ok(r.includes('Alugado por 2 dias! Expira em: ' + hojeMais(2)), 'alugar numero 2 dias: ' + r.slice(0, 80));
  ok(db.session('main').groups[GM].rent.por === '258841234567' && db.session('main').groups[GM].rent.dias === '2', 'guarda grupo/quem/dias');
  r = await M(GM, DONO, '.alugar @258842222222 30', { ctx: mention(CLI) }); ok(r.includes('Alugado por 30 dias! Expira em: ' + hojeMais(30)) && db.session('main').groups[GM].rent.por === '258842222222', 'alugar @mencao 30: ' + r.slice(0, 70));
  for (const d of ['1', '1000', '100000']) { r = await M(GM, DONO, '.alugar 258841234567 ' + d); ok(r.includes(`Alugado por ${d} dias!`) && !r.includes('Infinito'), 'alugar ' + d + ' dias: ' + r.slice(0, 60)); }
  r = await M(GM, DONO, '.alugar 258841234567 6486316487399'); ok(r.includes('Alugado por 6486316487399 dias! Expira em: Infinito / Sem expiração'), 'numero gigante = infinito: ' + r.slice(0, 90));
  r = await M(GM, DONO, '.alugar 258841234567 99999999999999999999999999'); ok(r.includes('Infinito / Sem expiração'), 'numero ENORME sem estourar');
  r = await M(GM, CLI, '.verprazo'); ok(r.includes('Tempo ilimitado / Sem expiração'), '.verprazo infinito: ' + r.slice(0, 60));
  r = await M(GM, DONO, '.alugar@258842222222 876544688853 dias', { ctx: mention(CLI) }); ok(r.includes('Alugado por 876544688853 dias! Expira em: Infinito / Sem expiração'), '.alugar@usuario colado, dias gigantes e palavra "dias": ' + r.slice(0, 90));
  r = await M(GM, DONO, '.alugar@258842222222 5', { ctx: mention(CLI) }); ok(r.includes('Alugado por 5 dias!'), '.alugar@usuario 5');
  r = await M(GM, DONO, '.alugar @258842222222 7', { ctx: mention(CLI) }); r = await M(GM, CLI, '.verprazo'); ok(r.includes('faltam 7 dia(s)'), '.verprazo mostra dias: ' + r.slice(0, 60));
  // aviso de 1 dia (so se nao for infinito) e expiracao
  const gm = db.session('main').groups[GM];
  gm.rent.fim = Date.now() + 20 * 3600e3; out.length = 0; await handler.tick(new Map([['main', sock]])); ok(out.some(o => (o.text || '') === 'Falta 1 dia para o aluguer expirar.'), 'aviso: falta 1 dia');
  out.length = 0; await handler.tick(new Map([['main', sock]])); ok(!out.some(o => (o.text || '').includes('Falta 1 dia')), 'aviso de 1 dia so uma vez');
  await M(GM, DONO, '.alugar 258841234567 99999999999999999999999999'); out.length = 0; await handler.tick(new Map([['main', sock]])); ok(!out.some(o => (o.text || '').includes('Falta 1 dia')), 'infinito nunca avisa');
  await M(GX, DONO, '.alugar 258841234567 5'); db.session('main').groups[GX].rent.fim = Date.now() - 1000; out.length = 0; await handler.tick(new Map([['main', sock]]));
  ok(out.some(o => (o.text || '') === 'O aluguer deste grupo expirou.'), 'aviso: aluguer expirou');
  r = await M(GX, CLI, '.tabela'); ok(r.includes('O aluguer deste grupo expirou.'), 'expirado: bot para de responder: ' + r.slice(0, 50)); r = await M(GX, CLI, 'tabela'); ok(r === '', 'expirado: sem ponto tambem fica mudo');
  r = await dm(DONO, '.alugados'); ok(r.includes('GRUPOS ALUGADOS') && r.includes('sem expiração') && r.includes('EXPIRADO'), '.alugados: ' + r.slice(0, 100));
  r = await M(GX, DONO, '.removeraluguer'); ok(r.includes('removido') && !db.session('main').groups[GX].rent, '.removeraluguer');

  // ===================== CONFIGURACAO POR GRUPO + SEM PONTO =====================
  await M(GR2, DONO, '.alugar 258841234567 30'); await M(GR3, DONO, '.alugar 258841234567 30');
  for (const [w, item] of [['Tabela', 'a tabela'], ['01', 'a tabela'], ['Pagamento', 'o pagamento'], ['02', 'o pagamento'], ['ilimitado', 'a tabela de ilimitado'], ['04', 'a tabela de ilimitado']]) {
    r = await M(GM, CLI, w); ok(r.startsWith(`Este grupo ainda não configurou ${item}. Peça ao dono do grupo para configurar.`), `sem config: "${w}" -> ${r.slice(0, 55)}`);
  }
  r = await M(GM, CLI, 'tabela'); ok(r.endsWith(cfg.marca), 'resposta sem ponto leva marca dagua');
  await M(GM, ADM, '.setnome LOJA DO ZE'); await M(GM, ADM, '.setdono Ze Silva'); await M(GM, ADM, '.setsuporte 841112222'); await M(GM, ADM, '.setnumero M-Pesa 841234567');
  r = await M(GM, ADM, '.settabela 1GB - 45MT\n2GB - 80MT\n5GB - 190MT'); ok(r.includes('Tabela salva'), 'settabela: ' + r.slice(0, 60));
  const T1_ = await M(GM, CLI, 'Tabela'), T2_ = await M(GM, CLI, '01');
  ok(T1_ === T2_ && T1_.includes('LOJA DO ZE') && T1_.includes('2GB - 80MT') && T1_.includes('Pagamento ou 02'), 'Tabela == 01 (mesma tabela do grupo): ' + T1_.slice(0, 80));
  const P1_ = await M(GM, CLI, 'Pagamento'), P2_ = await M(GM, CLI, '02');
  ok(P1_ === P2_ && P1_.includes('FORMAS DE PAGAMENTO') && P1_.includes('841234567') && P1_.includes('Suporte — 841112222') && P1_.includes('envie o comprovativo juntamente com o número'), 'Pagamento == 02: ' + P1_.slice(0, 120));
  ok((await M(GM, CLI, 'Megas')) === (await M(GM, CLI, '03')) && (await M(GM, CLI, 'megas')).includes('Pode mandar o valor'), 'Megas == 03');
  const MN1 = await M(GM, CLI, 'Menu'), MN2 = await M(GM, CLI, '00'); ok(MN1 === MN2 && MN1.includes('LOJA DO ZE ⚡') && MN1.includes('ilimitado ou 04'), 'Menu == 00: ' + MN1.slice(0, 60));
  await M(GM, ADM, '.setilimitado Ilimitado diario 30MT'); ok((await M(GM, CLI, 'ilimitado')) === (await M(GM, CLI, '04')) && (await M(GM, CLI, '04')).includes('Ilimitado diario 30MT'), 'ilimitado == 04');
  r = await M(GM, ADM, '.setpagamento Pague antes de enviar'); r = await M(GM, CLI, 'pagamento'); ok(r.includes('Pague antes de enviar'), 'setpagamento aparece no pagamento');
  r = await M(GR2, CLI, 'Tabela'); ok(r.startsWith(U.nc('a tabela')), 'OUTRO grupo nao ve a tabela do primeiro: ' + r.slice(0, 50));
  r = await M(GM, ADM, '.verconfig'); ok(r.includes('LOJA DO ZE') && r.includes('Ze Silva') && r.includes('841112222'), '.verconfig: ' + r.slice(0, 60));
  r = await M(GR2, ADM, '.verconfig'); ok(r.includes('❌ (.setnome)'), '.verconfig de outro grupo vazio');
  r = await M(GR3, ADM, '.setnome TESTE'); r = await M(GR3, ADM, '.limparconfig'); r = await M(GR3, CLI, 'tabela'); ok(db.session('main').groups[GR3].conf.nome === undefined, '.limparconfig limpa so aquele grupo');
  ok(db.session('main').groups[GM].conf.nome === 'LOJA DO ZE', 'limparconfig nao mexeu noutro grupo');
  r = await M(GM, CLI, '.setnome X'); ok(r.includes('administrador'), 'cliente nao configura');
  // --- NANO: prioridade, numero automatico, alias, nomes ---
  r = await M(GM, ADM, '.nanoadd tabela | NANO TABELA [NOME_DA_LOJA]'); ok(r.includes('Nano criado') && r.includes('01'), 'nanoadd tabela cria tambem o 01: ' + r.slice(0, 80));
  ok((await M(GM, CLI, 'tabela')).includes('NANO TABELA LOJA DO ZE'), 'NANO tem prioridade sobre o comando (sem ponto)'); ok((await M(GM, CLI, '01')).includes('NANO TABELA LOJA DO ZE'), 'numero 01 criado automaticamente');
  r = await M(GM, CLI, '.tabela'); ok(!r.includes('NANO') && r.includes('2GB - 80MT'), 'com ponto responde o COMANDO normal: ' + r.slice(0, 60));
  r = await M(GM, ADM, '.nanoadd 1 | tabela'); ok(r.includes('Nano criado'), '.nanoadd 1 | tabela aceita 1 caractere: ' + r.slice(0, 60)); ok((await M(GM, CLI, '1')).includes('NANO TABELA'), 'nano "1" = tabela');
  await M(GM, ADM, '.nanoadd 2 | pagamento'); ok((await M(GM, CLI, '2')).includes('FORMAS DE PAGAMENTO'), 'nano "2" = pagamento (palavra da loja)');
  r = await M(GM, ADM, '.nanoadd a | letra a'); ok((await M(GM, CLI, 'a')).includes('letra a'), 'nome de 1 letra');
  r = await M(GM, ADM, '.nanoadd 3 | megas'); r = await M(GM, ADM, '.nanoadd promo 07 | Promoção da semana'); ok((await M(GM, CLI, '07')).includes('Promoção da semana') && (await M(GM, CLI, 'promo')).includes('Promoção da semana'), 'escolher o numero na criacao');
  r = await M(GM, ADM, '.nanoadd meu nome grande | x'); ok(!r.includes('Nano criado'), 'nome com espacos bloqueado'); r = await M(GM, ADM, '.nanoadd ab$ | x'); ok(r.includes('Nome inválido'), 'simbolo bloqueado: ' + r.slice(0, 50));
  r = await M(GM, CLI, '.nanolist'); ok(r.includes('• tabela') && r.includes('• promo'), '.nanolist do grupo');
  r = await M(GR2, CLI, '.nanolist'); ok(r.includes('ainda não criou nanos'), '.nanolist de outro grupo vazio'); ok((await M(GR2, CLI, 'promo')) === '', 'nano do grupo A nao aparece no B');
  await M(GR2, ADM, '.limparnano'); ok(Object.keys(db.session('main').groups[GM].nano.comandos).length > 3, '.limparnano de B nao apaga A');
  await M(GM, ADM, '.nanodel tabela'); ok(!(await M(GM, CLI, 'tabela')).includes('NANO TABELA') && !db.session('main').groups[GM].nano.comandos['01'], '.nanodel apaga o nano e o numero ligado');

  // ===================== AUTO-COMPROVATIVO (fluxo do video: detecta -> aguarde -> admin regista com .compra) =====================
  await M(GM, ADM, '.mpesa 841234567-Ze');
  const vendasAntes = db.session('main').groups[GM].sales.length;
  r = await M(GM, CLI, 'Confirmado ABC123XYZ. Transferiste 80.00MT para conta 841234567, nome: ZE SILVA. Enviar para 842223333');
  ok(r.includes('Comprovativo detectado') && r.includes('(M-Pesa)') && r.includes('Chave:* ABC123XYZ') && r.includes('Destino validado:* Ze Silva') && r.includes('Valor:* 80.00 MT') && r.includes('Hoje às') && r.includes('842223333'), 'comprovativo detectado (M-Pesa): ' + r.slice(0, 120));
  ok(r.includes('Pagamento M-Pesa detectado!') && r.includes('@258842222222, aguarde alguns instantes enquanto o adm confirma o seu pagamento') && r.includes('banimento imediato') && r.includes('O adm já volta com a confirmação!'), 'mensagem de aguarde com aviso de fraude: ' + r.slice(-200));
  ok(!r.includes('A transferir') && db.session('main').groups[GM].sales.length === vendasAntes, 'fluxo padrao NAO regista venda sozinho');
  r = await M(GM, CLI, 'Chave: DEF456 Valor: 45.00MT conta 841234567'); ok(r.includes('Comprovativo detectado') && r.includes('envie o número que vai receber os megas') && !r.includes('aguarde alguns'), 'pede o numero que falta: ' + r.slice(0, 140));
  r = await M(GM, CLI, '842223333'); ok(r.includes('Número para receber:* 258842223333') && r.includes('Pagamento M-Pesa detectado!'), 'numero enviado depois: aguarde: ' + r.slice(0, 100));
  r = await M(GM, BAD, 'ID da transacao GHI789. Transferiste 12.00MT para conta 841234567 842223333'); ok(r.includes('(E-Mola)') && r.includes('Pagamento E-Mola detectado!') && db.session('main').groups[GM].sales.length === vendasAntes, 'E-Mola reconhecido; valor fora da tabela fica para o admin: ' + r.slice(0, 80));
  r = await M(GM, BAD, 'Confirmado ABC123XYZ. Transferiste 80.00MT para conta 841234567 842223333'); ok(r.includes('já foi usado'), 'chave repetida barrada');
  r = await M(GM, BAD, 'Confirmado JKL000. Transferiste 80.00MT para conta 849990000 842223333'); ok(r.includes('não é a deste grupo'), 'destino de outro dono barrado');
  r = await M(GR2, CLI, 'Confirmado MNO111. Transferiste 80.00MT para conta 841234567 842223333'); ok(r.includes('Destino não validado') && r.includes('ainda não configurou o pagamento') && !r.includes('aguarde alguns'), 'grupo sem config: nao valida: ' + r.slice(0, 120));
  // admin regista com .compra 2GB respondendo ao cliente: usa a chave e o numero do comprovativo
  const quoteDe = (j) => ({ ctx: { quotedMessage: { conversation: 'Confirmado ABC123XYZ...' }, participant: j, stanzaId: 'QC' } });
  r = await M(GM, CLI, '.compra 2GB', quoteDe(CLI)); ok(!r.includes('Obrigado @'), 'cliente NAO regista compra para si pelo atalho de admin: ' + r.slice(0, 60));
  r = await M(GM, ADM, '.compra 2GB', quoteDe(CLI)); const gmx = db.session('main').groups[GM]; const ult = gmx.sales[gmx.sales.length - 1];
  ok(r.includes('Obrigado @258842222222 por comprar *2GB*!') && ult.txid === 'DEF456' && ult.number === '258842223333' && ult.status === 'enviado' && !gmx.recibos['258842222222'], 'admin regista .compra 2GB (liga ao ultimo comprovativo do cliente): ' + r.slice(0, 80));
  // estatisticas no agradecimento
  const GE = '1203637777@g.us'; await M(GE, DONO, '.alugar 258841234567 30');
  r = await M(GE, ADM, '.compra 512MB', quoteDe(CLI)); ok(r.includes('Obrigado @258842222222 por comprar *512MB*!') && r.includes('primeira compra do dia') && r.includes('comprador nº 1') && r.includes('total acumulado de *0.50GB*') && r.includes('Você é o maior comprador do grupo!') && r.includes('Cliente como você merece o melhor'), 'agradecimento: 1a compra do dia, nº 1: ' + r);
  r = await M(GE, ADM, '.compra 1024MB', quoteDe(BAD)); ok(r.includes('total acumulado de *1.00GB*') && r.includes('comprador nº 1'), 'maior comprador passa a ser o BAD');
  r = await M(GE, ADM, '.compra 256MB', quoteDe(CLI)); ok(r.includes('2ª compra do dia') && r.includes('comprador nº 2') && r.includes('total acumulado de *0.75GB*') && r.includes('O maior comprador acumulou *1.00GB*'), 'agradecimento: 2a compra do dia, nº 2, maior comprador: ' + r);
  r = await M(GE, ADM, '.compra 512MB', { ctx: mention(BAD) }); ok(r.includes('Obrigado @258843333333'), '.compra tambem aceita @cliente');
  r = await M(GE, ADM, '.compra', quoteDe(CLI)); ok(!r.includes('Obrigado @'), '.compra sem quantidade nao regista');
  // entrega automatica ligada: "A transferir..." + venda registada pelo valor da tabela
  await M(GM, ADM, '.pagamento on');
  r = await M(GM, MEM, 'Confirmado AUTO777. Transferiste 80.00MT para conta 841234567, nome: ZE SILVA. 842224444'); ok(r.includes('A transferir...') && r.includes('Pagamento confirmado') && r.includes('2GB') && gmx.sales.length >= 2, 'com .pagamento on: A transferir + venda pela tabela: ' + r.slice(-120));
  await M(GM, ADM, '.pagamento off');
  // formato REAL do M-Pesa (do video): "para 258850868013 - NOME aos ..."; destino pelo nome do SMS; numero enviado depois
  const GV = '1203638888@g.us'; await M(GV, DONO, '.alugar 258841234567 30'); await M(GV, ADM, '.setnumero M-Pesa 850868013');
  r = await M(GV, CLI, 'Confirmado DKJB32T4RG. Transferiste 10.00MT e a taxa foi de 0.00MT para 258850868013 - ALMEIDA LUCAZE aos 19/11/26 às 1:30 PM. O teu novo saldo M-Pesa e de 160.00MT. Continua a transferir SEM TAXAS de M-Pesa para M-Pesa. Em caso de duvida, liga 100.');
  ok(r.includes('(M-Pesa)') && r.includes('Chave:* DKJB32T4RG') && r.includes('Destino validado:* ALMEIDA LUCAZE') && r.includes('Valor:* 10.00 MT') && r.includes('envie o número'), 'SMS real do M-Pesa: ' + r.slice(0, 130));
  r = await M(GV, CLI, '855965239'); ok(r.includes('258855965239') && r.includes('aguarde alguns instantes'), 'depois envia o numero (como no video): ' + r.slice(0, 80));

  // ===== PERSONALIZACAO por grupo =====
  r = await M(GM, ADM, '.setaguarde 🙏 [CLIENTE], recebemos o seu [PROVEDOR] de [VALOR]. [NOME_DA_LOJA] confirma já!'); ok(r.includes('guardado') && out.some(o => (o.text || '').includes('recebemos o seu M-Pesa de 10.00 MT')), '.setaguarde com pre-visualizacao: ' + flat().slice(0, 120));
  r = await M(GM, CLI, 'Confirmado PERS001. Transferiste 45.00MT para conta 841234567 842223333'); ok(r.includes('🙏 @258842222222, recebemos o seu M-Pesa de 45.00 MT. LOJA DO ZE confirma já!') && !r.includes('banimento'), 'modelo personalizado usado no grupo: ' + r.slice(-120));
  r = await M(GM, ADM, '.setcomprovativo 🔎 [PROVEDOR] [CHAVE] | [VALOR] | para [NUMERO] | [DESTINO]'); r = await M(GM, CLI, 'Confirmado PERS002. Transferiste 45.00MT para conta 841234567 842223333'); ok(r.includes('🔎 M-Pesa PERS002 | 45.00 MT | para 258842223333 | Ze Silva'), '.setcomprovativo personalizado: ' + r.slice(0, 100));
  r = await M(GM, ADM, '.setagradecimento 🎉 [CLIENTE] comprou [QUANTIDADE]! É a [COMPRA_DO_DIA] e o #[POSICAO] com [TOTAL].'); r = await M(GM, ADM, '.compra 100MB', quoteDe(MEM)); ok(r.includes('🎉 @258845555555 comprou 100MB! É a'), 'agradecimento personalizado: ' + r.slice(0, 100));
  r = await M(GM, ADM, '.vermodelos'); ok(r.includes('personalizado') && r.includes('MODELOS DO AUTO-COMPROVATIVO'), '.vermodelos');
  r = await M(GR2, CLI, 'Confirmado PERS003. Transferiste 45.00MT para conta 841234567 842223333'); ok(!r.includes('recebemos o seu'), 'outro grupo nao usa o modelo deste');
  r = await M(GM, ADM, '.limparmodelos'); r = await M(GM, CLI, 'Confirmado PERS004. Transferiste 45.00MT para conta 841234567 842223333'); ok(r.includes('banimento imediato'), '.limparmodelos volta ao padrao');
  r = await M(GM, MEM, '.autocomprovativo off'); ok(r.includes('administrador'), 'so admin liga/desliga'); await M(GM, ADM, '.autocomprovativo off');
  r = await M(GM, CLI, 'Confirmado OFF001. Transferiste 45.00MT para conta 841234567 842223333'); ok(r === '', '.autocomprovativo off: bot ignora comprovativos'); await M(GM, ADM, '.auto-comprovativo on');

  // ===================== BOAS-VINDAS / SAIDA COM FOTO =====================
  const fotoOrig = sock.profilePictureUrl;
  sock.profilePictureUrl = async (j) => { if (j === MEM) return 'http://x/pessoa.jpg'; if (j === GM) return 'http://x/grupo.jpg'; throw new Error('sem foto'); };
  out.length = 0; await handler.onParticipants(sock, 'main', { id: GM, action: 'add', participants: [MEM] });
  ok(out[0] && out[0].image && out[0].image.url === 'http://x/pessoa.jpg' && out[0].caption.includes('Olá @258845555555, seja bem-vindo(a) ao grupo LOJA DO ZE') && out[0].caption.includes('Tabela ou 01') && out[0].mentions.includes(MEM), 'boas-vindas: foto DA PESSOA + @ + nome da loja: ' + (out[0] && out[0].caption));
  sock.profilePictureUrl = async (j) => { if (j === GM) return 'http://x/grupo.jpg'; throw new Error('sem foto'); };
  out.length = 0; await handler.onParticipants(sock, 'main', { id: GM, action: 'add', participants: [MEM] }); ok(out[0] && out[0].image && out[0].image.url === 'http://x/grupo.jpg', 'sem foto da pessoa: usa a foto do grupo');
  sock.profilePictureUrl = async () => { throw new Error('sem foto'); };
  out.length = 0; await handler.onParticipants(sock, 'main', { id: GM, action: 'add', participants: [MEM] }); ok(out[0] && Buffer.isBuffer(out[0].image), 'sem nenhuma foto: foto padrao do bot (nunca so texto)');
  sock.profilePictureUrl = async (j) => { if (j === MEM) return 'http://x/pessoa.jpg'; throw new Error('x'); };
  out.length = 0; await handler.onParticipants(sock, 'main', { id: GM, action: 'remove', participants: [MEM] }); ok(out[0] && out[0].image && out[0].caption.includes('@258845555555 saiu do grupo, até breve!'), 'saida: foto + texto: ' + (out[0] && out[0].caption));
  out.length = 0; await handler.onParticipants(sock, 'main', { id: GM, action: 'remove', participants: [MEM], author: ADM }); ok(out.length === 0, 'removido por admin: sem mensagem de saiu');
  await M(GM, ADM, '.nanobemvindo 🎉 @, bem-vindo à [NOME_DA_LOJA]!'); out.length = 0; await handler.onParticipants(sock, 'main', { id: GM, action: 'add', participants: [MEM] });
  ok(out[0].caption.startsWith('🎉 @258845555555, bem-vindo à LOJA DO ZE!'), 'nanobemvindo personalizado POR GRUPO: ' + out[0].caption);
  out.length = 0; await handler.onParticipants(sock, 'main', { id: GR2, action: 'add', participants: [MEM] }); ok(out[0].caption.includes('ao grupo Vendas Mega') && !out[0].caption.includes('LOJA DO ZE'), 'outro grupo usa o seu proprio texto/nome');
  await M(GM, ADM, '.nanosaida 👋 @ foi embora'); out.length = 0; await handler.onParticipants(sock, 'main', { id: GM, action: 'remove', participants: [MEM] }); ok(out[0].caption.startsWith('👋 @258845555555 foi embora'), 'nanosaida por grupo');
  out.length = 0; await handler.onParticipants(sock, 'main', { id: GN, action: 'add', participants: [MEM] }); ok(out.length === 0, 'grupo sem aluguer: sem boas-vindas');
  out.length = 0; await handler.onParticipants(sock, 'main', { id: GN2, action: 'add', participants: [sock.user.id] }); ok(out[0] && out[0].text.startsWith('Obrigado por me adicionar! Para ativar, fale com o dono. Para configurar, use .verconfig'), 'bot adicionado a grupo novo: ' + (out[0] && out[0].text));
  sock.profilePictureUrl = fotoOrig;
  r = await dm(CLI, 'tabela', 'main'); ok(r === '', 'no privado nao responde dados de grupo'); r = await dm(CLI, '.tabela', 'main'); ok(r.includes('dentro de um grupo'), '.tabela no PV: pede grupo');

  // ===================== TESTE GRATIS DO GRUPO (+ anuncios) =====================
  r = await M(GT, CLI, '.teste'); ok(r.includes('Só admins'), 'teste: so admin do grupo');
  r = await M(GT, ADM, '.teste'); ok(r.includes('TESTE GRÁTIS ATIVO') && db.session('main').groups[GT].rent.trial, 'teste do grupo ativado: ' + r.slice(0, 60));
  r = await M(GT, ADM, '.teste'); ok(r.includes('já está em teste grátis'), 'teste repetido no mesmo grupo');
  r = await M(GN2, ADM, '.teste'); ok(r.includes('já foi usado por si'), 'teste: 1 por pessoa: ' + r.slice(0, 70));
  let adsT = []; for (let i = 1; i <= 14; i++) { r = await M(GT, CLI, '.moeda'); adsT.push(out.some(o => (o.text || '').includes('PUBLICIDADE'))); }
  ok(adsT.map((a, i) => a ? i + 1 : 0).filter(Boolean).join() === '7,14', 'anuncio no 7o e 14o comando do grupo em teste: ' + adsT.map((a, i) => a ? i + 1 : ''));
  ok(out.some(o => (o.text || '').includes('Teste grátis') && (o.text || '').includes(cfg.canal)), 'anuncio com link do canal e rodape do teste');
  await M(GT, DONO, '.alugar 258841234567 30'); adsT = []; for (let i = 1; i <= 14; i++) { await M(GT, CLI, '.moeda'); adsT.push(out.some(o => (o.text || '').includes('PUBLICIDADE'))); }
  ok(!adsT.some(Boolean) && db.session('main').groups[GT].rent.trial === false, 'depois de alugar: sem anuncios');

  { const ficheiro = fs.readFileSync(path.join(BOT, 'assets', 'menu.jpg'));
    r = await M(GM, CLI, '.menu'); ok(Buffer.isBuffer(out[0].image) && out[0].image.equals(ficheiro), 'bot principal: .menu usa assets/menu.jpg');
    ok(out[out.length - 1].text.endsWith(cfg.marca) && out.slice(0, -1).every(o => !(o.text || o.caption || '').includes(cfg.marca)), 'marca dagua so no fim do menu (principal)');
    r = await say(CLI, '.menu'); ok(out[0].image && !Buffer.isBuffer(out[0].image), 'bot de cliente: usa a foto de perfil, nao a arte do Sasuke'); }
  // ===================== NANO: formato ".nanoadd tabela" + LIMITE 5000 =====================
  const GF = '1203636666@g.us'; await M(GF, DONO, '.alugar 258841234567 30');
  r = await M(GF, ADM, '.nanoadd tabela\n1GB - 45MT\n2GB - 80MT\n5GB - 190MT'); ok(r.includes('Nano criado') && r.includes('01'), '.nanoadd tabela + conteudo nas linhas de baixo: ' + r.slice(0, 80));
  r = await M(GF, CLI, 'tabela'); ok(r.includes('1GB - 45MT\n2GB - 80MT\n5GB - 190MT'), 'digitar "tabela" mostra o conteudo: ' + r.slice(0, 60));
  r = await M(GF, ADM, '.nanoadd pagamento', { ctx: { quotedMessage: { conversation: 'M-Pesa 841234567 Ze' }, participant: ADM, stanzaId: 'q9' } }); ok(r.includes('Nano criado'), '.nanoadd respondendo a uma mensagem');
  ok((await M(GF, CLI, '02')).includes('M-Pesa 841234567 Ze'), 'numero 02 automatico mostra o conteudo');
  r = await M(GF, ADM, '.nanoadd vazio'); ok(r.includes('Como criar') && r.includes('5000'), '.nanoadd sem conteudo explica o formato');
  r = await M(GF, ADM, '.nanoadd grande ' + 'x'.repeat(5000)); ok(r.includes('Nano criado'), 'aceita exactamente 5000 caracteres: ' + r.slice(0, 60));
  r = await M(GF, CLI, 'grande'); ok(out.some(o => (o.text || '').includes('x'.repeat(5000))), 'resposta de 5000 caracteres e enviada inteira');
  r = await M(GF, ADM, '.nanoadd grande2 ' + 'x'.repeat(5001)); ok(r.includes('5000') && !r.includes('Nano criado'), '5001 caracteres e recusado: ' + r.slice(0, 70));

  // ===================== FONTE DO BOT (𝗲𝘀𝘀𝗮) =====================
  cfg.fonte = 'sans-bold';
  r = await M(GF, DONO, '.alugar 258841234567'); ok(r.includes('𝗤𝘂𝗮𝗻𝘁𝗼𝘀 𝗱𝗶𝗮𝘀?') && r.includes('.alugar') && r.includes('258841234567') && r.includes('Ex: .alugar'.replace('Ex', '𝗘𝘅')), 'fonte: letras estilizadas; comandos e numeros ficam normais: ' + r.slice(0, 90));
  r = await M(GF, ADM, '.nanodel xyz'); ok(r.includes('𝗡𝗮𝗻𝗼 𝗻𝗮\u0303𝗼 𝗲𝗻𝗰𝗼𝗻𝘁𝗿𝗮𝗱𝗼') && r.includes('.nanolist'), 'acentos viram marcas combinadas; comando fica normal: ' + r.slice(0, 50));
  ok((await M(GF, CLI, 'tabela')).includes('1GB - 45MT\n2GB - 80MT'), 'conteudo do nano NAO recebe a fonte (fica como o admin escreveu)');
  r = await M(GF, CLI, 'Menu'); ok(r.includes('𝗖𝗼𝗺𝗮𝗻𝗱𝗼𝘀 𝘂́𝘁𝗲𝗶𝘀') || r.includes('𝗖𝗼𝗺𝗮𝗻𝗱𝗼𝘀'), 'modelo padrao do Menu na fonte: ' + r.slice(0, 80));
  r = await M(GF, CLI, 'Menu'); ok(r.includes('Tabela ou 01') === false && r.includes('01'), 'palavras do modelo estilizadas, numeros normais');
  await M(GF, ADM, '.setnome LOJA X'); r = await M(GF, CLI, 'Menu'); ok(r.includes('LOJA X'), 'nome da loja (conteudo do grupo) fica intacto');
  r = await M(GF, ADM, '.fonte off'); r = await M(GF, CLI, '.verprazo'); ok(r.includes('Tempo ilimitado') || r.includes('faltam'), '.fonte off: texto normal: ' + r.slice(0, 60));
  await M(GF, ADM, '.fonte on'); cfg.fonte = 'nenhuma';

  r = await dm(DONO, '.conectar 258841234567 30 BOT-JONAS'); ok(r.includes('ABCD-1234') && r.includes(WM_MAIN), 'conectar: codigo + marca sasuke: ' + r.slice(0, 80));
  for (const cmd of ['.conectar 258841234567', '.pair 258841234567', '.qrcode', '.qr', '.alugar 258841234567 5', '.tirardias 258841234567 1', '.sessoes', '.desconectar x', '.status']) {
    out.length = 0; reacts.length = 0; await handler.handle(sock, 'main', { key: { remoteJid: ESTR, id: 'X' + (++n), fromMe: false }, message: { conversation: cmd }, messageTimestamp: 1 }, 'notify');
    ok(out.length === 0 && reacts.length === 0 || (cmd === '.status' && out.length === 1), 'estranho bloqueado em ' + cmd);
  }
  r = await dm(DONO, '.qrcode 15 TesteQR'); ok(r.includes('IMG:'), 'qrcode envia imagem');
  r = await dm(DONO, '.sessoes'); ok(r.includes('BOT-JONAS') && r.includes('TesteQR'), 'sessoes');
  r = await dm(DONO, '.alugar 258841234567 10'); ok(r.includes('+10'), 'alugar'); r = await dm(DONO, '.tirardias 258841234567 5'); ok(r.includes('-5'), 'tirardias');
  r = await dm(DONO, '.status'); ok(r.includes('STATUS DAS SESSÕES'), 'status no privado do dono');
  r = await dm(DONO, '.anular 258841234567'); ok(r.includes('anulado'), 'anular aluguel: ' + r); ok(db.session('s258841234567').until < Date.now(), 'aluguel anulado expirou');
  r = await dm(DONO, '.menudono'); ok(r.includes('conectar') && r.includes('bangp'), 'menudono');
  // bangp
  out.length = 0; r = await say(DONO, '.bangp', {}, 's1'); ok(calls.some(x => x.startsWith('leave:')) && db.session('s1').bannedGroups.includes(GJ), 'bangp: sai e bane o grupo'); calls.length = 0;
  await say(CLI, 'oi', {}, 's1'); ok(calls.includes('leave:' + GJ), 'bangp: sai de novo se for adicionado');

  // ===== base de dados =====
  db.flushAll(); db.flushAll();
  ok(fs.existsSync(path.join(process.env.SASUKE_DB_DIR, 'db.json')) && fs.existsSync(path.join(process.env.SASUKE_DB_DIR, 'db.json.bak')), 'db: db.json + .bak');
  ok(!!db.backupNow() && fs.readdirSync(path.join(process.env.SASUKE_DB_DIR, 'backups')).length >= 1, 'db: backup criado');

  // ===== modo humano (messageScheduler) =====
  scheduler.configure({ escala: 0.05 }); cfg.human.on = true; pres.length = 0;
  const t0 = Date.now(); await handler.handle(sock, 's1', { key: { remoteJid: GJ2, participant: CLI, id: 'H1', fromMe: false }, message: { conversation: '.uptime' }, messageTimestamp: 1 }, 'notify');
  ok(Date.now() - t0 >= 40 && pres.includes('composing') && pres.includes('paused') && out.length >= 1, `resposta humana via scheduler (${Date.now() - t0}ms, ${pres})`);
  cfg.human.on = false;

  console.log(`\n${pass} ok, ${fail} falhas`);
  // limpeza de sessoes criadas pelo teste
  for (const d of fs.readdirSync(path.join(BOT, 'sessoes'))) if (d !== '.gitkeep') fs.rmSync(path.join(BOT, 'sessoes', d), { recursive: true, force: true });
  fs.rmSync(process.env.SASUKE_DB_DIR, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
