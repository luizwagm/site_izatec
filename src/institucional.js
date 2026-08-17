"use strict";
/* ==========================================================================
   INSTITUCIONAL — "A Izatec" e "Contato"

   ---------------------------------------------------------------------------
   A PÁGINA "SOBRE" DE UM FORNECEDOR NÃO É A DE UMA MARCA DE MODA

   Quem lê essa página aqui não está se emocionando com a história da empresa:
   está decidindo se confia o tecido da coleção inteira a ela. As perguntas
   silenciosas são outras — "e se a cor do segundo lote vier diferente?",
   "quem responde se o tecido encolher mais do que a ficha diz?".

   Por isso as três promessas do briefing (garantia, qualidade, transparência)
   viram COMPROMISSOS ESCRITOS, com o que a loja faz quando dá errado. Uma
   promessa sem consequência é decoração; com consequência, é garantia.
   ========================================================================== */
const { Q, txt } = require("./db");
const { pagina, esc, zap, SITE } = require("./layout");
const Img = require("./imagens");

/* ========================================================================== */
function sobre() {
  const familias = Q.todos("SELECT slug, nome, resumo, cor, foto FROM familias WHERE ativo=1 ORDER BY ordem");

  const compromissos = [
    ["Garantia", "Tecido com defeito de fábrica",
     "Achou falha de tecelagem, mancha de tinturaria ou diferença de tom dentro do mesmo lote? Troca ou devolução do valor, sem discussão. O que a gente pede é que a peça não tenha sido cortada — depois do corte não há como o fornecedor aceitar de volta, e a gente não vai fingir que há."],
    ["Qualidade", "A ficha técnica é conferida, não copiada",
     "Gramatura, largura útil e composição saem do que a gente mede e do laudo do fornecedor — não do catálogo do representante. Quando um artigo troca de fornecedor e a ficha muda, a página muda junto."],
    ["Transparência", "Preço por faixa, à vista, na tela",
     "O preço de 10 metros e o de um rolo estão publicados. Você não precisa ligar para descobrir se compensa fechar mais — a tabela está aí, e o que muda com o volume é só o que está escrito nela."],
  ];

  const corpo = `
<nav class="migalha env" aria-label="Você está aqui">
  <a href="/">Início</a> <span>›</span> <b>A Izatec</b>
</nav>

<section class="secao secao--curta">
  <div class="env sobre">
    <div class="sobre__texto">
      <span class="cab__sobre">A empresa</span>
      <h1>${esc(txt("sobre.titulo", "Uma loja de tecidos que fala a língua de quem produz"))}</h1>
      <p class="sobre__abre">${esc(txt("sobre.texto", ""))}</p>
      <p>Estamos no meio do maior polo de confecção do Nordeste. Nossos clientes
        não compram tecido: compram a certeza de que a produção da semana não
        vai parar. É isso que a gente organiza — estoque de giro, ficha técnica
        conferida e alguém do outro lado do WhatsApp que sabe do que você está
        falando.</p>
      <div class="sobre__acoes">
        <a class="btn btn--acao" href="/catalogo/">Ver os tecidos</a>
        <a class="btn btn--linha" href="/contato/">Falar com a loja</a>
      </div>
    </div>

    <!-- A foto é de MEDIÇÃO, não de gente sorrindo em escritório: mãos e fita
         métrica. O que a página promete é ficha técnica conferida, e a imagem
         tem de dizer a mesma coisa que o texto — senão vira enfeite.
         A régua desenhada em CSS continua embaixo, amarrando ao ofício. -->
    <figure class="sobre__visual revelar">
      ${Img.img("medida", { forma: "larga", classe: "moldura__img",
        alt: "Mãos medindo tecido com fita métrica" })}
      <span class="regua" aria-hidden="true"></span>
    </figure>
  </div>
</section>

<section class="secao secao--papel">
  <div class="env">
    <div class="cab">
      <span class="cab__sobre">Compromissos</span>
      <h2>O que a gente garante — e o que acontece se falhar</h2>
      <p class="cab__texto">Promessa sem consequência é propaganda. Aqui está o
        que a Izatec faz quando alguma das três não se cumpre.</p>
    </div>

    <div class="grade grade--3">
      ${compromissos.map(([rot, tit, txt2]) => `
      <article class="promessa promessa--forte">
        <span class="promessa__rot">${esc(rot)}</span>
        <h3>${esc(tit)}</h3>
        <p>${esc(txt2)}</p>
      </article>`).join("")}
    </div>
  </div>
</section>

<section class="secao">
  <div class="env">
    <div class="cab"><span class="cab__sobre">O que temos</span>
      <h2>Oito famílias de tecido</h2></div>
    <div class="grade grade--4">
      ${familias.map((f, i) => `
      <a class="fcard fcard--${esc(f.cor)} revelar" style="--atraso:${i * 55}ms"
         href="/catalogo/${esc(f.slug)}/">
        <span class="fcard__foto" aria-hidden="true">
          ${Img.img(`fam:${f.slug}`, { doBanco: f.foto, forma: "quadro",
            classe: "fcard__img", decorativa: true })}
        </span>
        <span class="fcard__tira" aria-hidden="true"></span>
        <h3>${esc(f.nome)}</h3><p>${esc(f.resumo)}</p>
        <span class="fcard__ir">Ver tecidos</span>
      </a>`).join("")}
    </div>
  </div>
</section>

<section class="secao secao--escura trama">
  <div class="env lojas">
    <div class="cab cab--claro"><span class="cab__sobre">Onde estamos</span>
      <h2>Duas lojas físicas, no lugar onde a confecção acontece</h2></div>
    <div class="grade grade--2">
      ${[1, 2].map((n) => `
      <address class="loja">
        <h3>${esc(txt(`loja${n}.nome`, ""))}</h3>
        <p>${esc(txt(`loja${n}.endereco`, ""))}</p>
        <p class="loja__hora">${esc(txt(`loja${n}.horario`, ""))}</p>
        <a class="btn btn--linha btn--sm" target="_blank" rel="noopener"
           href="https://www.google.com/maps/search/${encodeURIComponent(txt(`loja${n}.endereco`, ""))}">
          Ver no mapa</a>
      </address>`).join("")}
    </div>
  </div>
</section>`;

  const jsonld = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: "A Izatec",
    url: SITE + "/sobre/",
  };

  return pagina({
    titulo: "A Izatec", atual: "sobre", canonical: "/sobre/", corpo, jsonld,
    descricao: "Loja de tecidos para confecção em Caruaru e Toritama: garantia de lote, ficha técnica conferida e preço por faixa publicado.",
  });
}

/* ==========================================================================
   CONTATO

   O WhatsApp vem PRIMEIRO e o formulário depois. No polo, ninguém escreve
   e-mail para perguntar preço de tecido — pergunta no WhatsApp e espera
   resposta em minutos. Um formulário no topo seria o canal que o site prefere,
   não o que o cliente prefere.

   O formulário fica para quem quer registro escrito: pedido de cadastro,
   proposta de fornecedor, reclamação. Esses ficam melhor gravados no banco.
   ========================================================================== */
function contato(erro = "", enviado = false) {
  const corpo = `
<nav class="migalha env" aria-label="Você está aqui">
  <a href="/">Início</a> <span>›</span> <b>Contato</b>
</nav>

<section class="secao secao--curta">
  <div class="env">
    <div class="cab">
      <span class="cab__sobre">Contato</span>
      <h1>Fale com a loja</h1>
      <p class="cab__texto">A resposta mais rápida é pelo WhatsApp, no horário
        comercial. Para assunto que precisa ficar registrado, use o formulário.</p>
    </div>

    <div class="contato">
      <div class="contato__canais">
        <a class="canal canal--zap" href="${zap("Olá! Vim pelo site da Izatec.")}"
           target="_blank" rel="noopener">
          <strong>WhatsApp</strong>
          <span>Resposta no horário comercial</span>
        </a>
        <a class="canal" href="mailto:${esc(txt("marca.email", ""))}">
          <strong>E-mail</strong>
          <span>${esc(txt("marca.email", ""))}</span>
        </a>
        <a class="canal" href="https://instagram.com/${esc(txt("marca.instagram", ""))}"
           target="_blank" rel="noopener">
          <strong>Instagram</strong>
          <span>@${esc(txt("marca.instagram", ""))}</span>
        </a>

        ${[1, 2].map((n) => `
        <address class="canal canal--loja">
          <strong>${esc(txt(`loja${n}.nome`, ""))}</strong>
          <span>${esc(txt(`loja${n}.endereco`, ""))}</span>
          <span class="canal__hora">${esc(txt(`loja${n}.horario`, ""))}</span>
        </address>`).join("")}
      </div>

      <form class="contato__form" method="post" action="/contato">
        ${enviado ? `<p class="aviso aviso--ok">Mensagem enviada. A loja responde
          no próximo horário comercial.</p>` : ""}
        ${erro ? `<p class="aviso aviso--erro">${esc(erro)}</p>` : ""}

        <div class="campo"><label for="c-nome">Seu nome *</label>
          <input id="c-nome" name="nome" required maxlength="120" autocomplete="name"></div>
        <div class="campo"><label for="c-tel">WhatsApp *</label>
          <input id="c-tel" name="telefone" required maxlength="20" inputmode="tel" autocomplete="tel"></div>
        <div class="campo"><label for="c-mail">E-mail</label>
          <input id="c-mail" name="email" type="email" maxlength="160" autocomplete="email"></div>
        <div class="campo"><label for="c-ass">Assunto</label>
          <select id="c-ass" name="assunto">
            <option>Quero comprar tecido</option>
            <option>Cadastro de cliente</option>
            <option>Sou fornecedor</option>
            <option>Troca ou devolução</option>
            <option>Outro assunto</option>
          </select></div>
        <div class="campo"><label for="c-msg">Mensagem *</label>
          <textarea id="c-msg" name="mensagem" rows="5" required maxlength="1500"></textarea></div>

        <button class="btn btn--acao btn--largo" type="submit">Enviar mensagem</button>
        <p class="amostra__lgpd">Seus dados são usados só para responder esta
          mensagem. Não enviamos propaganda e não repassamos a ninguém.</p>
      </form>
    </div>
  </div>
</section>`;

  const jsonld = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    url: SITE + "/contato/",
    mainEntity: {
      "@type": "Store",
      name: txt("marca.nome", "Izatec Tecidos"),
      email: txt("marca.email", ""),
      telephone: "+" + txt("marca.whatsapp", "").replace(/\D/g, ""),
      address: [1, 2].map((n) => ({
        "@type": "PostalAddress",
        streetAddress: txt(`loja${n}.endereco`, ""),
        addressLocality: txt(`loja${n}.nome`, ""),
        addressRegion: "PE", addressCountry: "BR",
      })),
    },
  };

  return pagina({
    titulo: "Contato", atual: "contato", canonical: "/contato/", corpo, jsonld,
    descricao: "Fale com a Izatec Tecidos: WhatsApp, e-mail e as duas lojas físicas em Caruaru e Toritama.",
  });
}

/* ========================================================================== */
function erro404() {
  const corpo = `
<section class="secao">
  <div class="env vazio vazio--404">
    <span class="vazio__num" aria-hidden="true">404</span>
    <h1>Essa página não existe</h1>
    <p>Pode ser que o tecido tenha saído de linha, ou que o endereço esteja
      com um caractere trocado. O catálogo inteiro está a um clique.</p>
    <div class="obrigado__acoes">
      <a class="btn btn--acao" href="/catalogo/">Ver os tecidos</a>
      <a class="btn btn--linha" href="/">Voltar ao início</a>
    </div>
  </div>
</section>`;
  return pagina({ titulo: "Página não encontrada", descricao: "", canonical: "/", corpo });
}

module.exports = { sobre, contato, erro404 };
