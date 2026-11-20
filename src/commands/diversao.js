const db = require('../lib/db');
const U = require('../lib/utils');
const { C } = require('../lib/cmd');

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const hash = (s) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 100003; return h; };
const tg = (c, n = 1) => c.targets.slice(0, n);
const at = (j) => '@' + U.num(j);
const RESP8 = ['Sim, sem dúvida.', 'Tudo indica que sim.', 'Talvez... o futuro está nublado.', 'Não conte com isso.', 'Definitivamente não.', 'Pergunta de novo mais tarde.',
  'As estrelas dizem que sim.', 'Minha resposta é não.', 'Com certeza!', 'Duvido muito.', 'Pode apostar.', 'Melhor não te dizer agora.'];
const JUTSUS = [['Chidori', 'Rank A', 'Mil pássaros: relâmpago concentrado na mão.'], ['Rasengan', 'Rank A', 'Esfera giratória de chakra.'], ['Kage Bunshin', 'Rank B', 'Clones sólidos que dividem a experiência.'],
  ['Katon: Goukakyuu', 'Rank C', 'Grande bola de fogo do clã Uchiha.'], ['Amaterasu', 'Rank S', 'Chamas negras que não se apagam.'], ['Susanoo', 'Rank S', 'Guerreiro espectral de chakra.'],
  ['Raikiri', 'Rank A', 'Corte de relâmpago, assinatura de Kakashi.'], ['Edo Tensei', 'Rank S', 'Reencarnação do mundo impuro.'], ['Kamui', 'Rank S', 'Técnica espaço-tempo do Mangekyō.']];
const NIVEIS = ['👁️ Sharingan de 1 tomoe: estás a despertar.', '👁️ Sharingan de 2 tomoe: já enxergas os movimentos.', '👁️ Sharingan de 3 tomoe: copias tudo o que vês!',
  '🩸 Mangekyō Sharingan: poder (e dor) em dobro.', '🌌 Eterno Mangekyō: nível Shadow God.'];
const acao = (names, emoji, verbo) => C(names, 'all', `Ação divertida: ${verbo}. Uso: .${[].concat(names)[0]} @pessoa`, async (c) => {
  const t = tg(c)[0];
  if (!t) return c.reply(`Marque alguém. Ex.: .${[].concat(names)[0]} @pessoa`);
  await c.reply(`${emoji} ${at(c.sender)} ${verbo} ${at(t)}!`, { mentions: [c.sender, t] });
});

exports.commands = [
  C('dado', 'all', 'Joga um dado. Uso: .dado [lados]', async (c) => {
    const n = Math.min(1000, Math.max(2, parseInt(c.args[0], 10) || 6));
    await c.reply(`🎲 Dado de ${n} lados: *${1 + Math.floor(Math.random() * n)}*`);
  }, { group: false }),
  C('moeda', 'all', 'Cara ou coroa.', async (c) => c.reply(`🪙 Deu *${Math.random() < 0.5 ? 'CARA' : 'COROA'}*!`), { group: false }),
  C('8ball', 'all', 'Faz uma pergunta à bola 8. Uso: .8ball vou passar?', async (c) => {
    if (!c.args.length) return c.reply('Faz uma pergunta. Ex.: .8ball vou ganhar hoje?');
    await c.reply(`🎱 ${pick(RESP8)}`);
  }, { group: false }),
  acao('beijar', '😘', 'deu um beijo em'),
  acao('abraçar', '🤗', 'abraçou'),
  acao('socar', '👊', 'deu um soco (de brincadeira) em'),
  C('jutsu', 'all', 'Sorteia um jutsu.', async (c) => { const [n, r, d] = pick(JUTSUS); await c.reply(`🌀 *${n}* (${r})\n${d}`); }, { group: false }),
  C('sharingan', 'all', 'Desperta o teu Sharingan.', async (c) => c.reply(pick(NIVEIS)), { group: false }),
  C('ship', 'all', 'Compatibilidade entre duas pessoas. Uso: .ship @a @b (ou so @a)', async (c) => {
    const t = tg(c, 2), a = t.length === 2 ? t[0] : c.sender, b = t.length === 2 ? t[1] : t[0];
    if (!b) return c.reply('Marque alguém. Ex.: .ship @pessoa  ou  .ship @a @b');
    const p = hash([U.num(a), U.num(b)].sort().join('-')) % 101;
    await c.reply(`💞 ${at(a)} + ${at(b)}\n\n*${p}%* de compatibilidade ${p > 80 ? '🔥' : p > 50 ? '😊' : p > 25 ? '🤔' : '🥀'}`, { mentions: [a, b] });
  }),
  C('casal', 'all', 'Sorteia um casal do grupo.', async (c) => {
    const mt = await U.meta(c.sock, c.jid), me = U.num(c.raw.user?.id || '');
    const l = mt.participants.map(p => p.phoneNumber || p.id).filter(j => U.num(j) !== me);
    if (l.length < 2) return c.reply('Poucos membros para sortear.');
    const a = pick(l); let b = pick(l); while (b === a) b = pick(l);
    await c.reply(`💘 O casal de hoje: ${at(a)} ❤️ ${at(b)}`, { mentions: [a, b] });
  }),
  C('daily', 'all', 'Recompensa diaria de pontos (uma vez por dia, com sequencia).', async (c) => {
    const u = U.num(c.sender), d = c.g.daily[u] || (c.g.daily[u] = { last: 0, streak: 0, pontos: 0 });
    const ja = U.dayKey(d.last) === U.dayKey(), ontem = U.dayKey(d.last) === U.dayKey(Date.now() - 864e5);
    if (d.last && ja) return c.reply(`⏳ Já recebeste o daily hoje. Volta amanhã! (sequência: ${d.streak} dia(s), ${d.pontos} pontos)`);
    d.streak = ontem ? d.streak + 1 : 1;
    const ganho = Math.min(100, 10 + d.streak * 2);
    d.pontos += ganho; d.last = Date.now(); db.save();
    await c.reply(`🎁 *DAILY*\n+${ganho} pontos 🩸\n🔥 Sequência: ${d.streak} dia(s)\n💠 Total: ${d.pontos} pontos`);
  })
];
