// PERSONALIZAR o auto-comprovativo POR GRUPO: .setcomprovativo  .setaguarde  .setagradecimento  .vermodelos  .limparmodelos
const cfg = require('../config');
const db = require('../lib/db');
const U = require('../lib/utils');
const CP = require('../lib/comprovativo');
const loja = require('../lib/loja');
const F = require('../lib/fonte');
const { C } = require('../lib/cmd');

const body = (c) => c.text.replace(/^\S+\s*/, '').trim() || (U.getQuoted(c.m) || {}).text || '';
const exemplo = (c, chave) => {
  const g = c.g, dono = g.conf.dono || 'Nome do Dono';
  const base = { CLIENTE: '@cliente', PROVEDOR: 'M-Pesa', CHAVE: 'DKJB32T4RG', DESTINO: dono, VALOR: '10.00 MT', HORA: U.hm(), NUMERO: '841234567',
    DESTINO_LINHA: `${F.f(g, '🏦 *Destino validado:*')} ${dono}` };
  const agr = { CLIENTE: '@cliente', QUANTIDADE: '512MB', COMPRA_DO_DIA: 'primeira compra do dia', POSICAO: '1', TOTAL: '3.50GB', MAIOR_COMPRADOR: '53.98GB', TOTAL_COMPRAS: '1', MAIOR_LINHA: `${F.f(g, 'O maior comprador acumulou')} *53.98GB*.` };
  return chave === 'agradecimento' ? agr : base;
};
const setter = (cmd, chave) => C(cmd, 'admin', `Personaliza "${CP.NOMES[chave]}" DESTE grupo. Variáveis: ${CP.VARIAVEIS[chave]} ${CP.COMUNS}. Uso: .${cmd} texto (ou responda a uma mensagem)`, async (c) => {
  const t = body(c);
  if (!t) return c.reply(`Uso: .${cmd} texto   (ou responda a uma mensagem com .${cmd})\n\n*${CP.NOMES[chave]}*\nVariáveis: ${CP.VARIAVEIS[chave]}\nGerais: ${CP.COMUNS}\n\nVer o modelo atual: .vermodelos · voltar ao padrão: .limparmodelos`);
  if (t.length > cfg.limiteTexto) return c.reply(`Texto demasiado longo (máx. ${cfg.limiteTexto} caracteres).`);
  c.g.txt.modelos = c.g.txt.modelos || {};
  c.g.txt.modelos[chave] = t; db.save();
  await c.reply(`✅ ${CP.NOMES[chave]} deste grupo guardado. Pré-visualização:`);
  await c.sock.sendMessage(c.jid, { text: CP.render(c.g, chave, exemplo(c, chave), await loja.nomeGrupo(c)), raw: true });
});

exports.commands = [
  setter('setcomprovativo', 'detectado'),
  setter('setaguarde', 'aguarde'),
  setter('setagradecimento', 'agradecimento'),

  C('vermodelos', 'admin', 'Mostra os modelos do auto-comprovativo DESTE grupo (padrão ou personalizado).', async (c) => {
    const m = c.g.txt.modelos || {};
    const linhas = Object.keys(CP.DEFAULTS).map(k => `• *${CP.NOMES[k]}*: ${m[k] ? `✏️ personalizado (${m[k].length} caracteres)` : 'padrão'}   → .set${k === 'detectado' ? 'comprovativo' : k === 'aguarde' ? 'aguarde' : 'agradecimento'}`);
    await c.reply(`🧾 *MODELOS DO AUTO-COMPROVATIVO*\n\n${linhas.join('\n')}\n\nAuto-comprovativo: ${c.g.on.comprovativo ? '✅ ligado' : '❌ desligado'} (.autocomprovativo on/off)\nEntrega automática: ${c.g.on.pagamento ? '✅ ligada' : '❌ desligada (o admin confirma com .compra 512MB)'}\n\nVariáveis do detectado: ${CP.VARIAVEIS.detectado}\nGerais: ${CP.COMUNS}`);
  }),

  C('limparmodelos', 'admin', 'Volta os modelos do auto-comprovativo DESTE grupo ao padrão.', async (c) => {
    c.g.txt.modelos = {}; db.save(); await c.reply('🧹 Modelos do auto-comprovativo voltaram ao padrão.');
  })
];
