"use strict";
/* ==========================================================================
   /restrito — O PAINEL DOS PRODUTOS

   ---------------------------------------------------------------------------
   ESTE PAINEL É USADO EM PÉ, NO BALCÃO

   Não é o painel do escritório. Quem entra aqui está com o rolo na mão,
   conferindo o que chegou do fornecedor. Isso muda três coisas do desenho:

   · A tela de ESTOQUE edita tudo numa grade só, sem abrir cada cor. Abrir e
     salvar dezenove cores, uma por vez, é meia hora que ninguém tem.
   · O PEDIDO tem os botões de situação na frente, grandes. É o gesto mais
     repetido do dia — "confirmei", "separei", "despachei".
   · Nada some da lista. Tecido esgotado, artigo fora de linha: tudo continua
     visível e marcado, porque no balcão a pergunta é "temos?", e "não achei
     no sistema" não é resposta.
   ========================================================================== */
const { Q, txt, precoPara } = require("./db");
const P = require("./painel");
const esc = P.esc;
const VERSAO = require("../package.json").version;

const dinheiro = (v) => Number(v || 0).toLocaleString("pt-BR",
  { style: "currency", currency: "BRL" });
const DATA = (s) => String(s || "").slice(0, 16).replace("T", " ").split(" ")
  .map((x, i) => i === 0 ? x.split("-").reverse().join("/") : x).join(" ");

const SITUACOES = ["novo", "confirmado", "separando", "enviado", "entregue", "cancelado"];

const MENU = [
  { grupo: "Movimento", itens: [
    { rota: "", rotulo: "Início" },
    { rota: "pedidos", rotulo: "Pedidos" },
  ] },
  { grupo: "Catálogo", itens: [
    { rota: "artigos", rotulo: "Artigos" },
    { rota: "familias", rotulo: "Famílias" },
  ] },
  { grupo: "Chão de loja", itens: [
    { rota: "estoque", rotulo: "Estoque e preço" },
  ] },
];

function menuComSelos() {
  const n = Q.um("SELECT COUNT(*) c FROM pedidos WHERE situacao = 'novo'").c;
  return MENU.map((g) => ({
    grupo: g.grupo,
    itens: g.itens.map((i) => i.rota === "pedidos" && n ? Object.assign({}, i, { selo: n }) : i),
  }));
}

const tela = (u, atual, titulo, corpo) => P.casca({
  prefixo: "restrito", titulo, usuario: u, menu: menuComSelos(), atual, corpo, versao: VERSAO,
});

/* ========================================================================== */
function inicio() {
  const n = (sql, ...p) => Q.um(sql, ...p).c;
  const cartoes = [
    ["Pedidos novos", n("SELECT COUNT(*) c FROM pedidos WHERE situacao='novo'"), "pedidos"],
    ["Em separação", n("SELECT COUNT(*) c FROM pedidos WHERE situacao IN ('confirmado','separando')"), "pedidos"],
    ["Artigos no ar", n("SELECT COUNT(*) c FROM artigos WHERE ativo=1"), "artigos"],
    ["Cores acabando", n("SELECT COUNT(*) c FROM cores WHERE ativo=1 AND estoque < 100"), "estoque"],
  ];

  const pedidos = Q.todos("SELECT * FROM pedidos ORDER BY id DESC LIMIT 6");
  const acabando = Q.todos(`
    SELECT c.id, c.nome cor, c.estoque, a.nome artigo, a.unidade
      FROM cores c JOIN artigos a ON a.id = c.artigo_id
     WHERE c.ativo = 1 AND a.ativo = 1 AND c.estoque < 100
     ORDER BY c.estoque LIMIT 10`);

  /* ======================================================================
     COR SEM PREÇO NÃO VENDE

     O cadastro inicial vem com preço zerado de propósito — preço chutado que
     o cliente esquece de corrigir é pior do que preço em branco. Mas em
     branco o site troca "Adicionar ao pedido" por "Pedir orçamento", e a loja
     virtual deixa de vender sem nenhum aviso.

     Este alerta é o que fecha esse buraco: enquanto houver cor a zero, o
     painel diz quantas são e leva direto para a tela de ajuste.
     ====================================================================== */
  const semPreco = Q.um(
    "SELECT COUNT(*) c FROM cores WHERE ativo = 1 AND preco <= 0").c;

  return `
${semPreco ? `<p class="aviso aviso--erro">
  <strong>${semPreco} ${semPreco === 1 ? "cor está" : "cores estão"} sem preço.</strong>
  No site ${semPreco === 1 ? "ela aparece" : "elas aparecem"} com “Pedir orçamento”
  em vez do botão de comprar — a loja virtual só vende o que tem preço publicado.
  <a href="/restrito/estoque">Preencher agora →</a></p>` : ""}

<div class="cartoes">
  ${cartoes.map(([r, v, ir]) => `
  <a class="cartao" href="/restrito/${ir}">
    <span class="cartao__n">${v}</span><span class="cartao__r">${esc(r)}</span></a>`).join("")}
</div>

<div class="duas">
  <section class="caixa">
    <h2>Últimos pedidos</h2>
    ${pedidos.length ? `<table class="tab">
      <thead><tr><th>Código</th><th>Cliente</th><th>Total</th><th>Situação</th></tr></thead>
      <tbody>${pedidos.map((p) => `<tr>
        <td><a href="/restrito/pedidos/${p.id}"><code>${esc(p.codigo)}</code></a></td>
        <td>${esc(p.nome)}<span class="sub">${esc(p.cidade)}</span></td>
        <td>${dinheiro(p.total)}</td>
        <td><span class="pino pino--${esc(p.situacao)}">${esc(p.situacao)}</span></td>
      </tr>`).join("")}</tbody></table>`
      : `<p class="nada">Nenhum pedido ainda.</p>`}
  </section>

  <section class="caixa">
    <h2>Acabando no estoque</h2>
    ${acabando.length ? `<ul class="lista-seca">
      ${acabando.map((c) => `<li><strong>${esc(c.artigo)}</strong>
        <span>${esc(c.cor)}</span>
        <em>${c.estoque} ${esc(c.unidade)}</em></li>`).join("")}</ul>`
      : `<p class="nada">Nada abaixo de 100 no momento.</p>`}
    <a class="btn btn--linha btn--sm" href="/restrito/estoque">Ajustar estoque</a>
  </section>
</div>`;
}

/* ==========================================================================
   PEDIDOS
   ========================================================================== */
function pedidos(filtro = "") {
  const onde = SITUACOES.includes(filtro) ? "WHERE situacao = ?" : "";
  const lista = Q.todos(`SELECT * FROM pedidos ${onde} ORDER BY id DESC LIMIT 300`,
    ...(onde ? [filtro] : []));

  return `
<div class="filtros filtros--painel">
  <a class="chip${!filtro ? " chip--on" : ""}" href="/restrito/pedidos">Todos</a>
  ${SITUACOES.map((s) => `<a class="chip${filtro === s ? " chip--on" : ""}"
    href="/restrito/pedidos?s=${s}">${esc(s)}</a>`).join("")}
</div>

${lista.length ? `<table class="tab">
  <thead><tr><th>Código</th><th>Quando</th><th>Cliente</th><th>Entrega</th>
    <th>Total</th><th>Situação</th></tr></thead>
  <tbody>${lista.map((p) => `<tr class="${p.situacao === "novo" ? "tr--novo" : ""}">
    <td><a href="/restrito/pedidos/${p.id}"><code>${esc(p.codigo)}</code></a></td>
    <td>${esc(DATA(p.criado))}</td>
    <td><strong>${esc(p.nome)}</strong>
      ${p.empresa ? `<span class="sub">${esc(p.empresa)}</span>` : ""}
      <span class="sub">${esc(p.cidade)}</span></td>
    <td>${p.entrega === "retirada" ? "Retirada" : "Transportadora"}</td>
    <td><b>${dinheiro(p.total)}</b></td>
    <td><span class="pino pino--${esc(p.situacao)}">${esc(p.situacao)}</span></td>
  </tr>`).join("")}</tbody></table>`
  : `<p class="nada">Nenhum pedido com esse recorte.</p>`}`;
}

function pedido(id) {
  const p = Q.um("SELECT * FROM pedidos WHERE id = ?", id);
  if (!p) return null;
  const itens = Q.todos("SELECT * FROM pedido_itens WHERE pedido_id = ? ORDER BY id", id);
  const zap = `https://wa.me/55${String(p.telefone).replace(/\D/g, "")}` +
    `?text=${encodeURIComponent(`Olá, ${p.nome}! Sobre o seu pedido ${p.codigo} na Izatec:`)}`;

  return `
<div class="barra-acao barra-acao--topo">
  <a class="btn--texto" href="/restrito/pedidos">← Todos os pedidos</a>
  <a class="btn btn--linha btn--sm" href="${esc(zap)}" target="_blank" rel="noopener">
    Falar com o cliente</a>
</div>

<!-- SITUAÇÃO EM BOTÕES, e não em lista suspensa: é o gesto que mais se repete
     no dia, e no celular a lista suspensa custa três toques. -->
<section class="caixa">
  <h2>Situação</h2>
  <form method="post" action="/restrito/pedidos/${p.id}" class="situacoes">
    ${SITUACOES.map((s) => `<button class="sit${p.situacao === s ? " sit--on" : ""}"
      name="situacao" value="${s}" type="submit">${esc(s)}</button>`).join("")}
  </form>
</section>

<div class="duas">
  <section class="caixa">
    <h2>Pedido ${esc(p.codigo)}</h2>
    <table class="tab">
      <thead><tr><th>Item</th><th>Qtd.</th><th>Preço</th><th>Subtotal</th></tr></thead>
      <tbody>${itens.map((i) => `<tr>
        <td>${esc(i.descricao)}</td><td>${i.quantidade}</td>
        <td>${dinheiro(i.preco)}</td><td><b>${dinheiro(i.subtotal)}</b></td>
      </tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="3">Total (sem frete)</td>
        <td><b>${dinheiro(p.total)}</b></td></tr></tfoot>
    </table>
    ${p.observacao ? `<p class="obs"><strong>Observação do cliente:</strong>
      ${esc(p.observacao)}</p>` : ""}
  </section>

  <section class="caixa">
    <h2>Cliente</h2>
    <dl class="ficha-painel">
      <div><dt>Nome</dt><dd>${esc(p.nome)}</dd></div>
      ${p.empresa ? `<div><dt>Confecção</dt><dd>${esc(p.empresa)}</dd></div>` : ""}
      ${p.documento ? `<div><dt>CNPJ/CPF</dt><dd>${esc(p.documento)}</dd></div>` : ""}
      <div><dt>WhatsApp</dt><dd>${esc(p.telefone)}</dd></div>
      ${p.email ? `<div><dt>E-mail</dt><dd>${esc(p.email)}</dd></div>` : ""}
      <div><dt>Cidade</dt><dd>${esc(p.cidade)}</dd></div>
      <div><dt>Entrega</dt><dd>${p.entrega === "retirada" ? "Retirada na loja" : "Transportadora"}</dd></div>
      <div><dt>Recebido em</dt><dd>${esc(DATA(p.criado))}</dd></div>
    </dl>
  </section>
</div>`;
}

/* ==========================================================================
   ARTIGOS
   ========================================================================== */
function artigos() {
  const lista = Q.todos(`
    SELECT a.*, f.nome familia, f.cor familia_cor,
           (SELECT COUNT(*) FROM cores c WHERE c.artigo_id = a.id AND c.ativo=1) ncores,
           (SELECT COALESCE(SUM(c.estoque),0) FROM cores c WHERE c.artigo_id = a.id AND c.ativo=1) est
      FROM artigos a JOIN familias f ON f.id = a.familia_id
     ORDER BY f.ordem, a.nome`);

  return `
<div class="barra-acao barra-acao--topo">
  <a class="btn btn--acao" href="/restrito/artigos/novo">Novo artigo</a>
</div>
<table class="tab">
  <thead><tr><th>Artigo</th><th>Família</th><th>Ficha</th><th>Cores</th>
    <th>Estoque</th><th>No ar</th></tr></thead>
  <tbody>${lista.map((a) => `<tr>
    <td><a href="/restrito/artigos/${a.id}"><strong>${esc(a.nome)}</strong></a>
      <span class="sub">${esc(a.chamada)}</span></td>
    <td><span class="fam fam--${esc(a.familia_cor)}">${esc(a.familia)}</span></td>
    <td class="sub">${a.gramatura || "?"} g/m² · ${a.largura || "?"} cm ·
      ${a.elastano ? "c/ elastano" : "s/ elastano"}</td>
    <td>${a.ncores}</td>
    <td>${a.est} ${esc(a.unidade)}</td>
    <td>${a.ativo ? `<span class="pino pino--ok">no ar</span>`
                  : `<span class="pino">fora</span>`}</td>
  </tr>`).join("")}</tbody>
</table>`;
}

function artigoForma(id) {
  const a = id ? Q.um("SELECT * FROM artigos WHERE id = ?", id) : null;
  if (id && !a) return null;
  const familias = Q.todos("SELECT id, nome FROM familias ORDER BY ordem");
  const v = a || { nome: "", slug: "", chamada: "", descricao: "", composicao: "",
    gramatura: "", largura: "", encolhimento: "", elastano: 0, indicacao: "",
    unidade: "m", minimo: 1, destaque: 0, ativo: 1, foto: "",
    familia_id: familias[0] && familias[0].id };

  const cores = id ? Q.todos("SELECT * FROM cores WHERE artigo_id = ? ORDER BY ordem, id", id) : [];
  const faixas = id ? Q.todos("SELECT * FROM faixas WHERE artigo_id = ? ORDER BY de", id) : [];

  return `
<form method="post" action="/restrito/artigos/${id || "novo"}" class="caixa">
  <h2>Ficha técnica</h2>
  <div class="dois">
    <div class="campo"><label for="a-nome">Nome do artigo *</label>
      <input id="a-nome" name="nome" required maxlength="120" value="${esc(v.nome)}"></div>
    <div class="campo"><label for="a-fam">Família *</label>
      <select id="a-fam" name="familia_id">${familias.map((f) =>
        `<option value="${f.id}"${f.id === v.familia_id ? " selected" : ""}>${esc(f.nome)}</option>`).join("")}</select></div>
  </div>

  <div class="campo"><label for="a-cha">Chamada</label>
    <input id="a-cha" name="chamada" maxlength="200" value="${esc(v.chamada)}">
    <span class="ajuda">Uma linha, aparece no cartão do catálogo.</span></div>

  <!-- GRAMATURA E LARGURA COMO NÚMERO. É o que faz funcionar o filtro
       "acima de 300 g/m²" no site — guardado como texto ("340g") o filtro
       morre no primeiro artigo escrito de outro jeito. -->
  <div class="quatro">
    <div class="campo"><label for="a-gra">Gramatura (g/m²)</label>
      <input id="a-gra" name="gramatura" type="number" min="0" max="2000"
        value="${esc(v.gramatura)}"></div>
    <div class="campo"><label for="a-lar">Largura útil (cm)</label>
      <input id="a-lar" name="largura" type="number" min="0" max="400"
        value="${esc(v.largura)}"></div>
    <div class="campo"><label for="a-uni">Unidade</label>
      <select id="a-uni" name="unidade">
        ${["m", "kg", "pç"].map((x) => `<option${x === v.unidade ? " selected" : ""}>${x}</option>`).join("")}
      </select></div>
    <div class="campo"><label for="a-min">Corte mínimo</label>
      <input id="a-min" name="minimo" type="number" min="0" step="0.5" value="${esc(v.minimo)}"></div>
  </div>

  <div class="dois">
    <div class="campo"><label for="a-com">Composição</label>
      <input id="a-com" name="composicao" maxlength="160" value="${esc(v.composicao)}"
        placeholder="Ex.: 98% algodão, 2% elastano"></div>
    <div class="campo"><label for="a-enc">Encolhimento</label>
      <input id="a-enc" name="encolhimento" maxlength="80" value="${esc(v.encolhimento)}"
        placeholder="Ex.: até 3% na trama"></div>
  </div>

  <div class="campo"><label for="a-ind">Indicado para</label>
    <input id="a-ind" name="indicacao" maxlength="200" value="${esc(v.indicacao)}"
      placeholder="Ex.: calça, bermuda, jaqueta"></div>

  <div class="campo"><label for="a-des">Descrição</label>
    <textarea id="a-des" name="descricao" rows="4">${esc(v.descricao)}</textarea></div>

  <!-- ============================================================
       A FOTO É UM CAMINHO, não um upload.

       O site já vem com uma foto de acervo para cada artigo. Trocar é apontar
       para outro arquivo — e enquanto não houver foto da loja, o acervo
       segura a vitrine em pé.

       Upload de arquivo fica para quando houver foto DA IZATEC para subir:
       upload exige recorte, limite de tamanho, varredura do que entra e uma
       pasta gravável no servidor. Fazer isso antes de existir foto é construir
       máquina para produto que não chegou.
       ============================================================ -->
  <div class="campo"><label for="a-foto">Foto do artigo</label>
    <input id="a-foto" name="foto" maxlength="200" value="${esc(v.foto || "")}"
      placeholder="/assets/img/banco/art-jeans-3d-10133274.jpg">
    <span class="ajuda">Caminho da imagem. Em branco, o site usa a foto do
      acervo daquele artigo; sem nenhuma das duas, mostra a cor real cadastrada
      com a trama por cima.</span>
    ${v.foto ? `<img class="previa" src="${esc(v.foto)}" alt="Prévia da foto atual"
      width="240" height="180" loading="lazy">` : ""}</div>

  <div class="tres">
    <div class="campo campo--check"><label><input type="checkbox" name="elastano" value="1"
      ${v.elastano ? "checked" : ""}> Tem elastano</label></div>
    <div class="campo campo--check"><label><input type="checkbox" name="destaque" value="1"
      ${v.destaque ? "checked" : ""}> Destacar na home</label></div>
    <div class="campo campo--check"><label><input type="checkbox" name="ativo" value="1"
      ${v.ativo ? "checked" : ""}> Publicado no site</label></div>
  </div>

  <div class="barra-acao">
    <button class="btn btn--acao" type="submit">${id ? "Salvar ficha" : "Criar artigo"}</button>
    <a class="btn btn--linha" href="/restrito/artigos">Voltar</a>
  </div>
</form>

${!id ? `<p class="dica">Cores e faixas de preço aparecem aqui depois que o
  artigo for criado — elas pertencem a ele.</p>` : `

<section class="caixa">
  <h2>Cores</h2>
  <p class="dica">A cor é o que tem preço, foto e estoque. A ficha técnica acima
    vale para todas elas.</p>
  <!-- UM FORMULÁRIO PARA A TABELA INTEIRA, e não um por linha: <form> dentro
       de <tr> é HTML inválido, e o navegador o joga para fora da tabela — os
       campos ficam órfãos e o "salvar" envia vazio. O botão diz qual linha
       gravar pelo próprio valor. -->
  ${cores.length ? `<form method="post" action="/restrito/cores/lote">
  <input type="hidden" name="artigo_id" value="${id}">
  <table class="tab">
    <thead><tr><th>Cor</th><th>Código</th><th>Tom</th><th>Preço</th>
      <th>Estoque</th><th>No ar</th><th></th></tr></thead>
    <tbody>${cores.map((c) => `<tr>
      <td><input name="n_${c.id}" value="${esc(c.nome)}" required maxlength="60"></td>
      <td><input name="c_${c.id}" value="${esc(c.codigo)}" maxlength="30" size="8"></td>
      <td><input name="h_${c.id}" type="color" value="${esc(c.hex)}"></td>
      <td><input name="p_${c.id}" type="number" step="0.01" min="0" value="${c.preco}" size="6"></td>
      <td><input name="e_${c.id}" type="number" step="0.5" min="0" value="${c.estoque}" size="6"></td>
      <td><input name="v_${c.id}" type="checkbox" value="1"${c.ativo ? " checked" : ""}></td>
      <td class="tab__fim">
        <button class="btn--perigo" name="apagar" value="${c.id}" formnovalidate
          onclick="return confirm('Apagar a cor ${esc(c.nome)}?')">apagar</button></td>
    </tr>`).join("")}</tbody></table>
  <div class="barra-acao"><button class="btn btn--acao btn--sm" type="submit">Salvar cores</button></div>
  </form>` : `<p class="nada">Nenhuma cor cadastrada.</p>`}

  <form method="post" action="/restrito/cores/nova" class="linha-forma linha-forma--nova">
    <input type="hidden" name="artigo_id" value="${id}">
    <input name="nome" placeholder="Nome da cor" required maxlength="60">
    <input name="codigo" placeholder="Código" maxlength="30" size="8">
    <input name="hex" type="color" value="#3B5378">
    <input name="preco" type="number" step="0.01" min="0" placeholder="Preço" size="6">
    <input name="estoque" type="number" step="0.5" min="0" placeholder="Estoque" size="6">
    <button class="btn btn--acao btn--sm" type="submit">Adicionar cor</button>
  </form>
</section>

<section class="caixa">
  <h2>Preço por faixa</h2>
  <p class="dica">O preço vale A PARTIR da quantidade indicada. A faixa seguinte
    é que define onde esta termina — por isso não há campo "até".</p>
  ${faixas.length ? `<form method="post" action="/restrito/faixas/lote">
  <input type="hidden" name="artigo_id" value="${id}">
  <table class="tab">
    <thead><tr><th>A partir de</th><th>Preço</th><th>Rótulo</th><th></th></tr></thead>
    <tbody>${faixas.map((f) => `<tr>
      <td><input name="d_${f.id}" type="number" step="0.5" min="0" value="${f.de}" size="6"></td>
      <td><input name="p_${f.id}" type="number" step="0.01" min="0" value="${f.preco}" size="6"></td>
      <td><input name="r_${f.id}" value="${esc(f.rotulo)}" maxlength="40"></td>
      <td class="tab__fim"><button class="btn--perigo" name="apagar" value="${f.id}"
        formnovalidate>apagar</button></td>
    </tr>`).join("")}</tbody></table>
  <div class="barra-acao"><button class="btn btn--acao btn--sm" type="submit">Salvar faixas</button></div>
  </form>` : `<p class="nada">Sem faixas: vale o preço da cor.</p>`}

  <form method="post" action="/restrito/faixas/nova" class="linha-forma linha-forma--nova">
    <input type="hidden" name="artigo_id" value="${id}">
    <input name="de" type="number" step="0.5" min="0" placeholder="A partir de" required size="8">
    <input name="preco" type="number" step="0.01" min="0" placeholder="Preço" required size="8">
    <input name="rotulo" placeholder="Rótulo (ex.: rolo fechado)" maxlength="40">
    <button class="btn btn--acao btn--sm" type="submit">Adicionar faixa</button>
  </form>
</section>`}`;
}

/* ==========================================================================
   FAMÍLIAS
   ========================================================================== */
function familias(salvo = false) {
  const f = Q.todos(`SELECT f.*, (SELECT COUNT(*) FROM artigos a WHERE a.familia_id=f.id) n
                     FROM familias f ORDER BY ordem`);
  const CORES = ["jeans", "sarja", "malha", "moletom", "tricoline", "viscose",
                 "alfaiataria", "aviamentos"];

  return `
${salvo ? `<p class="aviso aviso--ok">Famílias salvas.</p>` : ""}
<p class="dica">A cor da família é a etiqueta que ela ganha no site. Elas vêm das
  oito pétalas do logotipo — por isso são oito, e mudar aqui muda o site inteiro.</p>

<form method="post" action="/restrito/familias">
<table class="tab">
  <thead><tr><th>Nome</th><th>Endereço</th><th>Resumo</th><th>Cor</th>
    <th>Foto</th><th>Ordem</th><th>Artigos</th><th>No ar</th></tr></thead>
  <tbody>${f.map((x) => `<tr>
    <td><input name="n_${x.id}" value="${esc(x.nome)}" required maxlength="60"></td>
    <td class="sub"><code>/${esc(x.slug)}/</code></td>
    <td><input name="r_${x.id}" value="${esc(x.resumo)}" maxlength="200"></td>
    <td><select name="c_${x.id}">${CORES.map((c) =>
      `<option${c === x.cor ? " selected" : ""}>${c}</option>`).join("")}</select></td>
    <td><input name="f_${x.id}" value="${esc(x.foto || "")}" maxlength="200"
        placeholder="caminho da imagem"></td>
    <td><input name="o_${x.id}" type="number" value="${x.ordem}" size="3"></td>
    <td>${x.n}</td>
    <td><input name="a_${x.id}" type="checkbox" value="1"${x.ativo ? " checked" : ""}></td>
  </tr>`).join("")}</tbody>
</table>
<div class="barra-acao"><button class="btn btn--acao" type="submit">Salvar famílias</button></div>
</form>`;
}

/* ==========================================================================
   ESTOQUE E PREÇO — a grade do balcão

   Todas as cores de todos os artigos numa tela, editáveis de uma vez. É a tela
   que a loja abre depois que a carga chega do fornecedor.
   ========================================================================== */
function estoque(salvo = false) {
  const cores = Q.todos(`
    SELECT c.*, a.nome artigo, a.unidade, a.id aid, f.nome familia
      FROM cores c JOIN artigos a ON a.id = c.artigo_id
      JOIN familias f ON f.id = a.familia_id
     ORDER BY f.ordem, a.nome, c.ordem, c.id`);

  let artigoAtual = null;
  const linhas = cores.map((c) => {
    const cabecalho = c.aid !== artigoAtual
      ? `<tr class="tr--sub"><td colspan="5"><strong>${esc(c.artigo)}</strong>
           <span class="sub">${esc(c.familia)}</span>
           <a class="btn--texto" href="/restrito/artigos/${c.aid}">abrir ficha</a></td></tr>`
      : "";
    artigoAtual = c.aid;
    return cabecalho + `<tr>
      <td><i class="bolinha" style="background:${esc(c.hex)}"></i> ${esc(c.nome)}
        ${c.codigo ? `<span class="sub">${esc(c.codigo)}</span>` : ""}</td>
      <td><input name="p_${c.id}" type="number" step="0.01" min="0" value="${c.preco}"></td>
      <td><input name="e_${c.id}" type="number" step="0.5" min="0" value="${c.estoque}"></td>
      <td class="sub">${esc(c.unidade)}</td>
      <td><input name="v_${c.id}" type="checkbox" value="1"${c.ativo ? " checked" : ""}></td>
    </tr>`;
  }).join("");

  return `
${salvo ? `<p class="aviso aviso--ok">Estoque e preços salvos. Já estão no site.</p>` : ""}
<p class="dica">Todas as cores numa tela só: dá para conferir a carga inteira e
  salvar uma vez. O preço aqui é o preço BASE — as faixas por quantidade ficam
  na ficha de cada artigo e continuam valendo por cima deste.</p>

<form method="post" action="/restrito/estoque">
<table class="tab tab--grade">
  <thead><tr><th>Cor</th><th>Preço base</th><th>Estoque</th><th>Un.</th><th>No ar</th></tr></thead>
  <tbody>${linhas || `<tr><td colspan="5" class="nada">Nenhuma cor cadastrada.</td></tr>`}</tbody>
</table>
<div class="barra-acao barra-acao--fixa">
  <button class="btn btn--acao" type="submit">Salvar tudo</button></div>
</form>`;
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

  if (partes[0] === "entrar" && req.method === "POST") {
    const d = await lerCorpo(req);
    const user = String(d.usuario || "").toLowerCase().slice(0, 40);
    const chaves = [`ip:${P.ipDe(req)}`, `conta:${user}`];
    if (chaves.some((c) => !P.podeTentar(c)))
      return html(429, P.telaEntrada("restrito", "Painel dos produtos",
        "Muitas tentativas. Espere alguns minutos e tente de novo."));

    const u = Q.um("SELECT * FROM usuarios WHERE usuario = ? AND ativo = 1", user);
    if (!u || !P.conferir(d.senha, u.senha) || !P.podeVer(u, "restrito")) {
      chaves.forEach(P.anotarFalha);
      P.anotar(user, "ENTRADA_NEGADA", "restrito");
      return html(401, P.telaEntrada("restrito", "Painel dos produtos",
        "Usuário ou senha não conferem."));
    }
    chaves.forEach(P.limparFalhas);
    P.abrirSessao(res, u.id, "restrito");
    P.anotar(u.usuario, "ENTROU", "restrito");
    return volta("/restrito/");
  }

  const eu = P.quemE(req, "restrito");
  if (!eu || !P.podeVer(eu, "restrito"))
    return html(200, P.telaEntrada("restrito", "Painel dos produtos"));

  if (partes[0] === "sair" && req.method === "POST") {
    P.anotar(eu.usuario, "SAIU", "restrito");
    P.fecharSessao(req, res, "restrito");
    return volta("/restrito/");
  }

  const rota = partes[0] || "";

  /* --------------------------------------------------------------- POSTs */
  if (req.method === "POST") {
    const d = await lerCorpo(req);
    const num = (x) => { const n = Number(String(x).replace(",", ".")); return Number.isFinite(n) ? n : 0; };

    if (rota === "pedidos" && SITUACOES.includes(d.situacao)) {
      Q.roda("UPDATE pedidos SET situacao = ? WHERE id = ?", d.situacao, Number(partes[1]));
      P.anotar(eu.usuario, "PEDIDO_SITUACAO", "pedidos", `${partes[1]} → ${d.situacao}`);
      return volta(`/restrito/pedidos/${Number(partes[1])}`);
    }

    if (rota === "artigos") {
      /* Campo numérico VAZIO vira NULL, e não string. Passar "" para coluna
         inteira é erro em Postgres e vira 0 silencioso em SQLite — os dois
         indesejados. Aqui a gramatura em branco fica em branco mesmo. */
      const inteiro = (x) => (String(x).trim() === "" ? null : Math.round(num(x)));
      const campos = [
        String(d.nome || "").slice(0, 120),
        Number(d.familia_id) || 1,
        String(d.chamada || "").slice(0, 200),
        String(d.descricao || ""),
        String(d.composicao || "").slice(0, 160),
        inteiro(d.gramatura), inteiro(d.largura),
        String(d.encolhimento || "").slice(0, 80),
        d.elastano ? 1 : 0,
        String(d.indicacao || "").slice(0, 200),
        ["m", "kg", "pç"].includes(d.unidade) ? d.unidade : "m",
        num(d.minimo) || 1, d.destaque ? 1 : 0, d.ativo ? 1 : 0,
        String(d.foto || "").slice(0, 200),
      ];
      if (!campos[0]) return volta("/restrito/artigos");

      if (partes[1] === "novo") {
        const { slugify } = require("./admin");
        let slug = slugify(campos[0]);
        /* Slug repetido ganha sufixo em vez de recusar o cadastro: "Jeans 3D"
           de duas famílias diferentes é caso real, e travar o cadastro por
           causa disso é o painel discutindo com quem trabalha. */
        let i = 2;
        while (Q.um("SELECT id FROM artigos WHERE slug = ?", slug)) slug = `${slugify(campos[0])}-${i++}`;
        const r = Q.roda(`INSERT INTO artigos (nome, familia_id, chamada, descricao,
          composicao, gramatura, largura, encolhimento, elastano, indicacao,
          unidade, minimo, destaque, ativo, foto, slug) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          ...campos, slug);
        P.anotar(eu.usuario, "ARTIGO_CRIADO", "artigos", campos[0]);
        return volta(`/restrito/artigos/${r.lastInsertRowid}`);
      }
      Q.roda(`UPDATE artigos SET nome=?, familia_id=?, chamada=?, descricao=?,
        composicao=?, gramatura=?, largura=?, encolhimento=?, elastano=?,
        indicacao=?, unidade=?, minimo=?, destaque=?, ativo=?, foto=? WHERE id=?`,
        ...campos, Number(partes[1]));
      P.anotar(eu.usuario, "ARTIGO_EDITADO", "artigos", campos[0]);
      return volta(`/restrito/artigos/${Number(partes[1])}`);
    }

    if (rota === "cores") {
      if (partes[1] === "nova") {
        const aid = Number(d.artigo_id);
        if (!aid || !d.nome) return volta("/restrito/artigos");
        Q.roda(`INSERT INTO cores (artigo_id, nome, codigo, hex, preco, estoque)
                VALUES (?,?,?,?,?,?)`, aid, String(d.nome).slice(0, 60),
          String(d.codigo || "").slice(0, 30), String(d.hex || "#cccccc").slice(0, 9),
          num(d.preco), num(d.estoque));
        P.anotar(eu.usuario, "COR_CRIADA", "cores", `${aid}: ${d.nome}`);
        return volta(`/restrito/artigos/${aid}`);
      }
      const aid = Number(d.artigo_id);
      if (!aid) return volta("/restrito/artigos");

      if (d.apagar) {
        const id = Number(d.apagar);
        /* Cor com pedido gravado não some: o pedido antigo aponta para ela.
           Apagar deixaria a linha do pedido sem referência — e o histórico da
           loja com um buraco que ninguém sabe explicar depois. */
        const usada = Q.um("SELECT COUNT(*) c FROM pedido_itens WHERE cor_id = ?", id).c;
        if (usada) Q.roda("UPDATE cores SET ativo = 0 WHERE id = ?", id);
        else Q.roda("DELETE FROM cores WHERE id = ?", id);
        P.anotar(eu.usuario, usada ? "COR_DESATIVADA" : "COR_APAGADA", "cores", id);
        return volta(`/restrito/artigos/${aid}`);
      }

      for (const c of Q.todos("SELECT id FROM cores WHERE artigo_id = ?", aid)) {
        if (d[`n_${c.id}`] === undefined) continue;
        Q.roda(`UPDATE cores SET nome=?, codigo=?, hex=?, preco=?, estoque=?, ativo=?
                WHERE id=?`, String(d[`n_${c.id}`]).slice(0, 60),
          String(d[`c_${c.id}`] || "").slice(0, 30),
          String(d[`h_${c.id}`] || "#cccccc").slice(0, 9),
          num(d[`p_${c.id}`]), num(d[`e_${c.id}`]), d[`v_${c.id}`] ? 1 : 0, c.id);
      }
      P.anotar(eu.usuario, "CORES_SALVAS", "cores", `artigo ${aid}`);
      return volta(`/restrito/artigos/${aid}`);
    }

    if (rota === "faixas") {
      if (partes[1] === "nova") {
        const aid = Number(d.artigo_id);
        if (!aid) return volta("/restrito/artigos");
        Q.roda("INSERT INTO faixas (artigo_id, de, preco, rotulo) VALUES (?,?,?,?)",
          aid, num(d.de), num(d.preco), String(d.rotulo || "").slice(0, 40));
        P.anotar(eu.usuario, "FAIXA_CRIADA", "faixas", `${aid}: a partir de ${d.de}`);
        return volta(`/restrito/artigos/${aid}`);
      }
      const aid = Number(d.artigo_id);
      if (!aid) return volta("/restrito/artigos");
      if (d.apagar) {
        Q.roda("DELETE FROM faixas WHERE id = ?", Number(d.apagar));
        P.anotar(eu.usuario, "FAIXA_APAGADA", "faixas", d.apagar);
        return volta(`/restrito/artigos/${aid}`);
      }
      for (const f of Q.todos("SELECT id FROM faixas WHERE artigo_id = ?", aid)) {
        if (d[`d_${f.id}`] === undefined) continue;
        Q.roda("UPDATE faixas SET de=?, preco=?, rotulo=? WHERE id=?",
          num(d[`d_${f.id}`]), num(d[`p_${f.id}`]),
          String(d[`r_${f.id}`] || "").slice(0, 40), f.id);
      }
      P.anotar(eu.usuario, "FAIXAS_SALVAS", "faixas", `artigo ${aid}`);
      return volta(`/restrito/artigos/${aid}`);
    }

    if (rota === "familias") {
      for (const f of Q.todos("SELECT id FROM familias")) {
        if (d[`n_${f.id}`] === undefined) continue;
        Q.roda("UPDATE familias SET nome=?, resumo=?, cor=?, foto=?, ordem=?, ativo=? WHERE id=?",
          String(d[`n_${f.id}`]).slice(0, 60), String(d[`r_${f.id}`] || "").slice(0, 200),
          String(d[`c_${f.id}`] || "jeans").slice(0, 20), String(d[`f_${f.id}`] || "").slice(0, 200),
          Math.round(num(d[`o_${f.id}`])), d[`a_${f.id}`] ? 1 : 0, f.id);
      }
      P.anotar(eu.usuario, "FAMILIAS_SALVAS", "familias");
      return volta("/restrito/familias?ok=1");
    }

    if (rota === "estoque") {
      let n = 0;
      for (const c of Q.todos("SELECT id FROM cores")) {
        if (d[`p_${c.id}`] === undefined) continue;
        Q.roda("UPDATE cores SET preco=?, estoque=?, ativo=? WHERE id=?",
          num(d[`p_${c.id}`]), num(d[`e_${c.id}`]), d[`v_${c.id}`] ? 1 : 0, c.id);
        n++;
      }
      P.anotar(eu.usuario, "ESTOQUE_SALVO", "cores", `${n} cores`);
      return volta("/restrito/estoque?ok=1");
    }

    return volta("/restrito/");
  }

  /* ---------------------------------------------------------------- GETs */
  if (rota === "") return html(200, tela(eu, "", "Início", inicio()));
  if (rota === "familias") return html(200, tela(eu, "familias", "Famílias", familias(!!q.ok)));
  if (rota === "estoque") return html(200, tela(eu, "estoque", "Estoque e preço", estoque(!!q.ok)));

  if (rota === "pedidos") {
    if (!partes[1]) return html(200, tela(eu, "pedidos", "Pedidos", pedidos(q.s || "")));
    const p = pedido(Number(partes[1]));
    return p ? html(200, tela(eu, "pedidos", "Pedido", p))
             : html(404, tela(eu, "pedidos", "Não encontrado", `<p class="nada">Pedido não encontrado.</p>`));
  }

  if (rota === "artigos") {
    if (!partes[1]) return html(200, tela(eu, "artigos", "Artigos", artigos()));
    if (partes[1] === "novo") return html(200, tela(eu, "artigos", "Novo artigo", artigoForma(null)));
    const f = artigoForma(Number(partes[1]));
    return f ? html(200, tela(eu, "artigos", "Ficha do artigo", f))
             : html(404, tela(eu, "artigos", "Não encontrado", `<p class="nada">Artigo não encontrado.</p>`));
  }

  return html(404, tela(eu, "", "Não encontrada", `<p class="nada">Tela não encontrada.</p>`));
}

module.exports = { atender };
