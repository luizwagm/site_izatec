"use strict";
/* ==========================================================================
   IZATEC TECIDOS — servidor

   Node puro, sem framework. O site tem cerca de quinze rotas; um framework
   aqui traria mais superfície de atualização de segurança do que economia de
   código — e este servidor precisa ficar de pé por anos sem manutenção.

   AS PÁGINAS SÃO GERADAS A CADA PEDIDO, a partir do banco. Não existe arquivo
   HTML com conteúdo dentro para o painel reescrever, e por isso "editou no
   admin, apareceu no site" é consequência da arquitetura — não de um passo de
   publicação que alguém pode esquecer de rodar.
   ========================================================================== */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { URL } = require("node:url");

const { Q, txt, CAMINHO } = require("./src/db");
const Endereco = require("./src/endereco");
const Paginas = require("./src/paginas");
const Catalogo = require("./src/catalogo");
const Loja = require("./src/loja");
const Feed = require("./src/feed");
const Inst = require("./src/institucional");
const Admin = require("./src/admin");
const Restrito = require("./src/restrito");
const VERSAO = require("./package.json").version;

const PORTA = Number(process.env.PORT) || 5198;
const HOST = process.env.HOST || "127.0.0.1";
const RAIZ = __dirname;

/* ------------------------------------------------------------ tipos MIME */
const TIPOS = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".avif": "image/avif", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function responder(res, codigo, corpo, tipo = "text/html; charset=utf-8", extra = {}) {
  res.writeHead(codigo, Object.assign({
    "Content-Type": tipo,
    /* Cabeçalhos que não custam nada e fecham três portas conhecidas:
       tipo adivinhado, enquadramento em iframe alheio e vazamento do
       endereço completo no Referer para outro site. */
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    /* No endereço de trabalho, TODA resposta sai marcada como fora do índice —
       inclusive a imagem e o CSS. O robots.txt evita a visita; este cabeçalho
       evita a indexação de quem chegou por um link, e link de aprovação
       circula no WhatsApp o tempo todo. */
    ...(Endereco.CABECALHO_ROBOS ? { "X-Robots-Tag": Endereco.CABECALHO_ROBOS } : {}),
  }, extra));
  res.end(corpo);
}

/* ==========================================================================
   ARQUIVOS ESTÁTICOS

   Autorizados por LUGAR, e não por extensão. A diferença já custou caro em
   outro projeto do parque: uma lista de extensões permitidas deixava
   `GET /server.js` responder 200, porque `.js` estava na lista.

   Aqui só saem arquivos de dentro de `/assets`, e o caminho é resolvido e
   conferido antes de abrir — `../` não escapa.
   ========================================================================== */
function estatico(req, res, caminho) {
  const alvo = path.resolve(RAIZ, "." + caminho);
  const permitido = path.join(RAIZ, "assets");
  if (!alvo.startsWith(permitido)) return false;

  let info;
  try { info = fs.statSync(alvo); } catch { return false; }
  if (!info.isFile()) return false;

  const ext = path.extname(alvo).toLowerCase();
  const etag = `W/"${info.size.toString(36)}-${Math.floor(info.mtimeMs).toString(36)}"`;
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, { ETag: etag }); res.end(); return true;
  }

  responder(res, 200, fs.readFileSync(alvo), TIPOS[ext] || "application/octet-stream", {
    ETag: etag,
    /* `no-cache` + ETag, e não `max-age`: com max-age o navegador nem
       pergunta, e uma correção de CSS levaria horas para chegar a quem já
       visitou o site. Com ETag, a pergunta custa um 304 vazio. */
    "Cache-Control": ext === ".woff2" ? "public, max-age=31536000, immutable" : "no-cache",
  });
  return true;
}

/* ==========================================================================
   ACESSOS — contagem sem cookie e sem terceiro

   O IP entra como HASH com sal do dia. Dá para contar visitante único e não
   dá para saber de quem era o endereço depois — endereço IP é dado pessoal
   pela LGPD, e o que não se guarda não vaza.
   ========================================================================== */
const SAL = crypto.randomBytes(16).toString("hex");
function registrar(req, rota) {
  try {
    const ip = (req.headers["x-forwarded-for"] || "").split(",").pop().trim()
      || req.socket.remoteAddress || "";
    const dia = new Date().toISOString().slice(0, 10);
    const hash = crypto.createHash("sha256").update(SAL + dia + ip).digest("hex").slice(0, 16);
    Q.roda("INSERT INTO acessos (dia, rota, ip_hash) VALUES (?,?,?)", dia, rota, hash);
  } catch { /* contagem nunca derruba página */ }
}

/* ==========================================================================
   CORPO DO POST

   Limite de 64 KB. Formulário de tecido não tem nada que passe disso, e sem
   teto um pedido malicioso mantém o processo lendo até a memória acabar —
   derrubando o site sem precisar de nenhuma falha de código.
   ========================================================================== */
function lerCorpo(req) {
  return new Promise((ok, falha) => {
    let bruto = "", tamanho = 0;
    req.on("data", (parte) => {
      tamanho += parte.length;
      if (tamanho > 64 * 1024) { req.destroy(); return falha(new Error("corpo grande demais")); }
      bruto += parte;
    });
    req.on("end", () => {
      const d = {};
      for (const [k, v] of new URLSearchParams(bruto)) d[k] = v;
      ok(d);
    });
    req.on("error", falha);
  });
}

/* ==========================================================================
   FREIO DE ENVIO

   Balde por IP, só nos POSTs públicos. Não é defesa contra ataque grande — é
   o que impede um robô de encher a tabela de contatos com mil linhas em um
   minuto, que é o problema real de formulário aberto na internet.

   O IP vem do ÚLTIMO item do X-Forwarded-For, não do primeiro: o primeiro é
   texto que o cliente escreve, e ler dali já custou caro em outro projeto do
   parque. O último é o que o nosso nginx acrescentou.
   ========================================================================== */
const baldes = new Map();
function freio(req, limite = 8, janelaMs = 10 * 60 * 1000) {
  const ip = (req.headers["x-forwarded-for"] || "").split(",").pop().trim()
    || req.socket.remoteAddress || "";
  const agora = Date.now();
  const b = baldes.get(ip) || { n: 0, ate: agora + janelaMs };
  if (agora > b.ate) { b.n = 0; b.ate = agora + janelaMs; }
  b.n += 1;
  baldes.set(ip, b);
  if (baldes.size > 5000) baldes.clear();   /* teto de memória */
  return b.n <= limite;
}

function redir(res, para, extra = {}) {
  res.writeHead(303, Object.assign({ Location: para }, extra));
  res.end();
}

/* ========================================================================== */
const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || Endereco.HOST}`);
  const p = decodeURIComponent(url.pathname);
  const q = Object.fromEntries(url.searchParams);

  /* Metadados de repositório nunca saem pela web. */
  if (/\/\.(git|env)/.test(p)) return responder(res, 404, "não encontrado", "text/plain; charset=utf-8");

  if (p.startsWith("/assets/") && estatico(req, res, p)) return;

  /* ==========================================================================
     BARRA FINAL CANÔNICA

     /catalogo e /catalogo/ são a MESMA página, e o Google trata as duas como
     duplicadas se as duas responderem 200. Uma redireciona para a outra.

     AS ROTAS DE OPERAÇÃO FICAM DE FORA, e isso não é detalhe: a primeira
     versão mandava /saude para /saude/, que não existe. O monitoramento e o
     verificador do deploy batem em /saude — e passariam a receber 303 seguido
     de 404, reportando o site como fora do ar com o site no ar.
     ========================================================================== */
  const OPERACAO = ["/saude", "/robots.txt", "/sitemap.xml"];
  if (p.length > 1 && !p.endsWith("/") && !path.extname(p) && req.method === "GET"
      && !OPERACAO.includes(p)
      && !p.startsWith("/admin") && !p.startsWith("/restrito")) {
    return redir(res, p + "/" + (url.search || ""));
  }

  const partes = p.split("/").filter(Boolean);

  try {
    /* ==================================================== painel /admin */
    if (partes[0] === "admin") return await Admin.atender(req, res, partes.slice(1), q, lerCorpo);
    if (partes[0] === "restrito") return await Restrito.atender(req, res, partes.slice(1), q, lerCorpo);

    /* ======================================================== POSTs do site */
    if (req.method === "POST") {
      if (!freio(req)) return responder(res, 429, Inst.erro404());
      const d = await lerCorpo(req);

      /* ------------------------------------------------------- carrinho */
      if (p === "/carrinho/adicionar") {
        const cor = Q.um(`SELECT c.id, a.minimo FROM cores c JOIN artigos a ON a.id=c.artigo_id
                          WHERE c.id = ? AND c.ativo = 1`, Number(d.cor_id));
        if (!cor) return redir(res, "/catalogo/");
        const itens = Loja.lerCarrinho(req);
        const qtd = Math.max(cor.minimo, Number(String(d.quantidade).replace(",", ".")) || 0);
        const achou = itens.find((i) => Number(i.id) === cor.id);
        if (achou) achou.q = Number(achou.q) + qtd; else itens.push({ id: cor.id, q: qtd });
        Loja.gravarCarrinho(res, itens);
        return redir(res, "/carrinho/");
      }

      if (p === "/carrinho/atualizar") {
        let itens = Loja.lerCarrinho(req);
        if (d.remover) itens = itens.filter((i) => Number(i.id) !== Number(d.remover));
        itens = itens.map((i) => {
          const novo = d[`q_${i.id}`];
          return novo === undefined ? i : { id: i.id, q: Number(String(novo).replace(",", ".")) || 0 };
        }).filter((i) => i.q > 0);
        Loja.gravarCarrinho(res, itens);
        return redir(res, "/carrinho/");
      }

      /* --------------------------------------------------------- pedido */
      if (p === "/pedido/enviar") {
        if (!d.nome || !d.telefone || !d.cidade) return redir(res, "/pedido/");
        const feito = Loja.gravarPedido(d, Loja.lerCarrinho(req));
        if (!feito) return redir(res, "/carrinho/");
        /* O carrinho é esvaziado JUNTO com a resposta: se ficasse para depois,
           um F5 na página de obrigado repetiria o pedido. */
        Loja.gravarCarrinho(res, []);
        return responder(res, 200,
          Loja.paginaObrigado(feito.codigo, feito.total, feito.linhas));
      }

      /* -------------------------------------------------------- amostra */
      if (p === "/amostra") {
        if (!d.nome || !d.telefone) return redir(res, "/catalogo/#amostra");
        Q.roda(`INSERT INTO amostras (nome, empresa, telefone, cidade, artigos)
                VALUES (?,?,?,?,?)`,
          String(d.nome).slice(0, 120), String(d.empresa || "").slice(0, 120),
          String(d.telefone).slice(0, 20), String(d.cidade || "").slice(0, 80),
          String(d.artigos || "").slice(0, 600));
        return responder(res, 200, Paginas.amostraEnviada(d.artigos || ""));
      }

      /* -------------------------------------------------------- contato */
      if (p === "/contato") {
        if (!d.nome || !d.telefone || !d.mensagem)
          return responder(res, 200, Inst.contato("Preencha nome, WhatsApp e mensagem."));
        Q.roda(`INSERT INTO contatos (nome, telefone, email, assunto, mensagem)
                VALUES (?,?,?,?,?)`,
          String(d.nome).slice(0, 120), String(d.telefone).slice(0, 20),
          String(d.email || "").slice(0, 160), String(d.assunto || "").slice(0, 120),
          String(d.mensagem).slice(0, 1500));
        return responder(res, 200, Inst.contato("", true));
      }

      return responder(res, 404, Inst.erro404());
    }

    /* ------------------------------------------------------------- home */
    if (p === "/" || p === "/index.html") {
      registrar(req, "/");
      return responder(res, 200, Paginas.home());
    }

    /* ---------------------------------------------------------- catálogo */
    if (partes[0] === "catalogo") {
      registrar(req, "/catalogo/");
      if (partes.length === 1) return responder(res, 200, Catalogo.lista("", q));
      if (partes.length === 2) {
        const html = Catalogo.lista(partes[1], q);
        return html ? responder(res, 200, html) : responder(res, 404, Inst.erro404());
      }
      if (partes.length === 3) {
        const html = Catalogo.artigo(partes[1], partes[2]);
        return html ? responder(res, 200, html) : responder(res, 404, Inst.erro404());
      }
    }

    /* -------------------------------------------------------------- loja */
    if (p === "/carrinho/") { return responder(res, 200, Loja.paginaCarrinho(req)); }
    if (p === "/pedido/") {
      const html = Loja.paginaFechar(req);
      return html ? responder(res, 200, html) : redir(res, "/carrinho/");
    }

    /* -------------------------------------------------------------- feed */
    if (partes[0] === "feed") {
      registrar(req, "/feed/");
      if (partes.length === 1) return responder(res, 200, Feed.indice());
      const html = Feed.materia(partes[1]);
      return html ? responder(res, 200, html) : responder(res, 404, Inst.erro404());
    }

    /* ----------------------------------------------------- institucional */
    if (p === "/sobre/") { registrar(req, "/sobre/"); return responder(res, 200, Inst.sobre()); }
    if (p === "/contato/") { registrar(req, "/contato/"); return responder(res, 200, Inst.contato()); }

    /* --------------------------------------------------------- operação */
    if (p === "/saude") {
      const artigos = Q.um("SELECT COUNT(*) c FROM artigos").c;
      return responder(res, 200, JSON.stringify({ ok: true, versao: VERSAO, artigos }),
        TIPOS[".json"]);
    }

    if (p === "/robots.txt") {
      return responder(res, 200, Endereco.robots(), TIPOS[".txt"]);
    }

    if (p === "/sitemap.xml") {
      /* No endereço de trabalho o sitemap sai VAZIO, e não com as URLs de
         trabalho dentro. Um sitemap preenchido é um convite explícito para
         indexar — contradizendo o robots.txt que acabou de pedir o contrário. */
      const urls = Endereco.INDEXAVEL
        ? ["/", "/catalogo/", "/sobre/", "/feed/", "/contato/"] : [];
      if (Endereco.INDEXAVEL) {
        for (const f of Q.todos("SELECT slug FROM familias WHERE ativo=1")) urls.push(`/catalogo/${f.slug}/`);
        for (const a of Q.todos(`SELECT a.slug, f.slug fs FROM artigos a
          JOIN familias f ON f.id=a.familia_id WHERE a.ativo=1`)) urls.push(`/catalogo/${a.fs}/${a.slug}/`);
        for (const m of Q.todos("SELECT slug FROM feed WHERE publicado=1")) urls.push(`/feed/${m.slug}/`);
      }
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${Endereco.SITE}${u}</loc></url>`).join("\n")}
</urlset>`;
      return responder(res, 200, xml, TIPOS[".xml"]);
    }

    return responder(res, 404, Inst.erro404());
  } catch (e) {
    console.error("  ✖", p, "—", e.message);
    return responder(res, 500, "Erro interno", "text/plain; charset=utf-8");
  }
});

/* ==========================================================================
   PRIMEIRO ACESSO

   Sem nenhum usuário, os painéis ficariam trancados por fora. A saída NÃO é
   uma senha padrão ("admin/admin"): essa é a primeira coisa que um robô testa,
   e ninguém troca depois.

   Aqui o primeiro usuário nasce com senha SORTEADA, escrita uma única vez no
   log da subida. Quem tem acesso ao servidor lê e troca; quem não tem, não
   descobre — e não existe senha conhecida esperando para ser adivinhada.
   ========================================================================== */
function primeiroUsuario() {
  if (Q.um("SELECT COUNT(*) c FROM usuarios").c) return null;
  const senha = crypto.randomBytes(9).toString("base64url");
  const P = require("./src/painel");
  Q.roda("INSERT INTO usuarios (usuario, nome, senha, papel) VALUES (?,?,?,?)",
    "dono", "Izatec", P.cifrar(senha), "dono");
  return senha;
}

/* Escuta nos dois loopbacks: o nginx pode resolver "localhost" como ::1, e um
   servidor só em 127.0.0.1 responderia 502 sem explicação. */
servidor.listen(PORTA, HOST, () => {
  const senha = primeiroUsuario();
  console.log(`
  Izatec Tecidos — v${VERSAO}
  ─────────────────────────────────────────────
  Escutando http://${HOST}:${PORTA}/
  Endereço  ${Endereco.SITE}${Endereco.INDEXAVEL
    ? "   (indexável)"
    : "\n            ⚠ endereço de TRABALHO — fora do índice do Google"}
  Painéis   /admin (seções do site) · /restrito (produtos)
  Banco     ${CAMINHO}
  Artigos ${Q.um("SELECT COUNT(*) c FROM artigos").c} · Famílias ${Q.um("SELECT COUNT(*) c FROM familias").c} · Feed ${Q.um("SELECT COUNT(*) c FROM feed").c}
`);
  if (senha) console.log(
`  ┌──────────────────────────────────────────────────────┐
  │  PRIMEIRO ACESSO — anote agora, aparece uma vez só   │
  │                                                      │
  │    usuário:  dono                                    │
  │    senha:    ${senha.padEnd(40)}│
  │                                                      │
  │  Troque em /admin → Usuários assim que entrar.       │
  └──────────────────────────────────────────────────────┘
`);
});
