// Adaptador: o codigo le daqui; a fonte unica de verdade e o config.json da raiz.
const j = require('../config.json');
module.exports = {
  json: j,
  prefix: j.bot.prefixo,
  fonte: j.bot.fonte || 'sans-bold',
  limiteTexto: (j.limites && j.limites.texto) || 5000,
  botName: j.bot.nomeCurto,        // nome curto (menu, sessao principal)
  botFull: j.bot.nome,
  marca: j.bot.marca,              // marca d'agua da sessao principal
  versao: j.bot.versao,
  core: j.bot.core,
  botNumber: (process.env.SASUKE_NUMERO || j.bot.numeroIntl).replace(/\D/g, ''),   // numero cujo WhatsApp vai digitar o codigo
  owner: { nome: j.dono.nome, numero: j.dono.numeroIntl, local: j.dono.numero },
  owners: [j.dono.numeroIntl],     // so estes usam .conectar .qrcode .alugar ... (na sessao principal)
  contato: 'wa.me/' + j.dono.numeroIntl,
  canal: j.canal.link,
  menu: j.menu,
  conexao: (process.env.SASUKE_MODO || j.conexao.modo || 'ambos').toLowerCase(),
  moeda: j.regiao.moeda, tz: j.regiao.fuso, ddi: j.regiao.ddi,
  anuncio: j.anuncio, teste: j.teste,
  human: { on: j.humano.ativo, escala: j.humano.escala }
};
