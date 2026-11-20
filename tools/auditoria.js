// Auditoria: compara os comandos implementados com a lista oficial (120 + pareamento) e com o menu.
const path = require('path');
let handler, OF, U, menu;
try {
  handler = require('../src/lib/handler'); OF = require('../src/data/comandosOficiais'); U = require('../src/lib/utils'); menu = require('../src/lib/menu');
} catch (e) { console.error('Falha a carregar (corra "npm install" primeiro):', e.message); process.exit(1); }

const resumo = process.argv.includes('--resumo');
const lista = OF.lista();
let faltam = 0;
const secs = {};
for (const x of lista) {
  const ok = handler.commands.has(U.norm(x.nome));
  if (!ok) faltam++;
  (secs[x.grupo + ' ' + x.titulo] = secs[x.grupo + ' ' + x.titulo] || []).push([x.nome, ok]);
}
if (!resumo) for (const [t, l] of Object.entries(secs)) console.log(`\n${t} (${l.filter(x => x[1]).length}/${l.length})\n  ` + l.map(([n, ok]) => (ok ? '✅' : '❌') + n).join(' '));
const par = OF.PAREAMENTO.map(n => [n, handler.commands.has(U.norm(n))]);
const noMenu = []; let totalMenu = 0;
for (const ln of menu({ name: 'X', until: 0 }).split('\n')) {
  const m = ln.match(/^│ • \.(.+)$/); if (!m) continue;
  for (const p of m[1].split(' / ')) { totalMenu++; const n = U.norm(p.trim().replace(/^\./, '').split(/\s+/)[0]); if (!handler.commands.has(n)) noMenu.push(n); }
}
console.log(`\nOficiais: ${lista.length - faltam}/${lista.length} | Pareamento: ${par.filter(x => x[1]).length}/${par.length} | Menu: ${totalMenu - noMenu.length}/${totalMenu}`);
console.log(`Total de comandos: ${handler.list.length} (${handler.commands.size} nomes com apelidos)`);
process.exit(faltam || noMenu.length || par.some(x => !x[1]) ? 1 : 0);
