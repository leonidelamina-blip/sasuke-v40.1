# V8 BOT 75

Bot WhatsApp em Node.js + Baileys para venda de megas e aluguer multi-grupo.

## Dados iniciais
- Nome: V8
- Proprietário: Leo
- Número do proprietário: 258852223969
- Número anteriormente reservado para o bot: 258872698781
- Prefixo: `.`
- Hospedagem pretendida: bot-hosting.net / VPS
- Idioma: Português

## Instalação
1. Instale Node.js 20 ou superior no alojamento.
2. Envie todos os ficheiros desta pasta para o alojamento.
3. Execute `npm install`.
4. Execute `npm start`.
5. Leia o QR apresentado no terminal para ligar a conta WhatsApp.
6. Para produção, mantenha a pasta `auth/` e `data/` persistentes e privadas.

> O código usa QR nesta versão inicial. O emparelhamento por código pode ser integrado na etapa seguinte, conforme suporte da versão Baileys e do painel de alojamento.

## Os 75 comandos
.menu, .ajuda, .ping, .hora, .data, .botinfo, .dono, .status, .precos, .megas, .compra, .comprovativo, .historico, .meuspedidos, .pedido, .cancelarpedido, .ranking, .stock, .suporte, .alugar, .planos, .expiracao, .meugrupo, .renovar, .termos, .admin, .addadmin, .deladmin, .admins, .setpreco, .setmega, .delmega, .setpagamento, .pagamento, .setstock, .setplanos, .aprovar, .rejeitar, .pendentes, .comprovativos, .aprovarrecibo, .vendas, .clientes, .alugueres, .ativaraluguer, .revogaraluguer, .grupos, .estatisticas, .manutencao, .abrir, .fechar, .linkgrupo, .antilink, .antispam, .boasvindas, .setboasvindas, .tagall, .promover, .rebaixar, .kick, .anunciar, .info, .figurinha, .eco, .calc, .sorteio, .moeda, .dado, .silenciar, .dessilenciar, .limparconfig, .exportar, .versao, .desenvolvedor, .comandos

## Configuração comercial por grupo
Cada grupo tem preços, catálogo de megas, instruções de pagamento, stock e texto de planos separados. Configure dentro do grupo:
- `.setmega NOME MB PREÇO`
- `.setpreco NOME PREÇO`
- `.setpagamento instruções de pagamento`
- `.setstock texto do stock`
- `.setplanos texto dos planos` (proprietário)

## Pagamentos: limitação importante
O comando `.comprovativo` apenas regista texto para análise. Não consegue provar sozinho que uma transferência M-Pesa/e-Mola é verdadeira. Para confirmação automática real, será necessária integração oficial/autorizada com API, webhook ou consulta de transacções do provedor. Não entregue megas com base apenas numa imagem ou SMS copiado.

## Venda e entrega
`.compra 1024 84xxxxxxx` cria um pedido pendente. Um administrador pode usar `.aprovar ID` depois de confirmar o recebimento no canal oficial. A entrega de megas ainda deve ser feita manualmente ou ligada a uma API autorizada da operadora/provedor.

## Segurança e produção
- Não partilhe a pasta `auth/` nem `data/database.json`.
- Faça backups regulares.
- Use HTTPS e variáveis de ambiente para credenciais de integrações futuras.
- Teste comandos de administração num grupo de teste.
- Este é um ponto de partida funcional, não uma garantia de operação sem falhas: Baileys é uma integração não oficial e pode sofrer alterações ou limitações do WhatsApp.
