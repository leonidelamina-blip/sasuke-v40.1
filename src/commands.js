const cfg = require('../config');
const db = require('./db');

const commands = new Map();
const add = (name, desc, fn, ownerOnly=false) => commands.set(name, { name, desc, fn, ownerOnly });
const isOwner = (m) => m.sender === cfg.OWNER_NUMBER;
const isGroupAdmin = (m) => m.isGroup && (m.isGroupAdmin || isOwner(m));
const money = n => `${Number(n || 0).toLocaleString('pt-PT')} MT`;
const groupId = m => m.chat;
const reply = (m, t) => m.reply(t);
const group = m => db.group(groupId(m));

add('menu','Mostrar menu', async m => {
  const lines = [...commands.values()].map(c => `${cfg.PREFIX}${c.name} — ${c.desc}`);
  await reply(m, `╭━━〔 ⚡ ${cfg.BOT_NAME} 〕━━╮\n│ VENDA DE MEGAS • ALUGUER\n╰━━━━━━━━━━━━━━━━━━╯\n${lines.join('\n')}\n\nPrefixo: ${cfg.PREFIX}`);
});
add('ajuda','Ajuda e utilização', async m => reply(m, `Use ${cfg.PREFIX}menu para ver os 75 comandos. Para detalhes, contacte o administrador do grupo.`));
add('ping','Testar resposta', async m => reply(m, 'V8 online.'));
add('hora','Ver hora local', async m => reply(m, new Date().toLocaleString('pt-PT',{timeZone:cfg.TIMEZONE})));
add('data','Ver data', async m => reply(m, new Date().toLocaleDateString('pt-PT',{timeZone:cfg.TIMEZONE})));
add('botinfo','Informações do bot', async m => reply(m, `⚡ ${cfg.BOT_NAME}\nSistema de vendas de megas e aluguer multi-grupo.\nPrefixo: ${cfg.PREFIX}`));
add('dono','Contacto do proprietário', async m => reply(m, `Proprietário: ${cfg.OWNER_NAME}\nWhatsApp: https://wa.me/${cfg.OWNER_NUMBER}`));
add('regras','Regras de utilização', async m => reply(m, 'Utilize os comandos com responsabilidade. Pagamentos devem ser confirmados pelo administrador antes da entrega.'));
add('status','Estado do sistema', async m => reply(m, `V8: ONLINE\nPedidos: ${db.state.orders.length}\nComprovativos: ${db.state.receipts.length}`));
add('perfil','Ver perfil do utilizador', async m => reply(m, `Utilizador: @${m.sender.split('@')[0]}`, [m.sender]));
add('precos','Consultar preços configurados', async m => {
  const p = group(m).prices;
  reply(m, p.length ? '📦 PREÇOS\n'+p.map(x=>`${x.label}: ${money(x.price)}`).join('\n') : 'Ainda não existem preços configurados neste grupo.');
});
add('megas','Consultar pacotes disponíveis', async m => {
  const a = group(m).megas;
  reply(m, a.length ? '📶 PACOTES\n'+a.map(x=>`${x.name} — ${x.mb} MB — ${money(x.price)}`).join('\n') : 'Pacotes ainda não configurados neste grupo.');
});
add('compra','Registar pedido de megas', async m => {
  const [mb, phone] = m.args;
  if (!mb || !phone) return reply(m, `Formato: ${cfg.PREFIX}compra <MB> <número>\nEx.: ${cfg.PREFIX}compra 1024 84xxxxxxx`);
  const order = { id: 'V8'+Date.now(), group: groupId(m), user: m.sender, mb:Number(mb), phone, status:'PENDENTE', createdAt:new Date().toISOString() };
  db.state.orders.push(order); db.save();
  reply(m, `Pedido ${order.id} registado como PENDENTE.\nAguarde a confirmação do pagamento pelo administrador.`);
});
add('comprovativo','Registar comprovativo para análise', async m => {
  const text = m.args.join(' ') || m.quotedText || '';
  if (!text) return reply(m, `Envie o texto do comprovativo ou responda a uma mensagem com ${cfg.PREFIX}comprovativo.`);
  const r = { id:'REC'+Date.now(), group:groupId(m), user:m.sender, text, status:'PENDENTE', createdAt:new Date().toISOString() };
  db.state.receipts.push(r); db.save();
  reply(m, `Comprovativo ${r.id} recebido para análise. Isto não confirma a autenticidade nem o pagamento.`);
});
add('historico','Consultar os seus pedidos', async m => {
  const rows = db.state.orders.filter(x=>x.user===m.sender && x.group===groupId(m)).slice(-10);
  reply(m, rows.length ? rows.map(x=>`${x.id} | ${x.mb}MB | ${x.status}`).join('\n') : 'Não existem pedidos no histórico.');
});
add('meuspedidos','Listar os seus pedidos', async m => {
  const rows=db.state.orders.filter(x=>x.user===m.sender && x.group===groupId(m));
  reply(m, rows.length?rows.map(x=>`${x.id} — ${x.mb}MB — ${x.status}`).join('\n'):'Sem pedidos.');
});
add('pedido','Consultar pedido por ID', async m => {
  const x=db.state.orders.find(x=>x.id===m.args[0] && x.group===groupId(m));
  reply(m, x?`${x.id}\nPacote: ${x.mb}MB\nNúmero: ${x.phone}\nEstado: ${x.status}`:'Pedido não encontrado.');
});
add('cancelarpedido','Cancelar pedido pendente', async m => {
  const x=db.state.orders.find(x=>x.id===m.args[0] && x.user===m.sender && x.group===groupId(m));
  if(!x || x.status!=='PENDENTE') return reply(m,'Pedido pendente não encontrado.');
  x.status='CANCELADO'; db.save(); reply(m,`Pedido ${x.id} cancelado.`);
});
add('ranking','Ranking de compradores', async m => {
  const counts={}; db.state.orders.filter(x=>x.group===groupId(m)&&x.status==='PAGO').forEach(x=>counts[x.user]=(counts[x.user]||0)+1);
  const out=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,10).map((x,i)=>`${i+1}. @${x[0].split('@')[0]} — ${x[1]} compras`);
  reply(m,out.length?out.join('\n'):'Ainda não há compras confirmadas.');
});
add('stock','Consultar disponibilidade informada', async m => reply(m, group(m).config.stock || 'Stock não configurado. Confirme com o administrador.'));
add('suporte','Contactar suporte', async m => reply(m, `Suporte: https://wa.me/${cfg.OWNER_NUMBER}`));
add('alugar','Solicitar aluguer do V8', async m => {
  const g=group(m); if(!m.isGroup) return reply(m,'Este comando deve ser usado num grupo.');
  const r={id:'RENT'+Date.now(),group:groupId(m),requestedBy:m.sender,status:'PENDENTE',createdAt:new Date().toISOString()};
  db.state.rentals.push(r); db.save(); reply(m,`Pedido de aluguer registado: ${r.id}\nAguarde contacto do proprietário.`);
});
add('planos','Consultar planos de aluguer', async m => reply(m, group(m).config.rentalPlans || 'Planos não configurados. Contacte o proprietário.'));
add('expiracao','Consultar validade do aluguer', async m => {
  const r=db.state.rentals.find(x=>x.group===groupId(m)&&x.status==='ATIVO');
  reply(m,r?`Aluguer activo até: ${r.expiresAt||'data não definida'}`:'Este grupo não tem aluguer activo.');
});
add('meugrupo','Ver dados do grupo', async m => reply(m, `ID: ${groupId(m)}\nEstado: ${group(m).active?'Activo':'Inactivo'}`));
add('renovar','Solicitar renovação', async m => reply(m,'Pedido de renovação recebido. Contacte o proprietário para concluir o pagamento.'));
add('termos','Termos de aluguer', async m => reply(m,'O aluguer é associado ao ID do grupo. A activação depende da confirmação do pagamento e da aprovação do proprietário.'));
add('admin','Ver administradores do grupo', async m => reply(m, m.isGroup?`Administradores: ${m.groupAdmins.map(x=>'@'+x.split('@')[0]).join(', ')||'não identificados'}`:'Comando disponível em grupos.'));
add('addadmin','Adicionar administrador do V8', async m => {
  if(!isOwner(m)) return reply(m,'Apenas o proprietário pode executar.');
  const n=m.args[0]; if(!n) return reply(m,'Formato: .addadmin número');
  if(!db.state.admins.includes(n)) db.state.admins.push(n); db.save(); reply(m,'Administrador adicionado.');
},true);
add('deladmin','Remover administrador do V8', async m => {
  if(!isOwner(m)) return reply(m,'Apenas o proprietário pode executar.');
  db.state.admins=db.state.admins.filter(x=>x!==m.args[0]); db.save(); reply(m,'Administrador removido.');
},true);
add('admins','Listar administradores', async m => reply(m, db.state.admins.length?db.state.admins.join('\n'):'Sem administradores adicionais.'));
add('setpreco','Definir preço de pacote', async m => {
  if(!isOwner(m)&&!isGroupAdmin(m)) return reply(m,'Apenas administradores.');
  const [label,price]=m.args; if(!label||!price||isNaN(Number(price))) return reply(m,'Formato: .setpreco <nome> <valor>');
  const g=group(m); g.prices=g.prices.filter(x=>x.label!==label); g.prices.push({label,price:Number(price)}); db.save(); reply(m,'Preço guardado neste grupo.');
});
add('setmega','Adicionar pacote de megas', async m => {
  if(!isOwner(m)&&!isGroupAdmin(m)) return reply(m,'Apenas administradores.');
  const [name,mb,price]=m.args; if(!name||!mb||!price||[mb,price].some(x=>isNaN(Number(x)))) return reply(m,'Formato: .setmega <nome> <MB> <preço>');
  const g=group(m); g.megas.push({name,mb:Number(mb),price:Number(price)}); db.save(); reply(m,'Pacote adicionado.');
});
add('delmega','Remover pacote', async m => {
  if(!isOwner(m)&&!isGroupAdmin(m)) return reply(m,'Apenas administradores.');
  const g=group(m); const i=Number(m.args[0]); if(!Number.isInteger(i)||!g.megas[i]) return reply(m,'Formato: .delmega <índice>');
  g.megas.splice(i,1); db.save(); reply(m,'Pacote removido.');
});
add('setpagamento','Configurar instruções de pagamento', async m => {
  if(!isOwner(m)&&!isGroupAdmin(m)) return reply(m,'Apenas administradores.');
  const v=m.args.join(' '); if(!v) return reply(m,'Formato: .setpagamento <instruções>');
  group(m).payment.instructions=v; db.save(); reply(m,'Instruções de pagamento guardadas apenas neste grupo.');
});
add('pagamento','Ver instruções de pagamento', async m => reply(m,group(m).payment.instructions||'Instruções de pagamento ainda não configuradas.'));
add('setstock','Actualizar informação de stock', async m => {
  if(!isOwner(m)&&!isGroupAdmin(m)) return reply(m,'Apenas administradores.');
  group(m).config.stock=m.args.join(' '); db.save(); reply(m,'Stock actualizado.');
});
add('setplanos','Configurar texto dos planos', async m => {
  if(!isOwner(m)) return reply(m,'Apenas o proprietário.');
  group(m).config.rentalPlans=m.args.join(' '); db.save(); reply(m,'Planos guardados neste grupo.');
});
add('aprovar','Aprovar pedido de compra', async m => {
  if(!isOwner(m)&&!db.state.admins.includes(m.sender)) return reply(m,'Sem permissão.');
  const x=db.state.orders.find(x=>x.id===m.args[0]); if(!x) return reply(m,'Pedido não encontrado.');
  x.status='PAGO'; x.approvedBy=m.sender; x.approvedAt=new Date().toISOString(); db.save(); reply(m,`Pedido ${x.id} marcado como PAGO. Faça a entrega manualmente ou via integração autorizada.`);
});
add('rejeitar','Rejeitar pedido de compra', async m => {
  if(!isOwner(m)&&!db.state.admins.includes(m.sender)) return reply(m,'Sem permissão.');
  const x=db.state.orders.find(x=>x.id===m.args[0]); if(!x) return reply(m,'Pedido não encontrado.');
  x.status='REJEITADO'; db.save(); reply(m,'Pedido rejeitado.');
});
add('pendentes','Listar pedidos pendentes', async m => {
  if(!isOwner(m)&&!db.state.admins.includes(m.sender)) return reply(m,'Sem permissão.');
  const a=db.state.orders.filter(x=>x.status==='PENDENTE'); reply(m,a.length?a.map(x=>`${x.id} | ${x.mb}MB | ${x.phone}`).join('\n'):'Sem pedidos pendentes.');
});
add('comprovativos','Listar comprovativos pendentes', async m => {
  if(!isOwner(m)&&!db.state.admins.includes(m.sender)) return reply(m,'Sem permissão.');
  const a=db.state.receipts.filter(x=>x.status==='PENDENTE'); reply(m,a.length?a.map(x=>`${x.id} | @${x.user.split('@')[0]}`).join('\n'):'Sem comprovativos pendentes.');
});
add('aprovarrecibo','Marcar comprovativo como analisado', async m => {
  if(!isOwner(m)&&!db.state.admins.includes(m.sender)) return reply(m,'Sem permissão.');
  const x=db.state.receipts.find(x=>x.id===m.args[0]); if(!x) return reply(m,'Comprovativo não encontrado.');
  x.status='ANALISADO'; x.reviewedBy=m.sender; db.save(); reply(m,'Comprovativo marcado como analisado. A confirmação bancária deve ser feita separadamente.');
});
add('vendas','Relatório de vendas', async m => {
  if(!isOwner(m)&&!db.state.admins.includes(m.sender)) return reply(m,'Sem permissão.');
  const a=db.state.orders.filter(x=>x.status==='PAGO'); reply(m,`Vendas confirmadas: ${a.length}\nPedidos registados: ${db.state.orders.length}`);
});
add('clientes','Listar clientes com pedidos', async m => {
  if(!isOwner(m)&&!db.state.admins.includes(m.sender)) return reply(m,'Sem permissão.');
  const a=[...new Set(db.state.orders.map(x=>x.user))]; reply(m,a.length?a.join('\n'):'Sem clientes.');
});
add('alugueres','Listar alugueres', async m => {
  if(!isOwner(m)) return reply(m,'Apenas o proprietário.');
  const a=db.state.rentals; reply(m,a.length?a.map(x=>`${x.id} | ${x.group} | ${x.status}`).join('\n'):'Sem pedidos de aluguer.');
});
add('ativaraluguer','Activar aluguer por ID', async m => {
  if(!isOwner(m)) return reply(m,'Apenas o proprietário.');
  const r=db.state.rentals.find(x=>x.id===m.args[0]); if(!r) return reply(m,'Pedido não encontrado.');
  const days=Number(m.args[1]||cfg.RENTAL_DEFAULT_DAYS); r.status='ATIVO'; r.expiresAt=new Date(Date.now()+days*86400000).toISOString(); db.save(); reply(m,`Aluguer activo até ${r.expiresAt}.`);
});
add('revogaraluguer','Revogar aluguer por ID', async m => {
  if(!isOwner(m)) return reply(m,'Apenas o proprietário.');
  const r=db.state.rentals.find(x=>x.id===m.args[0]); if(!r) return reply(m,'Pedido não encontrado.');
  r.status='REVOGADO'; db.save(); reply(m,'Aluguer revogado.');
});
add('grupos','Listar grupos conhecidos', async m => {
  if(!isOwner(m)) return reply(m,'Apenas o proprietário.');
  const a=Object.keys(db.state.groups); reply(m,a.length?a.join('\n'):'Sem grupos registados.');
});
add('estatisticas','Estatísticas gerais', async m => {
  if(!isOwner(m)) return reply(m,'Apenas o proprietário.');
  reply(m,`Grupos: ${Object.keys(db.state.groups).length}\nPedidos: ${db.state.orders.length}\nRecibos: ${db.state.receipts.length}\nAlugueres: ${db.state.rentals.length}`);
});
add('backupinfo','Informação de backup', async m => reply(m,'A base de dados está em data/database.json. Faça cópias regulares e mantenha-as fora da pasta pública.'));
add('manutencao','Activar/desactivar manutenção', async m => {
  if(!isOwner(m)) return reply(m,'Apenas o proprietário.');
  db.state.settings.maintenance=!db.state.settings.maintenance; db.save(); reply(m,`Manutenção: ${db.state.settings.maintenance?'ACTIVA':'DESACTIVADA'}`);
});
add('broadcast','Enviar aviso aos grupos conhecidos', async m => {
  if(!isOwner(m)) return reply(m,'Apenas o proprietário.');
  reply(m,'O broadcast está desactivado nesta versão-base para evitar mensagens em massa acidentais. Use comunicação autorizada por grupo.');
});
add('abrir','Abrir grupo', async m => { if(!isGroupAdmin(m)) return reply(m,'Apenas administradores.'); await m.sock.groupSettingUpdate(m.chat,'not_announcement'); reply(m,'Grupo aberto.'); });
add('fechar','Fechar grupo', async m => { if(!isGroupAdmin(m)) return reply(m,'Apenas administradores.'); await m.sock.groupSettingUpdate(m.chat,'announcement'); reply(m,'Grupo fechado.'); });
add('linkgrupo','Obter link do grupo', async m => { if(!isGroupAdmin(m)) return reply(m,'Apenas administradores.'); const x=await m.sock.groupInviteCode(m.chat); reply(m,`https://chat.whatsapp.com/${x}`); });
add('antilink','Activar/desactivar anti-link', async m => { if(!isGroupAdmin(m)) return reply(m,'Apenas administradores.'); const g=group(m); g.config.antilink=!g.config.antilink; db.save(); reply(m,`Anti-link: ${g.config.antilink?'ON':'OFF'}`); });
add('antispam','Activar/desactivar anti-spam', async m => { if(!isGroupAdmin(m)) return reply(m,'Apenas administradores.'); const g=group(m); g.config.antispam=!g.config.antispam; db.save(); reply(m,`Anti-spam: ${g.config.antispam?'ON':'OFF'}`); });
add('boasvindas','Activar/desactivar boas-vindas', async m => { if(!isGroupAdmin(m)) return reply(m,'Apenas administradores.'); const g=group(m); g.config.welcome=!g.config.welcome; db.save(); reply(m,`Boas-vindas: ${g.config.welcome?'ON':'OFF'}`); });
add('setboasvindas','Definir mensagem de boas-vindas', async m => { if(!isGroupAdmin(m)) return reply(m,'Apenas administradores.'); group(m).config.welcomeText=m.args.join(' '); db.save(); reply(m,'Mensagem guardada.'); });
add('tagall','Marcar membros do grupo', async m => { if(!isGroupAdmin(m)) return reply(m,'Apenas administradores.'); const md=await m.sock.groupMetadata(m.chat); reply(m,md.participants.map(p=>'@'+p.id.split('@')[0]).join(' '),md.participants.map(p=>p.id)); });
add('promover','Promover membro', async m => { if(!isGroupAdmin(m)) return reply(m,'Apenas administradores.'); const u=m.mentions[0]; if(!u) return reply(m,'Marque o membro.'); await m.sock.groupParticipantsUpdate(m.chat,[u],'promote'); reply(m,'Membro promovido.'); });
add('rebaixar','Rebaixar administrador', async m => { if(!isGroupAdmin(m)) return reply(m,'Apenas administradores.'); const u=m.mentions[0]; if(!u) return reply(m,'Marque o membro.'); await m.sock.groupParticipantsUpdate(m.chat,[u],'demote'); reply(m,'Administrador rebaixado.'); });
add('kick','Remover membro', async m => { if(!isGroupAdmin(m)) return reply(m,'Apenas administradores.'); const u=m.mentions[0]; if(!u) return reply(m,'Marque o membro.'); await m.sock.groupParticipantsUpdate(m.chat,[u],'remove'); reply(m,'Membro removido.'); });
add('anunciar','Enviar anúncio ao grupo', async m => { if(!isGroupAdmin(m)) return reply(m,'Apenas administradores.'); const t=m.args.join(' '); if(!t) return reply(m,'Escreva o anúncio.'); const md=await m.sock.groupMetadata(m.chat); reply(m,t,md.participants.map(p=>p.id)); });
add('info','Informações do grupo', async m => { if(!m.isGroup) return reply(m,'Use num grupo.'); const x=await m.sock.groupMetadata(m.chat); reply(m,`${x.subject}\nMembros: ${x.participants.length}\nID: ${m.chat}`); });
add('figurinha','Converter imagem respondida em sticker', async m => reply(m,'Envie uma imagem e responda a ela com .figurinha. A conversão de mídia será adicionada no módulo de mídia.'));
add('eco','Repetir texto', async m => reply(m,m.args.join(' ')||'Escreva o texto depois do comando.'));
add('calc','Calculadora básica', async m => {
  const expr=m.args.join(' ');
  if(!/^[0-9+\-*/(). %]+$/.test(expr)) return reply(m,'Expressão inválida.');
  try { const val=Function(`"use strict"; return (${expr})`)(); reply(m,String(val)); } catch { reply(m,'Não foi possível calcular.'); }
});
add('sorteio','Escolher um participante mencionado', async m => {
  if(!m.mentions.length) return reply(m,'Marque pelo menos um participante.');
  const u=m.mentions[Math.floor(Math.random()*m.mentions.length)]; reply(m,`Selecionado: @${u.split('@')[0]}`,[u]);
});
add('moeda','Lançar moeda', async m => reply(m,Math.random()<0.5?'🪙 Cara':'🪙 Coroa'));
add('dado','Lançar dado', async m => reply(m,`🎲 ${1+Math.floor(Math.random()*6)}`));
add('frase','Frase aleatória', async m => {
  const a=['A consistência vence a pressa.','Planeie, execute e confirme.','Tecnologia útil é tecnologia que resolve.'];
  reply(m,a[Math.floor(Math.random()*a.length)]);
});
add('convite','Mostrar convite do grupo', async m => { if(!m.isGroup||!isGroupAdmin(m)) return reply(m,'Apenas administradores em grupos.'); reply(m,`https://chat.whatsapp.com/${await m.sock.groupInviteCode(m.chat)}`); });
add('silenciar','Fechar grupo para membros', async m => { if(!isGroupAdmin(m)) return reply(m,'Apenas administradores.'); await m.sock.groupSettingUpdate(m.chat,'announcement'); reply(m,'Grupo fechado para membros.'); });
add('dessilenciar','Abrir grupo para membros', async m => { if(!isGroupAdmin(m)) return reply(m,'Apenas administradores.'); await m.sock.groupSettingUpdate(m.chat,'not_announcement'); reply(m,'Grupo aberto para membros.'); });
add('limparconfig','Limpar configurações comerciais do grupo', async m => { if(!isOwner(m)) return reply(m,'Apenas o proprietário.'); const g=group(m); g.prices=[];g.megas=[];g.payment={};g.config={};db.save();reply(m,'Configurações comerciais deste grupo limpas.'); });
add('exportar','Exportar resumo de dados', async m => { if(!isOwner(m)) return reply(m,'Apenas o proprietário.'); reply(m,JSON.stringify({orders:db.state.orders.length,receipts:db.state.receipts.length,rentals:db.state.rentals.length,groups:Object.keys(db.state.groups).length},null,2)); });
add('versao','Versão do V8', async m => reply(m,'V8 BOT 75 — versão 1.0.0'));
add('desenvolvedor','Informação do desenvolvedor', async m => reply(m,`Desenvolvido para ${cfg.OWNER_NAME}.`));
add('comandos','Contar comandos disponíveis', async m => reply(m,`Comandos registados: ${commands.size}`));

['perfil','regras','backupinfo','broadcast','convite','frase'].forEach(name => commands.delete(name));
module.exports = { commands };
