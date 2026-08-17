"use strict";
/* ==========================================================================
   PÁGINAS DO SITE

   ---------------------------------------------------------------------------
   O FUNIL DESTA HOME, E POR QUE ELE NÃO É O DE UMA LOJA COMUM

   Quem entra aqui é dono de confecção em Caruaru ou Toritama. Ele não está
   passeando: está com uma coleção para produzir e precisa saber se ESTA loja
   tem o tecido certo, com a ficha técnica certa, disponível agora.

   A ordem da página segue as perguntas dele, na ordem em que ele as faz:

     1. "vocês têm o que eu preciso?"      → capa direta, com o jeans na frente
     2. "que tipo de tecido vocês têm?"    → as famílias, reconhecíveis pela cor
     3. "esse serve pra minha peça?"       → ficha técnica JÁ na vitrine
     4. "posso confiar?"                   → garantia, lote, troca
     5. "dá pra ver antes de comprar?"     → amostra (o passo que fecha venda)
     6. "onde vocês ficam?"                → as duas lojas

   O que NÃO está aqui, de propósito: carrossel de banner, contador de
   satisfação inventado e depoimento sem nome. Comprador profissional
   desconfia dos três, e eles empurram o conteúdo útil para baixo da dobra.
   ========================================================================== */
const { Q, txt } = require("./db");
const { pagina, esc, zap, SITE } = require("./layout");
const Img = require("./imagens");

const dinheiro = (v) => Number(v || 0).toLocaleString("pt-BR",
  { style: "currency", currency: "BRL" });

/* Estoque vira SEMÁFORO, não número cru. "412 metros" não diz nada a quem não
   sabe o tamanho do estoque normal daquele artigo; "disponível" diz. */
function sinalEstoque(metros) {
  if (metros <= 0)  return `<span class="sinal sinal--fim">Sob encomenda</span>`;
  if (metros < 100) return `<span class="sinal sinal--atencao">Últimos metros</span>`;
  return `<span class="sinal sinal--ok">Disponível</span>`;
}

/* ==========================================================================
   CARTÃO DE ARTIGO — a peça que se repete pelo site inteiro

   A decisão que o define: a FICHA TÉCNICA aparece no cartão, não só na página
   interna. Custa três linhas de espaço e economiza um clique por artigo — e
   quem está comparando cinco tecidos não vai abrir cinco abas para descobrir
   a gramatura de cada um.
   ========================================================================== */
function cartaoArtigo(a) {
  const cores = Q.todos(
    "SELECT nome, hex, estoque FROM cores WHERE artigo_id = ? AND ativo = 1 ORDER BY ordem",
    a.id);
  const estoqueTotal = cores.reduce((s, c) => s + c.estoque, 0);

  /* A FOTO ENTRA POR CIMA DA COR, não no lugar dela.

     O bloco continua pintado com o tom real cadastrado; a foto fica em cima.
     Assim, artigo sem foto não vira retângulo cinza — cai na cor do tecido com
     a trama, que é o comportamento honesto de antes. E enquanto a foto carrega,
     o que se vê é a cor certa, não um vazio. */
  const foto = Img.img(`art:${a.slug}`, {
    doBanco: a.foto, alt: `${a.nome} — ${a.chamada}`, forma: "cartao", classe: "art__img",
  });

  return `
<article class="art revelar">
  <a class="art__link" href="/catalogo/${esc(a.familia_slug)}/${esc(a.slug)}/">
    <div class="art__foto" style="--tom:${esc(cores[0] ? cores[0].hex : "#8A8A89")}">
      ${foto || `<span class="so-leitor">Amostra de ${esc(a.nome)}</span>`}
    </div>
    <div class="art__corpo">
      <span class="fam fam--${esc(a.familia_cor)}">${esc(a.familia_nome)}</span>
      <h3 class="art__nome">${esc(a.nome)}</h3>
      <p class="art__chamada">${esc(a.chamada)}</p>

      <!-- Os três números que decidem a compra. Em <dl> porque é dado
           tabulado de verdade: leitor de tela anuncia rótulo e valor, e
           comparar dois artigos vira leitura em diagonal. -->
      <dl class="art__tec">
        <div><dt>Gramatura</dt><dd>${a.gramatura ? a.gramatura + " g/m²" : "—"}</dd></div>
        <div><dt>Largura</dt><dd>${a.largura ? a.largura + " cm" : "—"}</dd></div>
        <div><dt>Elastano</dt><dd>${a.elastano ? "Sim" : "Não"}</dd></div>
      </dl>
    </div>
  </a>
  <div class="art__pe">
    ${sinalEstoque(estoqueTotal)}
    <span class="art__cores" aria-label="${cores.length} cores disponíveis">
      ${cores.slice(0, 5).map((c) =>
        `<i style="background:${esc(c.hex)}" title="${esc(c.nome)}"></i>`).join("")}
      ${cores.length > 5 ? `<b>+${cores.length - 5}</b>` : ""}
    </span>
  </div>
</article>`;
}

/* ========================================================================== */
function home() {
  const familias = Q.todos(`
    SELECT f.*, (SELECT COUNT(*) FROM artigos a WHERE a.familia_id = f.id AND a.ativo = 1) n
      FROM familias f WHERE f.ativo = 1 ORDER BY f.ordem`);

  const destaques = Q.todos(`
    SELECT a.*, f.slug familia_slug, f.nome familia_nome, f.cor familia_cor
      FROM artigos a JOIN familias f ON f.id = a.familia_id
     WHERE a.ativo = 1 AND a.destaque = 1 ORDER BY a.id LIMIT 4`);

  const materias = Q.todos(
    "SELECT slug, titulo, resumo, etiqueta, data, capa FROM feed WHERE publicado = 1 ORDER BY data DESC, id DESC LIMIT 3");

  const corpo = `
<!-- ======================================================================
     CAPA

     A FOTO ENTRA COMO FUNDO, sob um véu de índigo. A escolha da imagem não é
     aleatória: rolos empilhados em tons frios, luz de galpão. Uma foto de
     tecido colorido e claro competiria com o texto e obrigaria a escurecer o
     véu até a foto virar mancha — e aí não vale a pena ter foto.

     Ela carrega com prioridade alta e SEM lazy: capa com lazy chega
     depois, e a primeira coisa que o visitante vê é um buraco.

     O tom de reserva pinta o índigo antes de a foto chegar. Se a rede do
     polo estiver ruim, a capa aparece escura e legível em vez de branca.
     ====================================================================== -->
<section class="capa">
  <div class="capa__fundo" aria-hidden="true">
    ${Img.img("capa", { forma: "capa", classe: "capa__foto", prioridade: true, decorativa: true })}
  </div>
  <div class="capa__veu trama" aria-hidden="true"></div>

  <div class="env capa__in">
    <div class="capa__texto">
      <span class="capa__tarja">Caruaru · Toritama · Atacado para confecção</span>
      <h1>${esc(txt("home.titulo", ""))}</h1>
      <p class="capa__chamada">${esc(txt("home.chamada", ""))}</p>
      <div class="capa__acoes">
        <a class="btn btn--acao" href="/catalogo/">Ver os tecidos</a>
        <a class="btn btn--linha" href="/catalogo/#amostra">Pedir amostra</a>
      </div>
    </div>

    <!-- A PROVA fica NA CAPA, e não numa seção lá embaixo: é o que responde
         "posso confiar em comprar daqui?" antes de a pessoa rolar a página. -->
    <dl class="prova">
      <div><dt>${esc(txt("home.prova1.num", ""))}</dt><dd>${esc(txt("home.prova1.txt", ""))}</dd></div>
      <div><dt>${esc(txt("home.prova2.num", ""))}</dt><dd>${esc(txt("home.prova2.txt", ""))}</dd></div>
      <div><dt>${esc(txt("home.prova3.num", ""))}</dt><dd>${esc(txt("home.prova3.txt", ""))}</dd></div>
    </dl>
  </div>
</section>
<div class="regua regua--anima" aria-hidden="true"></div>

<!-- ======================================================================
     FAMÍLIAS — a navegação principal do site

     Aqui a paleta do logotipo vira função: cada família tem a cor de uma
     pétala, e quem volta ao site na semana seguinte reconhece o bloco antes
     de ler o nome. É o ativo da marca fazendo trabalho de usabilidade.
     ====================================================================== -->
<section class="secao" id="familias">
  <div class="env">
    <div class="cab">
      <span class="cab__sobre">O que temos</span>
      <h2>Oito famílias, uma ficha técnica para cada artigo</h2>
      <p class="cab__texto">Do índigo pesado de calça masculina à viscose de blusa.
        Escolha pela família ou vá direto ao que a sua peça pede.</p>
    </div>

    <div class="grade grade--4 familias">
      ${familias.map((f, i) => `
      <a class="fcard fcard--${esc(f.cor)} revelar" style="--atraso:${i * 60}ms"
         href="/catalogo/${esc(f.slug)}/">
        <!-- A foto é DECORATIVA aqui: o nome da família está escrito logo
             abaixo, e descrever a textura de novo só atrapalha quem usa leitor
             de tela. Ela vive atrás do texto, esmaecida, e acende no hover. -->
        <span class="fcard__foto" aria-hidden="true">
          ${Img.img(`fam:${f.slug}`, { doBanco: f.foto, forma: "quadro",
            classe: "fcard__img", decorativa: true })}
        </span>
        <span class="fcard__tira" aria-hidden="true"></span>
        <h3>${esc(f.nome)}</h3>
        <p>${esc(f.resumo)}</p>
        <span class="fcard__n">${f.n} ${f.n === 1 ? "artigo" : "artigos"}</span>
      </a>`).join("")}
    </div>
  </div>
</section>

<!-- ====================================================================== -->
<section class="secao secao--papel">
  <div class="env">
    <div class="cab">
      <span class="cab__sobre">Mais pedidos</span>
      <h2>O que sai todo dia do balcão</h2>
      <p class="cab__texto">Gramatura, largura e elastano à vista — para você
        comparar sem abrir uma aba por tecido.</p>
    </div>
    <div class="grade grade--4">${destaques.map(cartaoArtigo).join("")}</div>
    <p class="centro" style="margin-top:var(--e6)">
      <a class="btn btn--linha" href="/catalogo/">Ver o catálogo completo</a>
    </p>
  </div>
</section>

<!-- ======================================================================
     CONFIANÇA

     Os três diferenciais que o cliente citou — garantia, qualidade e
     transparência — escritos como PROMESSA VERIFICÁVEL, não como adjetivo.
     "Qualidade" não significa nada sozinho; "mesmo lote na mesma produção"
     é uma promessa que dá para cobrar.
     ====================================================================== -->
<section class="secao secao--escura secao--foto">
  <!-- A foto entra MUITO esmaecida, atrás da trama. Não é para ser vista como
       foto: é para tirar o chapado do bloco escuro e dar a sensação de galpão
       de verdade por trás do texto. Foto legível aqui roubaria a leitura das
       três promessas, que é o conteúdo que importa nesta seção. -->
  <div class="secao__fundo" aria-hidden="true">
    ${Img.img("producao", { forma: "larga", classe: "secao__img", decorativa: true })}
  </div>
  <div class="secao__veu trama" aria-hidden="true"></div>

  <div class="env">
    <div class="cab">
      <span class="cab__sobre">Por que a Izatec</span>
      <h2>Três compromissos que você pode cobrar de nós</h2>
    </div>
    <div class="grade grade--3">
      <div class="promessa revelar">
        <span class="promessa__n">01</span>
        <h3>Mesmo lote na mesma produção</h3>
        <p>Diferença de tonalidade entre lotes é característica do tingimento,
          não defeito — mas não pode aparecer na mesma peça. Separamos a sua
          metragem do mesmo lote e avisamos quando isso não for possível.</p>
      </div>
      <div class="promessa revelar" style="--atraso:100ms">
        <span class="promessa__n">02</span>
        <h3>Ficha técnica antes da compra</h3>
        <p>Composição, gramatura, largura útil e encolhimento publicados em cada
          artigo. Você calcula consumo e margem de encolhimento antes de fechar,
          não depois que a peça sai da lavanderia.</p>
      </div>
      <div class="promessa revelar" style="--atraso:200ms">
        <span class="promessa__n">03</span>
        <h3>Amostra antes do rolo</h3>
        <p>Ninguém compra tecido sem sentir. Enviamos amostra dos artigos que
          você quiser avaliar, e a nossa equipe indica alternativas se o que
          você procura estiver em falta.</p>
      </div>
    </div>
  </div>
</section>

<!-- ====================================================================== -->
<section class="secao" id="lojas">
  <div class="env lojas-par">
    <!-- Foto e endereços lado a lado. A foto aqui é a da LOJA, não de fábrica:
         a seção responde "onde eu retiro?", e mostrar prateleira cheia é o que
         convence alguém a ir até lá em vez de pedir por transportadora. -->
    <div class="lojas-par__foto revelar">
      ${Img.img("loja", { forma: "larga", classe: "moldura__img",
        alt: "Prateleiras da loja com rolos de tecido" })}
    </div>

    <div class="lojas-par__texto">
      <div class="cab">
        <span class="cab__sobre">Onde estamos</span>
        <h2>Duas lojas, no meio do polo</h2>
        <p class="cab__texto">Compre online e retire na loja, ou passe para ver o
          tecido pessoalmente antes de fechar.</p>
      </div>
      ${[1, 2].map((i) => `
      <div class="loja revelar" style="--atraso:${i * 90}ms">
        <h3>${esc(txt(`loja${i}.nome`, ""))}</h3>
        <address>${esc(txt(`loja${i}.endereco`, ""))}</address>
        <p class="loja__hora">${esc(txt(`loja${i}.horario`, ""))}</p>
        <a class="btn btn--linha btn--sm"
           href="${zap(`Olá! Queria falar com a loja de ${txt(`loja${i}.nome`, "")}.`)}"
           target="_blank" rel="noopener">Chamar no WhatsApp</a>
      </div>`).join("")}
    </div>
  </div>
</section>

<!-- ====================================================================== -->
<section class="secao secao--papel">
  <div class="env">
    <div class="cab">
      <span class="cab__sobre">Feed</span>
      <h2>O que ajuda na hora de produzir</h2>
      <p class="cab__texto">Conteúdo técnico para quem corta e costura — sem
        enrolação e sem vender nada no meio.</p>
    </div>
    <div class="grade grade--3">
      ${materias.map((m, i) => `
      <a class="post post--foto revelar" style="--atraso:${i * 80}ms"
         href="/feed/${esc(m.slug)}/">
        <span class="post__capa">
          ${Img.img(`feed:${m.slug}`, { doBanco: m.capa, alt: m.titulo,
            forma: "larga", classe: "post__img" })}
        </span>
        <span class="post__corpo">
          <span class="post__et">${esc(m.etiqueta)}</span>
          <h3>${esc(m.titulo)}</h3>
          <p>${esc(m.resumo)}</p>
          <span class="post__mais">Ler a matéria</span>
        </span>
      </a>`).join("")}
    </div>
  </div>
</section>`;

  /* ======================================================================
     SCHEMA.ORG

     'Store' e não 'Organization': o Google trata loja com endereço e horário
     de forma diferente na busca local, que é exatamente onde este cliente
     precisa aparecer — "tecidos em Caruaru" é a consulta que traz venda.
     ====================================================================== */
  const jsonld = {
    "@context": "https://schema.org",
    "@type": "Store",
    name: txt("marca.nome", "Izatec Tecidos"),
    description: txt("home.chamada", ""),
    url: SITE,
    telephone: "+" + txt("marca.whatsapp", "").replace(/\D/g, ""),
    email: txt("marca.email", ""),
    sameAs: [`https://instagram.com/${txt("marca.instagram", "izatectecidos")}`],
    areaServed: ["Caruaru", "Toritama", "Agreste de Pernambuco"],
    location: [1, 2].map((i) => ({
      "@type": "Place",
      name: `${txt("marca.nome", "Izatec")} — ${txt(`loja${i}.nome`, "")}`,
      address: { "@type": "PostalAddress", streetAddress: txt(`loja${i}.endereco`, ""),
        addressRegion: "PE", addressCountry: "BR" },
    })),
    makesOffer: familias.map((f) => ({
      "@type": "Offer",
      itemOffered: { "@type": "Product", name: f.nome, description: f.resumo },
    })),
  };

  return pagina({
    titulo: "",
    descricao: txt("home.chamada", "").slice(0, 158),
    atual: "home", canonical: "/", corpo, jsonld,
  });
}

/* ==========================================================================
   AMOSTRA PEDIDA

   Página própria, e não uma faixa verde de volta ao catálogo. O pedido de
   amostra é o lead mais valioso do negócio, e quem acabou de pedir merece
   saber exatamente o que vem depois — inclusive quanto tempo esperar.

   O botão do WhatsApp já leva o texto pronto: quem quer adiantar não precisa
   redigir de novo o que acabou de escrever no formulário.
   ========================================================================== */
function amostraEnviada(artigos = "") {
  const corpo = `
<section class="secao">
  <div class="env obrigado">
    <span class="obrigado__selo" aria-hidden="true">✓</span>
    <h1>Pedido de amostra recebido</h1>
    <p>A loja separa as amostras e responde pelo WhatsApp no próximo horário
      comercial, combinando a retirada em Caruaru ou Toritama — ou o envio, se
      você for de fora.</p>
    ${artigos ? `<p class="obrigado__eco">Você pediu: <em>${esc(artigos)}</em></p>` : ""}
    <div class="obrigado__acoes">
      <a class="btn btn--acao" target="_blank" rel="noopener"
         href="${zap("Ola! Acabei de pedir amostra pelo site" + (artigos ? ": " + artigos : "."))}">
        Adiantar pelo WhatsApp</a>
      <a class="btn btn--linha" href="/catalogo/">Continuar vendo tecidos</a>
    </div>
  </div>
</section>`;
  return pagina({ titulo: "Amostra pedida", descricao: "", canonical: "/catalogo/", corpo });
}

module.exports = { home, cartaoArtigo, dinheiro, sinalEstoque, amostraEnviada };
