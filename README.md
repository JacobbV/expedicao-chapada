# 🏍️ Expedição Chapada Diamantina 2027

PWA da viagem de moto **Catolé do Rocha-PB → Lençóis-BA**. Tem roteiro dia a dia, **mapa com os pontos de cada circuito**, checklist por piloto, gastos com acerto de contas, hospedagem e pendências. O app funciona **sem internet** e sincroniza entre os celulares pelo Firebase quando o sinal volta.

**App:** <https://jacobbv.github.io/expedicao-chapada/> · **Versão atual:** 1.15.3 ([histórico](#histórico-de-versões))

## Sumário
- [O que tem](#o-que-tem)
- [Mapa](#mapa)
- [Roadbook](#roadbook)
- [Tempo](#tempo)
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
| **Início** | Contagem regressiva, folga até o fim das férias (avisa se o roteiro passar da data) e **painel Hoje**: o dia da viagem (antes de sair, a prévia do dia 1) com tempo, saída e chegada estimada, quantas paradas cada moto precisa para abastecer, pernoite e o que falta no seu checklist. Abaixo, checklist dos dois, pendências, combustível previsto e acerto de contas |
| **Roteiro** | Dias com o circuito de cada um, em cores. Permite editar data, saída, km e observações, trocar o circuito de um dia, **inserir um dia depois de outro** (as datas seguintes avançam) ou **remover** (as seguintes recuam), mudar a data de saída de tudo e abrir os pontos do dia no mapa |
| **Mapa** | Pins com a cor do circuito, o ícone do tipo de lugar e o número da ordem no dia. Tocar no pin mostra detalhes, distância de Lençóis e o botão **Abrir no Google Maps**. Também dá para editar, arrastar o pin, criar ponto novo, filtrar por circuito e **ligar os pontos** para ver os km de cada circuito |
| **Checklist** | Um por piloto. Cada um edita o seu e vê o do outro. Tem uma legenda explicando cada status: **Pronto**, **Providenciar**, **Revisar**, **Não preciso** e **Avaliar** |
| **Gastos** | Duas abas: **Gastos da viagem** (os dois veem; cada gasto pode ser dividido) e **Meus gastos** (privada: o total de tudo o que você gastou). Detalhes em [Gastos](#gastos) |
| **Menu ☰** | Topo com o seu perfil (nome, moto, admin), dias para a saída e status da sincronização; grupos **Viagem** e **App** com ícones; aparência; **Sair da conta** |
| **Menu ☰ → Roadbook** | Um cartão 10 × 15 cm por dia para imprimir ou salvar em PDF |
| **Menu ☰ → Hospedagem** | Opções para Petrolina (ida), Lençóis e Petrolina (volta). As datas e noites acompanham o roteiro |
| **Menu ☰ → Pendências** | Lista por prioridade, com pendências próprias |
| **Menu ☰ → Pilotos** | Consumo e tanque de cada moto (usados na autonomia e no combustível), redes e contatos de cada um e, para o admin, **+ Adicionar piloto** |
| **Menu ☰ → Segurança** | Botões **Enviar minha localização** e **Cheguei bem** (abrem o WhatsApp com a mensagem e o link do mapa e ficam registrados no app), números úteis e a **ficha de emergência** de cada piloto, visível só para o grupo |
| **Menu ☰ → Diário de bordo** | Cada abastecida com hodômetro, litros e preço. Calcula o **consumo real** entre dois tanques cheios, km por tanque e custo por km; o consumo real passa a ser usado na autonomia, nas paradas do painel Hoje e no combustível previsto |
| **Menu ☰ → Modo pilotando** | Tela de letras grandes para olhar numa parada: hora, próxima cidade e distância, km até o destino e hora de chegada, onde abastecer, tempo agora e botões de localização, Cheguei bem e 192. Usa o GPS (sem GPS, estima pelo horário) e deixa a tela acesa |
| **Menu ☰ → Revisão das motos** | O que fazer na moto antes da viagem e o que já foi feito, com data, km e valor; o custo pode ir para Meus gastos |
| **Menu ☰ → Novidades** | O que o outro piloto lançou (gastos, avisos de localização, fotos) e lembretes da viagem; o número em vermelho no botão ☰ mostra quantas são novas |
| **Menu ☰ → Resumo da expedição** | Números da viagem (km do roteiro e rodados, gastos, consumo real, parte de cada um, fotos), gastos por categoria, dia a dia com fotos e botão **Compartilhar** |
| **Menu ☰ → Ajustes** | Aparência (Automático, Dia, Noite), preço da gasolina, média na estrada (para o tempo no caminho), fim das férias, backup, sincronização, sair da conta e versão do app |
| **Menu ☰ → Aparência** | Atalho para trocar entre **Automático** (segue o celular), **☀ Dia** e **☾ Noite**. A escolha fica salva em cada aparelho |
| **Menu ☰ → Sobre** | Quem somos, nossa história, objetivos e sonhos, sobre o app, **redes e contatos de cada piloto** (só aparecem os preenchidos) e créditos. Todos veem; os textos só o admin edita, e cada piloto edita os próprios contatos |

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

## Roadbook

Em **Menu ☰ → Roadbook** (ou no botão **Roadbook 10×15** do Roteiro) o app monta **um cartão por dia**, no tamanho 10 × 15 cm:

- Dia, data e título, com a faixa na cor do circuito.
- Horário de saída, km de moto e tempo previsto (quando já houver previsão).
- **Caminho** cidade a cidade (dias de estrada).
- **Pontos** do circuito na ordem, com a distância em linha reta da pousada.
- Observação do dia e **pernoite** (a hospedagem confirmada ou escolhida daquela etapa).

O botão **Imprimir / salvar PDF** abre a impressão do celular ou do computador: escolha **Salvar como PDF** para guardar, ou imprima. Cada cartão sai numa página de 10 × 15 cm. Como o roadbook é gerado na hora, ele sempre acompanha o roteiro atual. Gere de novo depois de mudar algo.

## Tempo

Tudo vem do **Open-Meteo**, gratuito e sem cadastro. A consulta sai do próprio celular.

**No Roteiro**
- **Tempo da viagem** (no topo): os dias em barras de mínima e máxima, com a chance de chuva. Se um dia de passeio tem 70% ou mais de chuva e outro tem 30% ou menos, o app sugere trocar os circuitos.
- **No cartão de cada dia:** faixa com máxima/mínima, chance de chuva, mm e rajadas, e avisos rápidos (calor de 34° ou mais, chuva de 60% ou mais, rajadas de 45 km/h ou mais, UV extremo). Toque para abrir o **Tempo do dia**.

**Tempo do dia** (ao tocar)
- **Na estrada, na hora que vocês passam:** com a hora de saída e a média em Ajustes (70 km/h contando paradas, por padrão), o app estima a que horas vocês passam em cada cidade do **Caminho** e mostra o tempo naquela hora e lugar. As cidades são achadas pela busca de nomes do Open-Meteo e ficam guardadas. Nos dias de volta escritos como “mesmo corredor da ida”, o app usa o caminho da ida ao contrário.
- **Avisos:** calor na rota, chuva perto de alguma cidade, chegada perto ou depois do pôr do sol, rajadas, UV e, nos passeios, chuva mais provável à tarde.
- **Hora a hora** no lugar do dia, **vento** (com de onde vem), **índice UV**, **nascer e pôr do sol** e **chuva**.

**Quando**

| Quando | O que aparece |
|---|---|
| Até 15 dias antes | **Previsão** completa, também no resumo do dia e no roadbook |
| Mais de 15 dias antes | **Clima típico:** o mesmo dia nos últimos 5 anos (média de máxima e mínima, em quantos choveu, ano a ano) e o hora a hora do ano anterior como referência. A previsão entra sozinha 15 dias antes |
| Dia que já passou | Como foi o tempo |

O resultado fica guardado no celular: a previsão é renovada a cada 3 horas com internet, e sem sinal aparece a última baixada. Lugar de cada dia: destino nos dias de estrada; Lençóis, Pai Inácio, Capão ou Lapa Doce nos passeios. Se um pin mudar no mapa, o tempo acompanha.

## Gastos

| Aba | Quem vê | O que soma |
|---|---|---|
| **Gastos da viagem** | Os dois | Gastos lançados na viagem + gastos de *Meus gastos* que o dono escolheu **exibir** |
| **Meus gastos** | Só a própria conta | **Total geral**: os gastos privados + o que você pagou na viagem |

**Categorias (as mesmas nas duas abas):** Combustível, Hospedagem, Alimentação, Pedágio, Passeios e guias, Estacionamento, Imprevistos na estrada, Moto: manutenção e conserto, Equipamentos, Equipamentos de proteção, Ferramentas, Bagagem, Navegação e estrada, Roupas e higiene, Trilhas e cachoeiras, Fotos e comunicação, Medicamentos e Outros.

- **Categoria nova:** no fim da lista, escolha **+ Nova categoria…**. Logo abaixo aparece o campo para digitar o nome. Ela fica salva e aparece na lista para todos, nas duas abas. Se já existir uma com o mesmo nome, o app usa a existente.
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

A viagem é feita em conjunto: os pilotos editam juntos o que é da viagem. O **Jacó é o admin** e cuida só do que é pessoal dele e do app. A regra do Firestore garante isso no servidor, não só na tela.

| Parte do app | Admin (Jacó) | Kaique |
|---|---|---|
| Roteiro, datas, inserir/remover dias, data de saída | Edita | Edita |
| Mapa: criar, mover, editar e remover pontos | Edita | Edita |
| Hospedagem (opções, escolhida, confirmada) | Edita | Edita |
| Pendências (criar, marcar, remover) | Edita | Edita |
| Preço da gasolina | Edita | Edita |
| Sobre: Quem somos, Nossa história, Objetivos e sonhos | Edita | Edita |
| Sobre: “Sobre o app” | Edita | Só vê |
| Fim das férias | Edita (aviso de folga no Início) | Vê só o **prazo da viagem** e o motivo |
| Checklist | O seu | O seu |
| Perfil, moto e contatos | Os seus (e pode ajustar os dos outros) | Os seus |
| Gastos da viagem | Os que pagou | Os que pagou |
| Meus gastos (privado) | Só os seus | Só os seus |
| Backup (.json) | Baixa | Baixa (com os próprios dados privados) |
| Adicionar ou remover piloto | Sim | Não |

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
- **Fotos** ficam no próprio Firestore (o armazenamento de arquivos do Firebase exige plano pago): o app reduz cada foto para até ~500 KB, mais uma miniatura de ~20 KB. A cota grátis de 1 GB dá para centenas de fotos. As originais continuam no celular.
- **Configuração do app web:** [`firebase-config.js`](firebase-config.js). A `apiKey` pode ficar pública, porque quem protege os dados são as regras.

### Atualizar as regras (a partir da v1.14.0)
A v1.14.0 acrescentou as **fotos** (`photos` com as miniaturas e `photofull` com a foto grande; cada um envia e apaga só as suas). A v1.8.0 liberou a edição em conjunto da viagem e manteve só o pessoal com o admin. Copie o conteúdo de `firestore.rules` e cole em **Firestore → Regras** no console. Na função `pilotos()`, troque os dois e-mails pelos reais. Cada e-mail aponta para o perfil (`'jaco'` ou `'kaique'`). Depois clique em **Publicar**. Enquanto o Kaique não tiver conta, pode deixar o e-mail dele como modelo.

### Adicionar um piloto
1. **No app (admin):** Menu ☰ → Pilotos e motos → **+ Adicionar piloto**. Preencha nome, moto, consumo e tanque. O app mostra o **ID do perfil** (ex.: `joaopedro`).
2. **Firebase → Authentication → Usuários → Adicionar usuário**, com o e-mail e uma senha.
3. **Firestore → Regras**: na função `pilotos()`, acrescente uma linha `'email@dele.com': 'idDoPerfil',` e clique em **Publicar**. Para o Kaique, é só trocar o e-mail modelo pelo real.
4. Mande para ele o link, o e-mail e a senha. No primeiro acesso, ele escolhe o próprio perfil.

Piloto novo começa com o checklist em *Avaliar*, entra na divisão dos gastos marcados como *dividir* (dividido igual entre todos) e aparece no Sobre.

### Senhas
As contas são criadas pelo admin. Se alguém esquecer a senha, é só tocar em **Esqueci minha senha** na tela de login: o Firebase manda um link por e-mail para criar uma nova (precisa de internet). O admin também pode trocar a senha em Authentication → Usuários.

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
js/weather.js         tempo por dia (Open-Meteo)
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
| **1.15.3** | 25/10/2026 | **Mapa novo**: estilo da CARTO (claro “Voyager” ou escuro “Dark Matter”, conforme o tema do app), mais limpo que o padrão do OpenStreetMap. A **linha da estrada** no mapa agora passa pelas cidades do Caminho dos dias de ida (Sousa, Cajazeiras, Brejo Santo, Salgueiro, Cabrobó, Petrolina, Senhor do Bonfim, Jacobina, Morro do Chapéu, Utinga, Wagner) em vez de escolher outro caminho |
| 1.15.2 | 25/10/2026 | Mensagens de **Localização** e **Cheguei bem** mais bonitas no WhatsApp: título em negrito, nome da cidade pela posição (OpenStreetMap), o dia da viagem e, na localização, quantos km faltam para o destino |
| 1.15.1 | 25/10/2026 | Títulos de seção de volta nos cartões (Caminho, Tempo no caminho, Abastecimento; no Início também Horário e distância e Pernoite), caminho com setas entre as cidades e abastecimento como “Jacó: cidade → cidade” |
| 1.15.0 | 25/10/2026 | **Telas mais limpas.** Dia do Roteiro: chegada estimada no cabeçalho; aberto, só Caminho, Tempo e Abastecer (uma linha por piloto) e uma barra com **Navegar · Mapa · Fotos · Editar**. Navegar pergunta Google Maps ou Waze; Fotos abre a galeria do dia; inserir dia foi para dentro de Editar; trechos e dicas dos circuitos ficam recolhidos. Painel do Início: tempo, saída → chegada, km, pernoite e abastecimento em poucas linhas, com os mesmos botões |
| 1.14.6 | 25/10/2026 | Correção do erro **“The client has already been terminated”** ao enviar fotos no iPhone: quando a conexão local cai (galeria, segundo plano), o app reabre o banco e repete a operação. A atualização automática do roteiro agora só roda com os dados do servidor, para não apagar o que foi editado (como o link da rota) usando uma cópia antiga do celular. **Compartilhar** do Resumo com texto mais bonito para o WhatsApp: contagem regressiva, pilotos e roteiro dia a dia, e gastos só depois que a viagem começa |
| 1.14.5 | 25/10/2026 | **Resumo reorganizado** em seções: Estrada (km planejados e rodados, dias de estrada e passeio, horas de volante), Motos (consumo, autonomia e combustível de cada uma), Dinheiro da viagem (total, divididos, parte de cada um, acerto e categorias), Memórias (fotos e “cheguei bem”) e Dia a dia (com gastos do dia). A preparação que cada um mostra ao grupo agora aparece separada e **não entra mais no total da viagem** |
| 1.14.4 | 25/10/2026 | Botão **Limpar avisos** em Segurança (cada um apaga os seus; o admin apaga todos). Cartão **Complete seu perfil** no Início para quem ainda não preencheu tanque e consumo, ficha de emergência, placa, WhatsApp ou o checklist; some sozinho quando tudo estiver preenchido |
| 1.14.3 | 25/10/2026 | **Rota corrigida aplicada sozinha** no roteiro de vocês: dia 1 sem Pombal (PB-325 até o trevo da BR-230, Sousa, Cajazeiras, BR-116 pelo Ceará, Salgueiro, Cabrobó, Petrolina · 565 km), dia 2 por Jacobina e Morro do Chapéu (528 km) e as voltas com os mesmos km; só mexe nos dias que ainda estavam com o texto antigo. **Link da rota no Google Maps** em Editar dia: o botão Google Maps abre exatamente a rota que vocês montaram |
| 1.14.2 | 25/10/2026 | Caminho do dia 1 sem Pombal: pela PB-325 até o trevo da BR-230 e à direita sentido Sousa |
| 1.14.1 | 25/10/2026 | **Localização e Cheguei bem** agora abrem uma folha: pega a posição, mostra a mensagem e os botões **Enviar pelo WhatsApp** (abre o app direto, com a lista de conversas), **Outros apps…** e **Copiar texto**; se não achar a posição, explica o motivo e deixa tentar de novo. **Rota nova** no roteiro inicial: ida por Sousa, Cajazeiras e BR-116 pelo Ceará até Salgueiro e Cabrobó (563 km) e, no 2º dia, Juazeiro, Senhor do Bonfim, Jacobina, Morro do Chapéu, Utinga e Wagner até Lençóis (528 km) |
| 1.14.0 | 25/10/2026 | **Navegar no Google Maps ou no Waze** (aparece no CarPlay): em cada dia e no Modo pilotando, com a rota do dia e até 3 cidades do caminho como paradas; nos passeios, os pontos do circuito; no Modo pilotando sai da sua posição. **Fotos por dia** (reduzidas e guardadas no Firestore, com legenda, baixar e excluir). **Resumo da expedição** (☰): km, gastos, consumo real, parte de cada um, dia a dia com fotos e botão Compartilhar. **Exportar gastos** em planilha (.csv para Excel/Google Planilhas), nas duas abas. **Novidades** (☰): gastos, avisos e fotos do outro piloto e lembretes da viagem, com contador no botão do menu e aviso na tela quando chega algo novo. **Regras do Firestore novas** (fotos) |
| 1.13.1 | 25/10/2026 | Gasto de **Combustível** ganhou hodômetro e tanque cheio: com o hodômetro, o abastecimento entra sozinho no Diário de bordo, e os dois ficam ligados (editar ou excluir um atualiza o outro). Localização: tenta o GPS e depois a posição aproximada, e explica o motivo quando não consegue (bloqueada, sem sinal, demora). Mensagem do WhatsApp sem o emoji que aparecia como “�” no PC |
| 1.13.0 | 25/10/2026 | **Abastecimento na rota:** em cada dia de estrada, onde cada moto deve abastecer pela autonomia (20% de reserva), usando as cidades do caminho e os postos marcados no mapa, com aviso de trecho longo sem parada; aparece no dia, no painel Hoje e no roadbook. **Revisão das motos** (☰): itens a fazer e feitos por moto, com data, km, valor e opção de lançar em Meus gastos. **Modo pilotando** (☰ ou painel Hoje): tela grande com hora, próxima cidade, km até o destino e chegada, próximo abastecimento, tempo agora e botões de localização, Cheguei bem e 192; usa o GPS e mantém a tela acesa. Roadbook não corta mais na tela do celular |
| 1.12.0 | 25/10/2026 | **Segurança** (☰ → Segurança): enviar minha localização e “Cheguei bem” pelo WhatsApp com link do mapa, registrados no app para o outro piloto; números úteis (192, 193, 191, 190); ficha de emergência de cada piloto (tipo sanguíneo, alergias, remédios, plano, contato, placa, assistência). **Diário de bordo** (☰ → Diário de bordo): hodômetro e litros a cada abastecida, consumo real entre tanques cheios, km por tanque, custo por km, opção de lançar em Gastos; o consumo real passa a valer nas contas do app. No painel Hoje: botões de localização e Cheguei bem e os avisos do dia |
| 1.11.0 | 25/10/2026 | **Painel Hoje** no Início: o dia (ou a prévia do dia 1 antes da viagem) com tempo, saída e chegada estimada, paradas para abastecer de cada moto pela autonomia, pernoite, o que falta no seu checklist, atalhos para Tempo do dia, mapa e roadbook, e o dia seguinte |
| 1.10.0 | 25/10/2026 | **Tempo mais completo:** semana em barras no topo do Roteiro com sugestão de troca de circuito em dia de chuva; faixa e avisos no cartão do dia; folha **Tempo do dia** com o tempo em cada cidade do caminho na hora que vocês passam, avisos (calor, chuva, pôr do sol, rajadas, UV), hora a hora, vento, UV, sol e chuva; antes da previsão, **clima típico dos últimos 5 anos**; média na estrada em Ajustes |
| 1.9.1 | 24/10/2026 | Correção no menu: os textos ao lado de cada item (confirmadas, abertas, versão) apareciam cortados |
| 1.9.0 | 24/10/2026 | **Menu novo** (perfil no topo, dias para a saída, sincronização, grupos com ícones e Sair da conta); **Roadbook 10 × 15 cm** com um cartão por dia para imprimir ou salvar em PDF; **tempo por dia** no Roteiro (previsão até 15 dias; antes disso, o mesmo dia do ano anterior como referência) |
| 1.8.0 | 24/10/2026 | **Edição em conjunto**: o Kaique passa a editar roteiro, mapa, hospedagem, pendências, gasolina e os textos Quem somos, Nossa história e Objetivos; continuam só do admin as férias, “Sobre o app” e adicionar/remover pilotos. O aviso de férias aparece só para o admin; os outros veem o prazo da viagem e o motivo. Regras do Firestore atualizadas |
| 1.7.1 | 24/10/2026 | Opção **+ Nova categoria…** separada do “Outros”, com o campo aparecendo só quando é escolhida; corrigidos campos que apareciam sem precisar (litros fora do combustível) |
| 1.7.0 | 24/10/2026 | **Categorias iguais nas duas abas** de gastos, com Equipamentos e Equipamentos de proteção separados e **Medicamentos** novo; em **Outros** dá para criar uma categoria, que fica salva para os próximos gastos; nomes antigos de categoria são convertidos sozinhos |
| 1.6.1 | 24/10/2026 | Tela de login mais limpa (sem texto técnico), com uma linha sobre o app, **Esqueci minha senha** (o Firebase manda o link por e-mail) e “Criado por Jacó · GitHub” no rodapé |
| 1.6.0 | 24/10/2026 | **Redes e contatos por piloto**: cada um edita os próprios e eles aparecem separados no Sobre; admin pode **adicionar e remover pilotos** (nome, moto, consumo, tanque) e vê o ID do perfil para as regras |
| 1.5.0 | 24/10/2026 | Papéis **admin** (Jacó) e **usuário** (Kaique): o usuário vê tudo e só altera o próprio checklist, perfil e gastos, com a regra do Firestore garantindo no servidor; Sobre ganha **Quem somos**, **Nossa história**, **Objetivos e sonhos** e **Sobre o app**, com textos editáveis pelo admin |
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
