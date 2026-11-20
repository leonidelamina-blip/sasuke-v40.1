// ALUGUER: no GRUPO (bot principal) com dias sem limite (BigInt), e no privado (bots de clientes por pareamento).
const cfg = require('../config');
const db = require('../lib/db');
const U = require('../lib/utils');
const A = require('../lib/aluguer');
const sessions = require('../lib/sessions');
const { C } = require('../lib/cmd');

const USO_NUM = 'Quantos dias? Uso: .alugar numero dias - Ex: .alugar 258841234567 2';
const USO_MEN = 'Quantos dias? Uso: .alugar @usuario 2';
const INVALIDOS = 'Dias inválidos. Escolhe um número maior que 0. Ex: .alugar 258841234567 5';
const expira = (r) => r.infinito ? 'Infinito / Sem expiração' : A.fmtData(r.fim);

async function alugarGrupo(c) {
  if (c.sid !== 'main') return;
  const men = U.ctxInfo(c.m).mentionedJid || [];
  const toks = c.args.filter(Boolean);
  let renter, diasTok;
  if (men.length) {                                   // FORMA 2: .alugar @usuario dias
    renter = men[0]; diasTok = toks.filter(t => !t.startsWith('@'))[0];
    if (diasTok === undefined) return c.reply(USO_MEN);
  } else {                                            // FORMA 1: .alugar numero dias
    if (!toks.length) return c.reply(USO_NUM + '\nou: .alugar @usuario 2');
    const num = U.normNum(toks[0]);
    if (num.length < 10 || num.length > 15) return c.reply('Número inválido. ' + USO_NUM);
    renter = U.jidOf(num); diasTok = toks[1];
    if (diasTok === undefined) return c.reply(USO_NUM);
  }
  const dias = A.parseDias(diasTok);
  if (dias === null) return c.reply(INVALIDOS);
  let nome = ''; try { nome = (await U.meta(c.sock, c.jid)).subject || ''; } catch {}
  const r = A.registar(c.g, { jid: c.jid, nome, por: U.num(renter), dias });
  db.save();
  await c.reply(`✅ Alugado por ${dias} dias! Expira em: ${expira(r)}\n👤 Cliente: @${U.num(renter)}`, { mentions: [renter] });
}

async function alugarSessao(c) {                      // privado: .alugar <numero|id> <dias>  (bots de clientes)
  const s = sessions.find(c.args[0]), dias = A.parseDias(c.args[1] || '');
  if (!c.args[0]) return c.reply('Em grupo: .alugar numero dias · .alugar @usuario dias\nNo privado (bot de cliente): .alugar numero dias');
  if (!s) return c.reply('Sessão não encontrada. Para alugar um GRUPO, use o comando dentro do grupo. Veja .sessoes');
  if (c.args[1] === undefined) return c.reply(USO_NUM);
  if (dias === null) return c.reply(INVALIDOS);
  const base = Math.max(Date.now(), s.until || 0), calc = A.calcular(dias, base);
  s.until = calc.infinito ? 0 : calc.fim; s.warn = null;
  const eraTeste = !!s.trial; if (eraTeste) s.trial = false; db.save();
  await c.reply(`✅ ${s.name}: +${dias} dia(s). Validade: ${calc.infinito ? 'Infinito / Sem expiração' : A.fmtData(s.until)}` + (eraTeste ? '\n🎁→💎 Teste convertido em aluguel: os anúncios foram removidos.' : ''));
}

exports.commands = [
  C(['alugar', 'renovar'], 'master', 'DONO: aluga o GRUPO onde escreve (.alugar numero dias | .alugar @usuario dias), com dias sem limite. No privado: aluga um bot de cliente.',
    async (c) => c.isGroup ? alugarGrupo(c) : alugarSessao(c), { group: false }),

  C('verprazo', 'all', 'Mostra quanto tempo falta para o aluguer deste grupo expirar.', async (c) => {
    if (c.sid !== 'main') {
      return c.reply(c.S.until ? (c.S.until > Date.now() ? `⏳ Faltam ${U.left(c.S.until)} dia(s). Expira em: ${A.fmtData(c.S.until)}` : 'O aluguer deste bot expirou.') : '⏳ Tempo ilimitado / Sem expiração');
    }
    const e = A.estado(c.g), r = c.g.rent;
    if (e.st === 'sem') return c.reply('Este grupo ainda não tem aluguer ativo. Fale com o dono para ativar.');
    if (e.st === 'expirado') return c.reply('O aluguer deste grupo expirou.');
    if (e.infinito) return c.reply('⏳ Tempo ilimitado / Sem expiração');
    await c.reply(`${r.trial ? '🎁 Teste grátis' : '⏳ Aluguer'}: faltam ${e.dias} dia(s).\nExpira em: ${A.fmtDataHora(r.fim)}`);
  }),

  C('removeraluguer', 'master', 'DONO: remove o aluguer do grupo (no grupo) ou de todos os grupos de um cliente (.removeraluguer numero).', async (c) => {
    const grupos = Object.entries(db.session('main').groups);
    if (c.args[0]) {
      const n = U.normNum(c.args[0]); let k = 0;
      for (const [, g] of grupos) if (g.rent && g.rent.por === n) { g.rent = null; k++; }
      db.save(); return c.reply(k ? `🗑️ Aluguer removido de ${k} grupo(s) de +${n}.` : 'Esse número não tem grupos alugados.');
    }
    if (!c.isGroup || c.sid !== 'main') return c.reply('Use dentro do grupo, ou: .removeraluguer numero');
    if (!c.g.rent) return c.reply('Este grupo não tem aluguer.');
    c.g.rent = null; db.save();
    await c.reply('🗑️ Aluguer removido. O bot deixa de responder neste grupo.');
  }, { group: false }),

  C('alugados', 'master', 'DONO: lista os grupos alugados (quem alugou, quando expira).', async (c) => {
    const l = Object.values(db.session('main').groups).filter(g => g.rent).map(g => g.rent).sort((a, b) => (a.fim ?? Infinity) - (b.fim ?? Infinity));
    const linha = (r) => {
      const e = A.estado({ rent: r });
      const q = r.infinito ? '♾️ sem expiração' : e.st === 'ativo' ? `${e.dias} dia(s) · até ${A.fmtData(r.fim)}` : '⛔ EXPIRADO';
      return `• ${r.grupoNome || r.grupo.split('@')[0]}\n   👤 +${r.por} · ${r.trial ? '🎁 teste · ' : ''}${q}`;
    };
    await c.reply(l.length ? `📋 *GRUPOS ALUGADOS* (${l.length})\n\n` + l.slice(0, 40).map(linha).join('\n') : 'Nenhum grupo alugado ainda.');
  }, { group: false })
];
