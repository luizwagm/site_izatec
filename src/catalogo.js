"use strict";
/* ==========================================================================
   CATÁLOGO

   ---------------------------------------------------------------------------
   OS FILTROS SÃO OS DO CONFECCIONISTA, NÃO OS DE UMA LOJA COMUM

   Loja de roupa filtra por tamanho, cor e preço. Aqui não serve: quem compra
   tecido filtra pelo que a PEÇA exige.

     · gramatura — decide o corpo. Calça pede 300+; blusa, abaixo de 200.
     · elastano  — a peça precisa ceder? É pergunta de sim ou não.
     · largura   — muda o consumo por peça, e portanto o custo.

   Por isso a gramatura e a largura são NÚMEROS no banco, e não texto: é o que
   permite "acima de 300 g/m²". Guardadas como "340g" viravam string, e o
   filtro morria no primeiro artigo escrito de outro jeito.

   O filtro roda no SERVIDOR e volta na URL. Assim o comprador manda o link
   pronto para o sócio pelo WhatsApp — "olha esses aqui" — e o Google indexa
   cada recorte como página própria.
   ========================================================================== */
const { Q, txt } = require("./db");
const { pagina, esc, zap, SITE } = require("./layout");
const { cartaoArtigo, sinalEstoque, dinheiro } = require("./paginas");
const Img = require("./imagens");

/* ==========================================================================
   O FORMULÁRIO DE AMOSTRA

   Repetido no fim de toda página de catálogo, porque é o passo que fecha
   venda em atacado têxtil: ninguém compra rolo sem sentir o tecido.

   Quatro campos e nada além. Cada campo a mais numa página de captação
   derruba a taxa de envio, e endereço completo a gente pega no WhatsApp
   depois — quando a pessoa já disse que quer.
   ========================================================================== */
function blocoAmostra(artigoSugerido = "") {
  return `
<section class="secao secao--escura trama" id="amostra">
  <div class="env amostra">
    <div class="amostra__texto">
      <span class="cab__sobre">Antes de fechar</span>
      <h2>Peça uma amostra</h2>
      <p>Manda o tecido que você quer avaliar. A gente separa a amostra e combina
        a retirada na loja ou o envio — e, se o que você procura estiver em falta,
        indicamos o mais próximo do que a sua peça precisa.</p>
      <p class="amostra__nota">Retirada imediata em Caruaru e Toritama.</p>
    </div>

    <form class="amostra__form" method="post" action="/amostra">
      <div class="campo">
        <label for="am-nome">Seu nome</label>
        <input id="am-nome" name="nome" required autocomplete="name" maxlength="120">
      </div>
      <div class="campo">
        <label for="am-empresa">Confecção <span>(opcional)</span></label>
        <input id="am-empresa" name="empresa" autocomplete="organization" maxlength="120">
      </div>
      <div class="campo">
        <label for="am-tel">WhatsApp</label>
        <input id="am-tel" name="telefone" required inputmode="tel"
               autocomplete="tel" maxlength="20" placeholder="(81) 90000-0000">
      </div>
      <div class="campo">
        <label for="am-art">Que tecidos quer ver?</label>
        <textarea id="am-art" name="artigos" rows="3" maxlength="600"
          placeholder="Ex.: jeans 3D com elastano, sarja bege">${esc(artigoSugerido)}</textarea>
      </div>
      <button class="btn btn--acao btn--largo" type="submit">Pedir amostra</button>
      <p class="amostra__lgpd">Usamos os seus dados só para responder este pedido.
        Não enviamos propaganda e não repassamos a ninguém.</p>
    </form>
  </div>
</section>`;
}

/* ==========================================================================
   LISTA — todo o catálogo ou uma família
   ========================================================================== */
function lista(familiaSlug = "", filtros = {}) {
  const familias = Q.todos("SELECT * FROM familias WHERE ativo = 1 ORDER BY ordem");
  const fam = familiaSlug ? familias.find((f) => f.slug === familiaSlug) : null;
  if (familiaSlug && !fam) return null;

  const onde = ["a.ativo = 1"], args = [];
  if (fam) { onde.push("a.familia_id = ?"); args.push(fam.id); }

  /* Os filtros vêm da URL e são NÚMEROS conferidos aqui. Interpolar direto o
     que veio na barra de endereços seria SQL injection com nome bonito. */
  const gMin = Number(filtros.gmin) || 0;
  const gMax = Number(filtros.gmax) || 0;
  if (gMin) { onde.push("a.gramatura >= ?"); args.push(gMin); }
  if (gMax) { onde.push("a.gramatura <= ?"); args.push(gMax); }
  if (filtros.elastano === "1") onde.push("a.elastano = 1");
  if (filtros.elastano === "0") onde.push("a.elastano = 0");

  const artigos = Q.todos(`
    SELECT a.*, f.slug familia_slug, f.nome familia_nome, f.cor familia_cor
      FROM artigos a JOIN familias f ON f.id = a.familia_id
     WHERE ${onde.join(" AND ")}
     ORDER BY a.destaque DESC, f.ordem, a.nome`, ...args);

  const base = fam ? `/catalogo/${fam.slug}/` : "/catalogo/";
  const qs = (extra) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(Object.assign({}, filtros, extra)))
      if (v) p.set(k, v);
    const s = p.toString();
    return base + (s ? "?" + s : "");
  };
  /* A faixa de gramatura é UM filtro com dois campos, e o destaque tem de
     olhar os dois juntos. Comparando um por vez, "Todas" ficava aceso ao lado
     de "Pesada (301+)" — porque o campo `gmax` estava mesmo vazio nas duas. */
  const faixaOn = (min, max) =>
    (filtros.gmin || "") === min && (filtros.gmax || "") === max ? " chip--on" : "";
  const ativo = (k, v) => (filtros[k] || "") === v ? " chip--on" : "";

  const titulo = fam ? fam.nome : "Todos os tecidos";

  /* A faixa do topo mostra a foto DA FAMÍLIA quando há uma, e a foto geral da
     loja no catálogo inteiro. É o que dá identidade a cada recorte: "Jeans e
     Índigo" com textura de jeans atrás não é a mesma página que "Malha". */
  const capa = fam
    ? Img.img(`fam:${fam.slug}`, { doBanco: fam.foto, forma: "quadro",
        classe: "faixa__img", prioridade: true, decorativa: true })
    : Img.img("capaCor", { forma: "capa", classe: "faixa__img",
        prioridade: true, decorativa: true });

  const corpo = `
<header class="faixa">
  <div class="faixa__fundo" aria-hidden="true">${capa}</div>
  <div class="faixa__veu trama" aria-hidden="true"></div>
  <div class="env faixa__in">
    <nav class="migalha migalha--clara" aria-label="Você está aqui">
      <a href="/">Início</a> <span>›</span>
      ${fam ? `<a href="/catalogo/">Tecidos</a> <span>›</span> <b>${esc(fam.nome)}</b>`
            : `<b>Tecidos</b>`}
    </nav>
    <div class="cab cab--claro">
      <span class="cab__sobre">Catálogo</span>
      <h1>${esc(titulo)}</h1>
      <p class="cab__texto">${esc(fam ? fam.resumo :
        "Oito famílias com ficha técnica completa. Filtre pelo que a sua peça exige.")}</p>
    </div>
  </div>
</header>

<section class="secao secao--curta">
  <div class="env">

    <!-- FILTROS EM LINKS, não em <select> com JavaScript. Assim funcionam sem
         script, cada recorte tem URL própria para compartilhar no WhatsApp, e
         o Google indexa "jeans acima de 300 g/m²" como página. -->
    <div class="filtros" role="group" aria-label="Filtrar tecidos">
      <span class="filtros__rot">Gramatura</span>
      <a class="chip${faixaOn("", "")}" href="${qs({ gmin: "", gmax: "" })}">Todas</a>
      <a class="chip${faixaOn("", "200")}" href="${qs({ gmin: "", gmax: "200" })}">Leve (até 200)</a>
      <a class="chip${faixaOn("201", "300")}" href="${qs({ gmin: "201", gmax: "300" })}">Média (201–300)</a>
      <a class="chip${faixaOn("301", "")}" href="${qs({ gmin: "301", gmax: "" })}">Pesada (301+)</a>

      <span class="filtros__rot">Elastano</span>
      <a class="chip${ativo("elastano", "1")}" href="${qs({ elastano: "1" })}">Com</a>
      <a class="chip${ativo("elastano", "0")}" href="${qs({ elastano: "0" })}">Sem</a>
    </div>

    <!-- As famílias continuam à mão dentro do catálogo: quem entrou pela busca
         numa família específica precisa poder pular para outra sem voltar. -->
    <div class="fam-linha">
      <a class="fam-linha__i${!fam ? " fam-linha__i--on" : ""}" href="/catalogo/">Todas</a>
      ${familias.map((f) => `<a class="fam-linha__i${fam && fam.id === f.id ? " fam-linha__i--on" : ""}"
        style="--cor-f:var(--fam-${esc(f.cor)})" href="/catalogo/${esc(f.slug)}/">${esc(f.nome)}</a>`).join("")}
    </div>
  </div>
</section>

<section class="secao secao--topo0">
  <div class="env">
    <p class="lista__conta">${artigos.length} ${artigos.length === 1 ? "artigo" : "artigos"}</p>
    ${artigos.length
      ? `<div class="grade grade--4">${artigos.map(cartaoArtigo).join("")}</div>`
      : `<div class="vazio">
           <h3>Nenhum tecido com esse recorte</h3>
           <p>Tente afrouxar o filtro, ou mande no WhatsApp o que você precisa —
              boa parte do estoque gira toda semana e nem tudo está no site.</p>
           <a class="btn btn--acao" href="${zap("Olá! Procuro um tecido que não achei no site.")}"
              target="_blank" rel="noopener">Perguntar no WhatsApp</a>
         </div>`}
  </div>
</section>

${blocoAmostra()}`;

  const jsonld = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: titulo,
    url: SITE + base,
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Início", item: SITE + "/" },
        { "@type": "ListItem", position: 2, name: "Tecidos", item: SITE + "/catalogo/" },
        ...(fam ? [{ "@type": "ListItem", position: 3, name: fam.nome, item: SITE + base }] : []),
      ],
    },
  };

  return pagina({
    titulo,
    descricao: fam ? fam.resumo
      : "Catálogo de tecidos para confecção em Caruaru e Toritama, com composição, gramatura, largura útil e encolhimento de cada artigo.",
    atual: "catalogo", canonical: base, corpo, jsonld,
  });
}

/* ==========================================================================
   PÁGINA DO ARTIGO

   O centro do site. A ordem dela é a ordem da decisão de compra:
   cor → ficha técnica → preço por faixa → quantidade → amostra.

   A FICHA vem ANTES do preço de propósito. Preço sem ficha faz o comprador
   comparar dois tecidos diferentes como se fossem o mesmo — e o mais barato
   ganha, mesmo quando é o errado para a peça dele.
   ========================================================================== */
function artigo(familiaSlug, slug) {
  const a = Q.um(`
    SELECT a.*, f.slug familia_slug, f.nome familia_nome, f.cor familia_cor
      FROM artigos a JOIN familias f ON f.id = a.familia_id
     WHERE a.slug = ? AND a.ativo = 1`, slug);
  if (!a || a.familia_slug !== familiaSlug) return null;

  const cores = Q.todos(
    "SELECT * FROM cores WHERE artigo_id = ? AND ativo = 1 ORDER BY ordem", a.id);
  const faixas = Q.todos(
    "SELECT * FROM faixas WHERE artigo_id = ? ORDER BY de", a.id);
  const irmaos = Q.todos(`
    SELECT a.*, f.slug familia_slug, f.nome familia_nome, f.cor familia_cor
      FROM artigos a JOIN familias f ON f.id = a.familia_id
     WHERE a.familia_id = ? AND a.id <> ? AND a.ativo = 1 LIMIT 4`, a.familia_id, a.id);

  const un = a.unidade === "kg" ? "kg" : "m";
  const temPreco = cores.some((c) => c.preco > 0);

  const corpo = `
<nav class="migalha env" aria-label="Você está aqui">
  <a href="/">Início</a> <span>›</span>
  <a href="/catalogo/">Tecidos</a> <span>›</span>
  <a href="/catalogo/${esc(a.familia_slug)}/">${esc(a.familia_nome)}</a> <span>›</span>
  <b>${esc(a.nome)}</b>
</nav>

<section class="secao secao--curta">
  <div class="env produto">
    <!-- COLUNA DA COR. Sem foto ainda, o bloco mostra a cor REAL cadastrada,
         com a trama por cima. É honesto: mostra a cor, não finge ser foto. -->
    <div class="produto__visual">
      <!-- A foto do artigo fica por cima do bloco de cor. Trocar de cor muda o
           tom por baixo dela e esmaece a foto por um instante — o suficiente
           para o olho perceber a troca sem a página piscar. -->
      <div class="produto__foto" id="p-foto"
           style="--tom:${esc(cores[0] ? cores[0].hex : "#8A8A89")}">
        ${Img.img(`art:${a.slug}`, { doBanco: a.foto, forma: "cartao",
          classe: "produto__img", prioridade: true,
          alt: `${a.nome} — ${a.composicao || "tecido"}` })}
      </div>
      ${cores.length > 1 ? `
      <div class="produto__cores" role="group" aria-label="Cores disponíveis">
        ${cores.map((c, i) => `
        <button type="button" class="cor${i === 0 ? " cor--on" : ""}"
                data-hex="${esc(c.hex)}" data-nome="${esc(c.nome)}"
                data-cod="${esc(c.codigo)}" data-estoque="${c.estoque}"
                data-preco="${c.preco}" data-id="${c.id}"
                style="--c:${esc(c.hex)}" aria-pressed="${i === 0}">
          <span class="so-leitor">${esc(c.nome)}</span>
        </button>`).join("")}
      </div>` : ""}
      <p class="produto__cor-nome" id="p-cor-nome">
        ${esc(cores[0] ? cores[0].nome : "")}
        ${cores[0] && cores[0].codigo ? `<span>· ${esc(cores[0].codigo)}</span>` : ""}
      </p>
    </div>

    <div class="produto__dados">
      <span class="fam fam--${esc(a.familia_cor)}">${esc(a.familia_nome)}</span>
      <h1>${esc(a.nome)}</h1>
      <p class="produto__chamada">${esc(a.chamada)}</p>
      <p class="produto__estoque" id="p-estoque">
        ${sinalEstoque(cores[0] ? cores[0].estoque : 0)}
      </p>

      <h2 class="produto__sub">Ficha técnica</h2>
      <dl class="ficha">
        <div class="ficha__linha"><dt class="ficha__rot">Composição</dt>
          <dd class="ficha__val">${esc(a.composicao || "—")}</dd></div>
        <div class="ficha__linha"><dt class="ficha__rot">Gramatura</dt>
          <dd class="ficha__val">${a.gramatura ? a.gramatura + " g/m²" : "—"}</dd></div>
        <div class="ficha__linha"><dt class="ficha__rot">Largura útil</dt>
          <dd class="ficha__val">${a.largura ? a.largura + " cm" : "—"}</dd></div>
        <div class="ficha__linha"><dt class="ficha__rot">Encolhimento</dt>
          <dd class="ficha__val">${esc(a.encolhimento || "—")}</dd></div>
        <div class="ficha__linha"><dt class="ficha__rot">Elasticidade</dt>
          <dd class="ficha__val">${a.elastano ? "Com elastano" : "Sem elastano"}</dd></div>
        <div class="ficha__linha"><dt class="ficha__rot">Indicado para</dt>
          <dd class="ficha__val">${esc(a.indicacao || "—")}</dd></div>
        <div class="ficha__linha"><dt class="ficha__rot">Corte mínimo</dt>
          <dd class="ficha__val">${a.minimo} ${un}</dd></div>
      </dl>

      ${a.descricao ? `<p class="produto__desc">${esc(a.descricao)}</p>` : ""}

      ${faixas.length ? `
      <h2 class="produto__sub">Preço por quantidade</h2>
      <table class="faixas">
        <caption class="so-leitor">Preço por faixa de quantidade</caption>
        <thead><tr><th scope="col">A partir de</th><th scope="col">Preço por ${un}</th></tr></thead>
        <tbody>
          ${faixas.map((f) => `<tr>
            <td>${f.de} ${un}${f.rotulo ? ` <span>${esc(f.rotulo)}</span>` : ""}</td>
            <td>${f.preco > 0 ? dinheiro(f.preco) : "<em>sob consulta</em>"}</td>
          </tr>`).join("")}
        </tbody>
      </table>` : ""}

      <!-- ============================================================
           A AÇÃO muda conforme o preço estar publicado ou não.

           Sem preço, um botão "comprar" levaria a pessoa a um carrinho que
           não fecha — e a frustração cai sobre a loja. Com preço em branco,
           o caminho honesto é o orçamento pelo WhatsApp.
           ============================================================ -->
      <div class="produto__acoes">
        ${temPreco ? `
        <form class="compra" method="post" action="/carrinho/adicionar">
          <input type="hidden" name="cor_id" id="p-cor-id" value="${cores[0] ? cores[0].id : ""}">
          <label class="compra__qtd">
            <span>Quantidade (${un})</span>
            <input type="number" name="quantidade" min="${a.minimo}" step="0.5"
                   value="${a.minimo}" inputmode="decimal" required>
          </label>
          <button class="btn btn--acao" type="submit">Adicionar ao pedido</button>
        </form>` : `
        <a class="btn btn--acao" target="_blank" rel="noopener"
           href="${zap(`Olá! Quero orçamento do tecido: ${a.nome}.`)}">Pedir orçamento</a>`}
        <a class="btn btn--linha" href="#amostra">Quero uma amostra</a>
      </div>
    </div>
  </div>
</section>

${irmaos.length ? `
<section class="secao secao--papel">
  <div class="env">
    <div class="cab"><span class="cab__sobre">Da mesma família</span>
      <h2>Outros ${esc(a.familia_nome.toLowerCase())}</h2></div>
    <div class="grade grade--4">${irmaos.map(cartaoArtigo).join("")}</div>
  </div>
</section>` : ""}

${blocoAmostra(a.nome)}`;

  /* Schema.org de PRODUTO com as propriedades têxteis. `material` e `width`
     são campos que o Google entende, e é o que faz o artigo aparecer na busca
     por "jeans 340g" em vez de só pelo nome. */
  const jsonld = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: a.nome,
    description: a.chamada || a.descricao,
    material: a.composicao,
    ...(a.largura ? { width: { "@type": "QuantitativeValue", value: a.largura, unitCode: "CMT" } } : {}),
    ...(a.gramatura ? { weight: { "@type": "QuantitativeValue", value: a.gramatura, unitText: "g/m2" } } : {}),
    brand: { "@type": "Brand", name: txt("marca.nome", "Izatec Tecidos") },
    category: a.familia_nome,
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "BRL",
      offerCount: cores.length,
      availability: cores.some((c) => c.estoque > 0)
        ? "https://schema.org/InStock" : "https://schema.org/PreOrder",
      ...(temPreco ? { lowPrice: Math.min(...cores.filter((c) => c.preco > 0).map((c) => c.preco)) } : {}),
    },
  };

  return pagina({
    titulo: a.nome,
    descricao: `${a.chamada} ${a.composicao}, ${a.gramatura || "?"} g/m², largura ${a.largura || "?"} cm.`.slice(0, 158),
    atual: "catalogo", canonical: `/catalogo/${a.familia_slug}/${a.slug}/`,
    corpo, jsonld,
  });
}

module.exports = { lista, artigo, blocoAmostra };
