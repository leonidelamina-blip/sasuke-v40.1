// SISTEMA NANO (por grupo): respostas que funcionam SEM ponto, por palavra e por numero.
//   .nanoadd tabela | texto      -> cria "tabela" e, automaticamente, "01"
//   .nanoadd tabela 05 | texto   -> escolhe o numero
//   .nanoadd 1 | tabela          -> "1" passa a responder o mesmo que "tabela" (alias)
const db = require('../lib/db');
const U = require('../lib/utils');
const loja = require('../lib/loja');
const { C } = require('../lib/cmd');

const NOME = /^[a-z0-9_-]{1,20}$/;
const MAX = 200;
const cfg = require('../config');
const lim = (s) => U.norm(String(s || '').trim().replace(/^\./, ''));

exports.commands = [
  C('nano', 'admin', 'Liga/desliga ou explica o sistema nano. Uso: .nano on | .nano off | .nano', async (c) => {
    const a = U.norm(c.args[0] || '');
    if (a === 'on' || a === 'off') { c.g.nano.on = a === 'on'; db.save(); return c.reply(`🧩 Sistema nano ${a === 'on' ? '✅ ligado' : '❌ desligado'}.`); }
    const n = Object.keys(c.g.nano.comandos).length;
    await c.reply(`🧩 *SISTEMA NANO* ${c.g.nano.on !== false ? '✅' : '❌'}\n\nRespostas do SEU grupo, que funcionam SEM ponto (${n} criada(s)).\n\n.nanoadd tabela   + conteúdo nas linhas de baixo (ou responda a uma mensagem)\n.nanoadd tabela | texto   (cria também o 01)\n.nanoadd tabela 05 | texto   (você escolhe o número)\n.nanoadd 1 | tabela   (o 1 responde igual a "tabela")\n.nanolist  .nanodel nome  .limparnano\n\nVariáveis: [NOME_DA_LOJA] [TABELA_DO_GRUPO] [PAGAMENTO_DO_GRUPO] [SUPORTE_DO_GRUPO]\nEx.: .nanoadd regras | Proibido spam e links!\nDepois qualquer um escreve:  regras`);
  }),

  C('nanoadd', 'admin', 'Cria um nano deste grupo (nome de 1 a 20 letras/numeros, aceita so numero). Uso: .nanoadd nome [numero] | resposta', async (c) => {
    const raw = c.text.replace(/^\S+\s*/, '');
    const idx = raw.indexOf('|');
    const left = (idx >= 0 ? raw.slice(0, idx) : raw.trim().split(/\s+/)[0] || '').trim();
    let right = idx >= 0 ? raw.slice(idx + 1).trim() : raw.trim().slice(left.length).trim();
    right = right || (U.getQuoted(c.m) || {}).text || '';
    const toks = left.split(/\s+/).filter(Boolean);
    const nome = lim(toks[0]), numOpt = toks[1] ? lim(toks[1]) : null;
    if (!toks.length || toks.length > 2 || !right) return c.reply('Como criar:\n1) .nanoadd tabela   e, nas linhas de baixo, o conteúdo\n2) responda a uma mensagem com  .nanoadd tabela\n3) .nanoadd tabela | texto\n\nDepois, quando alguém escrever  tabela  aparece o conteúdo. (máx. ' + cfg.limiteTexto + ' caracteres)');
    if (!NOME.test(nome) || (numOpt && !/^[0-9]{1,20}$/.test(numOpt))) return c.reply('❌ Nome inválido: use de 1 a 20 letras ou números, sem espaços nem símbolos.');
    if (right.length > cfg.limiteTexto) return c.reply(`Texto demasiado longo (${right.length} caracteres). O máximo é ${cfg.limiteTexto}.`);
    const g = c.g, novo = g.nano.comandos[nome] === undefined;
    if (novo && Object.keys(g.nano.comandos).length >= MAX) return c.reply(`Limite de ${MAX} nanos por grupo.`);

    // resposta de uma palavra so que ja e um nano/palavra da loja = alias ("1" -> "tabela")
    const alvo = lim(right);
    const ehAlias = NOME.test(alvo) && alvo !== nome && (g.nano.comandos[alvo] !== undefined || loja.PALAVRAS.has(alvo));
    g.nano.comandos[nome] = ehAlias ? { alias: alvo } : right;

    // numero automatico das palavras padrao (tabela=01, pagamento=02, megas=03, ilimitado=04, menu=00) ou escolhido
    let numero = numOpt, auto = false;
    if (!numero && !ehAlias && loja.STD[nome] && g.nano.comandos[loja.STD[nome]] === undefined) { numero = loja.STD[nome]; auto = true; }
    if (numero && numero !== nome && (!auto || g.nano.comandos[numero] === undefined)) g.nano.comandos[numero] = { alias: nome };
    db.save();
    await c.reply(`🧩 Nano ${novo ? 'criado' : 'atualizado'}: *${nome}*${numero ? ` (e *${numero}*)` : ''}${ehAlias ? ` → responde igual a "${alvo}"` : ''}\n✅ Funciona SEM ponto: escreva ${nome}${numero ? ' ou ' + numero : ''}${g.nano.on === false ? '\n⚠️ O sistema nano está desligado. Use .nano on' : ''}`);
  }),

  C('nanolist', 'all', 'Lista os nanos DESTE grupo.', async (c) => {
    const cm = c.g.nano.comandos, nomes = Object.keys(cm);
    if (!nomes.length) return c.reply('Este grupo ainda não criou nanos. Admin: .nanoadd nome | resposta');
    const linhas = [];
    for (const n of nomes) {
      if (typeof cm[n] !== 'string') continue;
      const nums = nomes.filter(x => cm[x] && cm[x].alias === n);
      linhas.push(`• ${n}${nums.length ? ' (' + nums.join(', ') + ')' : ''}`);
    }
    for (const n of nomes) if (cm[n] && cm[n].alias && typeof cm[cm[n].alias] !== 'string') linhas.push(`• ${n} → ${cm[n].alias}`);
    await c.reply(`🧩 *NANOS DESTE GRUPO* (${nomes.length})\n\n${linhas.join('\n')}`);
  }),

  C('nanodel', 'admin', 'Apaga um nano deste grupo (e os numeros ligados a ele). Uso: .nanodel nome', async (c) => {
    const n = lim(c.args[0]), cm = c.g.nano.comandos;
    if (cm[n] === undefined) return c.reply('Nano não encontrado neste grupo. Veja .nanolist');
    delete cm[n];
    for (const k of Object.keys(cm)) if (cm[k] && cm[k].alias === n) delete cm[k];
    db.save(); await c.reply(`🗑️ Nano "${n}" apagado.`);
  }),

  C('limparnano', 'admin', 'Apaga TODOS os nanos DESTE grupo (não mexe em outros grupos).', async (c) => {
    const n = Object.keys(c.g.nano.comandos).length; c.g.nano.comandos = {}; db.save(); await c.reply(`🧹 ${n} nano(s) apagado(s) deste grupo.`);
  })
];
