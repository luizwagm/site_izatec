"use strict";
/* ==========================================================================
   FEED — o conteúdo editorial da Izatec

   ---------------------------------------------------------------------------
   POR QUE "FEED" E NÃO "BLOG"

   Foi pedido assim, e o nome combina com o público: quem trabalha no polo lê
   feed o dia inteiro no celular. "Blog" soa a texto longo de quem tem tempo.

   O QUE ELE FAZ PELO NEGÓCIO, e que a vitrine não faz:

   A página de produto responde a quem JÁ sabe que quer jeans. O Feed alcança
   quem ainda está perguntando "que tecido eu uso numa calça que não amassa?".
   Essa busca acontece meses antes da compra e o concorrente não a disputa —
   catálogo puro não tem texto para responder pergunta nenhuma.

   Por isso cada matéria termina apontando para uma família do catálogo: o
   texto atrai, o link converte. Um Feed que não leva ao produto é despesa.
   ========================================================================== */
const { Q, txt } = require("./db");
const { pagina, esc, zap, SITE } = require("./layout");
const { cartaoArtigo } = require("./paginas");
const Img = require("./imagens");

const DIA = (d) => {
  const [a, m, x] = String(d || "").split("-");
  if (!x) return "";
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun",
                 "jul", "ago", "set", "out", "nov", "dez"];
  return `${x} de ${meses[Number(m) - 1] || ""} de ${a}`;
};

/* ==========================================================================
   O CORPO DA MATÉRIA É TEXTO SIMPLES, e vira HTML aqui

   Linha em branco separa parágrafo; "## " abre subtítulo; "- " abre lista.
   Ênfase com **negrito** e *itálico*.

   POR QUE NÃO GUARDAR HTML DIRETO: editor rico no painel produz HTML colado do
   Word, com <span style> em toda parte. Um dia isso chega à página e quebra o
   layout — e, pior, abre caminho para script vindo do campo de texto.

   A ORDEM AQUI IMPORTA: escapa PRIMEIRO, aplica a ênfase DEPOIS. Assim um
   "<script>" escrito no painel vira texto visível, e as únicas etiquetas que
   saem daqui são as que este código escreveu.

   (A primeira versão do Feed esquecia a ênfase, e as matérias semeadas — que
   estavam em HTML — apareciam com as etiquetas na tela. O conteúdo foi
   convertido para este formato junto com a correção.)
   ========================================================================== */
function enfase(textoJaEscapado) {
  return textoJaEscapado
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
}

function corpoEmHtml(bruto) {
  return String(bruto || "").split(/\n{2,}/).map((bloco) => {
    const t = bloco.trim();
    if (!t) return "";
    if (t.startsWith("## ")) return `<h2>${enfase(esc(t.slice(3)))}</h2>`;
    if (t.startsWith("- ")) {
      const itens = t.split("\n").filter((l) => l.trim().startsWith("- "));
      return `<ul>${itens.map((l) => `<li>${enfase(esc(l.trim().slice(2)))}</li>`).join("")}</ul>`;
    }
    return `<p>${enfase(esc(t))}</p>`;
  }).join("\n");
}

/* ========================================================================== */
function indice() {
  const materias = Q.todos(
    "SELECT * FROM feed WHERE publicado = 1 ORDER BY data DESC, id DESC");

  const corpo = `
<nav class="migalha env" aria-label="Você está aqui">
  <a href="/">Início</a> <span>›</span> <b>Feed</b>
</nav>

<section class="secao secao--curta">
  <div class="env">
    <div class="cab">
      <span class="cab__sobre">Feed</span>
      <h1>Tecido explicado por quem vende tecido</h1>
      <p class="cab__texto">O que a gente aprende no balcão, escrito para quem
        corta e costura. Sem enrolação e sem termo que só o fornecedor entende.</p>
    </div>

    ${materias.length ? `
    <div class="grade grade--3 feed-grade">
      ${materias.map((m, i) => `
      <article class="post revelar" style="--atraso:${i * 80}ms">
        <a class="post__link" href="/feed/${esc(m.slug)}/">
          <div class="post__capa">
            ${Img.img(`feed:${m.slug}`, { doBanco: m.capa, alt: m.titulo,
              forma: "larga", classe: "post__img" })}
          </div>
          <div class="post__corpo">
            ${m.etiqueta ? `<span class="post__tag">${esc(m.etiqueta)}</span>` : ""}
            <h2 class="post__tit">${esc(m.titulo)}</h2>
            <p class="post__res">${esc(m.resumo)}</p>
            <time class="post__data" datetime="${esc(m.data)}">${esc(DIA(m.data))}</time>
          </div>
        </a>
      </article>`).join("")}
    </div>` : `
    <div class="vazio"><h3>Ainda não há matérias publicadas</h3>
      <p>Volte em breve.</p></div>`}
  </div>
</section>`;

  return pagina({
    titulo: "Feed", atual: "feed", canonical: "/feed/", corpo,
    descricao: "Guias práticos sobre tecidos para confecção: gramatura, encolhimento, elastano e escolha de artigo por peça.",
  });
}

/* ========================================================================== */
function materia(slug) {
  const m = Q.um("SELECT * FROM feed WHERE slug = ? AND publicado = 1", slug);
  if (!m) return null;

  const outras = Q.todos(
    "SELECT slug, titulo, resumo, data FROM feed WHERE publicado = 1 AND id <> ? ORDER BY data DESC LIMIT 2",
    m.id);

  /* Quatro artigos em destaque no pé da matéria. É a ponte texto → produto:
     quem terminou de ler sobre gramatura está exatamente no momento de olhar
     tecido, e obrigá-lo a voltar ao menu perde a visita. */
  const sugestoes = Q.todos(`
    SELECT a.*, f.slug familia_slug, f.nome familia_nome, f.cor familia_cor
      FROM artigos a JOIN familias f ON f.id = a.familia_id
     WHERE a.ativo = 1 ORDER BY a.destaque DESC, a.id LIMIT 4`);

  const corpo = `
<nav class="migalha env" aria-label="Você está aqui">
  <a href="/">Início</a> <span>›</span>
  <a href="/feed/">Feed</a> <span>›</span> <b>${esc(m.titulo)}</b>
</nav>

<!-- A BARRA DE LEITURA no topo. Matéria técnica é longa, e saber quanto falta
     é o que segura quem está lendo no celular entre um corte e outro. -->
<div class="progresso" id="progresso" aria-hidden="true"><span></span></div>

<article class="secao secao--curta">
  <div class="env materia">
    <header class="materia__cab">
      ${m.etiqueta ? `<span class="post__tag">${esc(m.etiqueta)}</span>` : ""}
      <h1>${esc(m.titulo)}</h1>
      <p class="materia__res">${esc(m.resumo)}</p>
      <time class="post__data" datetime="${esc(m.data)}">${esc(DIA(m.data))}</time>
    </header>

    <!-- A capa vem DEPOIS do título, não antes. Quem chegou pela busca precisa
         confirmar em um segundo que caiu na matéria certa — e é o título que
         responde isso, não a foto. -->
    <figure class="materia__capa">
      ${Img.img(`feed:${m.slug}`, { doBanco: m.capa, alt: m.titulo,
        forma: "larga", classe: "materia__img", prioridade: true })}
    </figure>

    <div class="materia__corpo">${corpoEmHtml(m.corpo)}</div>

    <aside class="materia__cta">
      <h2>Precisa desse tecido agora?</h2>
      <p>Fale com a loja pelo WhatsApp ou peça uma amostra — a gente separa e
        você avalia antes de fechar.</p>
      <div class="materia__cta-acoes">
        <a class="btn btn--acao" target="_blank" rel="noopener"
           href="${zap("Ola! Li uma materia no site e queria falar sobre tecido.")}">Falar no WhatsApp</a>
        <a class="btn btn--linha" href="/catalogo/">Ver o catálogo</a>
      </div>
    </aside>

    ${outras.length ? `
    <nav class="materia__mais" aria-label="Outras matérias">
      <h2>Leia também</h2>
      <ul>${outras.map((o) =>
        `<li><a href="/feed/${esc(o.slug)}/"><strong>${esc(o.titulo)}</strong>
          <span>${esc(o.resumo)}</span></a></li>`).join("")}</ul>
    </nav>` : ""}
  </div>
</article>

<section class="secao secao--papel">
  <div class="env">
    <div class="cab"><span class="cab__sobre">Do catálogo</span>
      <h2>Tecidos para começar</h2></div>
    <div class="grade grade--4">${sugestoes.map(cartaoArtigo).join("")}</div>
  </div>
</section>`;

  const jsonld = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: m.titulo,
    description: m.resumo,
    datePublished: m.data,
    author: { "@type": "Organization", name: txt("marca.nome", "Izatec Tecidos") },
    publisher: { "@type": "Organization", name: txt("marca.nome", "Izatec Tecidos") },
    mainEntityOfPage: `${SITE}/feed/${m.slug}/`,
  };

  return pagina({
    titulo: m.titulo, descricao: m.resumo, atual: "feed",
    canonical: `/feed/${m.slug}/`, corpo, jsonld,
  });
}

module.exports = { indice, materia, corpoEmHtml };
