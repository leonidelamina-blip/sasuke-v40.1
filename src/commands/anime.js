const fs = require('fs');
const path = require('path');
const U = require('../lib/utils');
const { C } = require('../lib/cmd');

const DIR = path.join(__dirname, '..', '..', 'assets', 'anime');
const FICHAS = {
  sasuke: ['Sasuke Uchiha', '🩸 Clã Uchiha · Konoha', 'Último herdeiro do clã Uchiha. Mestre do Sharingan e do Chidori, trilhou o caminho da vingança e depois o da redenção.'],
  naruto: ['Naruto Uzumaki', '🍥 Vila da Folha', 'Jinchūriki da Kurama, criado sozinho e movido por um sonho: tornar-se Hokage. Usa o Rasengan e o Modo Sábio.'],
  itachi: ['Itachi Uchiha', '🌑 Clã Uchiha · Akatsuki', 'Prodígio do clã, dono do Mangekyō Sharingan, do Tsukuyomi e do Amaterasu. Irmão mais velho de Sasuke.'],
  madara: ['Madara Uchiha', '👁️ Clã Uchiha', 'Lendário cofundador de Konoha, portador do Rinnegan e idealizador do Plano do Olho da Lua.'],
  kakashi: ['Kakashi Hatake', '⚡ Vila da Folha', 'O "Ninja que copia mil jutsus", sensei do Time 7. Usa o Sharingan emprestado e o Raikiri.'],
  sakura: ['Sakura Haruno', '🌸 Vila da Folha', 'Kunoichi médica, discípula de Tsunade, famosa pela força sobre-humana e pelo controle perfeito de chakra.'],
  hinata: ['Hinata Hyūga', '🤍 Clã Hyūga', 'Portadora do Byakugan e do Punho Gentil. Tímida, leal e muito mais forte do que aparenta.'],
  obito: ['Obito Uchiha', '🌀 Clã Uchiha', 'Antigo colega de Kakashi. Domina o Kamui e carrega uma das histórias mais trágicas da série.']
};
const FRASES = [
  'Quem teme perder já começou derrotado.', 'A dor é a melhor professora; o erro é não aprender com ela.', 'Força sem controle é só barulho.',
  'O silêncio também é uma resposta.', 'Quem protege os outros nunca está realmente sozinho.', 'Cair é normal; ficar no chão é uma escolha.',
  'O caminho mais difícil costuma ser o que mais te transforma.', 'Não confies em quem só aparece quando tudo corre bem.',
  'Disciplina vence talento que não treina.', 'Uma noite escura não apaga a lua: só a faz brilhar mais.'
];
const photos = () => { try { return fs.readdirSync(DIR).filter(f => /\.(jpe?g|png)$/i.test(f)); } catch { return []; } };
const erro = (t) => `🥀 ${t}`;

async function getJSON(url) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), 9000);
  try { const r = await fetch(url, { signal: ac.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}
async function localRandom(c, cap) {
  const l = photos();
  if (!l.length) return c.reply(erro('Não consegui obter uma imagem agora (sem internet e sem fotos em assets/anime).'));
  const f = l[Math.floor(Math.random() * l.length)];
  return c.sock.sendMessage(c.jid, { image: fs.readFileSync(path.join(DIR, f)), caption: cap }, { quoted: c.m });
}

exports.commands = [
  ...Object.entries({ ...FICHAS, minato: ['Minato Namikaze', '⚡ Vila da Folha', 'O Relâmpago Amarelo de Konoha, Quarto Hokage e criador do Rasengan. Pai de Naruto.'] }).map(([k, [nome, cla, bio]]) =>
    C(k, 'all', `Ficha e foto de ${nome}.`, async (c) => {
      const f = ['jpg', 'jpeg', 'png'].map(e => path.join(DIR, `${k}.${e}`)).find(p => fs.existsSync(p));
      if (!f) return c.reply(erro(`Foto não encontrada: assets/anime/${k}.jpg. O dono precisa colocar a imagem nessa pasta.`));
      await c.sock.sendMessage(c.jid, { image: fs.readFileSync(f), caption: `🩸 *${nome.toUpperCase()}*\n${cla}\n\n${bio}` }, { quoted: c.m });
    }, { group: false })),

  C('waifu', 'all', 'Envia uma imagem de anime (segura para todas as idades).', async (c) => {
    try { const j = await getJSON('https://api.waifu.pics/sfw/waifu'); if (!j.url) throw 0; await c.sock.sendMessage(c.jid, { image: { url: j.url }, caption: '🌸 Tua waifu do dia' }, { quoted: c.m }); }
    catch { await localRandom(c, '🌸 Tua waifu do dia (modo offline)'); }
  }, { group: false }),

  C('wallpaper', 'all', 'Envia um wallpaper de anime.', async (c) => {
    try { const j = await getJSON('https://api.waifu.pics/sfw/neko'); if (!j.url) throw 0; await c.sock.sendMessage(c.jid, { image: { url: j.url }, caption: '🖼️ Wallpaper' }, { quoted: c.m }); }
    catch { await localRandom(c, '🖼️ Wallpaper (modo offline)'); }
  }, { group: false }),

  C('anime', 'all', 'Procura um anime. Uso: .anime naruto', async (c) => {
    const q = c.args.join(' ').trim();
    if (!q) return c.reply('Uso: .anime nome   (ex.: .anime naruto)');
    try {
      const j = await getJSON('https://api.jikan.moe/v4/anime?limit=1&sfw=true&q=' + encodeURIComponent(q));
      const a = j.data && j.data[0];
      if (!a) return c.reply(erro(`Não encontrei nenhum anime com "${q}".`));
      const sin = (a.synopsis || 'Sem sinopse.').replace(/\s+/g, ' ').slice(0, 350);
      const cap = `🎌 *${a.title}*\n⭐ Nota: ${a.score ?? '—'} · 📺 Episódios: ${a.episodes ?? '?'} · ${a.status || ''}\n📅 ${a.year ?? '—'}\n\n${sin}…`;
      const img = a.images && a.images.jpg && a.images.jpg.image_url;
      if (img) await c.sock.sendMessage(c.jid, { image: { url: img }, caption: cap }, { quoted: c.m }); else await c.reply(cap);
    } catch { await c.reply(erro('Não consegui consultar o catálogo de animes agora. Tenta de novo daqui a pouco.')); }
  }, { group: false }),

  C('quote', 'all', 'Uma frase para a alma.', async (c) => c.reply('🩸 “' + FRASES[Math.floor(Math.random() * FRASES.length)] + '”'), { group: false }),

  C('amv', 'all', 'Procura AMVs no YouTube. Uso: .amv sasuke', async (c) => {
    const q = c.args.join(' ').trim() || 'anime';
    await c.reply(`🎬 *AMV: ${q}*\nhttps://www.youtube.com/results?search_query=${encodeURIComponent(q + ' amv')}`);
  }, { group: false }),

  C('otaku', 'all', 'Mede o teu nível otaku de hoje. Uso: .otaku [@pessoa]', async (c) => {
    const u = (c.targets[0] && U.num(c.targets[0])) || U.num(c.sender);
    let h = 0; for (const ch of u + U.dayKey()) h = (h * 31 + ch.charCodeAt(0)) % 1009;
    const p = h % 101;
    const t = p > 90 ? 'Hokage dos otakus 👑' : p > 70 ? 'Otaku veterano 🔥' : p > 40 ? 'Fã de carteirinha 🍥' : p > 15 ? 'Quase lá 🌱' : 'Ainda a começar 🥀';
    await c.reply(`🎌 *NÍVEL OTAKU* de ${u}\n\n${p}% — ${t}`);
  }, { group: false })
];
