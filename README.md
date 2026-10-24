# 🏍️ Expedição Chapada Diamantina 2027

PWA da viagem de moto **Catolé do Rocha-PB → Lençóis-BA**. Tem roteiro dia a dia, **mapa com os pontos de cada circuito**, checklist por piloto, gastos com acerto de contas, hospedagem e pendências. O app funciona **sem internet** e sincroniza entre os celulares pelo Firebase quando o sinal volta.

**App:** <https://jacobbv.github.io/expedicao-chapada/>

## O que tem

| Tela | O que faz |
|---|---|
| **Início** | Contagem regressiva, folga até o fim das férias (avisa se o roteiro passar da data), próximo dia, progresso do checklist dos dois, combustível previsto e acerto de contas |
| **Roteiro** | Dias com o circuito de cada um, em cores. Permite editar data, saída, km e observações, trocar o circuito de um dia, **inserir um dia depois de outro** (as datas seguintes avançam) ou **remover** (as seguintes recuam), mudar a data de saída de tudo e abrir os pontos do dia no mapa |
| **Mapa** | Pins com a cor do circuito, o ícone do tipo de lugar e o número da ordem no dia. Tocar no pin mostra detalhes, distância de Lençóis e o botão **Abrir no Google Maps**. Também dá para editar, arrastar o pin, criar ponto novo e filtrar por circuito |
| **Checklist** | Um por piloto. Cada um edita o seu e vê o do outro. Tem uma legenda explicando cada status: **Pronto**, **Providenciar**, **Revisar**, **Não preciso** e **Avaliar** |
| **Gastos** | Duas abas. **Gastos da viagem** são vistos pelos dois (combustível, hospedagem, alimentação, pedágio, passeios e guias, estacionamento, imprevistos), e cada gasto pode ser dividido ou não; os divididos entram no acerto de contas. **Minha preparação** é **privada**: cada conta vê só os seus gastos (moto e manutenção, proteção, bagagem, ferramentas, navegação, roupas, trilhas, fotos) |
| **Menu ☰ → Hospedagem** | Opções para Petrolina (ida), Lençóis e Petrolina (volta). As datas e noites acompanham o roteiro |
| **Menu ☰ → Pendências** | Lista por prioridade, com pendências próprias |
| **Menu ☰ → Pilotos** | Consumo e tanque de cada moto, usados no cálculo de autonomia e combustível |
| **Menu ☰ → Ajustes** | Preço da gasolina, fim das férias, backup, sincronização, sair da conta e versão do app |

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

## Publicar e atualizar

Hospedagem: **GitHub Pages**, em Settings → Pages → Deploy from a branch → `main` / `(root)`.

Para cada atualização:
1. Aumente a versão em [`js/version.js`](js/version.js), por exemplo `1.1.0` → `1.1.1`. Esse é o único lugar da versão: o `sw.js` e a tela de Ajustes leem dela. Sem trocar a versão, os celulares continuam abrindo a versão antiga guardada.
2. No terminal:
   ```powershell
   git add .
   git commit -m "feat: o que mudou"
   git push
   ```
3. Em 1–2 minutos o site atualiza. No celular, feche e abra o app com internet.

No celular: abra o link no Chrome → menu ⋮ → **Instalar app** (no iPhone: Compartilhar → *Adicionar à Tela de Início*).

## Sincronização (Firebase)

O projeto Firebase `expedicao-chapada` (plano grátis Spark) usa:
- **Authentication → E-mail/senha**, com o cadastro público **desligado** (Configurações → Ações do usuário → *Ativar criação* desmarcado). As contas são criadas à mão em **Usuários**.
- **Firestore** em `southamerica-east1`, com os dados em `trips/chapada2027` e subcoleções `riders`, `checklist`, `meta`, `expenses`, `lodging` e `points`.
- **Regras:** o arquivo [`firestore.rules`](firestore.rules) é só um **modelo**, com e-mails falsos. A regra que vale é a publicada no console, com os e-mails reais. Não coloque e-mails reais neste repositório público.
- **Gastos da preparação** ficam em `trips/chapada2027/private/<id da conta>/prep`. A regra deixa cada conta ler só a própria área, então nem o outro piloto consegue ver, mesmo mexendo no código.
- **Configuração do app web:** [`firebase-config.js`](firebase-config.js). A `apiKey` pode ficar pública, porque quem protege os dados são as regras.

### Atualizar as regras (a partir da v1.2.0)
A v1.2.0 criou a área privada da preparação. Copie o conteúdo de `firestore.rules`, cole em **Firestore → Regras** no console, troque os dois e-mails pelos reais e clique em **Publicar**. Sem isso, a aba *Minha preparação* mostra um aviso de permissão.

### Adicionar um piloto (ex.: Kaique)
1. **Authentication → Usuários → Adicionar usuário**, com o e-mail e uma senha.
2. **Firestore → Regras**: acrescente o e-mail na lista e clique em **Publicar**.
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
sw.js                 service worker (offline, cache de mapa)
manifest.webmanifest  instalação como app
icons/                ícones
```

## Avisos

As distâncias da estrada e dos circuitos são **estimativas** do planejamento e ainda não foram validadas por GPS. Confira traçado, postos e condições das estradas de terra antes de sair, principalmente com chuva em janeiro.

Mapa © colaboradores do [OpenStreetMap](https://www.openstreetmap.org/copyright).
