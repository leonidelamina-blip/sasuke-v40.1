// PERMISSOES: deixa membros comuns usarem certos comandos de admin
const db = require('../lib/db');
const U = require('../lib/utils');
const { C } = require('../lib/cmd');

const NAO = new Set(['liberar', 'liberartodos', 'bloqueartodos', 'modolivre', 'permissoes', 'promover', 'despromover', 'rebaixar', 'add', 'remover', 'bangp']);
const find = (n) => require('../lib/handler').commands.get(U.norm((n || '').replace(/^\./, '')));
const ok = (cmd) => cmd && cmd.scope === 'admin' && !NAO.has(cmd.names[0]) && cmd.liberavel !== false;

exports.commands = [
  C('liberar', 'admin', 'Deixa UM membro usar um comando de admin. Uso: .liberar <comando> @pessoa', async (c) => {
    const cmd = find(c.args[0]), t = c.targets[0];
    if (!cmd || !t) return c.reply('Uso: .liberar <comando> @pessoa\nEx.: .liberar todos @maria');
    if (!ok(cmd)) return c.reply(`🚫 O comando .${c.args[0]} não pode ser liberado (só comandos de admin que não mexam em permissões/cargos).`);
    const n = cmd.names[0], u = U.num(t);
    const l = (c.g.perm.liberados[n] = c.g.perm.liberados[n] || []);
    if (!l.includes(u)) l.push(u); db.save();
    await c.reply(`🔓 ${u} pode usar *.${n}*.`);
  }),
  C('liberartodos', 'admin', 'Deixa TODOS os membros usarem um comando de admin. Uso: .liberartodos <comando>', async (c) => {
    const cmd = find(c.args[0]);
    if (!cmd) return c.reply('Uso: .liberartodos <comando>');
    if (!ok(cmd)) return c.reply(`🚫 O comando .${c.args[0]} não pode ser liberado.`);
    if (!c.g.perm.todos.includes(cmd.names[0])) c.g.perm.todos.push(cmd.names[0]); db.save();
    await c.reply(`🔓 Todos podem usar *.${cmd.names[0]}*.`);
  }),
  C('modolivre', 'admin', 'Modo livre: membros usam comandos de admin (exceto permissoes/cargos). Uso: .modolivre on/off', async (c) => {
    const a = U.norm(c.args[0] || '');
    if (a !== 'on' && a !== 'off') return c.reply(`Modo livre: ${c.g.perm.modolivre ? '✅ ligado' : '❌ desligado'}\nUse .modolivre on/off`);
    c.g.perm.modolivre = a === 'on'; db.save();
    await c.reply(`🔓 Modo livre ${a === 'on' ? 'ligado: qualquer membro usa comandos de admin liberáveis' : 'desligado'}.`);
  }),
  C('bloqueartodos', 'admin', 'Apaga todas as liberacoes e desliga o modo livre.', async (c) => {
    c.g.perm = { modolivre: false, liberados: {}, todos: [] }; db.save(); await c.reply('🔒 Todas as liberações foram removidas.');
  }),
  C('permissoes', 'admin', 'Mostra as liberacoes deste grupo.', async (c) => {
    const p = c.g.perm, l = Object.entries(p.liberados).map(([n, u]) => `• .${n} → ${u.join(', ')}`);
    await c.reply(`🔑 *PERMISSÕES*\n\nModo livre: ${p.modolivre ? '✅' : '❌'}\nLiberados a todos: ${p.todos.map(n => '.' + n).join(' ') || '—'}\n\nPor pessoa:\n${l.join('\n') || '—'}`);
  })
];
