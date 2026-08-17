"use strict";
/* ==========================================================================
   PROVAR — a suíte do Izatec

     node testes/provar.cjs

   ---------------------------------------------------------------------------
   O QUE ESTA SUÍTE COBRE, E POR QUÊ ESSAS COISAS

   Não é cobertura por cobertura. Cada bloco aqui existe porque o defeito
   correspondente ou JÁ ACONTECEU nesta construção, ou custaria dinheiro à
   loja se acontecesse:

     · preço      — uma faixa zerada vendeu tecido por R$ 0,00 na primeira
                    prova da loja. É o defeito mais caro possível aqui.
     · carrinho   — o preço não pode vir do navegador, e o cookie tem de ser
                    inforjável. Sem os dois, o cliente escolhe quanto paga.
     · Feed       — o corpo é texto simples; se o escape falhar, o painel vira
                    porta de entrada para script na página pública.
     · senha      — hash com sal e comparação em tempo constante, mais o freio
                    de tentativa por IP E por conta.
     · rotas      — painel trancado sem sessão, 404 com a cara do site,
                    barra final canônica.

   O banco é um arquivo TEMPORÁRIO. Nenhum teste toca o banco de trabalho —
   essa é a linha que nunca se cruza.
   ========================================================================== */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");

const TEMP = fs.mkdtempSync(path.join(os.tmpdir(), "izatec-teste-"));
process.env.IZATEC_DB = path.join(TEMP, "prova.db");
process.env.IZATEC_SEGREDO = "segredo-fixo-so-do-teste";
process.env.PORT = "5298";

/* O SQLite ainda segura o arquivo quando o processo termina no Windows, e um
   EPERM na faxina derrubava a suíte DEPOIS de ela ter passado — mostrando erro
   onde não havia. A pasta é temporária; o sistema recolhe. */
function limpar() {
  try { fs.rmSync(TEMP, { recursive: true, force: true }); } catch { /* o SO recolhe */ }
}

/* ------------------------------------------------------------- o mínimo */
let ok = 0, falhas = [];
let grupo = "";
const G = (t) => { grupo = t; console.log(`\n  ${t}`); };
function certo(desc, condicao, detalhe = "") {
  if (condicao) { ok++; console.log(`    ✓ ${desc}`); }
  else { falhas.push(`${grupo} › ${desc}${detalhe ? " — " + detalhe : ""}`);
         console.log(`    ✖ ${desc}${detalhe ? " — " + detalhe : ""}`); }
}
const igual = (desc, a, b) => certo(desc, a === b, `esperava ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`);

/* ========================================================================== */
async function principal() {
  /* ======================================================================
     A CRASE DENTRO DO COMENTÁRIO HTML

     Este bloco existe porque o mesmo erro me pegou SEIS vezes construindo
     este site. As páginas são template literals; dentro delas há comentários
     `<!-- ... -->` explicando as decisões; e uma crase escrita nesse
     comentário FECHA A STRING. O arquivo passa a ser código inválido e o
     servidor não sobe — com uma mensagem de erro que aponta para uma linha
     dezenas de linhas depois da verdadeira.

     `require` no alto da suíte já pegaria o arquivo quebrado. O que este
     teste acrescenta é o DIAGNÓSTICO: em vez de "Unexpected identifier",
     ele diz o arquivo, a linha e a frase — que é a diferença entre corrigir
     em dez segundos e caçar por dez minutos.
     ====================================================================== */
  G("Crase dentro de comentário HTML");
  {
    const fsmod = require("node:fs");
    const dir = path.join(__dirname, "..", "src");
    const suspeitas = [];

    /* Precisa olhar a POSIÇÃO da crase na linha, não só a presença.
       `${x ? \`<!-- ... -->\` : ""}` é código legítimo: a crase abre o
       template ANTES de o comentário começar. A primeira versão deste guarda
       acusava esse caso — falso positivo no meu próprio código. */
    for (const arquivo of fsmod.readdirSync(dir).filter((f) => f.endsWith(".js"))) {
      const linhas = fsmod.readFileSync(path.join(dir, arquivo), "utf8").split("\n");
      let aberto = false;   /* comentário HTML atravessando linhas */
      linhas.forEach((linha, i) => {
        /* Trecho da linha que está DENTRO do comentário */
        const abre = linha.indexOf("<!--");
        const fecha = linha.indexOf("-->");
        let dentro = "";
        if (aberto) dentro = fecha >= 0 ? linha.slice(0, fecha) : linha;
        else if (abre >= 0) dentro = fecha > abre ? linha.slice(abre, fecha) : linha.slice(abre);

        if (dentro.includes("`"))
          suspeitas.push(`${arquivo}:${i + 1} — ${linha.trim().slice(0, 60)}`);

        if (abre >= 0 && (fecha < 0 || fecha < abre)) aberto = true;
        else if (fecha >= 0) aberto = false;
      });
    }
    certo("nenhuma crase dentro de comentário HTML", suspeitas.length === 0,
      suspeitas.join(" | "));
  }


  const { Q, txt, ajuste, precoPara } = require("../src/db");
  require("../ferramentas/semear.cjs");

  const P = require("../src/painel");
  const Catalogo = require("../src/catalogo");
  const Loja = require("../src/loja");
  const Feed = require("../src/feed");
  const Inst = require("../src/institucional");

  /* ======================================================================
     BANCO E SEMEADURA
     ====================================================================== */
  G("Banco e conteúdo inicial");
  igual("oito famílias", Q.um("SELECT COUNT(*) c FROM familias").c, 8);
  igual("oito artigos", Q.um("SELECT COUNT(*) c FROM artigos").c, 8);
  igual("três matérias no Feed", Q.um("SELECT COUNT(*) c FROM feed").c, 3);
  certo("dezenove cores", Q.um("SELECT COUNT(*) c FROM cores").c === 19);
  certo("gramatura é NÚMERO, não texto",
    typeof Q.um("SELECT gramatura g FROM artigos WHERE slug='jeans-3d-com-elastano'").g === "number");
  certo("semear roda duas vezes sem duplicar", (() => {
    delete require.cache[require.resolve("../ferramentas/semear.cjs")];
    require("../ferramentas/semear.cjs");
    return Q.um("SELECT COUNT(*) c FROM artigos").c === 8;
  })());
  igual("texto com padrão embutido", txt("marca.nome", "x"), "Izatec Tecidos");
  igual("texto ausente cai no padrão", txt("nao.existe", "reserva"), "reserva");

  /* ======================================================================
     PREÇO — o bloco mais importante da suíte
     ====================================================================== */
  G("Preço por faixa");
  const art = Q.um("SELECT id FROM artigos WHERE slug='jeans-3d-com-elastano'").id;
  Q.roda("UPDATE faixas SET preco = 0 WHERE artigo_id = ?", art);

  igual("faixa ZERADA não zera a venda — vale o preço base",
    precoPara(art, 100, 22.9), 22.9);

  Q.roda("UPDATE faixas SET preco = 20.5 WHERE artigo_id = ? AND de = 50", art);
  igual("acima de 50 pega a faixa de atacado", precoPara(art, 60, 22.9), 20.5);
  igual("abaixo de 50 continua no preço base", precoPara(art, 10, 22.9), 22.9);

  Q.roda("UPDATE faixas SET preco = 18.9 WHERE artigo_id = ? AND de = 100", art);
  igual("a faixa MAIS ALTA aplicável é a que vale", precoPara(art, 250, 22.9), 18.9);
  igual("exatamente no limite da faixa, a faixa vale", precoPara(art, 100, 22.9), 18.9);

  /* ======================================================================
     CARRINHO
     ====================================================================== */
  G("Carrinho");
  const corA = Q.um("SELECT id FROM cores WHERE artigo_id = ? LIMIT 1", art).id;
  Q.roda("UPDATE cores SET preco = 22.9 WHERE id = ?", corA);

  const resFalso = { cabecalhos: {}, setHeader(k, v) { this.cabecalhos[k] = v; } };
  Loja.gravarCarrinho(resFalso, [{ id: corA, q: 60 }]);
  const cookieBom = /carrinho=([^;]*)/.exec(resFalso.cabecalhos["Set-Cookie"])[1];
  const req = (c) => ({ headers: { cookie: `carrinho=${c}` } });

  igual("o carrinho volta do cookie", Loja.lerCarrinho(req(cookieBom)).length, 1);
  certo("o cookie é HttpOnly", resFalso.cabecalhos["Set-Cookie"].includes("HttpOnly"));
  certo("o cookie é SameSite=Lax", resFalso.cabecalhos["Set-Cookie"].includes("SameSite=Lax"));

  /* O ponto central: cookie mexido é cookie recusado. */
  const forjado = encodeURIComponent(
    Buffer.from(JSON.stringify([{ id: corA, q: 9999 }])).toString("base64url") + ".assinaturaInventada");
  igual("carrinho forjado é RECUSADO", Loja.lerCarrinho(req(forjado)).length, 0);
  igual("cookie sem assinatura é recusado",
    Loja.lerCarrinho(req(Buffer.from("[]").toString("base64url"))).length, 0);
  igual("cookie com lixo não derruba", Loja.lerCarrinho(req("abc.def")).length, 0);

  const m1 = Loja.montar([{ id: corA, q: 60 }]);
  igual("o preço vem do BANCO, com a faixa aplicada", m1.linhas[0].preco, 20.5);
  igual("subtotal calculado no servidor", m1.total, 1230);

  /* Preço mandado pelo navegador não tem efeito nenhum: `montar` só olha id
     e quantidade. Se um dia alguém acrescentar `preco` ao cookie, este teste
     é que vai falhar. */
  const m2 = Loja.montar([{ id: corA, q: 60, preco: 0.01 }]);
  igual("preço enviado pelo cliente é ignorado", m2.total, 1230);

  const m3 = Loja.montar([{ id: corA, q: 1 }]);
  igual("quantidade abaixo do corte mínimo sobe para o mínimo", m3.linhas[0].quantidade, 5);
  igual("cor inexistente some do carrinho em vez de dar erro",
    Loja.montar([{ id: 999999, q: 10 }]).linhas.length, 0);

  const corPouca = Q.um("SELECT id, estoque FROM cores WHERE artigo_id = ? LIMIT 1", art);
  Q.roda("UPDATE cores SET estoque = 10 WHERE id = ?", corPouca.id);
  certo("pedir acima do estoque AVISA, não bloqueia",
    Loja.montar([{ id: corPouca.id, q: 100 }]).linhas[0].alerta.includes("encomenda"));

  /* ======================================================================
     FEED — o corpo em texto simples
     ====================================================================== */
  G("Feed — texto simples vira HTML");
  const h = Feed.corpoEmHtml("Primeiro.\n\n## Um subtítulo\n\n- item a\n- item b\n\n**forte** e *fraco*");
  certo("parágrafo", h.includes("<p>Primeiro.</p>"));
  certo("subtítulo", h.includes("<h2>Um subtítulo</h2>"));
  certo("lista com dois itens", h.includes("<li>item a</li>") && h.includes("<li>item b</li>"));
  certo("negrito", h.includes("<strong>forte</strong>"));
  certo("itálico", h.includes("<em>fraco</em>"));

  const perigo = Feed.corpoEmHtml('<script>alert(1)</script> e <img src=x onerror=alert(2)>');
  certo("HTML escrito no painel vira TEXTO, não etiqueta",
    !perigo.includes("<script") && !perigo.includes("<img") && perigo.includes("&lt;script&gt;"));
  igual("corpo vazio não quebra", Feed.corpoEmHtml(""), "");
  igual("corpo nulo não quebra", Feed.corpoEmHtml(null), "");

  /* ======================================================================
     SENHA E SESSÃO
     ====================================================================== */
  G("Senha e freio de tentativa");
  const guardada = P.cifrar("umaSenhaBoa123");
  certo("a senha certa confere", P.conferir("umaSenhaBoa123", guardada));
  certo("a senha errada não confere", !P.conferir("umaSenhaBoa124", guardada));
  certo("a senha não aparece no que é guardado", !guardada.includes("umaSenhaBoa123"));
  certo("cada usuário tem sal próprio", P.cifrar("igual") !== P.cifrar("igual"));
  certo("hash corrompido não derruba", !P.conferir("x", "lixo"));

  const chave = "ip:teste-" + crypto.randomBytes(3).toString("hex");
  for (let i = 0; i < 6; i++) { certo(`tentativa ${i + 1} de 6 é permitida`, P.podeTentar(chave)); P.anotarFalha(chave); }
  certo("a sétima tentativa é barrada", !P.podeTentar(chave));
  P.limparFalhas(chave);
  certo("entrar certo limpa o balde", P.podeTentar(chave));

  G("Papéis");
  const papel = (p) => ({ papel: p });
  certo("dono entra nos dois painéis",
    P.podeVer(papel("dono"), "admin") && P.podeVer(papel("dono"), "restrito"));
  certo("quem cuida do site NÃO entra nos produtos",
    P.podeVer(papel("admin"), "admin") && !P.podeVer(papel("admin"), "restrito"));
  certo("quem cuida do estoque NÃO entra no site",
    !P.podeVer(papel("estoque"), "admin") && P.podeVer(papel("estoque"), "restrito"));
  certo("sem usuário, nenhum painel", !P.podeVer(null, "admin") && !P.podeVer(null, "restrito"));

  /* ======================================================================
     CATÁLOGO
     ====================================================================== */
  G("Catálogo e filtros");
  const conta = (html) => Number(/(\d+) artigos?/.exec(html)[1]);
  igual("sem filtro, todos os artigos", conta(Catalogo.lista("", {})), 8);
  igual("acima de 300 g/m²", conta(Catalogo.lista("", { gmin: "301" })), 2);
  igual("até 200 g/m²", conta(Catalogo.lista("", { gmax: "200" })), 3);
  igual("com elastano", conta(Catalogo.lista("", { elastano: "1" })), 2);
  igual("os dois filtros juntos", conta(Catalogo.lista("", { gmin: "301", elastano: "1" })), 1);
  certo("filtro com texto no lugar de número não derruba",
    typeof Catalogo.lista("", { gmin: "'; DROP TABLE artigos; --" }) === "string");
  igual("os artigos continuam lá depois disso", Q.um("SELECT COUNT(*) c FROM artigos").c, 8);
  certo("uma família só", conta(Catalogo.lista("jeans", {})) === 3);
  igual("família inexistente devolve nulo", Catalogo.lista("nao-existe", {}), null);
  igual("artigo em família errada devolve nulo",
    Catalogo.artigo("malha", "jeans-3d-com-elastano"), null);

  const pagArt = Catalogo.artigo("jeans", "jeans-3d-com-elastano");
  certo("a ficha aparece ANTES do preço na página do artigo",
    pagArt.indexOf("Ficha técnica") < pagArt.indexOf("Preço por quantidade"));
  certo("o filtro vira LINK, para poder ser compartilhado",
    Catalogo.lista("", {}).includes('href="/catalogo/?gmin=301"'));

  G("Escape de HTML nas páginas");
  ajuste("marca.nome", '<script>alert(1)</script>');
  certo("nome com etiqueta não vira script na página",
    !Inst.sobre().includes("<script>alert(1)</script>"));
  ajuste("marca.nome", "Izatec Tecidos");

  /* ======================================================================
     ENDEREÇO E INDEXAÇÃO

     O canonical errado é o defeito mais caro e mais silencioso desta
     arquitetura: manda o Google indexar OUTRO site, e nada na tela denuncia.
     E um endereço de trabalho indexado vira cópia do site real na busca —
     os dois competem, e tirar do índice depois leva semanas.

     O módulo é lido de novo a cada caso porque ele congela a decisão na
     carga (é uma constante, não uma função) — que é justamente o que a gente
     quer em produção: o endereço não muda no meio da vida do processo.
     ====================================================================== */
  G("Endereço e indexação");
  {
    const caminho = require.resolve("../src/endereco");
    const recarregar = (env) => {
      const antes = { site: process.env.IZATEC_SITE, idx: process.env.IZATEC_INDEXAVEL };
      Object.assign(process.env, env);
      delete require.cache[caminho];
      const mod = require(caminho);
      process.env.IZATEC_SITE = antes.site;
      if (antes.idx === undefined) delete process.env.IZATEC_INDEXAVEL;
      else process.env.IZATEC_INDEXAVEL = antes.idx;
      return mod;
    };

    const trab = recarregar({ IZATEC_SITE: "https://izatec.projetos.luizaugust.me",
      IZATEC_INDEXAVEL: "" });
    igual("o endereço de trabalho é o padrão", trab.SITE,
      "https://izatec.projetos.luizaugust.me");
    certo("...e nasce FORA do índice", trab.INDEXAVEL === false);
    certo("...com robots fechando o site inteiro", /^Disallow: \/$/m.test(trab.robots()));
    certo("...sem apontar sitemap (seria contradição)", !trab.robots().includes("Sitemap:"));
    certo("...e com X-Robots-Tag de noindex",
      String(trab.CABECALHO_ROBOS).includes("noindex"));

    const prod = recarregar({ IZATEC_SITE: "https://izatectecidos.com.br",
      IZATEC_INDEXAVEL: "" });
    certo("o domínio público é indexável", prod.INDEXAVEL === true);
    certo("...sem cabeçalho de noindex", prod.CABECALHO_ROBOS === null);
    certo("...e o robots aponta o sitemap DELE",
      prod.robots().includes("Sitemap: https://izatectecidos.com.br/sitemap.xml"));
    certo("...e não fecha o site", !/^Disallow: \/$/m.test(prod.robots()));

    /* A barra final duplicada é o erro clássico: `SITE + "/catalogo/"` com
       SITE terminando em barra vira `//catalogo/`, que o Google trata como
       outra página. */
    igual("a barra do fim é removida",
      recarregar({ IZATEC_SITE: "https://izatectecidos.com.br///" }).SITE,
      "https://izatectecidos.com.br");

    igual("o host sai sem o esquema",
      recarregar({ IZATEC_SITE: "https://izatectecidos.com.br" }).HOST,
      "izatectecidos.com.br");

    /* A conferência é por SUFIXO: um domínio de terceiro que apenas CONTENHA
       o texto no meio não pode herdar o tratamento do nosso subdomínio. */
    certo("domínio alheio parecido NÃO vira endereço de trabalho",
      recarregar({ IZATEC_SITE: "https://projetos.luizaugust.me.outro.com",
        IZATEC_INDEXAVEL: "" }).INDEXAVEL === true);
    certo("localhost é tratado como trabalho",
      recarregar({ IZATEC_SITE: "http://localhost:5198", IZATEC_INDEXAVEL: "" })
        .INDEXAVEL === false);

    certo("dá para forçar a indexação de um endereço de trabalho",
      recarregar({ IZATEC_SITE: "https://izatec.projetos.luizaugust.me",
        IZATEC_INDEXAVEL: "sim" }).INDEXAVEL === true);
    certo("e dá para tirar do índice um domínio público",
      recarregar({ IZATEC_SITE: "https://izatectecidos.com.br",
        IZATEC_INDEXAVEL: "nao" }).INDEXAVEL === false);

    /* Devolve o módulo ao estado do teste (endereço de trabalho), que é o que
       as rotas mais abaixo vão conferir. */
    recarregar({ IZATEC_SITE: "https://izatec.projetos.luizaugust.me" });
  }

  /* ======================================================================
     IMAGENS

     Foto quebrada num catálogo de tecidos não é detalhe estético: é o produto
     desaparecendo da vitrine. E `width`/`height` faltando é a página pulando
     debaixo do dedo de quem está lendo.
     ====================================================================== */
  G("Imagens");
  {
    const fsmod = require("node:fs");
    const Imagens = require("../src/imagens");
    const pasta = path.join(__dirname, "..", "assets", "img", "banco");

    /* Cada foto declarada no módulo existe MESMO no disco. Sem este teste, um
       arquivo renomeado só apareceria como buraco na página. */
    const faltando = Object.entries(Imagens.PADRAO)
      .filter(([, v]) => !fsmod.existsSync(path.join(pasta, v.arq)))
      .map(([k, v]) => `${k} → ${v.arq}`);
    certo("toda foto declarada existe no disco", faltando.length === 0, faltando.join(", "));

    const arquivos = fsmod.readdirSync(pasta).filter((f) => f.endsWith(".jpg"));
    certo("o acervo tem as 24 fotos", arquivos.length >= 24, `${arquivos.length} encontradas`);

    /* Cada arquivo é JPEG de verdade (FF D8 FF), não uma página de erro que o
       download gravou com nome .jpg. */
    const naoJpeg = arquivos.filter((f) => {
      const b = fsmod.readFileSync(path.join(pasta, f)).subarray(0, 3);
      return !(b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF);
    });
    certo("todo arquivo é JPEG de verdade", naoJpeg.length === 0, naoJpeg.join(", "));

    /* Peso: 700 KB numa foto de cartão é meio segundo a mais no 3G do galpão. */
    const pesadas = arquivos.filter((f) => fsmod.statSync(path.join(pasta, f)).size > 700 * 1024);
    certo("nenhuma foto passa de 700 KB", pesadas.length === 0, pesadas.join(", "));

    const marca = Imagens.img("capa", { forma: "capa", prioridade: true, decorativa: true });
    certo("a capa NÃO é lazy", !marca.includes('loading="lazy"'));
    certo("a capa tem prioridade alta", marca.includes('fetchpriority="high"'));
    certo("imagem decorativa tem alt vazio e aria-hidden",
      marca.includes('alt=""') && marca.includes('aria-hidden="true"'));

    const cartao = Imagens.img("fam:jeans", { alt: "Jeans", forma: "quadro" });
    certo("cartão é lazy", cartao.includes('loading="lazy"'));
    certo("cartão reserva o espaço (width e height)",
      cartao.includes('width="700"') && cartao.includes('height="700"'));
    certo("cartão leva o alt informado", cartao.includes('alt="Jeans"'));

    igual("chave sem foto devolve string vazia", Imagens.img("nao:existe"), "");
    certo("o caminho do banco vence o padrão",
      Imagens.img("fam:jeans", { doBanco: "/assets/img/uploads/outra.jpg" })
        .includes("/assets/img/uploads/outra.jpg"));
    certo("alt com aspas é escapado",
      Imagens.img("fam:jeans", { alt: 'a"b' }).includes("&quot;"));

    /* As páginas realmente pedem as fotos */
    const home = require("../src/paginas").home();
    certo("a home mostra a foto da capa", home.includes("capa-jeans-"));
    certo("a home tem as fotos das oito famílias",
      (home.match(/fam-[a-z]+-\d+\.jpg/g) || []).length >= 8);
    certo("a home revela blocos ao rolar", home.includes('class="revelar"') || home.includes(" revelar\""));
    certo("o cartão de artigo tem foto", home.includes("art-jeans-3d-"));
  }

  /* ======================================================================
     SERVIDOR — as rotas de verdade
     ====================================================================== */
  G("Servidor e rotas");
  require("../server.js");
  await new Promise((r) => setTimeout(r, 400));

  const pedir = (caminho, opcoes = {}) => new Promise((resolver) => {
    const req = http.request({ host: "127.0.0.1", port: 5298, path: caminho,
      method: opcoes.metodo || "GET", headers: opcoes.cabecalhos || {} }, (res) => {
      let corpo = "";
      res.on("data", (d) => corpo += d);
      res.on("end", () => resolver({ codigo: res.statusCode, cab: res.headers, corpo }));
    });
    req.on("error", () => resolver({ codigo: 0, cab: {}, corpo: "" }));
    if (opcoes.corpo) req.write(opcoes.corpo);
    req.end();
  });

  const home = await pedir("/");
  igual("home responde 200", home.codigo, 200);
  certo("a assinatura está no rodapé", home.corpo.includes("luizaugust.me"));
  certo("o CNPJ está no rodapé", home.corpo.includes("CNPJ"));
  certo("não sopra o tipo do arquivo", home.cab["x-content-type-options"] === "nosniff");

  igual("catálogo", (await pedir("/catalogo/")).codigo, 200);
  igual("família", (await pedir("/catalogo/jeans/")).codigo, 200);
  igual("artigo", (await pedir("/catalogo/jeans/jeans-3d-com-elastano/")).codigo, 200);
  igual("Feed", (await pedir("/feed/")).codigo, 200);
  igual("matéria", (await pedir("/feed/diferenca-entre-sarja-e-jeans/")).codigo, 200);
  igual("sobre", (await pedir("/sobre/")).codigo, 200);
  igual("contato", (await pedir("/contato/")).codigo, 200);
  igual("saúde", (await pedir("/saude")).codigo, 200);

  const semBarra = await pedir("/catalogo");
  igual("sem barra final, redireciona", semBarra.codigo, 303);
  igual("...para o endereço com barra", semBarra.cab.location, "/catalogo/");

  const perdida = await pedir("/pagina-que-nao-existe/");
  igual("404 de verdade", perdida.codigo, 404);
  certo("o 404 tem a cara do site", perdida.corpo.includes("Essa página não existe"));

  /* A suíte roda no endereço de TRABALHO (é o padrão), então o servidor tem de
     estar fechado para robô — e é assim que ele vai subir agora. */
  const robots = await pedir("/robots.txt");
  certo("no endereço de trabalho, o robots fecha tudo",
    /^Disallow: \/$/m.test(robots.corpo));
  const mapa = await pedir("/sitemap.xml");
  certo("...e o sitemap sai vazio", !mapa.corpo.includes("<loc>"));
  certo("...e é XML válido mesmo vazio", mapa.corpo.includes("</urlset>"));

  certo("toda resposta leva X-Robots-Tag de noindex",
    String(home.cab["x-robots-tag"] || "").includes("noindex"));
  certo("o CSS também leva",
    String((await pedir("/assets/css/site.css")).cab["x-robots-tag"] || "").includes("noindex"));
  certo("a página traz a etiqueta <meta robots>",
    home.corpo.includes('name="robots"') && home.corpo.includes("noindex"));
  certo("o canonical usa o endereço configurado",
    home.corpo.includes('rel="canonical" href="https://izatec.projetos.luizaugust.me/"'));

  G("Painéis trancados");
  for (const p of ["/admin/", "/restrito/", "/admin/usuarios", "/restrito/pedidos"]) {
    const r = await pedir(p);
    certo(`${p} pede senha`, r.corpo.includes('name="senha"') && !r.corpo.includes("lado__nav"));
  }
  const adm = await pedir("/admin/");
  certo("painel não é indexável", String(adm.cab["x-robots-tag"] || "").includes("noindex"));
  certo("painel não entra em iframe", adm.cab["x-frame-options"] === "DENY");

  const entrada = await pedir("/admin/entrar", { metodo: "POST",
    cabecalhos: { "Content-Type": "application/x-www-form-urlencoded" },
    corpo: "usuario=dono&senha=errada" });
  igual("senha errada não entra", entrada.codigo, 401);
  certo("o erro não diz se a conta existe",
    entrada.corpo.includes("Usuário ou senha não conferem"));

  G("Arquivos e caminhos");
  igual("o CSS sai", (await pedir("/assets/css/site.css")).codigo, 200);
  for (const p of ["/server.js", "/package.json", "/src/db.js", "/data/izatec.db",
                   "/assets/../server.js", "/.env", "/.git/config"]) {
    const r = await pedir(p);
    certo(`${p} NÃO sai pela web`, r.codigo === 404 || r.codigo === 303,
      "veio " + r.codigo);
  }

  G("Envio de formulário");
  const semNada = await pedir("/contato", { metodo: "POST",
    cabecalhos: { "Content-Type": "application/x-www-form-urlencoded" }, corpo: "nome=" });
  certo("contato sem dados não grava", Q.um("SELECT COUNT(*) c FROM contatos").c === 0);
  certo("...e responde a página, não um erro", semNada.codigo === 200);

  const bom = await pedir("/contato", { metodo: "POST",
    cabecalhos: { "Content-Type": "application/x-www-form-urlencoded" },
    corpo: "nome=ZZ+QA&telefone=81900000000&mensagem=teste" });
  igual("contato preenchido grava", Q.um("SELECT COUNT(*) c FROM contatos").c, 1);
  certo("...e mostra o aviso", bom.corpo.includes("Mensagem enviada"));

  /* Sete envios seguidos: o oitavo é o limite do balde do site. */
  let barrado = 0;
  for (let i = 0; i < 12; i++) {
    const r = await pedir("/contato", { metodo: "POST",
      cabecalhos: { "Content-Type": "application/x-www-form-urlencoded" },
      corpo: `nome=ZZ+QA${i}&telefone=81900000000&mensagem=x` });
    if (r.codigo === 429) barrado++;
  }
  certo("o freio segura o robô de formulário", barrado > 0, `${barrado} barrados de 12`);

  /* ====================================================================== */
  console.log(`\n  ${"─".repeat(52)}`);
  if (falhas.length) {
    console.log(`  ${ok} passaram · ${falhas.length} FALHARAM\n`);
    falhas.forEach((f) => console.log(`    ✖ ${f}`));
    console.log("");
    process.exitCode = 1;
  } else {
    console.log(`  ${ok}/${ok} — tudo certo\n`);
  }

  limpar();
  process.exit(process.exitCode || 0);
}

principal().catch((e) => {
  console.error("\n  A suíte quebrou:", e);
  limpar();
  process.exit(1);
});
