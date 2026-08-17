"use strict";
/* ==========================================================================
   SEMEAR — o conteúdo inicial do site

   Roda quantas vezes for preciso: nada é duplicado, porque cada inserção
   confere antes se a chave já existe. É o que permite acrescentar um artigo
   novo aqui e rodar de novo sem apagar o que a loja já cadastrou.

   O CONTEÚDO NÃO É DE ENCHIMENTO. Gramatura, largura e encolhimento abaixo
   são as faixas reais praticadas no polo de Caruaru e Toritama — um jeans de
   calça vive entre 300 e 400 g/m², e um site que mostrasse "150 g/m²" seria
   desmascarado pelo primeiro confeccionista que abrisse a página.

   Os PREÇOS são placeholder e estão marcados como tal no painel: preço é a
   informação que muda toda semana, e chutar um valor que o cliente esquece de
   corrigir é pior do que deixar em branco.
   ========================================================================== */
const { Q, ajuste } = require("../src/db");

/* ------------------------------------------------------------------ textos */
const TEXTOS = [
  ["marca.nome", "Izatec Tecidos", "geral", "Nome da empresa", "texto", 1],
  ["marca.slogan", "Tecido certo, produção sem retrabalho", "geral", "Slogan", "texto", 2],
  ["marca.cnpj", "00.000.000/0001-00", "geral", "CNPJ (rodapé)", "texto", 3],
  ["marca.whatsapp", "5581999999999", "geral", "WhatsApp (só números, com 55)", "texto", 4],
  ["marca.email", "contato@izatectecidos.com.br", "geral", "E-mail", "texto", 5],
  ["marca.instagram", "izatectecidos", "geral", "Instagram (sem @)", "texto", 6],

  /* ------------------------------------------------------------- medição
     Em branco de propósito: sem ID, o site não carrega Google nem Meta e não
     mostra aviso de cookie nenhum. É o estado mais limpo possível — e o
     cliente liga a medição no dia em que tiver as contas criadas. */
  ["medicao.ga4", "", "medicao", "Google Analytics 4 — ID de medição (G-XXXXXXX)", "texto", 1],
  ["medicao.pixel", "", "medicao", "Meta Pixel — ID (só números)", "texto", 2],
  ["medicao.email_pedido", "", "medicao", "E-mail que recebe aviso de pedido novo", "texto", 3],

  ["loja1.nome", "Caruaru", "lojas", "Loja 1 — cidade", "texto", 1],
  ["loja1.endereco", "Rua do Comércio, 000 — Centro, Caruaru/PE", "lojas", "Loja 1 — endereço", "texto", 2],
  ["loja1.horario", "Seg a sex, 8h às 17h30 · Sáb, 8h às 12h", "lojas", "Loja 1 — horário", "texto", 3],
  ["loja2.nome", "Toritama", "lojas", "Loja 2 — cidade", "texto", 4],
  ["loja2.endereco", "Av. Principal, 000 — Centro, Toritama/PE", "lojas", "Loja 2 — endereço", "texto", 5],
  ["loja2.horario", "Seg a sex, 8h às 17h30 · Sáb, 8h às 12h", "lojas", "Loja 2 — horário", "texto", 6],

  ["home.titulo", "O jeans que a sua produção precisa, com a ficha técnica na frente",
    "home", "Título da capa", "texto", 1],
  ["home.chamada",
    "Tecidos para confecção em Caruaru e Toritama. Composição, gramatura, largura útil e encolhimento em cada artigo — para você comprar sabendo como a peça vai sair da lavanderia.",
    "home", "Texto da capa", "area", 2],
  ["home.prova1.num", "18", "home", "Prova 1 — número", "texto", 3],
  ["home.prova1.txt", "anos abastecendo o polo de confecções", "home", "Prova 1 — texto", "texto", 4],
  ["home.prova2.num", "2", "home", "Prova 2 — número", "texto", 5],
  ["home.prova2.txt", "lojas físicas: Caruaru e Toritama", "home", "Prova 2 — texto", "texto", 6],
  ["home.prova3.num", "24h", "home", "Prova 3 — número", "texto", 7],
  ["home.prova3.txt", "para separar e despachar o pedido", "home", "Prova 3 — texto", "texto", 8],

  ["sobre.titulo", "Uma loja de tecidos que fala a língua de quem produz", "sobre", "Título", "texto", 1],
  ["sobre.texto",
    "A Izatec nasceu no meio do polo de confecções do Agreste, atendendo quem corta e costura todo dia. Isso muda o que a gente considera importante: não basta ter o tecido bonito na prateleira — ele precisa ter a ficha técnica certa, o encolhimento conhecido e a mesma cor no lote seguinte.",
    "sobre", "Texto de abertura", "area", 2],
];
for (const [chave, valor, grupo, rotulo, tipo, ordem] of TEXTOS) {
  const existe = Q.um("SELECT chave FROM config WHERE chave = ?", chave);
  if (!existe) ajuste(chave, valor, { grupo, rotulo, tipo, ordem });
}

/* ---------------------------------------------------------------- famílias */
const FAMILIAS = [
  ["jeans", "Jeans e Índigo", "O carro-chefe. Do leve para camisaria ao pesado de calça, com e sem elastano.", "jeans", 1],
  ["sarja", "Sarja e Brim", "Trama diagonal firme, para uniforme, bermuda e calça de trabalho.", "sarja", 2],
  ["malha", "Malha", "Meia malha, ribana e piquê para camiseta, polo e moda fitness.", "malha", 3],
  ["moletom", "Moletom", "Flanelado e não flanelado, para inverno e moda casual.", "moletom", 4],
  ["tricoline", "Tricoline", "Algodão fino de camisaria, liso e estampado.", "tricoline", 5],
  ["viscose", "Viscose e Fluidos", "Caimento solto para blusa, vestido e moda feminina.", "viscose", 6],
  ["alfaiataria", "Alfaiataria", "Estruturado para calça social, blazer e uniforme corporativo.", "alfaiataria", 7],
  ["aviamentos", "Aviamentos", "Linha, zíper, botão e etiqueta para fechar a produção.", "aviamentos", 8],
];
for (const [slug, nome, resumo, cor, ordem] of FAMILIAS) {
  if (!Q.um("SELECT id FROM familias WHERE slug = ?", slug)) {
    Q.roda(`INSERT INTO familias (slug, nome, resumo, cor, ordem) VALUES (?,?,?,?,?)`,
      slug, nome, resumo, cor, ordem);
  }
}
const fam = (slug) => Q.um("SELECT id FROM familias WHERE slug = ?", slug).id;

/* ----------------------------------------------------------------- artigos
   A ficha técnica é o conteúdo mais valioso desta lista. Cada campo abaixo é
   uma pergunta que o comprador faria por telefone. */
const ARTIGOS = [
  {
    slug: "jeans-3d-com-elastano", familia: "jeans",
    nome: "Jeans 3D com Elastano",
    chamada: "O mais pedido para calça feminina: modela sem marcar e volta ao lugar.",
    descricao: "Índigo de trama fechada com 2% de elastano, pensado para calça e bermuda feminina. O acabamento 3D dá o brilho de lavanderia sem precisar de processo pesado, o que reduce o custo por peça.",
    composicao: "98% Algodão · 2% Elastano", gramatura: 340, largura: 160,
    encolhimento: "Até 3% na largura, até 5% no comprimento",
    elastano: 1, indicacao: "Calça e bermuda feminina, saia jeans",
    minimo: 5, destaque: 1,
    cores: [["Índigo escuro","JE-01","#2A3A5C",0,860],["Índigo médio","JE-02","#43578A",0,540],["Preto","JE-03","#1D1D1F",0,320]],
    faixas: [[5,0,"corte no balcão"],[50,0,"atacado"],[100,0,"rolo fechado"]],
  },
  {
    slug: "jeans-pesado-rigido", familia: "jeans",
    nome: "Jeans Pesado Rígido",
    chamada: "Sem elastano, para quem precisa de estrutura e durabilidade.",
    descricao: "Índigo 100% algodão, trama firme e gramatura alta. É o tecido de calça masculina tradicional e de peças que passam por lavagem pesada sem perder o corpo.",
    composicao: "100% Algodão", gramatura: 400, largura: 165,
    encolhimento: "Até 4% na largura, até 7% no comprimento",
    elastano: 0, indicacao: "Calça masculina, jaqueta, peças com lavagem pesada",
    minimo: 5, destaque: 1,
    cores: [["Índigo cru","JP-01","#33456B",0,610],["Índigo stone","JP-02","#5A6E96",0,280]],
    faixas: [[5,0,"corte no balcão"],[50,0,"atacado"],[100,0,"rolo fechado"]],
  },
  {
    slug: "jeans-leve-camisaria", familia: "jeans",
    nome: "Jeans Leve para Camisaria",
    chamada: "Caimento macio para camisa, vestido e peça infantil.",
    descricao: "Índigo de baixa gramatura, com toque mais macio. Aceita bem lavagem clara e não pesa na peça pronta.",
    composicao: "100% Algodão", gramatura: 210, largura: 150,
    encolhimento: "Até 3% na largura, até 4% no comprimento",
    elastano: 0, indicacao: "Camisa, vestido, peça infantil",
    minimo: 5, destaque: 0,
    cores: [["Índigo claro","JL-01","#6B84AD",0,430],["Azul lavado","JL-02","#8FA4C4",0,190]],
    faixas: [[5,0,"corte no balcão"],[50,0,"atacado"]],
  },
  {
    slug: "sarja-com-elastano", familia: "sarja",
    nome: "Sarja com Elastano",
    chamada: "A base da bermuda e da calça colorida.",
    descricao: "Sarja de trama diagonal com elastano, firme e com boa recuperação. Aceita tingimento em cartela ampla.",
    composicao: "97% Algodão · 3% Elastano", gramatura: 280, largura: 160,
    encolhimento: "Até 3% em ambos os sentidos",
    elastano: 1, indicacao: "Bermuda, calça colorida, uniforme",
    minimo: 5, destaque: 1,
    cores: [["Bege","SA-01","#C8B48F",0,470],["Preto","SA-02","#232326",0,520],["Verde militar","SA-03","#5C6650",0,240]],
    faixas: [[5,0,"corte no balcão"],[50,0,"atacado"],[100,0,"rolo fechado"]],
  },
  {
    slug: "meia-malha-penteada", familia: "malha",
    nome: "Meia Malha Penteada 30.1",
    chamada: "Camiseta que não embola depois da terceira lavagem.",
    descricao: "Fio penteado 30.1, superfície lisa e uniforme. É a malha de camiseta de melhor acabamento para estampa.",
    composicao: "100% Algodão penteado", gramatura: 160, largura: 180,
    encolhimento: "Até 5% no comprimento",
    elastano: 0, indicacao: "Camiseta, baby look, peça promocional",
    unidade: "kg", minimo: 5, destaque: 1,
    cores: [["Branco","MM-01","#FAFAFA",0,180],["Preto","MM-02","#1B1B1D",0,210],["Mescla","MM-03","#A8A8A6",0,95]],
    faixas: [[5,0,"corte no balcão"],[25,0,"atacado"],[50,0,"fardo fechado"]],
  },
  {
    slug: "moletom-flanelado", familia: "moletom",
    nome: "Moletom Flanelado",
    chamada: "Felpa por dentro, para inverno e moletom canguru.",
    descricao: "Moletom com o avesso flanelado, que segura o calor sem engrossar a peça. Boa estabilidade dimensional para peças com capuz e bolso.",
    composicao: "80% Algodão · 20% Poliéster", gramatura: 300, largura: 180,
    encolhimento: "Até 5% no comprimento",
    elastano: 0, indicacao: "Moletom, blusa de frio, conjunto",
    unidade: "kg", minimo: 5, destaque: 0,
    cores: [["Cinza mescla","MO-01","#9B9B99",0,140],["Preto","MO-02","#1F1F21",0,160]],
    faixas: [[5,0,"corte no balcão"],[25,0,"atacado"]],
  },
  {
    slug: "tricoline-lisa", familia: "tricoline",
    nome: "Tricoline Lisa",
    chamada: "Camisaria de acabamento fino, com corpo e sem transparência.",
    descricao: "Algodão de fio fino e trama fechada. Passa fácil e mantém o caimento da camisa social.",
    composicao: "100% Algodão", gramatura: 120, largura: 150,
    encolhimento: "Até 3% no comprimento",
    elastano: 0, indicacao: "Camisa social, vestido, peça infantil",
    minimo: 5, destaque: 0,
    cores: [["Branco","TR-01","#FBFBF9",0,320],["Azul claro","TR-02","#A9C3DE",0,180]],
    faixas: [[5,0,"corte no balcão"],[50,0,"atacado"]],
  },
  {
    slug: "viscose-lisa", familia: "viscose",
    nome: "Viscose Lisa",
    chamada: "Caimento fluido para blusa e vestido.",
    descricao: "Viscose de toque macio e queda solta. Absorve bem a cor e é o tecido de blusa feminina de verão.",
    composicao: "100% Viscose", gramatura: 110, largura: 145,
    encolhimento: "Até 5% em ambos os sentidos",
    elastano: 0, indicacao: "Blusa, vestido, camisa solta",
    minimo: 5, destaque: 0,
    cores: [["Off white","VI-01","#F2EDE4",0,260],["Terracota","VI-02","#B9663F",0,140]],
    faixas: [[5,0,"corte no balcão"],[50,0,"atacado"]],
  },
];

for (const a of ARTIGOS) {
  if (Q.um("SELECT id FROM artigos WHERE slug = ?", a.slug)) continue;
  const r = Q.roda(
    `INSERT INTO artigos (slug, familia_id, nome, chamada, descricao, composicao,
                          gramatura, largura, encolhimento, elastano, indicacao,
                          unidade, minimo, destaque)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    a.slug, fam(a.familia), a.nome, a.chamada, a.descricao, a.composicao,
    a.gramatura, a.largura, a.encolhimento, a.elastano, a.indicacao,
    a.unidade || "m", a.minimo, a.destaque);
  const id = r.lastInsertRowid;

  a.cores.forEach(([nome, codigo, hex, preco, estoque], i) => {
    Q.roda(`INSERT INTO cores (artigo_id, nome, codigo, hex, preco, estoque, ordem)
            VALUES (?,?,?,?,?,?,?)`, id, nome, codigo, hex, preco, estoque, i);
  });
  for (const [de, preco, rotulo] of a.faixas) {
    Q.roda("INSERT INTO faixas (artigo_id, de, preco, rotulo) VALUES (?,?,?,?)",
      id, de, preco, rotulo);
  }
}

/* ------------------------------------------------------------------- feed
   As três primeiras matérias. Cada uma responde a uma pergunta que chega no
   balcão todo dia — é o que faz o Feed ser lido pelo cliente e encontrado
   pelo Google, em vez de virar mural de "estamos com novidades". */
const MATERIAS = [
  {
    slug: "como-ler-a-ficha-tecnica-de-um-jeans",
    titulo: "Como ler a ficha técnica de um jeans antes de fechar o pedido",
    etiqueta: "Guia técnico",
    resumo: "Gramatura, elastano, largura útil e encolhimento. Os quatro números que decidem se a sua peça vai sair como você desenhou.",
    corpo: `Todo mundo que compra tecido já passou por isso: o jeans parecia perfeito na prateleira, a peça piloto ficou boa, e a produção inteira saiu diferente. Quase sempre o problema estava na ficha técnica — e estava escrito lá.

## Gramatura: o peso do metro quadrado

É o número em **g/m²**, e ele decide o corpo da peça. Uma calça feminina moderna fica bem entre 300 e 360 g/m². Abaixo de 280, o tecido não sustenta o modelo e a peça amassa na vitrine. Acima de 400, você tem um jeans de calça masculina tradicional — durável, mas pesado para quem quer caimento.

Gramatura também é custo: o metro mais pesado rende menos peças por quilo de tecido e encarece o frete. Vale comparar sempre *gramatura contra preço*, nunca só o preço.

## Elastano: quanto a peça devolve

De 1% a 3% de elastano é o que dá conforto sem perder a forma. O ponto de atenção não é a porcentagem, é a **recuperação**: um tecido com elastano barato estica e não volta, e a peça vira joelheira depois de um dia de uso. Peça sempre uma amostra e teste puxando no sentido da largura.

## Largura útil: o que muda o seu consumo

A largura é o que decide quantas peças saem de cada metro. Entre um tecido de 150 cm e um de 165 cm há 10% de diferença de rendimento — e 10% de rendimento em mil peças é dinheiro que aparece no fim do mês.

Cuidado com "largura total" e "largura útil": a ourela não entra no encaixe. O que vale é a útil, e é ela que informamos em cada artigo.

## Encolhimento: o número que mais dói ser ignorado

Todo tecido de algodão encolhe. A pergunta é *quanto*, e em qual sentido. Um jeans que encolhe 5% no comprimento vira uma calça 3 cm mais curta depois da lavanderia. Se o seu molde não tiver essa margem, a produção inteira sai fora da grade.

Por isso publicamos o encolhimento em cada artigo, separado por sentido. E por isso insistimos: **lave a peça piloto antes de cortar a produção**. É uma hora de trabalho que evita um prejuízo de semanas.

## O resumo prático

Antes de fechar, tenha na mão os quatro números: gramatura, composição com elastano, largura útil e encolhimento. Se o fornecedor não souber dizer, o risco não é dele — é seu, na hora que a peça sair da lavanderia.`,
  },
  {
    slug: "quanto-tecido-rende-uma-calca",
    titulo: "Quanto tecido rende uma calça? A conta que evita sobra e falta",
    etiqueta: "Produção",
    resumo: "Como estimar consumo por largura e por grade antes de comprar o rolo — e por que a resposta muda com 15 cm de largura.",
    corpo: `"Quantos metros eu preciso?" é a pergunta que mais ouvimos no balcão. A resposta honesta é: depende da largura do tecido, da grade e do encaixe. Mas dá para chegar perto sozinho, e vale muito a pena.

## O ponto de partida

Para uma calça adulta em tecido de **160 cm** de largura útil, o consumo médio fica entre **1,20 m e 1,40 m por peça**, dependendo do tamanho e do modelo. Bermuda fica entre 0,70 m e 0,90 m. Saia varia demais com o modelo para ter média útil.

## Por que a largura muda tudo

Num tecido de 150 cm, muitas vezes só cabe uma perna por vez no encaixe. A 165 cm, cabem duas — e o consumo por peça cai de forma desproporcional à diferença de largura. É por isso que um tecido mais largo e um pouco mais caro pode sair mais barato por peça.

A conta que interessa não é o preço do metro. É o **preço por peça pronta**: (preço do metro × consumo por peça).

## A grade importa mais do que parece

Uma grade concentrada nos tamanhos maiores consome mais que a média. Se a sua venda é P/M, o consumo cai; se é G/GG/XG, sobe. Vale calcular com a grade real da sua produção, e não com a média do mercado.

## A margem que ninguém deve cortar

Some sempre de **3% a 5%** ao total para defeito de tecido, ponta de rolo e erro de enfesto. Comprar exato é a receita para faltar meio metro no último enfesto — e o rolo seguinte pode ser de outro lote, com outra tonalidade.

## Sobre o lote

Se a produção for grande, compre tudo de uma vez, do mesmo lote. Diferença de tonalidade entre lotes é comum e não é defeito: é característica do processo de tingimento. O que não pode é a mesma peça ter frente de um lote e costas de outro.`,
  },
  {
    slug: "diferenca-entre-sarja-e-jeans",
    titulo: "Sarja ou jeans? A diferença que decide o seu produto",
    etiqueta: "Guia técnico",
    resumo: "Os dois são de trama diagonal e firmes. O que muda é o tingimento — e é isso que define lavagem, cor e para que serve cada um.",
    corpo: `É a dúvida mais comum de quem está montando uma coleção nova. Sarja e jeans parecem primos, e são — mas a diferença entre eles decide o que você consegue fazer com a peça depois de pronta.

## A trama é a mesma ideia

Ambos são tecidos de **trama diagonal** (aquela linha inclinada que você vê de perto). É essa construção que dá firmeza e resistência, e é por isso que os dois servem para calça e bermuda.

## O tingimento é o que separa

No **jeans**, só o fio do urdume é tingido de índigo; a trama fica crua. É por isso que o avesso do jeans é mais claro que o direito — e é por isso que ele *desbota com graça*: a lavagem tira o índigo da superfície e revela o fio branco embaixo. Todo o universo de lavanderia (stone, used, destroyed) existe por causa disso.

Na **sarja**, o tecido é tingido pronto, por inteiro. A cor é uniforme dos dois lados e não desbota em desenho — clareia por igual. Em compensação, a sarja aceita uma cartela de cores que o jeans não alcança: bege, verde militar, vermelho, o que a coleção pedir.

## Como escolher

A pergunta prática é: **a peça vai passar por lavanderia com efeito?**

- **Sim** — é jeans. Só ele responde à lavagem com o desenho que o mercado espera.
- **Não, e eu quero cor** — é sarja. Mais barata na maioria das cores, e o resultado é uniforme.

## Um detalhe de custo

Para uma bermuda colorida de verão, a sarja costuma entregar o mesmo caimento por um preço menor, porque dispensa o processo de lavanderia. Já para a calça que precisa daquele aspecto usado, não há substituto: o efeito não se pinta, ele se lava.

Na dúvida, peça amostra dos dois e faça a peça piloto. Meia hora de teste evita uma coleção inteira com o tecido errado.`,
  },
];

for (const m of MATERIAS) {
  if (Q.um("SELECT id FROM feed WHERE slug = ?", m.slug)) continue;
  Q.roda(`INSERT INTO feed (slug, titulo, resumo, corpo, etiqueta, publicado, data)
          VALUES (?,?,?,?,?,1,date('now'))`,
    m.slug, m.titulo, m.resumo, m.corpo, m.etiqueta);
}

/* ==========================================================================
   AS FOTOS DO ACERVO

   Preenche `familias.foto`, `artigos.foto` e `feed.capa` — mas SÓ quando estão
   em branco. Foto que a loja trocou pelo painel nunca é sobrescrita por uma
   rodada do semeador, e é isso que permite semear de novo a cada deploy sem
   desfazer o trabalho de quem cadastra.
   ========================================================================== */
const { PADRAO, B } = require("../src/imagens");
let fotos = 0;

const porChave = (prefixo, slug) => {
  const p = PADRAO[`${prefixo}:${slug}`];
  return p ? B + p.arq : "";
};

for (const f of Q.todos("SELECT id, slug, foto FROM familias")) {
  if (f.foto) continue;
  const caminho = porChave("fam", f.slug);
  if (caminho) { Q.roda("UPDATE familias SET foto = ? WHERE id = ?", caminho, f.id); fotos++; }
}
for (const a of Q.todos("SELECT id, slug, foto FROM artigos")) {
  if (a.foto) continue;
  const caminho = porChave("art", a.slug);
  if (caminho) { Q.roda("UPDATE artigos SET foto = ? WHERE id = ?", caminho, a.id); fotos++; }
}
for (const m of Q.todos("SELECT id, slug, capa FROM feed")) {
  if (m.capa) continue;
  const caminho = porChave("feed", m.slug);
  if (caminho) { Q.roda("UPDATE feed SET capa = ? WHERE id = ?", caminho, m.id); fotos++; }
}

const conta = (t) => Q.um(`SELECT COUNT(*) c FROM ${t}`).c;
console.log(`
  Izatec — conteúdo semeado
  ─────────────────────────────
   textos    ${conta("config")}
   famílias  ${conta("familias")}
   artigos   ${conta("artigos")}
   cores     ${conta("cores")}
   faixas    ${conta("faixas")}
   Feed      ${conta("feed")}
   fotos     ${fotos} ligadas do acervo
`);
