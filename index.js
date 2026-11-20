const fs = require('fs');
const path = require('path');
const config = require('./config.json');
const cfg = require('./src/config');
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}] 🩸`, ...a);

process.on('uncaughtException', (e) => console.error('uncaughtException:', e.stack || e.message));
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e?.stack || e));

function validarConfig() {
  const dig = (n) => /^\d{10,15}$/.test(String(n));
  if (!dig(cfg.botNumber)) throw new Error('Número do bot inválido (config.bot.numeroIntl ou SASUKE_NUMERO: só dígitos, sem +).');
  if (!dig(config.dono.numeroIntl)) throw new Error('config.dono.numeroIntl inválido (só dígitos, sem +).');
  if (cfg.botNumber === config.dono.numeroIntl) throw new Error('Número do bot e do dono NÃO podem ser iguais.');
  if (!['pairing', 'qr', 'ambos'].includes(cfg.conexao)) throw new Error("conexao.modo deve ser 'pairing', 'qr' ou 'ambos'.");
}

// Auto-reparacao: se o painel deixou o node_modules a meio (erro ENOTEMPTY) ou sem o Baileys, o bot refaz a instalacao sozinho.
const DEPS = ['@whiskeysockets/baileys', '@hapi/boom', 'pino', 'qrcode', 'qrcode-terminal'];
const dependenciasOk = () => { try { DEPS.forEach(m => require.resolve(m)); return true; } catch { return false; } };
function repararDependencias() {
  console.log('🔧 Dependências em falta ou corrompidas (ex.: ENOTEMPTY). A reparar — pode demorar 3 a 5 minutos, não reinicie...');
  for (const f of ['node_modules', 'package-lock.json']) { try { fs.rmSync(path.join(__dirname, f), { recursive: true, force: true, maxRetries: 3 }); } catch {} }
  require('child_process').execSync('npm install --omit=dev --no-audit --no-fund --no-package-lock --loglevel=error', { cwd: __dirname, stdio: 'inherit' });
}

async function main() {
  validarConfig();
  if (!dependenciasOk()) {
    try { repararDependencias(); } catch (e) { console.error('npm install falhou:', e.message); }
    if (!dependenciasOk()) throw new Error('Não consegui instalar as dependências. No painel: (1) Startup > Pacotes: deixe VAZIO; (2) apague a pasta node_modules; (3) use a imagem Node 20 ou 22; (4) reinicie.');
  }
  for (const d of ['auth', 'database', 'sessoes', 'assets/anime']) fs.mkdirSync(path.join(__dirname, d), { recursive: true });

  const db = require('./src/lib/db');
  db.startBackups();
  const scheduler = require('./src/services/messageScheduler');
  scheduler.configure({ escala: cfg.human.escala });
  const sessions = require('./src/lib/sessions');
  const handler = require('./src/lib/handler');
  const expiry = require('./src/lib/expiry');

  db.ensureSession('main', { name: cfg.botName, ownerPhone: cfg.owner.numero, until: 0 });
  log(`${config.bot.nome} • ${config.bot.core} • ${handler.list.length} comandos`);

  const shutdown = async () => { try { await scheduler.esvaziar(3000); } catch {} db.flushAll(); process.exit(0); };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);

  // Sessao principal: pareamento por codigo e/ou QR (config.conexao.modo)
  await sessions.start('main', {
    mode: cfg.conexao, pairNumber: cfg.botNumber,
    onPair: (code, n = 1) => {
      console.log(`\n🩸 PAIRING CODE (${n}/3) — válido ~2 min; se expirar, vem outro sozinho`);
      console.log(`CODIGO: ${code.match(/.{1,4}/g).join('-')}`);
      console.log(`COPIAR (sem hífen): ${code}`);
      console.log(`Gerado para o número: +${cfg.botNumber}`);
      console.log('⚠️ Só o WhatsApp DESTE número consegue usar o código. Noutro número dá "Não foi possível associar o dispositivo".');
      console.log('WhatsApp > Aparelhos conectados > Conectar um aparelho > Conectar com número de telefone > escreva o código.\n');
    },
    onError: (e) => console.error('Pairing code falhou:', e.message)
  });
  sessions.restoreAll();

  setInterval(() => handler.tick(sessions.socks), 30 * 1000);
  setInterval(() => expiry.check(sessions.socks).catch(() => {}), 30 * 60 * 1000);
  setTimeout(() => expiry.check(sessions.socks).catch(() => {}), 60 * 1000);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
