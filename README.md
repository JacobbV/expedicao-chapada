# 🏍️ Expedição Chapada Diamantina 2027

PWA da viagem de moto **Catolé do Rocha-PB → Lençóis-BA**. Tem roteiro dia a dia, **mapa com os pontos de cada circuito**, checklist por piloto, gastos com acerto de contas, hospedagem e pendências. O app funciona **sem internet** e sincroniza entre os celulares pelo Firebase quando o sinal volta.

**App:** <https://jacobbv.github.io/expedicao-chapada/> · **Versão atual:** 1.5.0 ([histórico](#histórico-de-versões))

## Sumário
- [O que tem](#o-que-tem)
- [Mapa](#mapa)
- [Gastos](#gastos)
- [Checklist](#checklist)
- [Quem pode mexer em quê](#quem-pode-mexer-em-quê)
- [Publicar e atualizar](#publicar-e-atualizar)
- [Sincronização (Firebase)](#sincronização-firebase)
- [Estrutura](#estrutura)
- [Histórico de versões](#histórico-de-versões)
- [Autor](#autor)

## O que tem

| Tela | O que faz |
|---|---|
| **Início** | Contagem regressiva, folga até o fim das férias (avisa se o roteiro passar da data), próximo dia, progresso do checklist dos dois, combustível previsto e acerto de contas |
| **Roteiro** | Dias com o circuito de cada um, em cores. Permite editar data, saída, km e observações, trocar o circuito de um dia, **inserir um dia depois de outro** (as datas seguintes avançam) ou **remover** (as seguintes recuam), mudar a data de saída de tudo e abrir os pontos do dia no mapa |
| **Mapa** | Pins com a cor do circuito, o ícone do tipo de lugar e o número da ordem no dia. Tocar no pin mostra detalhes, distância de Lençóis e o botão **Abrir no Google Maps**. Também dá para editar, arrastar o pin, criar ponto novo, filtrar por circuito e **ligar os pontos** para ver os km de cada circuito |
| **Checklist** | Um por piloto. Cada um edita o seu e vê o do outro. Tem uma legenda explicando cada status: **Pronto**, **Providenciar**, **Revisar**, **Não preciso** e **Avaliar** |
| **Gastos** | Duas abas: **Gastos da viagem** (os dois veem; cada gasto pode ser dividido) e **Meus gastos** (privada: o total de tudo o que você gastou). Detalhes em [Gastos](#gastos) |
| **Menu ☰ → Hospedagem** | Opções para Petrolina (ida), Lençóis e Petrolina (volta). As datas e noites acompanham o roteiro |
| **Menu ☰ → Pendências** | Lista por prioridade, com pendências próprias |
| **Menu ☰ → Pilotos** | Consumo e tanque de cada moto, usados no cálculo de autonomia e combustível |
| **Menu ☰ → Ajustes** | Aparência (Automático, Dia, Noite), preço da gasolina, fim das férias, backup, sincronização, sair da conta e versão do app |
| **Menu ☰ → Aparência** | Atalho para trocar entre **Automático** (segue o celular), **☀ Dia** e **☾ Noite**. A escolha fica salva em cada aparelho |
| **Menu ☰ → Sobre** | Quem somos, nossa história, objetivos e sonhos, sobre o app, criador e contatos (só aparecem os preenchidos) e créditos. Todos veem; só o admin edita |

## Mapa

### Cores e ícones
| Circuito | Cor |
|---|---|
| Chegada · Lençóis a pé | Rosa |
| Circuito 1 · Mosquito, Poço do Diabo, Pai Inácio | Azul |
| Circuito 2 · Vale do Capão, Fumaça, Riachinho | Laranja |
| Circuito 3 · Marimbus e Roncador | Verde |
| Plano B · Lapa Doce e Pratinha | Roxo |
| Estrada (Catolé, Petrolina) | Cinza |

Os ícones dentro do pin indicam o tipo de lugar: pousada (casa), cachoeira ou poço (gota), mirante ou morro (montanha), gruta, embarque de canoa, cidade ou vila, posto de combustível e outro ponto.

### Como usar
- **Ver detalhes:** toque num pin ou num item da lista abaixo do mapa.
- **Navegar:** use **Abrir no Google Maps** na ficha do ponto.
- **Corrigir a posição:** **Mover pin** e arraste, ou **Editar** e cole as coordenadas do Google Maps (formato `-12.5583, -41.3895`).
- **Criar ponto:** **+ Ponto**, ou segure o dedo no mapa.
- **Pontos sem posição:** aparecem na lista com o selo *sem posição*. Toque no ponto e use **Marcar no mapa**.
- **Tudo sincroniza:** o que um muda aparece no celular do outro.

### Ligar pontos
O botão **Ligar pontos** desenha cada circuito saindo da pousada, passando pelos pontos na ordem dos números e voltando para a pousada. Embaixo do mapa aparece um quadro com os km de cada circuito e o total.

| Filtro | O que liga |
|---|---|
| Todos | Cada circuito separado (chegada, 1, 2, 3 e plano B), com o total somado |
| Um circuito | Só aquele circuito: pousada → pontos → pousada |
| Estrada | Catolé do Rocha → Petrolina → pousada |

- **Linha cheia** = rota **pela estrada**, calculada pelo serviço público OSRM com dados do OpenStreetMap. Precisa de internet na primeira vez; depois o resultado fica guardado no celular.
- **Linha tracejada** = **linha reta**. É usada na chegada (a pé) e quando não há internet.
- Pontos que só se alcançam por trilha (ex.: Fumaça por cima) contam até a estrada mais próxima, então a trilha a pé não entra na conta.
- Pontos *sem posição* ficam de fora e aparecem avisados no quadro.
- É **estimativa**: estradas de terra e trechos novos podem estar diferentes no OpenStreetMap.

### Offline
O mapa usa o OpenStreetMap. Sem internet, ele mostra só as áreas que **já foram abertas antes** naquele celular (o app guarda até cerca de 3.000 pedaços de mapa). Antes da viagem, abra o mapa com Wi-Fi e passeie pelo zoom de Lençóis, Capão e da rota. Para **navegar** sem sinal, baixe a região no **Google Maps offline**: o botão de cada ponto abre direto lá.

### De onde vêm as posições
As coordenadas iniciais foram conferidas em fontes públicas, e a ficha de cada ponto mostra a fonte. Distâncias no mapa são **em linha reta** a partir da pousada, não pela estrada.

| Ponto | Fonte |
|---|---|
| Pousada Raízes de Lençóis | Informada pelo Jacó |
| Centro de Lençóis, Pai Inácio, Cachoeira da Fumaça, Catolé do Rocha, Petrolina | Wikipedia |
| Serrano, Salão de Areias, Poço Halley, Cachoeirinha, Primavera, Ribeirão do Meio, Mosquito, Poço do Diabo, Vila do Capão | komoot |
| Cachoeira do Riachinho | Outdooractive |
| Gruta da Lapa Doce, Fazenda Pratinha | Showcaves.com |
| **Sem posição ainda:** Mirante de Lençóis, Povoado do Remanso, embarque no Marimbus, piscinas do Rio Roncador | Marcar no app quando confirmar |

## Gastos

| Aba | Quem vê | O que soma | Categorias |
|---|---|---|---|
| **Gastos da viagem** | Os dois | Gastos lançados na viagem + gastos da preparação que o dono escolheu **exibir** | Combustível, Hospedagem, Alimentação, Pedágio, Passeios e guias, Estacionamento, Imprevistos na estrada, Manutenção / conserto, Equipamentos, Ferramentas, Outros |
| **Meus gastos** | Só a própria conta | **Total geral**: a sua preparação + o que você pagou na viagem | Moto e manutenção, Equipamentos de proteção, Bagagem, Ferramentas e imprevistos, Navegação e estrada, Roupas e higiene, Trilhas e cachoeiras, Fotos e comunicação, Outros |

- **Exibir para o grupo:** cada gasto da preparação tem essa chave. Desligada (padrão), o gasto é privado (🔒). Ligada, ele também aparece em *Gastos da viagem* com o selo *exibido da preparação*. Desligar remove de lá na hora.
- **Dividir entre os dois:** vale para os gastos da viagem. Só eles entram no **acerto de contas**. Os gastos exibidos da preparação não entram.
- **Sua parte na viagem:** o que você pagou sozinho na viagem mais a sua metade dos divididos.
- **Centavos:** todos os valores aparecem exatamente como foram lançados (ex.: R$ 75,72).
- **Combustível:** informando litros e R$/L, o valor é calculado sozinho. O preço padrão vem de Ajustes.
- **Privacidade de verdade:** os gastos da preparação ficam em `trips/chapada2027/private/<conta>/prep`, que a regra do Firestore deixa só o dono ler. Quando você exibe um gasto, uma cópia dele vai para a área compartilhada.

## Checklist

Um checklist por piloto. Os dois veem os dois, e cada um só altera o seu.

| Status | Quer dizer |
|---|---|
| **Pronto** | Tenho e está em condições, ou já comprei, consertei ou reservei |
| **Providenciar** | Falta comprar, conseguir, reservar ou consertar |
| **Revisar** | Tenho, mas preciso conferir antes de ir |
| **Não preciso** | Decidi não levar ou não fazer |
| **Avaliar** | Ainda não decidi (é como começa o checklist de quem não preencheu) |

O progresso conta como resolvido o que está em **Pronto** ou **Não preciso**.

## Quem pode mexer em quê

O **Jacó é o admin**. O **Kaique** (e qualquer outro piloto) é usuário: vê tudo e mexe só no que é dele. A regra do Firestore garante isso no servidor, não só na tela.

| Parte do app | Admin (Jacó) | Usuário (Kaique) |
|---|---|---|
| Roteiro, datas, inserir/remover dias | Edita | Só vê |
| Mapa: criar, mover, editar e remover pontos | Edita | Só vê (pode ligar pontos e abrir no Google Maps) |
| Hospedagem e pendências | Edita | Só vê |
| Gasolina e fim das férias (Ajustes) | Edita | Só vê |
| Sobre: textos e contatos | Edita | Só vê |
| Próprio checklist | Edita o seu | Edita o seu |
| Próprio perfil e moto (consumo, tanque) | Edita (e pode ajustar o do outro) | Edita o seu |
| Gastos da viagem | Cria e altera os que pagou | Cria e altera os que pagou |
| Meus gastos (privado) | Só os seus | Só os seus |
| Tema dia/noite | No próprio aparelho | No próprio aparelho |

Para quem não é admin, os botões de edição somem e aparece o aviso “🔒 Só o Jacó (admin) altera…”.

## Publicar e atualizar

Hospedagem: **GitHub Pages**, em Settings → Pages → Deploy from a branch → `main` / `(root)`.

Para cada atualização:
1. Aumente a versão em [`js/version.js`](js/version.js), por exemplo `1.3.0` → `1.3.1`, e acrescente uma linha no [histórico](#histórico-de-versões). Esse é o único lugar da versão: o `sw.js` e a tela de Ajustes leem dela. Sem trocar a versão, os celulares continuam abrindo a versão antiga guardada.
2. No terminal:
   ```powershell
   git add .
   git commit -m "feat: o que mudou"
   git push
   ```
3. Em 1–2 minutos o site atualiza. Com internet, o app sempre busca os arquivos novos (desde a v1.2.1). No celular, feche e abra o app. A versão aparece no rodapé do menu ☰.

No celular: abra o link no Chrome → menu ⋮ → **Instalar app** (no iPhone: Compartilhar → *Adicionar à Tela de Início*).

## Sincronização (Firebase)

O projeto Firebase `expedicao-chapada` (plano grátis Spark) usa:
- **Authentication → E-mail/senha**, com o cadastro público **desligado** (Configurações → Ações do usuário → *Ativar criação* desmarcado). As contas são criadas à mão em **Usuários**.
- **Firestore** em `southamerica-east1`, com os dados em `trips/chapada2027` e subcoleções `riders`, `checklist`, `meta`, `expenses`, `lodging` e `points`.
- **Regras:** o arquivo [`firestore.rules`](firestore.rules) é só um **modelo**, com e-mails falsos. A regra que vale é a publicada no console, com os e-mails reais. Não coloque e-mails reais neste repositório público.
- **Gastos da preparação** ficam em `trips/chapada2027/private/<id da conta>/prep`. A regra deixa cada conta ler só a própria área, então nem o outro piloto consegue ver, mesmo mexendo no código.
- **Configuração do app web:** [`firebase-config.js`](firebase-config.js). A `apiKey` pode ficar pública, porque quem protege os dados são as regras.

### Atualizar as regras (a partir da v1.5.0)
A v1.5.0 trouxe os papéis de admin e usuário. Copie o conteúdo de `firestore.rules` e cole em **Firestore → Regras** no console. Na função `pilotos()`, troque os dois e-mails pelos reais. Cada e-mail aponta para o perfil (`'jaco'` ou `'kaique'`). Depois clique em **Publicar**. Enquanto o Kaique não tiver conta, pode deixar o e-mail dele como modelo.

### Adicionar um piloto (ex.: Kaique)
1. **Authentication → Usuários → Adicionar usuário**, com o e-mail e uma senha.
2. **Firestore → Regras**: troque o e-mail modelo dele na função `pilotos()` pelo real e clique em **Publicar**.
3. Mande para ele o link, o e-mail e a senha. No primeiro acesso, ele escolhe o próprio perfil.

### Como o offline funciona
- O primeiro login precisa de internet. Depois disso o app abre sem sinal.
- O selo no topo mostra o estado: **Sincronizado**, **Offline · na fila** ou **Enviando…**.
- Mudanças feitas offline sobem sozinhas. Se os dois mudarem a mesma coisa, vale a última que chegar.
- **Não saia da conta durante a viagem:** sem internet não dá para entrar de novo.

## Estrutura

```
index.html            casca do app
css/app.css           visual (claro e escuro)
js/version.js         versão do app (troque a cada publicação)
js/data.js            dados-base: roteiro, circuitos, pontos do mapa, checklist, categorias de gasto, pendências
js/store.js           armazenamento: modo local ou Firebase com cache offline
js/map.js             mapa (Leaflet + OpenStreetMap) e desenho dos pins
js/app.js             telas e interações
firebase-config.js    configuração do Firebase (null = modo local)
firestore.rules       modelo das regras do Firestore
sw.js                 service worker (offline, cache do app e do mapa)
manifest.webmanifest  instalação como app
icons/                ícones
```

## Histórico de versões

| Versão | Data | O que mudou |
|---|---|---|
| **1.5.0** | 24/10/2026 | Papéis **admin** (Jacó) e **usuário** (Kaique): o usuário vê tudo e só altera o próprio checklist, perfil e gastos, com a regra do Firestore garantindo no servidor; Sobre ganha **Quem somos**, **Nossa história**, **Objetivos e sonhos** e **Sobre o app**, com textos editáveis pelo admin |
| 1.4.1 | 24/10/2026 | Tema **Dia / Noite / Automático** no menu ☰ e em Ajustes, salvo por aparelho e aplicado antes da tela aparecer; aviso do navegador sobre a tag de app instalável corrigido |
| 1.4.0 | 24/10/2026 | Aba privada vira **Meus gastos**, com o total geral (preparação + o que você pagou na viagem); chave **Exibir para o grupo** em cada gasto da preparação; valores sempre com centavos; casinha na pousada da lista do mapa; tela **Sobre** no menu com versão, criador, contatos editáveis e créditos |
| 1.3.0 | 24/10/2026 | Botão **Ligar pontos** no mapa: liga cada circuito saindo e voltando à pousada e mostra os km por circuito e o total (pela estrada via OSRM, ou em linha reta a pé/sem internet). README com sumário, seções de Gastos e Checklist e este histórico |
| 1.2.2 | 24/10/2026 | Gastos da viagem ganham **Manutenção / conserto**, **Equipamentos** e **Ferramentas**; preparação ganha **Outros**; o formulário diz em qual aba o gasto entra |
| 1.2.1 | 24/10/2026 | Menu **☰** no topo (Hospedagem, Pendências, Pilotos, Ajustes) no lugar do “Mais” embaixo; barra de baixo com 5 itens; com internet o app sempre busca os arquivos novos, o que evita versões misturadas |
| 1.2.0 | 24/10/2026 | Gastos em duas abas: **Gastos da viagem** (compartilhados, com dividir) e **Minha preparação** (privada por conta, com regra nova do Firestore); migração automática dos gastos antigos; checklist com **Pronto** no lugar de “Tenho” e legenda dos status |
| 1.1.0 | 24/10/2026 | Tela **Mapa** com pins por circuito (cor, ícone e ordem), ficha com Google Maps, mover/criar/remover pontos, filtros e cache do mapa offline; **inserir/remover dias** empurrando as datas; versão centralizada em `js/version.js` |
| 1.0.3 | 24/10/2026 | Tela de login cobre o app inteiro |
| 1.0.2 | 24/10/2026 | Configuração real do Firebase; e-mails retirados do modelo de regras |
| 1.0.1 | 24/10/2026 | Sincronização com Firebase ligada |
| 1.0.0 | 24/10/2026 | Primeira versão: roteiro de 12 a 18/01, circuitos, checklist por piloto, gastos com acerto, hospedagem, pendências, modo offline e instalação como app |

## Autor

Criado por **Jacó**, de Catolé do Rocha-PB · [github.com/JacobbV](https://github.com/JacobbV)

© 2026 Jacó. Os contatos que aparecem no app são editados em **Menu ☰ → Sobre → Editar contatos**.

## Avisos

As distâncias da estrada e dos circuitos são **estimativas** do planejamento e ainda não foram validadas por GPS. Confira traçado, postos e condições das estradas de terra antes de sair, principalmente com chuva em janeiro.

Mapa © colaboradores do [OpenStreetMap](https://www.openstreetmap.org/copyright).
