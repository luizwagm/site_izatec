"use strict";
/* ==========================================================================
   IMAGENS

   ---------------------------------------------------------------------------
   POR QUE ISTO É UM MÓDULO, E NÃO UM CAMINHO ESCRITO EM CADA PÁGINA

   Três coisas precisam acontecer em TODA imagem do site, e esquecer uma delas
   em um lugar só já estraga o resultado:

   1. `width` e `height` no HTML. Sem eles o navegador não sabe quanto espaço
      reservar, e a página PULA quando a foto chega — o texto que a pessoa
      estava lendo salta para baixo. É a falha de layout mais irritante que
      existe, e o Google penaliza por ela (CLS).

   2. `loading="lazy"` em tudo que está abaixo da dobra, e NUNCA na capa. Capa
      com lazy chega depois, e a primeira coisa que o visitante vê é um buraco.

   3. Um caminho de reserva. Foto apagada do disco não pode virar ícone
      quebrado: aqui, quando não há foto, o bloco cai na cor real do tecido
      com a trama por cima — que é honesto e continua bonito.

   O caminho vem do BANCO (`familias.foto`, `artigos.foto`, `feed.capa`), com
   um padrão embutido. Assim a loja troca a foto pelo painel sem tocar em
   código, e o site já nasce com imagem.
   ========================================================================== */

/* As fotos do acervo, por uso. O número no fim do arquivo é o id no Pexels —
   ver assets/img/banco/CREDITOS.md. */
const B = "/assets/img/banco/";

const PADRAO = {
  /* -------------------------------------------------------------- capa */
  capa:        { arq: "capa-jeans-17329670.jpg",     alt: "Rolos de tecido empilhados na prateleira da loja" },
  capaCor:     { arq: "capa-tecidos-9824794.jpg",    alt: "Rolos de tecido de várias cores" },
  producao:    { arq: "sec-producao-17710109.jpg",   alt: "Fila de máquinas industriais de costura" },
  loja:        { arq: "sec-loja-12008104.jpg",       alt: "Rolos de tecido na prateleira da loja" },
  medida:      { arq: "sobre-medida-6636369.jpg",    alt: "Mãos medindo tecido com fita métrica" },

  /* --------------------------------------------------- as oito famílias */
  "fam:jeans":       { arq: "fam-jeans-4049757.jpg",       alt: "Textura de jeans" },
  "fam:sarja":       { arq: "fam-sarja-36346049.jpg",      alt: "Tecido bege de trama aparente" },
  "fam:malha":       { arq: "fam-malha-6275942.jpg",       alt: "Malha de algodão" },
  "fam:moletom":     { arq: "fam-moletom-5908251.jpg",     alt: "Algodão felpudo" },
  "fam:tricoline":   { arq: "fam-tricoline-34634858.jpg",  alt: "Tecidos claros na prateleira" },
  "fam:viscose":     { arq: "fam-viscose-20531147.jpg",    alt: "Tecidos estampados de caimento solto" },
  "fam:alfaiataria": { arq: "fam-alfaiataria-36106019.jpg", alt: "Tecido listrado preto e cinza" },
  "fam:aviamentos":  { arq: "fam-aviamentos-4618282.jpg",  alt: "Linhas, botões e alfinetes" },

  /* ------------------------------------------------------- os artigos */
  "art:jeans-3d-com-elastano":  { arq: "art-jeans-3d-10133274.jpg",     alt: "Jeans dobrado" },
  "art:jeans-pesado-rigido":    { arq: "art-jeans-pesado-173207.jpg",   alt: "Trama de jeans em close" },
  "art:jeans-leve-camisaria":   { arq: "art-jeans-leve-19203176.jpg",   alt: "Tecido de algodão azul claro" },
  "art:sarja-com-elastano":     { arq: "art-sarja-18372335.jpg",        alt: "Tecido azul de trama diagonal" },
  "art:meia-malha-penteada":    { arq: "art-malha-13368318.jpg",        alt: "Superfície de malha azul" },
  "art:moletom-flanelado":      { arq: "art-moletom-6757420.jpg",       alt: "Fibras felpudas bege" },
  "art:tricoline-lisa":         { arq: "art-tricoline-6461399.jpg",     alt: "Fita métrica sobre tecido" },
  "art:viscose-lisa":           { arq: "art-viscose-35150389.jpg",      alt: "Tecido com zíper e botão" },

  /* ---------------------------------------------------------- o Feed */
  "feed:como-ler-a-ficha-tecnica-de-um-jeans": { arq: "feed-ficha-10133280.jpg",      alt: "Costura de um jeans em close" },
  "feed:quanto-tecido-rende-uma-calca":        { arq: "feed-rendimento-4622403.jpg",  alt: "Costureira medindo tecido com fita métrica" },
  "feed:diferenca-entre-sarja-e-jeans":        { arq: "feed-sarja-jeans-10133275.jpg", alt: "Tecidos jeans empilhados" },
};

/* Proporções por uso. Fixas de propósito: o `aspect-ratio` do CSS e o
   width/height do HTML têm de contar a MESMA história, senão o espaço
   reservado não bate com a foto e o pulo volta. */
const FORMA = {
  capa:   [1600, 1000],
  larga:  [1400, 875],
  cartao: [800, 600],
  quadro: [700, 700],
};

function achar(chave) {
  return PADRAO[chave] || null;
}

/* `src(chave, doBanco)` — o que vier do banco manda; o padrão é a reserva.
   Devolve `null` quando não há nenhuma das duas, e é o `null` que aciona o
   caminho de reserva (cor + trama) em quem chamou. */
function src(chave, doBanco = "") {
  const guardado = String(doBanco || "").trim();
  if (guardado) return { url: guardado, alt: "" };
  const p = achar(chave);
  return p ? { url: B + p.arq, alt: p.alt } : null;
}

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/* ==========================================================================
   A ETIQUETA <img>

   `alt` sempre. Uma foto de tecido sem alt é uma foto que não existe para
   quem usa leitor de tela — e o catálogo inteiro vira uma lista de nomes sem
   contexto. Quando a foto é decorativa (fundo de bloco que já tem título
   escrito ao lado), o alt vai VAZIO com aria-hidden, que é o certo: descrever
   decoração só polui a leitura.
   ========================================================================== */
function img(chave, { doBanco = "", alt = "", forma = "cartao",
                      classe = "", prioridade = false, decorativa = false } = {}) {
  const f = src(chave, doBanco);
  if (!f) return "";
  const [w, h] = FORMA[forma] || FORMA.cartao;
  const texto = alt || f.alt || "";

  return `<img class="${classe}" src="${esc(f.url)}"
    width="${w}" height="${h}"
    ${decorativa ? 'alt="" aria-hidden="true"' : `alt="${esc(texto)}"`}
    ${prioridade
      /* A capa é o oposto do lazy: quanto antes chegar, melhor. `fetchpriority`
         diz ao navegador para buscá-la na frente do resto. */
      ? 'loading="eager" fetchpriority="high"'
      : 'loading="lazy" decoding="async"'}>`;
}

const temFoto = (chave, doBanco = "") => !!src(chave, doBanco);

module.exports = { img, src, temFoto, PADRAO, B };
