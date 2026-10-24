// Dados-base da expedição. Tudo aqui é o ponto de partida; o que for editado no app
// fica salvo no aparelho (e no Firebase, se configurado) e passa a valer no lugar destes valores.

export const TRIP_ID = "chapada2027";

export const RIDERS_SEED = {
  jaco:   { name: "Jacó",   moto: "BMW G 650 GS 2012",       consumo: 26, tanque: 14, email: "" },
  kaique: { name: "Kaique", moto: "Honda CG 160 Titan",      consumo: null, tanque: null, email: "" },
};

// Circuitos: cor, sequência e estimativas (distâncias ainda não validadas por GPS)
export const CIRCUITS = {
  estrada: { name: "Dia de estrada", short: "Dia de estrada", color: "var(--road)" },
  chegada: {
    name: "Chegada · Lençóis a pé", short: "Chegada · passeio a pé", color: "var(--c-chegada)",
    seq: ["Centro histórico", "Serrano", "Salão de Areias Coloridas", "Poço Halley", "Cachoeirinha", "Primavera", "Mirante", "Ribeirão do Meio (opcional)"],
    moto: "0 km", caminhada: "variável · até 13–18 km", acesso: "a pé, motos na pousada",
    nota: "Depois de 487 km de estrada, o cansaço decide. Sossego (≈7 km por sentido) não entra hoje. Nada de trilha longa no fim da tarde.",
  },
  c1: {
    name: "Circuito 1 · Mosquito, Poço do Diabo, Pai Inácio", short: "Passeio · circuito azul", color: "var(--c-1)", saida: "07:00",
    seq: ["Pousada", "Cachoeira do Mosquito", "Poço do Diabo / Mucugezinho", "Morro do Pai Inácio", "Pousada"],
    moto: "110–125 km", caminhada: "4–6 km", acesso: "asfalto + terra no Mosquito",
    trechos: [["Pousada → Mosquito", "35–40 km"], ["Mosquito → Poço do Diabo", "35–45 km"], ["Poço do Diabo → Pai Inácio", "8–12 km"], ["Pai Inácio → pousada", "28–30 km"]],
    nota: "Checar a estrada de terra do Mosquito antes de levar a Titan. Pôr do sol no Pai Inácio se o horário permitir.",
  },
  c2: {
    name: "Circuito 2 · Vale do Capão, Fumaça, Riachinho", short: "Passeio · circuito laranja", color: "var(--c-2)", saida: "06:30",
    seq: ["Pousada", "Vale do Capão", "Fumaça por cima", "Riachinho", "Pousada"],
    moto: "145–180 km", caminhada: "10–12 km · 5–6 h", acesso: "terra no acesso ao Capão",
    trechos: [["Pousada → Vale do Capão", "70–85 km"], ["Local até Riachinho", "5–10 km"], ["Retorno a Lençóis", "70–85 km"]],
    nota: "O mais sensível à chuva. Avaliar guia, estrada e trilha. Plano B: Lapa Doce + Pratinha.",
  },
  c3: {
    name: "Circuito 3 · Marimbus e Roncador", short: "Passeio · circuito verde", color: "var(--c-3)",
    seq: ["Pousada", "Povoado do Remanso", "Canoa no Marimbus", "Rio Roncador e piscinas", "Pousada"],
    moto: "40–50 km", caminhada: "depende do operador", acesso: "possível terra",
    trechos: [["Lençóis → Remanso", "20–25 km"], ["Remanso → Lençóis", "20–25 km"]],
    nota: "É o povoado do Remanso perto de Lençóis, não o município de Remanso-BA. Confirmar operador, embarque, preço e nível do rio.",
  },
  folga: { name: "Folga / reserva", short: "Folga", color: "var(--muted)" },
};

export function seedDays(start = "2027-01-12") {
  const base = [
    { tipo: "estrada", circ: "estrada", title: "Catolé do Rocha → Petrolina", km: 548, saida: "04:00",
      via: "Catolé do Rocha · Pombal · Cajazeiras · Salgueiro · Cabrobó · Petrolina", notes: "Corredor BR-407 como referência; validar traçado e postos. Chegar de dia." },
    { tipo: "estrada", circ: "chegada", title: "Petrolina → Lençóis + passeio leve", km: 487, saida: "04:00",
      via: "Petrolina/Juazeiro · Senhor do Bonfim · Capim Grosso · Mairi · Baixa Grande · Macajuba · Ruy Barbosa · BR-242 · Lençóis", notes: "Check-in, guardar as motos, centro histórico à noite." },
    { tipo: "passeio", circ: "c1", title: "Circuito 1 · Mosquito, Diabo, Pai Inácio", km: 125, saida: "07:00", via: "", notes: "" },
    { tipo: "passeio", circ: "c2", title: "Circuito 2 · Capão, Fumaça, Riachinho", km: 180, saida: "06:30", via: "", notes: "" },
    { tipo: "passeio", circ: "c3", title: "Circuito 3 · Marimbus e Roncador", km: 50, saida: "", via: "", notes: "" },
    { tipo: "estrada", circ: "estrada", title: "Lençóis → Petrolina", km: 487, saida: "", via: "Mesmo corredor da ida, sentido contrário", notes: "Horário e pernoite a definir." },
    { tipo: "estrada", circ: "estrada", title: "Petrolina → Catolé do Rocha", km: 548, saida: "", via: "Mesmo corredor da ida, sentido contrário", notes: "Chegada em casa." },
  ];
  return base.map((d, i) => ({ id: "d" + (i + 1), date: addDays(start, i), ...d }));
}

export function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export const TRIP_SEED = {
  name: "Expedição Chapada Diamantina 2027",
  startDate: "2027-01-12",
  feriasFim: "2027-01-21",
  gasPrice: 6.99,
  days: seedDays("2027-01-12"),
};

export const STATUS = {
  avaliar: { label: "Avaliar", short: "Avaliar" },
  tenho:   { label: "Tenho", short: "Tenho" },
  prov:    { label: "Providenciar", short: "Provid." },
  rev:     { label: "Revisar", short: "Revisar" },
  nao:     { label: "Não preciso", short: "Não" },
};

// [id, nome, status do Jacó, nota]
export const CHECKLIST = [
  ["Moto e manutenção", [
    ["m1", "Óleo do motor e filtros", "tenho"], ["m2", "Kit relação", "tenho"], ["m3", "Arrefecimento e ventoinha", "tenho"],
    ["m4", "Bateria e sistema de carga", "tenho"], ["m5", "Faróis, setas, lanterna e buzina", "tenho"],
    ["m6", "Documentação e licenciamento", "tenho"], ["m7", "Chave reserva", "tenho"],
    ["m8", "Pneus em bom estado e calibrados", "prov", "Viagem soma ~2.400 km"], ["m9", "Pastilhas, discos e fluido de freio", "prov"],
    ["m10", "Suspensão, retentores e caixa de direção", "rev"]]],
  ["Equipamentos de proteção", [
    ["e1", "Capacete", "tenho"], ["e2", "Jaqueta com proteções", "tenho"], ["e3", "Calça com proteções", "tenho"], ["e4", "Luvas", "tenho"],
    ["e5", "Botas", "tenho"], ["e6", "Capa de chuva", "tenho"], ["e7", "Proteção impermeável para botas e luvas", "tenho"],
    ["e8", "Colete ou refletivos adicionais", "nao"]]],
  ["Bagagem", [
    ["b1", "Baú ou alforjes", "tenho"], ["b2", "Bolsas impermeáveis / sacos estanques", "tenho"], ["b3", "Mochila pequena para passeios", "prov"],
    ["b4", "Organizadores de roupas", "prov"], ["b5", "Cadeado ou trava da moto", "prov"], ["b6", "Saco para roupa suja ou molhada", "prov"],
    ["b7", "Cintas extras de fixação", "nao"]]],
  ["Ferramentas e imprevistos", [
    ["f1", "Kit básico de ferramentas da moto", "tenho"], ["f2", "Kit reparo de pneu", "tenho"], ["f3", "Mini compressor ou bomba", "tenho"],
    ["f4", "Lanterna", "tenho"], ["f5", "Power bank", "tenho"], ["f6", "Cabos e carregadores", "tenho"], ["f7", "Kit de primeiros socorros", "tenho"],
    ["f8", "Fusíveis e pequenas peças de reposição", "prov"], ["f9", "Contatos de assistência e seguro", "prov"]]],
  ["Navegação e estrada", [
    ["n1", "Suporte de celular", "tenho"], ["n2", "Documentos pessoais e CNH", "tenho"], ["n3", "Reserva para combustível, comida e imprevistos", "tenho"],
    ["n4", "Carregador USB ou tomada na moto", "prov"], ["n5", "Mapas offline da ida e volta", "prov"], ["n6", "Mapas offline dos passeios", "prov"],
    ["n7", "Dinheiro em espécie", "prov"], ["n8", "Cartão bancário reserva", "nao"]]],
  ["Hospedagem e roupas", [
    ["h1", "Estacionamento seguro para as motos", "tenho", "Reconfirmar ao reservar a pousada"], ["h2", "Roupas leves", "tenho"],
    ["h3", "Roupas íntimas e meias", "tenho"], ["h4", "Roupa para dormir", "tenho"], ["h5", "Chinelo ou sandália", "tenho"],
    ["h6", "Toalha de secagem rápida", "tenho"], ["h7", "Itens de higiene", "tenho"], ["h8", "Medicamentos de uso pessoal", "tenho"],
    ["h9", "Reserva da pousada em Lençóis", "prov"], ["h10", "Hospedagem em Petrolina", "prov"]]],
  ["Trilhas e cachoeiras", [
    ["t1", "Roupa de banho", "tenho"], ["t2", "Garrafa ou bolsa de hidratação", "tenho"], ["t3", "Boné ou chapéu", "tenho"], ["t4", "Óculos de sol", "tenho"],
    ["t5", "Tênis ou bota de trilha com aderência", "prov"], ["t6", "Roupa para caminhada longa", "prov"], ["t7", "Protetor solar", "prov"],
    ["t8", "Lanches para trilha", "prov"], ["t9", "Bolsa impermeável para celular e documentos", "prov"], ["t10", "Reservas de passeios e guias", "prov"],
    ["t11", "Repelente", "nao", "Vale reconsiderar em janeiro"], ["t12", "Capa de chuva leve para caminhada", "nao", "Vale reconsiderar em janeiro"]]],
  ["Fotos e comunicação", [
    ["c1", "Celular com espaço livre", "tenho"], ["c2", "Intercomunicador", "tenho"], ["c3", "Câmera de ação ou 360°", "prov"],
    ["c4", "Suporte seguro na moto", "prov"], ["c5", "Cartão de memória", "prov"], ["c6", "Baterias e carregadores da câmera", "prov"],
    ["c7", "Compartilhar roteiro e contatos com alguém de confiança", "prov"]]],
];

export function baseStatus(riderId, itemId) {
  if (riderId !== "jaco") return "avaliar";
  for (const [, items] of CHECKLIST) for (const it of items) if (it[0] === itemId) return it[2];
  return "avaliar";
}

export const PEND = [
  ["p1", "Segurança", "Pneus da BMW", "Com ~2.400 km pela frente, viajar com pneus novos (110/80-19 e 140/80 R17)."],
  ["p2", "Segurança", "Freios: pastilhas, discos e fluido DOT 4", "Avaliar também o disco traseiro."],
  ["p3", "Segurança", "Suspensão, retentores e caixa de direção", ""],
  ["p4", "Segurança", "Revisão geral da BMW antes de sair", ""],
  ["p5", "Segurança", "Revisão da Titan e consumo médio", "Kaique lança o consumo no perfil dele."],
  ["p6", "Logística", "Reservar a pousada em Lençóis (13→17/01, 4 noites)", "Reconfirmar o estacionamento."],
  ["p7", "Logística", "Hotel em Petrolina na ida (12/01) e na volta (17/01)", ""],
  ["p8", "Logística", "Validar traçado e postos de ida e volta", "Base para o roadbook 10 × 15 cm."],
  ["p9", "Logística", "Confirmar se o Augusto vai", ""],
  ["p10", "Logística", "Baixar mapas offline da rota e dos passeios", ""],
  ["p11", "Passeios", "Guia para a Fumaça e operador do Marimbus", "Ponto de partida: Alma Turismo, guias Rian e Ivan."],
  ["p12", "Passeios", "Preços de entradas, guias e canoa", ""],
  ["p13", "Trilhas", "Calçado de trilha, mochila, roupa de caminhada, protetor, bolsa estanque", ""],
  ["p14", "Complementar", "Câmera 360°, suporte, cartão e baterias", "Insta360 X3 era a favorita."],
  ["p15", "Complementar", "Trava da moto, organizadores e itens menores", ""],
];

export const LODGING_SEED = [
  { id: "raizes", etapa: "lencois", name: "Pousada Raízes de Lençóis", status: "opcao",
    price: 587, priceNote: "cotação antiga: 15→18/01, 3 noites, 2 adultos, café incluso",
    address: "Rua Perilo Benjamin / Rua do Cajueiro, Centro",
    link: "https://www.booking.com/hotel/br/pousada-raizes-de-lencois-lencois.pt-br.html?checkin=2027-01-13&checkout=2027-01-17&group_adults=2&no_rooms=1",
    parking: "a confirmar", notes: "Cancelamento grátis até 10/01 na cotação. Refazer a cotação para 13→17/01." },
];

export const ETAPAS = {
  petrolina_ida:   { name: "Petrolina · ida", dayIndex: 0 },
  lencois:         { name: "Lençóis · base", dayIndex: 1 },
  petrolina_volta: { name: "Petrolina · volta", dayIndex: 5 },
};

export const CATEGORIES = {
  combustivel: "Combustível", hospedagem: "Hospedagem", alimentacao: "Alimentação", pedagio: "Pedágio",
  passeio: "Passeios e guias", equipamento: "Equipamento", manutencao: "Manutenção", outros: "Outros",
};
