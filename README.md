# 🩸 SASUKE V40 — SHADOW GOD (CORE 77)

Bot de WhatsApp para **alugar a vários grupos** (venda de megas); também suporta bots de clientes por pareamento. Dono: **Leo** (852223969) · Bot: **Sasuke** (872698781).
244 comandos: os 120 oficiais + pareamento + extras. Verifique com `npm run auditoria`.

## ✨ Novidades da V40 (sobre a V31.2)
- **Aluguer por GRUPO** (bot principal): `.alugar 258841234567 30` ou `.alugar @cliente 30` dentro do grupo. **Dias sem limite** (BigInt): `1`, `1000`, `6486316487399`… número gigante = *Infinito / Sem expiração*.
  `.verprazo` · `.alugados` · `.removeraluguer` · aviso *"Falta 1 dia para o aluguer expirar."* · ao expirar: *"O aluguer deste grupo expirou."* e o bot cala-se nesse grupo. Só o dono principal usa `.alugar`.
- **Tudo por grupo, nada fixo no código:** `.setnome .setdono .setnumero .setsuporte .settabela .setpagamento .setilimitado .verconfig .limparconfig`. Sem configurar → *"Este grupo ainda não configurou a tabela. Peça ao dono do grupo para configurar."*
- **Sem ponto, por palavra e por número:** `Tabela`=`01` · `Pagamento`=`02` · `Megas`=`03` · `ilimitado`=`04` · `Menu`=`00`. Textos padrão com variáveis `[NOME_DA_LOJA] [TABELA_DO_GRUPO] [PAGAMENTO_DO_GRUPO] [SUPORTE_DO_GRUPO]`.
- **Nanos** por grupo, sem ponto, nome de 1 a 20 caracteres (aceita só número e nomes de comandos). `.nanoadd tabela | …` cria também o `01`; `.nanoadd 1 | tabela` faz alias. O nano tem prioridade sem ponto; com ponto responde o comando normal.
- **Boas-vindas e saída com FOTO** (pessoa → foto do grupo → foto do bot) e menção `@`; texto por grupo (`.nanobemvindo`, `.nanosaida`). Ao ser adicionado: *"Obrigado por me adicionar! Para ativar, fale com o dono…"*.
- **Auto-comprovativo (como no vídeo) e personalizável por grupo.** Quando alguém cola o SMS do M-Pesa/E-Mola (`Confirmado`, `Transferiste`, `Chave:`, `ID da transacao`), o bot responde com 🧾 *Comprovativo detectado (M-Pesa)* · 🔑 chave · 🏦 destino validado · 💵 valor · 🕒 hora · 📦 número para receber (pede o número se faltar). Depois manda *"Pagamento M-Pesa detectado! … aguarde o adm confirmar… comprovativos falsos = banimento"*.
  O **admin confirma** respondendo ao cliente com `.compra 512MB` (ou `.compra 512MB @cliente`): o bot regista e agradece com *compra do dia, comprador nº X, total acumulado e maior comprador*. Chave repetida, destino de outro dono e SMS sem destino validado são barrados.
  **Personalizar** (por grupo, com variáveis e pré-visualização): `.setcomprovativo` · `.setaguarde` · `.setagradecimento` · `.vermodelos` · `.limparmodelos` · `.autocomprovativo on/off`.
  Variáveis: `[CLIENTE] [PROVEDOR] [CHAVE] [DESTINO] [VALOR] [HORA] [NUMERO]` · `[QUANTIDADE] [COMPRA_DO_DIA] [POSICAO] [TOTAL] [MAIOR_COMPRADOR]` · `[NOME_DA_LOJA] [SUPORTE_DO_GRUPO] [NOME_DO_DONO_DO_GRUPO]`.
  Com `.pagamento on` (entrega automática) ou com um pedido `.compra 5gb` do cliente, a venda é registada sozinha (*"A transferir..."*); a entrega real depende de `src/lib/deliver.js`.
- **Teste grátis do grupo:** um admin envia `.teste` no grupo → 24 h, 1 vez por grupo e por pessoa, com anúncio do canal a cada 7 comandos.
- **Nano no formato simples:** `.nanoadd tabela` e, nas linhas de baixo, o conteúdo (ou responda a uma mensagem com `.nanoadd tabela`). Quando alguém escrever `tabela` aparece o conteúdo. **Limite: 5000 caracteres** (nanos e textos do grupo; em `config.json > limites.texto`).
- **Fonte do bot 𝗲𝘀𝘀𝗮:** letras dos textos do bot em sans-serif negrito. Comandos (`.menu`), números, links e `@` ficam normais, e o conteúdo escrito pelo grupo (nanos, tabela) fica exatamente como o admin escreveu. `.fonte on/off` por grupo; global em `config.json > bot.fonte` (`sans-bold` ou `nenhuma`).
- Mudança: o antigo `.setdono` (trocar dono de bot de cliente) passou a `.setdonobot`.

## 1. Instalar (Wispbyte / Pterodactyl / Termux / PC)
1. Envie o zip e **extraia de modo que `index.js` fique na RAIZ** (não dentro de uma subpasta!).
   Se aparecer `Cannot find module '/home/container/index.js'`, os arquivos ficaram numa subpasta: mova-os para a raiz.
2. Arquivo principal (`JS_FILE`): `index.js`. O painel corre `npm install` sozinho. Node ≥ 18 (o aviso `EBADENGINE` com Node 19 é inofensivo; se o painel permitir, escolha Node 20 ou 22).
3. Inicie. Na 1.ª vez o console mostra só o **PAIRING CODE** (sem QR; `conexao.modo` = `pairing` por defeito):
   WhatsApp do bot (872698781) > Aparelhos conectados > Conectar com número de telefone > escreva o código (use a linha `COPIAR (sem hífen)`).
   O código vale ~2 min; se expirar o bot gera outro sozinho (até 3). A linha *"sessão main: terminada no telemóvel; a limpar credenciais"* é normal se havia sessão antiga.
4. Teste: `.menu` · `.ping` · `.dono`.

### Teste rápido no telemóvel (Termux) — descobre se o problema é a hospedagem
Hospedagens grátis partilham IPs de servidor que o WhatsApp às vezes recusa no pareamento. No Termux o bot sai pela rede do seu telemóvel:
`termux-setup-storage` · `mkdir -p ~/sasuke && cd ~/sasuke` · `unzip -o ~/storage/downloads/sasuke-v40-completo.zip` · `bash termux.sh`
Se aparecer `dispositivo ASSOCIADO` no Termux e falhar no painel, a causa é o IP da hospedagem. O Termux só funciona enquanto o telemóvel estiver ligado e com o Termux aberto.

### Problemas comuns no Wispbyte / Pterodactyl
| Erro no console | Causa | Solução |
|---|---|---|
| `Cannot find module '/home/container/index.js'` | zip extraído dentro de uma subpasta | mova tudo para a raiz |
| `npm ERR! ENOTEMPTY ... rename ... node_modules/axios` e depois `Cannot find module '@whiskeysockets/baileys'` | instalação interrompida deixou o `node_modules` a meio | **apague a pasta `node_modules`** e reinicie (o bot também se repara sozinho) |
| banner "Pacote @whiskeysockets/baileys ausente" | o painel só detetou que o npm falhou | **não** adicione o pacote em *Startup > Pacotes* (instala o Baileys 7, incompatível, e duplica a instalação). Deixe *Pacotes* vazio |
| muitos avisos `EBADENGINE` | imagem Node 19 (já sem suporte) | *Startup > Imagem Docker*: escolha **Node 20 ou 22** |
| WhatsApp diz **"Não foi possível associar o dispositivo"** com o código certo | o código só funciona no WhatsApp **do número para o qual foi gerado** (linha `Gerado para o número` no console) | confira em WhatsApp > Definições qual é o número do telefone onde está a digitar. Tem de ser o mesmo. Se for outro, use esse telefone **ou** troque o número: `config.json > bot.numeroIntl` (ou variável `SASUKE_NUMERO=258XXXXXXXXX`) e reinicie |
| continua a falhar | limite de 4 aparelhos conectados, WhatsApp desatualizado, ou código antigo (cada reinício gera um novo) | remova um aparelho em *Aparelhos conectados*, atualize o WhatsApp, e use sempre o **último** código do console (não reinicie entre gerar e digitar) |
O `.npmrc` já desliga auditoria e barras de progresso (menos lixo no console e menos memória).

## 2. config.json (fonte única)
`bot` (nome, marca d'água, número), `dono`, `canal`, `menu.legendaMax`, `conexao.modo` (`pairing`|`qr`|`ambos`, ou variável `SASUKE_MODO`),
`humano` (ativo/escala: 1 normal, 2 mais lento, 0 sem espera), `regiao` (fuso, DDI, moeda).
O número do bot e o do dono **não podem ser iguais**.

## 3. Pastas
`assets/menu.jpg` foto do **.menu** (a legenda leva o início do menu e o resto vem em seguida) · `assets/sasuke.jpg` foto do bot (boas-vindas sem foto) · `assets/dono.jpg` foto do dono · `assets/anime/*.jpg` fotos dos personagens (falta **hinata.jpg**) ·
`auth/` sessão principal · `sessoes/` bots dos clientes · `database/` dados + `.bak` + `backups/` (a cada 6 h, guarda 10).

## 4. Regras do projeto
- Todo comando reage com emoji, responde "tipo humano" (lida, a escrever…, espera) e termina com a marca `sᴀsᴜᴋᴇ`.
- Nada vem configurado: preços, pagamentos, textos são **por grupo**. Sem configuração: *"Este grupo ainda não configurou esta informação. Um administrador pode utilizar o comando correspondente."*
- O link do canal **só** aparece em `.canal`, no aviso de aluguel/teste expirado e no anúncio periódico (secção 5b).
- Foto em falta → erro explícito, nunca finge que enviou.
- **Só o dono** usa `.conectar .qrcode .alugar .tirardias .sessoes .desconectar` (e só na sessão principal). Para os outros o bot ignora, sem resposta.

## 5. Aluguel e pareamento (só o dono)
`.conectar 258841234567 30 BOT-JONAS` código · `.qrcode 30 Nome` QR em imagem · `.sessoes` · `.alugar <num> <dias>` · `.tirardias` · `.anular <num>` (privado) · `.desconectar <num>` · `.bangp` (no grupo).
Avisos ao dono do bot e a si aos 3 dias, 1 dia e ao expirar. Expirado = bot **congelado** (nem o dono do bot usa); livres: `.alugueis .dono .criador .canal`. Nada é apagado; `.alugar` reativa na hora.

## 5b. Teste grátis (24 h) e anúncios
- **Teste grátis:** quem nunca alugou envia `.teste` no **privado** do bot principal (872698781). Recebe um código de pareamento e ganha **24 h** com o próprio número (as horas contam a partir da ligação).
  1 teste por número e por pessoa · máx. 10 testes ao mesmo tempo · não ligou em 30 min → limpo e o direito é devolvido · avisos às 3 h, 1 h e ao terminar (o dono recebe o *lead* para oferecer o aluguel).
  Dono: `.teste on/off` · `.testes` · `.resetteste <num>` · `.alugar <num> <dias>` converte o teste em aluguel (tira os anúncios).
  Durante o teste o `.broadcast` fica bloqueado. Sessões expiradas há mais de 3 dias são apagadas.
- **Anúncios:** a cada **7 comandos executados** num chat o bot envia uma *Publicidade · Canal Oficial* (3 textos que se alternam, com o link do canal e, no teste, o tempo restante).
  Por defeito só em bots de **teste**; clientes pagantes e o bot principal não veem. Em `config.json > anuncio`: `cadaComandos`, `paraAlugados`, `naSessaoPrincipal`, `ativo`.
  `.canal`, `.dono`, `.criador`, `.alugueis` e `.teste` não contam.

## 6. Vendas
`.setmegas 1GB=45, 5GB=190` (ou texto livre) · `.settabela` · `.mpesa 84xxxxxxx-Nome` / `.addmpesa` · `.emola` / `.addemola` · `.setpagamento .setcontas .setcarteira .setcompra .setloja`.
Cliente: `.compra 5gb` → paga → cola o SMS → o bot valida (conta, valor, ID repetido) → admin envia e usa `.enviar @cliente`.
`.compra` **não** regista nada sem pagamento verificado (corrigido: antes qualquer um inflava o ranking).
Entrega automática: ligue a API do fornecedor em `src/lib/deliver.js` e use `.pagamento on`.

## 7. Interpretações (confirme)
`automover` = remover automaticamente quem atinge `maxavisos` · `nanobemvindo/nanosaida` = boas-vindas curta / saída · `soadmin` = bot ignora comandos de membros ·
`anticoncorrencia` = apaga anúncios de venda de megas de outros · `nano*` = comandos criados pelo próprio grupo · `style-menu 1|2` = menu em caixas ou compacto.

## 8. Testes
`npm test` (304 verificações com WhatsApp simulado) · `npm run auditoria`.
**Aviso:** o Baileys não é oficial — há risco de banimento; use números dedicados. Anime (`.waifu`, `.anime`) precisa de internet.
