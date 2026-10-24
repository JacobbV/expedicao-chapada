# 🏍️ Expedição Chapada Diamantina 2027

PWA da viagem de moto **Catolé do Rocha-PB → Lençóis-BA**: roteiro dia a dia, circuitos de passeio, checklist por piloto, gastos com acerto de contas, hospedagem e pendências. O app funciona **sem internet**. Quando a sincronização está ligada, as mudanças feitas offline sobem sozinhas assim que o sinal volta.

## O que tem

| Tela | O que faz |
|---|---|
| **Início** | Contagem regressiva, folga até o fim das férias, próximo dia, progresso do checklist dos dois pilotos, combustível previsto e acerto de contas |
| **Roteiro** | 7 dias (12 a 18/01/2027) com o circuito de cada dia em cores. Dá para editar data, saída, km e observações, trocar o circuito de um dia (para fugir da chuva) e mudar a data de saída de tudo de uma vez |
| **Checklist** | Um por piloto. O do Jacó já vem preenchido; o do Kaique começa em "Avaliar". Cada um edita o seu e vê o do outro |
| **Gastos** | Cada um lança os seus. Abastecimento calcula o valor por litros × R$/L. O que for marcado como **compartilhado** entra no acerto ("Kaique deve R$ X ao Jacó") |
| **Mais → Hospedagem** | Opções para Petrolina (ida), Lençóis e Petrolina (volta). Ao marcar uma como Escolhida ou Confirmada, ela sobe para o topo |
| **Mais → Pendências** | Lista por prioridade (segurança, logística…), com pendências próprias |
| **Mais → Pilotos** | Consumo e tanque de cada moto, que alimentam autonomia e custo de combustível |
| **Mais → Ajustes** | Preço da gasolina, fim das férias, backup, status da sincronização |

## 1. Publicar no GitHub Pages

1. Suba estes arquivos na branch `main` do repositório.
2. No GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
3. Em 1–2 minutos o app fica em `https://jacobbv.github.io/expedicao-chapada/`.
4. No celular, abra o link e use **Adicionar à tela inicial** (Chrome: menu ⋮ → *Instalar app*; iPhone/Safari: Compartilhar → *Adicionar à Tela de Início*).

Sem nenhuma configuração extra, o app roda em **modo local**: tudo fica salvo só naquele celular.

## 2. Ligar a sincronização entre os dois celulares (Firebase, grátis)

Leva uns 10 minutos e só precisa ser feito uma vez.

1. Acesse <https://console.firebase.google.com> → **Adicionar projeto** → nome `expedicao-chapada` (pode desativar o Google Analytics).
2. **Build → Authentication → Começar → Método de login: E-mail/senha → Ativar**.
3. Na aba **Users → Adicionar usuário**, crie duas contas: a sua e a do Kaique (e-mail + senha).
4. Ainda em Authentication → **Settings → User actions**, desmarque **Enable create (sign-up)**. Assim ninguém consegue criar conta sozinho.
5. **Build → Firestore Database → Criar banco de dados** → modo produção → região `southamerica-east1 (São Paulo)`.
6. Na aba **Regras**, cole o conteúdo de [`firestore.rules`](firestore.rules), **troque os dois e-mails** pelos das contas criadas e clique em **Publicar**.
7. Em **⚙️ Configurações do projeto → Seus apps → Web (`</>`)**, registre o app com o nome `chapada`. **Não** marque Firebase Hosting.
8. Copie o objeto `firebaseConfig` que aparecer e cole no arquivo [`firebase-config.js`](firebase-config.js), no lugar do `null`.
9. Em **Authentication → Settings → Authorized domains**, adicione `jacobbv.github.io`.
10. Faça commit, push e aumente a `VERSION` no `sw.js` (ex.: `v1.0.1`) para os celulares pegarem a versão nova.

Pronto: o app passa a pedir login. No primeiro acesso, cada um escolhe **"Sou Jacó"** ou **"Sou Kaique"**.

> A chave `apiKey` do Firebase não é senha: ela vai no código do site normalmente. Quem protege os dados são as regras do Firestore com os dois e-mails.

> Se você já usou o app no modo local, baixe um backup em **Ajustes → Baixar backup** antes de ligar a sincronização. Os dados locais não vão sozinhos para a nuvem.

## 3. Como o offline funciona

- O primeiro acesso precisa de internet: ele baixa o app e, no modo nuvem, faz o login.
- Depois disso o app abre sem sinal. Tudo o que você edita fica guardado no celular.
- O selo no topo mostra o estado: **Sincronizado**, **Offline · na fila** (há mudanças esperando sinal) ou **Enviando…**.
- Quando os dois editam a mesma coisa offline, vale a última alteração que chegar ao servidor.

## Atualizar o app

Edite os arquivos, aumente `VERSION` em `sw.js`, faça `git add . && git commit -m "..." && git push`. Os celulares pegam a versão nova ao abrir o app com internet. Às vezes é preciso fechar e abrir de novo.

## Estrutura

```
index.html            casca do app
css/app.css           visual (claro e escuro)
js/data.js            dados-base: roteiro, circuitos, checklist, pendências
js/store.js           armazenamento: modo local ou Firebase com cache offline
js/app.js             telas e interações
firebase-config.js    configuração do Firebase (null = modo local)
firestore.rules       regras de acesso para colar no Firebase
sw.js                 service worker (offline)
manifest.webmanifest  instalação como app
icons/                ícones
```

## Avisos

As distâncias da estrada e dos circuitos são **estimativas** do planejamento e ainda não foram validadas por GPS. Confira traçado, postos e condições das estradas de terra antes de sair, principalmente com chuva em janeiro.
