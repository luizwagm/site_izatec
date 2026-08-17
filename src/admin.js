"use strict";
/* ==========================================================================
   /admin — O PAINEL DO SITE

   ---------------------------------------------------------------------------
   A DIVISÃO ENTRE OS DOIS PAINÉIS, E POR QUE ELA EXISTE

   /admin    → as SEÇÕES do site: textos, Feed, mensagens recebidas, acessos
   /restrito → os PRODUTOS: famílias, artigos, cores, preço, estoque, pedidos

   Não é gosto: são dois trabalhos com ritmos diferentes. O texto da home muda
   duas vezes por ano; o preço do jeans muda toda semana. Juntar os dois num
   painel só faria quem cadastra tecido o dia inteiro passar por dez telas de
   texto institucional para chegar onde trabalha.

   E tem o lado do risco: quem mexe em estoque não precisa poder reescrever a
   página inteira do site. Papéis separados, painéis separados.
   ========================================================================== */
const { Q, txt, ajuste } = require("./db");
const P = require("./painel");
const esc = P.esc;
const VERSAO = require("../package.json").version;

const MENU = [
  { grupo: "Visão geral", itens: [
    { rota: "", rotulo: "Início" },
    { rota: "acessos", rotulo: "Acessos" },
  ] },
  { grupo: "Conteúdo do site", itens: [
    { rota: "textos", rotulo: "Textos das seções" },
    { rota: "feed", rotulo: "Feed" },
  ] },
  { grupo: "Recebidos", itens: [
    { rota: "amostras", rotulo: "Pedidos de amostra" },
    { rota: "mensagens", rotulo: "Mensagens" },
  ] },
  { grupo: "Sistema", itens: [
    { rota: "usuarios", rotulo: "Usuários" },
    { rota: "trilha", rotulo: "Trilha de alterações" },
  ] },
];

/* Os selos com número de pendências são calculados a cada carregamento do
   menu: um número parado em "3" quando não há mais nada faz o painel perder a
   confiança de quem usa. */
function menuComSelos() {
  const am = Q.um("SELECT COUNT(*) c FROM amostras WHERE situacao = 'novo'").c;
  const ms = Q.um("SELECT COUNT(*) c FROM contatos WHERE lido = 0").c;
  return MENU.map((g) => ({
    grupo: g.grupo,
    itens: g.itens.map((i) => Object.assign({}, i,
      i.rota === "amostras" && am ? { selo: am } :
      i.rota === "mensagens" && ms ? { selo: ms } : {})),
  }));
}

const tela = (u, atual, titulo, corpo) => P.casca({
  prefixo: "admin", titulo, usuario: u, menu: menuComSelos(), atual, corpo, versao: VERSAO,
});

const DATA = (s) => String(s || "").slice(0, 16).replace("T", " ").split(" ")
  .map((x, i) => i === 0 ? x.split("-").reverse().join("/") : x).join(" ");

/* ==========================================================================
   INÍCIO — os números que respondem "e aí, como foi a semana?"
   ========================================================================== */
function inicio() {
  const hoje = new Date().toISOString().slice(0, 10);
  const seteDias = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);

  const n = (sql, ...p) => Q.um(sql, ...p).c;
  const cartoes = [
    ["Visitas hoje", n("SELECT COUNT(DISTINCT ip_hash) c FROM acessos WHERE dia = ?", hoje), "acessos"],
    ["Visitas em 7 dias", n("SELECT COUNT(DISTINCT ip_hash || dia) c FROM acessos WHERE dia >= ?", seteDias), "acessos"],
    ["Amostras a responder", n("SELECT COUNT(*) c FROM amostras WHERE situacao='novo'"), "amostras"],
    ["Mensagens não lidas", n("SELECT COUNT(*) c FROM contatos WHERE lido=0"), "mensagens"],
  ];

  const paginas = Q.todos(`
    SELECT rota, COUNT(*) v FROM acessos WHERE dia >= ?
     GROUP BY rota ORDER BY v DESC LIMIT 6`, seteDias);
  const ultimas = Q.todos("SELECT * FROM amostras ORDER BY id DESC LIMIT 5");

  return `
<div class="cartoes">
  ${cartoes.map(([r, v, ir]) => `
  <a class="cartao" href="/admin/${ir}">
    <span class="cartao__n">${v}</span>
    <span class="cartao__r">${esc(r)}</span>
  </a>`).join("")}
</div>

<div class="duas">
  <section class="caixa">
    <h2>Páginas mais vistas (7 dias)</h2>
    ${paginas.length ? `<table class="tab">
      <thead><tr><th>Página</th><th>Visitas</th></tr></thead>
      <tbody>${paginas.map((p) => `<tr><td><code>${esc(p.rota)}</code></td>
        <td><b>${p.v}</b></td></tr>`).join("")}</tbody></table>`
      : `<p class="nada">Ainda sem visitas registradas.</p>`}
  </section>

  <section class="caixa">
    <h2>Últimos pedidos de amostra</h2>
    ${ultimas.length ? `<ul class="lista-seca">
      ${ultimas.map((a) => `<li><strong>${esc(a.nome)}</strong>
        <span>${esc(a.telefone)}</span>
        <em>${esc(String(a.artigos).slice(0, 70))}</em></li>`).join("")}</ul>`
      : `<p class="nada">Nenhum pedido de amostra ainda.</p>`}
    <a class="btn btn--linha btn--sm" href="/admin/amostras">Ver todos</a>
  </section>
</div>`;
}

/* ==========================================================================
   TEXTOS — tudo que o site escreve, editável

   Agrupados pela TELA do site onde aparecem, e não em ordem alfabética de
   chave. Quem vai mudar a frase da capa procura "Home", não "home.chamada".
   ========================================================================== */
const NOME_GRUPO = {
  geral: "Marca e contatos", lojas: "As duas lojas",
  home: "Página inicial", sobre: "Página A Izatec",
  medicao: "Medição e integrações",
};

/* Explicação por grupo, mostrada acima dos campos. Um campo chamado
   "medicao.ga4" não diz a ninguém o que acontece quando ele é preenchido — e
   este em particular liga cookie de terceiro no site. */
const AJUDA_GRUPO = {
  medicao: "Enquanto estes campos estiverem vazios, o site não carrega Google " +
    "nem Meta e não mostra aviso de cookie. Ao preencher, o aviso de " +
    "consentimento aparece automaticamente e a medição só começa depois que o " +
    "visitante aceitar — é o que a LGPD exige. A contagem de visitas do painel " +
    "não depende disso e continua funcionando dos dois jeitos.",
};

function textos(salvo = false) {
  /* O grupo 'sistema' fica de FORA: ali mora a chave que assina o carrinho.
     Painel que exibe segredo é segredo vazado na primeira captura de tela —
     e este em particular, publicado, deixaria qualquer um forjar um pedido. */
  const linhas = Q.todos(
    "SELECT * FROM config WHERE grupo <> 'sistema' ORDER BY grupo, ordem, chave");
  const grupos = {};
  for (const l of linhas) (grupos[l.grupo] = grupos[l.grupo] || []).push(l);

  return `
${salvo ? `<p class="aviso aviso--ok">Textos salvos. Já estão no ar.</p>` : ""}
<p class="dica">O site é gerado do banco a cada visita: o que você salvar aqui
  aparece no próximo carregamento da página, sem publicar nada.</p>

<form method="post" action="/admin/textos">
  ${Object.entries(grupos).map(([g, itens]) => `
  <section class="caixa">
    <h2>${esc(NOME_GRUPO[g] || g)}</h2>
    ${AJUDA_GRUPO[g] ? `<p class="dica">${esc(AJUDA_GRUPO[g])}</p>` : ""}
    ${itens.map((i) => `
    <div class="campo">
      <label for="t-${esc(i.chave)}">${esc(i.rotulo || i.chave)}
        <code>${esc(i.chave)}</code></label>
      ${i.tipo === "area"
        ? `<textarea id="t-${esc(i.chave)}" name="${esc(i.chave)}" rows="4">${esc(i.valor)}</textarea>`
        : `<input id="t-${esc(i.chave)}" name="${esc(i.chave)}" value="${esc(i.valor)}">`}
    </div>`).join("")}
  </section>`).join("")}
  <div class="barra-acao"><button class="btn btn--acao" type="submit">Salvar textos</button></div>
</form>`;
}

/* ==========================================================================
   FEED
   ========================================================================== */
function feedLista() {
  const m = Q.todos("SELECT * FROM feed ORDER BY data DESC, id DESC");
  return `
<div class="barra-acao barra-acao--topo">
  <a class="btn btn--acao" href="/admin/feed/nova">Nova matéria</a>
</div>
${m.length ? `<table class="tab">
  <thead><tr><th>Título</th><th>Etiqueta</th><th>Data</th><th>No ar</th><th></th></tr></thead>
  <tbody>${m.map((x) => `<tr>
    <td><a href="/admin/feed/${x.id}"><strong>${esc(x.titulo)}</strong></a>
      <span class="sub">/feed/${esc(x.slug)}/</span></td>
    <td>${esc(x.etiqueta)}</td>
    <td>${esc(String(x.data).split("-").reverse().join("/"))}</td>
    <td>${x.publicado ? `<span class="pino pino--ok">no ar</span>`
                      : `<span class="pino">rascunho</span>`}</td>
    <td class="tab__fim">
      <a class="btn--texto" href="/feed/${esc(x.slug)}/" target="_blank" rel="noopener">ver ↗</a>
      <a class="btn--texto" href="/admin/feed/${x.id}">editar</a></td>
  </tr>`).join("")}</tbody></table>`
  : `<p class="nada">Nenhuma matéria ainda.</p>`}`;
}

function feedForma(id) {
  const m = id ? Q.um("SELECT * FROM feed WHERE id = ?", id) : null;
  if (id && !m) return null;
  const v = m || { titulo: "", slug: "", resumo: "", corpo: "", etiqueta: "",
                   capa: '', publicado: 1, data: new Date().toISOString().slice(0, 10) };

  return `
<form method="post" action="/admin/feed/${id || "nova"}" class="caixa">
  <div class="campo"><label for="m-tit">Título *</label>
    <input id="m-tit" name="titulo" required maxlength="160" value="${esc(v.titulo)}"></div>

  <div class="dois">
    <div class="campo"><label for="m-slug">Endereço (slug)</label>
      <input id="m-slug" name="slug" maxlength="80" value="${esc(v.slug)}"
        placeholder="deixe em branco para gerar do título">
      <span class="ajuda">Muda o link da matéria. Se ela já foi divulgada,
        mudar aqui quebra o link antigo.</span></div>
    <div class="campo"><label for="m-eti">Etiqueta</label>
      <input id="m-eti" name="etiqueta" maxlength="40" value="${esc(v.etiqueta)}"
        placeholder="Ex.: Guia, Bastidores"></div>
  </div>

  <div class="campo"><label for="m-res">Resumo *</label>
    <textarea id="m-res" name="resumo" rows="2" required maxlength="300">${esc(v.resumo)}</textarea>
    <span class="ajuda">Aparece na lista do Feed e na busca do Google.</span></div>

  <div class="campo"><label for="m-capa">Foto de capa</label>
    <input id="m-capa" name="capa" maxlength="200" value="${esc(v.capa || "")}"
      placeholder="/assets/img/banco/feed-ficha-10133280.jpg">
    <span class="ajuda">Caminho da imagem. Em branco, o site usa a foto do
      acervo daquela matéria — e, se não houver nenhuma, o cartão fica só com
      o texto, sem espaço vazio.</span>
    ${v.capa ? `<img class="previa" src="${esc(v.capa)}" alt="Prévia da capa"
      width="240" height="150" loading="lazy">` : ""}</div>

  <div class="campo"><label for="m-cor">Texto da matéria</label>
    <textarea id="m-cor" name="corpo" rows="18">${esc(v.corpo)}</textarea>
    <span class="ajuda">Linha em branco separa parágrafo.
      Comece a linha com <code>## </code> para subtítulo e com <code>- </code> para lista.</span></div>

  <div class="dois">
    <div class="campo"><label for="m-dat">Data</label>
      <input id="m-dat" name="data" type="date" value="${esc(v.data)}"></div>
    <div class="campo campo--check">
      <label><input type="checkbox" name="publicado" value="1"
        ${v.publicado ? "checked" : ""}> Publicada no site</label></div>
  </div>

  <div class="barra-acao">
    <button class="btn btn--acao" type="submit">${id ? "Salvar" : "Criar matéria"}</button>
    <a class="btn btn--linha" href="/admin/feed">Cancelar</a>
    ${id ? `<button class="btn--perigo" type="submit" name="apagar" value="1"
      onclick="return confirm('Apagar esta matéria? Não dá para desfazer.')">Apagar</button>` : ""}
  </div>
</form>`;
}

const slugify = (s) => String(s).toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

/* ==========================================================================
   RECEBIDOS
   ========================================================================== */
function amostras() {
  const a = Q.todos("SELECT * FROM amostras ORDER BY id DESC LIMIT 300");
  return `
<p class="dica">Quem pede amostra está a um passo de comprar. Marque como
  atendido depois de responder — o selo do menu segue essa marca.</p>
${a.length ? `<table class="tab">
  <thead><tr><th>Quando</th><th>Quem</th><th>O que quer ver</th><th></th></tr></thead>
  <tbody>${a.map((x) => `<tr class="${x.situacao === "novo" ? "tr--novo" : ""}">
    <td>${esc(DATA(x.criado))}</td>
    <td><strong>${esc(x.nome)}</strong>
      ${x.empresa ? `<span class="sub">${esc(x.empresa)}</span>` : ""}
      <a class="sub" href="https://wa.me/55${esc(String(x.telefone).replace(/\D/g, ""))}"
         target="_blank" rel="noopener">${esc(x.telefone)}</a></td>
    <td>${esc(x.artigos)}</td>
    <td class="tab__fim">${x.situacao === "novo"
      ? `<form method="post" action="/admin/amostras/${x.id}">
           <button class="btn--texto" name="feito" value="1">marcar atendido</button></form>`
      : `<span class="pino pino--ok">atendido</span>`}</td>
  </tr>`).join("")}</tbody></table>`
  : `<p class="nada">Nenhum pedido de amostra ainda.</p>`}`;
}

function mensagens() {
  const c = Q.todos("SELECT * FROM contatos ORDER BY id DESC LIMIT 300");
  return c.length ? `<div class="msgs">
  ${c.map((x) => `
  <article class="msg${x.lido ? "" : " msg--nova"}">
    <header>
      <strong>${esc(x.nome)}</strong>
      <span>${esc(x.assunto || "Sem assunto")}</span>
      <time>${esc(DATA(x.criado))}</time>
    </header>
    <p>${esc(x.mensagem)}</p>
    <footer>
      <a href="https://wa.me/55${esc(String(x.telefone).replace(/\D/g, ""))}"
         target="_blank" rel="noopener">${esc(x.telefone)}</a>
      ${x.email ? `<a href="mailto:${esc(x.email)}">${esc(x.email)}</a>` : ""}
      ${x.lido ? `<span class="pino pino--ok">lida</span>`
        : `<form method="post" action="/admin/mensagens/${x.id}">
             <button class="btn--texto" name="lido" value="1">marcar como lida</button></form>`}
    </footer>
  </article>`).join("")}</div>`
  : `<p class="nada">Nenhuma mensagem recebida.</p>`;
}

/* ==========================================================================
   ACESSOS

   Visitante único por dia = IP em hash distinto. Não é analytics completo, e
   não pretende ser: é o número que a loja precisa para saber se o site está
   sendo visto — sem cookie, sem terceiro e sem consentimento a pedir.
   ========================================================================== */
function acessos() {
  const dias = Q.todos(`
    SELECT dia, COUNT(*) v, COUNT(DISTINCT ip_hash) u FROM acessos
     GROUP BY dia ORDER BY dia DESC LIMIT 30`);
  const rotas = Q.todos(`
    SELECT rota, COUNT(*) v FROM acessos GROUP BY rota ORDER BY v DESC LIMIT 20`);
  const teto = Math.max(1, ...dias.map((d) => d.v));

  return `
<p class="dica">Contagem própria, sem cookie e sem enviar nada para fora. O IP
  entra como código embaralhado do dia — dá para contar visitante único e não
  dá para saber de quem era o endereço.</p>

<section class="caixa">
  <h2>Últimos 30 dias</h2>
  ${dias.length ? `<div class="barras">
    ${dias.slice().reverse().map((d) => `
    <div class="barras__i" title="${esc(d.dia)}: ${d.v} páginas, ${d.u} visitantes">
      <span style="height:${Math.round(d.v / teto * 100)}%"></span>
      <em>${esc(d.dia.slice(8))}</em>
    </div>`).join("")}
  </div>` : `<p class="nada">Ainda sem registro.</p>`}
</section>

<section class="caixa">
  <h2>Por página</h2>
  ${rotas.length ? `<table class="tab">
    <thead><tr><th>Página</th><th>Aberturas</th></tr></thead>
    <tbody>${rotas.map((r) => `<tr><td><code>${esc(r.rota)}</code></td>
      <td><b>${r.v}</b></td></tr>`).join("")}</tbody></table>`
    : `<p class="nada">Ainda sem registro.</p>`}
</section>`;
}

/* ==========================================================================
   USUÁRIOS — só o dono mexe

   A senha nunca é MOSTRADA, nem aqui nem em lugar nenhum: ela só existe em
   hash. O que o dono pode fazer é DEFINIR uma nova. Painel que exibe a senha
   de outro usuário é painel que vaza a senha na primeira captura de tela.
   ========================================================================== */
function usuarios(eu, aviso = "") {
  if (eu.papel !== "dono") return `<p class="aviso aviso--erro">Só o dono gerencia usuários.</p>`;
  const us = Q.todos("SELECT * FROM usuarios ORDER BY papel, usuario");

  return `
${aviso ? `<p class="aviso aviso--ok">${esc(aviso)}</p>` : ""}
<table class="tab">
  <thead><tr><th>Usuário</th><th>Nome</th><th>Acesso</th><th>Último acesso</th><th></th></tr></thead>
  <tbody>${us.map((u) => `<tr>
    <td><strong>${esc(u.usuario)}</strong></td>
    <td>${esc(u.nome)}</td>
    <td><span class="pino">${esc({ dono: "Dono (tudo)", admin: "Site", estoque: "Produtos" }[u.papel])}</span></td>
    <td>${u.entrou ? esc(DATA(u.entrou)) : "<em>nunca</em>"}</td>
    <td class="tab__fim">
      <form method="post" action="/admin/usuarios/${u.id}" class="linha-forma">
        <input name="senha" type="password" placeholder="nova senha" minlength="8" required>
        <button class="btn--texto" name="trocar" value="1">definir</button>
      </form>
      ${u.id !== eu.id ? `<form method="post" action="/admin/usuarios/${u.id}">
        <button class="btn--texto" name="ativo" value="${u.ativo ? 0 : 1}">
          ${u.ativo ? "bloquear" : "liberar"}</button></form>` : ""}
    </td></tr>`).join("")}</tbody>
</table>

<section class="caixa">
  <h2>Novo usuário</h2>
  <form method="post" action="/admin/usuarios/novo" class="dois">
    <div class="campo"><label for="u-user">Usuário *</label>
      <input id="u-user" name="usuario" required maxlength="40" pattern="[a-z0-9._-]+"
        ><span class="ajuda">Letras minúsculas, números, ponto e traço.</span></div>
    <div class="campo"><label for="u-nome">Nome</label>
      <input id="u-nome" name="nome" maxlength="80"></div>
    <div class="campo"><label for="u-senha">Senha *</label>
      <input id="u-senha" name="senha" type="password" required minlength="8"
        ><span class="ajuda">Mínimo de 8 caracteres.</span></div>
    <div class="campo"><label for="u-papel">Acesso *</label>
      <select id="u-papel" name="papel">
        <option value="admin">Site — textos, Feed e mensagens</option>
        <option value="estoque">Produtos — artigos, preço, estoque e pedidos</option>
        <option value="dono">Dono — os dois painéis</option>
      </select></div>
    <div class="barra-acao"><button class="btn btn--acao" type="submit">Criar usuário</button></div>
  </form>
</section>`;
}

function trilha() {
  const a = Q.todos("SELECT * FROM auditoria ORDER BY id DESC LIMIT 300");
  return a.length ? `<table class="tab">
    <thead><tr><th>Quando</th><th>Quem</th><th>O quê</th><th>Onde</th><th>Detalhe</th></tr></thead>
    <tbody>${a.map((x) => `<tr>
      <td>${esc(DATA(x.criado))}</td><td>${esc(x.usuario)}</td>
      <td><span class="pino">${esc(x.acao)}</span></td>
      <td>${esc(x.alvo)}</td><td class="sub">${esc(x.detalhe)}</td>
    </tr>`).join("")}</tbody></table>`
    : `<p class="nada">Nada registrado ainda.</p>`;
}

/* ==========================================================================
   ROTEADOR
   ========================================================================== */
async function atender(req, res, partes, q, lerCorpo) {
  const html = (codigo, corpo) => {
    res.writeHead(codigo, { "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow", "X-Frame-Options": "DENY",
      "Cache-Control": "no-store" });
    res.end(corpo);
  };
  const volta = (para) => { res.writeHead(303, { Location: para }); res.end(); };

  /* ------------------------------------------------------------- entrada */
  if (partes[0] === "entrar" && req.method === "POST") {
    const d = await lerCorpo(req);
    const user = String(d.usuario || "").toLowerCase().slice(0, 40);
    const chaves = [`ip:${P.ipDe(req)}`, `conta:${user}`];
    if (chaves.some((c) => !P.podeTentar(c)))
      return html(429, P.telaEntrada("admin", "Painel do site",
        "Muitas tentativas. Espere alguns minutos e tente de novo."));

    const u = Q.um("SELECT * FROM usuarios WHERE usuario = ? AND ativo = 1", user);
    if (!u || !P.conferir(d.senha, u.senha) || !P.podeVer(u, "admin")) {
      chaves.forEach(P.anotarFalha);
      P.anotar(user, "ENTRADA_NEGADA", "admin");
      return html(401, P.telaEntrada("admin", "Painel do site",
        "Usuário ou senha não conferem."));
    }
    chaves.forEach(P.limparFalhas);
    P.abrirSessao(res, u.id, "admin");
    P.anotar(u.usuario, "ENTROU", "admin");
    return volta("/admin/");
  }

  const eu = P.quemE(req, "admin");
  if (!eu || !P.podeVer(eu, "admin")) return html(200, P.telaEntrada("admin", "Painel do site"));

  if (partes[0] === "sair" && req.method === "POST") {
    P.anotar(eu.usuario, "SAIU", "admin");
    P.fecharSessao(req, res, "admin");
    return volta("/admin/");
  }

  const rota = partes[0] || "";

  /* --------------------------------------------------------------- POSTs */
  if (req.method === "POST") {
    const d = await lerCorpo(req);

    if (rota === "textos") {
      const atuais = Q.todos("SELECT chave FROM config WHERE grupo <> 'sistema'");
      let n = 0;
      for (const { chave } of atuais)
        if (d[chave] !== undefined) { ajuste(chave, d[chave]); n++; }
      P.anotar(eu.usuario, "TEXTOS_SALVOS", "config", `${n} campos`);
      return volta("/admin/textos?ok=1");
    }

    if (rota === "feed") {
      const id = partes[1] === "nova" ? null : Number(partes[1]);
      if (id && d.apagar) {
        const m = Q.um("SELECT titulo FROM feed WHERE id = ?", id);
        Q.roda("DELETE FROM feed WHERE id = ?", id);
        P.anotar(eu.usuario, "FEED_APAGADO", "feed", m ? m.titulo : id);
        return volta("/admin/feed");
      }
      const slug = slugify(d.slug || d.titulo || "");
      if (!d.titulo || !slug) return volta("/admin/feed");
      const campos = [d.titulo.slice(0, 160), slug, String(d.resumo || "").slice(0, 300),
        String(d.corpo || ""), String(d.etiqueta || "").slice(0, 40),
        String(d.capa || "").slice(0, 200),
        d.publicado ? 1 : 0, String(d.data || "").slice(0, 10) ||
          new Date().toISOString().slice(0, 10)];
      if (id) {
        Q.roda(`UPDATE feed SET titulo=?, slug=?, resumo=?, corpo=?, etiqueta=?,
                capa=?, publicado=?, data=? WHERE id=?`, ...campos, id);
        P.anotar(eu.usuario, "FEED_EDITADO", "feed", d.titulo);
      } else {
        if (Q.um("SELECT id FROM feed WHERE slug = ?", slug)) return volta("/admin/feed");
        Q.roda(`INSERT INTO feed (titulo, slug, resumo, corpo, etiqueta, capa, publicado, data)
                VALUES (?,?,?,?,?,?,?,?)`, ...campos);
        P.anotar(eu.usuario, "FEED_CRIADO", "feed", d.titulo);
      }
      return volta("/admin/feed");
    }

    if (rota === "amostras" && d.feito) {
      Q.roda("UPDATE amostras SET situacao='atendido' WHERE id = ?", Number(partes[1]));
      P.anotar(eu.usuario, "AMOSTRA_ATENDIDA", "amostras", partes[1]);
      return volta("/admin/amostras");
    }

    if (rota === "mensagens" && d.lido) {
      Q.roda("UPDATE contatos SET lido = 1 WHERE id = ?", Number(partes[1]));
      return volta("/admin/mensagens");
    }

    if (rota === "usuarios") {
      if (eu.papel !== "dono") return volta("/admin/");
      if (partes[1] === "novo") {
        const user = String(d.usuario || "").toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 40);
        if (!user || String(d.senha || "").length < 8) return volta("/admin/usuarios");
        if (Q.um("SELECT id FROM usuarios WHERE usuario = ?", user)) return volta("/admin/usuarios");
        Q.roda(`INSERT INTO usuarios (usuario, nome, senha, papel) VALUES (?,?,?,?)`,
          user, String(d.nome || "").slice(0, 80), P.cifrar(d.senha),
          ["admin", "estoque", "dono"].includes(d.papel) ? d.papel : "admin");
        P.anotar(eu.usuario, "USUARIO_CRIADO", "usuarios", user);
        return volta("/admin/usuarios?ok=criado");
      }
      const id = Number(partes[1]);
      if (d.trocar && String(d.senha || "").length >= 8) {
        Q.roda("UPDATE usuarios SET senha = ? WHERE id = ?", P.cifrar(d.senha), id);
        /* Trocar a senha derruba as sessões daquele usuário. É o comportamento
           esperado de quem troca a senha justamente porque desconfia de acesso
           indevido — deixar a sessão antiga viva anularia a troca. */
        Q.roda("DELETE FROM sessoes WHERE usuario_id = ?", id);
        P.anotar(eu.usuario, "SENHA_TROCADA", "usuarios", id);
        return volta("/admin/usuarios?ok=senha");
      }
      if (d.ativo !== undefined && id !== eu.id) {
        Q.roda("UPDATE usuarios SET ativo = ? WHERE id = ?", Number(d.ativo) ? 1 : 0, id);
        if (!Number(d.ativo)) Q.roda("DELETE FROM sessoes WHERE usuario_id = ?", id);
        P.anotar(eu.usuario, "USUARIO_ALTERADO", "usuarios", id);
      }
      return volta("/admin/usuarios");
    }

    return volta("/admin/");
  }

  /* ---------------------------------------------------------------- GETs */
  if (rota === "") return html(200, tela(eu, "", "Início", inicio()));
  if (rota === "textos") return html(200, tela(eu, "textos", "Textos das seções", textos(!!q.ok)));
  if (rota === "acessos") return html(200, tela(eu, "acessos", "Acessos", acessos()));
  if (rota === "amostras") return html(200, tela(eu, "amostras", "Pedidos de amostra", amostras()));
  if (rota === "mensagens") return html(200, tela(eu, "mensagens", "Mensagens", mensagens()));
  if (rota === "trilha") return html(200, tela(eu, "trilha", "Trilha de alterações", trilha()));
  if (rota === "usuarios") {
    const av = q.ok === "criado" ? "Usuário criado."
      : q.ok === "senha" ? "Senha definida. As sessões daquele usuário foram encerradas." : "";
    return html(200, tela(eu, "usuarios", "Usuários", usuarios(eu, av)));
  }
  if (rota === "feed") {
    if (!partes[1]) return html(200, tela(eu, "feed", "Feed", feedLista()));
    if (partes[1] === "nova") return html(200, tela(eu, "feed", "Nova matéria", feedForma(null)));
    const f = feedForma(Number(partes[1]));
    return f ? html(200, tela(eu, "feed", "Editar matéria", f))
             : html(404, tela(eu, "feed", "Não encontrada", `<p class="nada">Matéria não encontrada.</p>`));
  }

  return html(404, tela(eu, "", "Não encontrada", `<p class="nada">Tela não encontrada.</p>`));
}

module.exports = { atender, slugify };
