"use strict";
/* ==========================================================================
   LAYOUT — o esqueleto de toda página

   Cabeçalho, rodapé e o <head> ficam AQUI, num lugar só. Uma mudança no menu
   ou no rodapé chega a todas as páginas sem ninguém precisar lembrar de cada
   arquivo — que é como um site ganha um rodapé diferente na página de contato.
   ========================================================================== */
const { Q, txt } = require("./db");
const Medicao = require("./medicao");

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/* O endereço vem do ambiente, num lugar só — ver src/endereco.js. Escrito no
   código, ele vira uma caçada por canonical, JSON-LD, sitemap e robots no dia
   da virada de domínio. */
const { SITE, CABECALHO_ROBOS } = require("./endereco");

/* ==========================================================================
   O LOGOTIPO, EM SVG

   A flor é redesenhada em código, e não incorporada como imagem, por três
   razões concretas:

   · escala em qualquer tela sem borrar, inclusive num monitor 4K de escritório
     e num celular antigo de 320px;
   · pesa menos de 2 KB e não custa requisição — o cabeçalho aparece junto com
     o HTML, sem o pulo de layout de quando a imagem chega depois;
   · as pétalas herdam as cores do design system, então mudar a paleta muda o
     logo junto, sem alguém ter de reexportar arquivo.

   As oito pétalas ficam em opacidade parcial, como no original impresso — é o
   que dá o efeito de sobreposição translúcida da marca.
   ========================================================================== */
function marca(altura = 40) {
  return `<svg class="marca" viewBox="0 0 240 96" height="${altura}" role="img"
     aria-label="Izatec Tecidos">
  <g class="marca__flor">
    <circle cx="34" cy="26" r="15" fill="var(--petala-agua)" opacity=".85"/>
    <circle cx="58" cy="20" r="15" fill="var(--petala-laranja)" opacity=".85"/>
    <circle cx="74" cy="38" r="15" fill="var(--petala-ouro)" opacity=".85"/>
    <circle cx="70" cy="60" r="15" fill="var(--petala-limao)" opacity=".85"/>
    <circle cx="52" cy="70" r="15" fill="var(--petala-verde)" opacity=".85"/>
    <circle cx="32" cy="64" r="15" fill="var(--petala-uva)" opacity=".85"/>
    <circle cx="22" cy="44" r="15" fill="var(--petala-caramelo)" opacity=".85"/>
    <circle cx="46" cy="44" r="17" fill="none" stroke="var(--acao)" stroke-width="7"/>
  </g>
  <text x="96" y="52" class="marca__iza">IZA</text>
  <text x="152" y="52" class="marca__tec">TEC</text>
  <text x="97" y="74" class="marca__sub">T E C I D O S</text>
</svg>`;
}

/* --------------------------------------------------------------- WhatsApp */
function zap(mensagem = "") {
  const n = txt("marca.whatsapp", "5581999999999").replace(/\D/g, "");
  return `https://wa.me/${n}${mensagem ? "?text=" + encodeURIComponent(mensagem) : ""}`;
}

/* ==========================================================================
   CABEÇALHO

   O menu é curto DE PROPÓSITO: cinco itens. Quem compra tecido chega
   procurando um artigo, não explorando o site — e um menu de dez itens só
   atrasa a decisão de para onde ir.

   O botão de ação no topo é "Pedir amostra", e não "Comprar": em atacado
   têxtil, ninguém fecha um rolo sem ver o tecido. Pedir a compra antes da
   amostra é pedir o segundo passo primeiro.
   ========================================================================== */
function cabecalho(atual = "") {
  const item = (href, rot, chave) =>
    `<a href="${href}" class="nav__i${atual === chave ? " nav__i--atual" : ""}"${
      atual === chave ? ' aria-current="page"' : ""}>${rot}</a>`;

  return `
<a href="#conteudo" class="pular">Ir para o conteúdo</a>
<header class="topo" id="topo">
  <div class="env topo__in">
    <a href="/" class="topo__marca" aria-label="Izatec Tecidos — página inicial">${marca(44)}</a>

    <nav class="nav" aria-label="Principal">
      ${item("/catalogo/", "Tecidos", "catalogo")}
      ${item("/sobre/", "A Izatec", "sobre")}
      ${item("/feed/", "Feed", "feed")}
      ${item("/contato/", "Contato", "contato")}
    </nav>

    <div class="topo__acoes">
      <a class="btn btn--acao btn--sm" href="/catalogo/#amostra">Pedir amostra</a>
      <button class="topo__menu" type="button" aria-expanded="false"
              aria-controls="nav-movel" aria-label="Abrir o menu">
        <span></span><span></span><span></span>
      </button>
    </div>
  </div>

  <!-- Menu do celular: os mesmos itens, sem duplicar a lista de links em dois
       lugares que podem divergir. -->
  <nav class="nav-movel" id="nav-movel" hidden aria-label="Principal (celular)">
    <a href="/catalogo/">Tecidos</a>
    <a href="/sobre/">A Izatec</a>
    <a href="/feed/">Feed</a>
    <a href="/contato/">Contato</a>
    <a class="btn btn--acao btn--largo" href="${zap("Olá! Vim pelo site e queria falar sobre tecidos.")}"
       target="_blank" rel="noopener">Falar no WhatsApp</a>
  </nav>
</header>`;
}

/* ==========================================================================
   RODAPÉ

   Mapa do site de verdade, não três links soltos: em loja com catálogo, o
   rodapé é onde o visitante que rolou a página inteira decide o próximo
   passo — e é de onde o Google entende a estrutura.
   ========================================================================== */
function rodape() {
  const familias = Q.todos(
    "SELECT slug, nome FROM familias WHERE ativo = 1 ORDER BY ordem LIMIT 8");
  const ano = new Date().getFullYear();

  return `
<footer class="rodape trama">
  <div class="env">
    <div class="rodape__topo">
      <div class="rodape__marca">
        ${marca(56)}
        <p class="rodape__frase">${esc(txt("marca.slogan", "Tecido certo, produção sem retrabalho"))}</p>
        <a class="rodape__zap" href="${zap("Olá! Vim pelo site da Izatec.")}" target="_blank" rel="noopener">
          Falar no WhatsApp
        </a>
      </div>

      <nav class="rodape__col" aria-labelledby="rf-tec">
        <h2 class="rodape__tit" id="rf-tec">Tecidos</h2>
        <ul>${familias.map((f) =>
          `<li><a href="/catalogo/${esc(f.slug)}/">${esc(f.nome)}</a></li>`).join("")}</ul>
      </nav>

      <nav class="rodape__col" aria-labelledby="rf-emp">
        <h2 class="rodape__tit" id="rf-emp">A empresa</h2>
        <ul>
          <li><a href="/sobre/">Quem somos</a></li>
          <li><a href="/feed/">Feed</a></li>
          <li><a href="/contato/">Contato</a></li>
          <li><a href="/catalogo/#amostra">Pedir amostra</a></li>
        </ul>
      </nav>

      <div class="rodape__col">
        <h2 class="rodape__tit">Onde estamos</h2>
        <address class="rodape__loja">
          <strong>${esc(txt("loja1.nome", "Caruaru"))}</strong>
          ${esc(txt("loja1.endereco", ""))}<br>
          <span>${esc(txt("loja1.horario", ""))}</span>
        </address>
        <address class="rodape__loja">
          <strong>${esc(txt("loja2.nome", "Toritama"))}</strong>
          ${esc(txt("loja2.endereco", ""))}<br>
          <span>${esc(txt("loja2.horario", ""))}</span>
        </address>
      </div>
    </div>

    <div class="rodape__base">
      <p class="rodape__legal">
        © ${ano} ${esc(txt("marca.nome", "Izatec Tecidos"))} ·
        CNPJ ${esc(txt("marca.cnpj", "00.000.000/0001-00"))}
      </p>

      <!-- ============================================================
           ASSINATURA — obrigatória em todo site do parque.
           O emblema herda 'currentColor' e acende no vermelho da Izatec
           no hover, para a assinatura pertencer a este site e não parecer
           um selo colado por cima.
           ============================================================ -->
      <a class="dev-credit" href="https://luizaugust.me" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M4 20V8l4-4 4 4v12M12 20V10l4-4 4 4v10" fill="none"
                stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        </svg>
        Desenvolvido por <strong>LA Software House</strong>
      </a>
    </div>
  </div>
</footer>`;
}

/* ==========================================================================
   A PÁGINA INTEIRA

   'jsonld' entra como parâmetro e não é montado aqui: cada página sabe o que
   ela é (loja, produto, artigo), e um Schema.org genérico no layout diria a
   mesma coisa para todas — que é o mesmo que não dizer nada.
   ========================================================================== */
function pagina({ titulo, descricao, corpo, atual = "", canonical = "/",
                  jsonld = null, css = "", js = "" }) {
  const nome = txt("marca.nome", "Izatec Tecidos");
  const tit = titulo ? `${titulo} — ${nome}` : `${nome} — Tecidos em Caruaru e Toritama`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<!-- ============================================================
     A CLASSE "js" É COLOCADA ANTES DE QUALQUER CSS RODAR.

     É ela que autoriza o CSS a esconder os blocos que serão revelados na
     rolagem. Se este trecho não executar — script bloqueado, erro de rede —
     a classe não entra e o site aparece INTEIRO e parado, que é o
     comportamento certo. Enfeite que falha não pode apagar a loja.

     Fica aqui, embutido e antes das folhas de estilo, e não no site.js com
     defer: um pouco depois já seria tarde, e os blocos apareceriam para
     sumir em seguida — o pisca que todo site com "reveal" mal feito tem.
     ============================================================ -->
<script>document.documentElement.className += " js";</script>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(tit)}</title>
<meta name="description" content="${esc(descricao || "")}">
<link rel="canonical" href="${SITE}${canonical}">
${CABECALHO_ROBOS ? `<!-- Endereço de TRABALHO: fora do índice. A etiqueta acompanha o
     cabeçalho X-Robots-Tag, porque link de aprovação circula no WhatsApp e
     nem todo robô lê o robots.txt antes de seguir um link. -->
<meta name="robots" content="${CABECALHO_ROBOS}">` : ""}
<meta name="theme-color" content="#E30613">

<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(nome)}">
<meta property="og:title" content="${esc(tit)}">
<meta property="og:description" content="${esc(descricao || "")}">
<meta property="og:url" content="${SITE}${canonical}">
<meta property="og:locale" content="pt_BR">
<meta name="twitter:card" content="summary_large_image">

<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/css/design-system.css">
<link rel="stylesheet" href="/assets/css/site.css">
${css}
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ""}
${Medicao.cabeca()}
</head>
<body>
${cabecalho(atual)}
<main id="conteudo">
${corpo}
</main>
${rodape()}
${Medicao.aviso()}
<script src="/assets/js/site.js" defer></script>
${js}
</body>
</html>`;
}

module.exports = { pagina, cabecalho, rodape, marca, zap, esc, SITE };
