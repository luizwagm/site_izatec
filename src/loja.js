"use strict";
/* ==========================================================================
   LOJA — carrinho e fechamento do pedido

   ---------------------------------------------------------------------------
   O CARRINHO VIVE NUM COOKIE ASSINADO, e não em sessão no servidor

   Motivo prático: quem compra tecido monta o pedido ao longo do dia, entre um
   corte e outro, e volta ao site três vezes. Sessão em memória morreria no
   primeiro restart do serviço, e o comprador voltaria para um carrinho vazio
   sem entender por quê.

   O cookie guarda só PARES de id e quantidade — nunca preço. Preço vindo do
   navegador é preço que o cliente consegue editar antes de enviar; aqui ele é
   sempre recalculado do banco, na hora de mostrar e na hora de gravar.

   A ASSINATURA (HMAC) não é para esconder o conteúdo: é para o servidor saber
   que aquele carrinho saiu daqui. Sem ela, alguém montaria um cookie com um
   id de cor que não existe e o site teria de tratar lixo em toda consulta.
   ========================================================================== */
const crypto = require("node:crypto");
const { Q, txt, precoPara } = require("./db");
const { pagina, esc, zap, SITE } = require("./layout");
const { dinheiro } = require("./paginas");

/* ==========================================================================
   A CHAVE PRECISA SOBREVIVER AO RESTART

   Primeira versão sorteava a chave na subida do processo. Funcionava — e
   esvaziava o carrinho de TODO MUNDO a cada deploy, coisa que só apareceu
   quando reiniciei o servidor no meio de uma compra de teste. Quem estava
   montando o pedido volta e encontra a tela vazia, sem entender por quê.

   Agora: a chave vem do ambiente; na falta dele, é sorteada UMA VEZ e guardada
   no banco. Constante escrita no código estava fora de questão — qualquer
   pessoa com acesso ao repositório poderia forjar um carrinho assinado.
   ========================================================================== */
function chave() {
  if (process.env.IZATEC_SEGREDO) return process.env.IZATEC_SEGREDO;
  const guardada = Q.um("SELECT valor FROM config WHERE chave = 'sistema.segredo'");
  if (guardada && guardada.valor) return guardada.valor;
  const nova = crypto.randomBytes(32).toString("hex");
  /* grupo 'sistema' não aparece na tela de textos do painel: é chave de
     assinatura, não conteúdo editável. */
  Q.roda(`INSERT INTO config (chave, valor, grupo, rotulo) VALUES (?,?,?,?)`,
    "sistema.segredo", nova, "sistema", "Chave de assinatura do carrinho");
  return nova;
}
const CHAVE = chave();

function assinar(dados) {
  return crypto.createHmac("sha256", CHAVE).update(dados).digest("base64url");
}

function lerCarrinho(req) {
  const bruto = (req.headers.cookie || "");
  const m = /(?:^|;\s*)carrinho=([^;]*)/.exec(bruto);
  if (!m) return [];
  try {
    const valor = decodeURIComponent(m[1]);
    const [corpo, assinatura] = valor.split(".");
    if (!corpo || !assinatura) return [];
    const esperado = assinar(corpo);
    const a = Buffer.from(assinatura), b = Buffer.from(esperado);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return [];
    const itens = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8"));
    return Array.isArray(itens) ? itens.slice(0, 40) : [];
  } catch { return []; }
}

function gravarCarrinho(res, itens) {
  const corpo = Buffer.from(JSON.stringify(itens)).toString("base64url");
  const valor = encodeURIComponent(`${corpo}.${assinar(corpo)}`);
  res.setHeader("Set-Cookie",
    `carrinho=${valor}; Path=/; Max-Age=${30 * 24 * 3600}; HttpOnly; SameSite=Lax`);
}

/* ==========================================================================
   MONTAR O PEDIDO A PARTIR DO CARRINHO

   Aqui é onde o preço nasce: sempre do banco, sempre passando pelas faixas.
   O que veio do cookie é só "qual cor" e "quanto".
   ========================================================================== */
function montar(itens) {
  const linhas = [];
  let total = 0;

  for (const it of itens) {
    const c = Q.um(`
      SELECT c.*, a.id artigo_id, a.nome artigo, a.slug, a.unidade, a.minimo,
             f.slug familia_slug
        FROM cores c JOIN artigos a ON a.id = c.artigo_id
        JOIN familias f ON f.id = a.familia_id
       WHERE c.id = ? AND c.ativo = 1 AND a.ativo = 1`, Number(it.id));
    if (!c) continue;   /* cor apagada depois de o cliente montar o carrinho */

    const qtd = Math.max(c.minimo, Number(it.q) || 0);
    const preco = precoPara(c.artigo_id, qtd, c.preco);
    const subtotal = Math.round(qtd * preco * 100) / 100;
    total += subtotal;

    linhas.push({
      cor_id: c.id, artigo: c.artigo, cor: c.nome, codigo: c.codigo, hex: c.hex,
      unidade: c.unidade, quantidade: qtd, preco, subtotal,
      url: `/catalogo/${c.familia_slug}/${c.slug}/`,
      /* O estoque é conferido AQUI e mostrado na linha, não bloqueado: em
         atacado, pedir mais do que há em estoque é comum e vira encomenda.
         Bloquear perderia a venda; avisar deixa a loja combinar o prazo. */
      alerta: qtd > c.estoque ? `Temos ${c.estoque} ${c.unidade} em estoque — o restante vira encomenda` : "",
    });
  }
  return { linhas, total: Math.round(total * 100) / 100 };
}

/* ========================================================================== */
function paginaCarrinho(req) {
  const { linhas, total } = montar(lerCarrinho(req));

  const corpo = `
<nav class="migalha env" aria-label="Você está aqui">
  <a href="/">Início</a> <span>›</span> <b>Meu pedido</b>
</nav>

<section class="secao secao--curta">
  <div class="env">
    <div class="cab">
      <span class="cab__sobre">Pedido</span>
      <h1>O que você separou</h1>
    </div>

    ${!linhas.length ? `
    <div class="vazio">
      <h3>Seu pedido está vazio</h3>
      <p>Escolha os tecidos no catálogo e volte aqui para fechar.</p>
      <a class="btn btn--acao" href="/catalogo/">Ver os tecidos</a>
    </div>` : `
    <form method="post" action="/carrinho/atualizar" class="carrinho">
      <table class="tabela-pedido">
        <caption class="so-leitor">Itens do pedido</caption>
        <thead><tr>
          <th scope="col">Tecido</th><th scope="col">Qtd.</th>
          <th scope="col">Preço</th><th scope="col">Subtotal</th><th></th>
        </tr></thead>
        <tbody>
        ${linhas.map((l) => `
          <tr>
            <td>
              <span class="tp__cor" style="background:${esc(l.hex)}" aria-hidden="true"></span>
              <a href="${esc(l.url)}"><strong>${esc(l.artigo)}</strong></a>
              <span class="tp__sub">${esc(l.cor)}${l.codigo ? " · " + esc(l.codigo) : ""}</span>
              ${l.alerta ? `<span class="tp__alerta">${esc(l.alerta)}</span>` : ""}
            </td>
            <td><input type="number" name="q_${l.cor_id}" value="${l.quantidade}"
                       min="0" step="0.5" inputmode="decimal" aria-label="Quantidade de ${esc(l.artigo)}">
                <span class="tp__un">${esc(l.unidade)}</span></td>
            <td>${dinheiro(l.preco)}</td>
            <td><strong>${dinheiro(l.subtotal)}</strong></td>
            <td><button class="tp__x" type="submit" name="remover" value="${l.cor_id}"
                        aria-label="Remover ${esc(l.artigo)}">&times;</button></td>
          </tr>`).join("")}
        </tbody>
        <tfoot><tr>
          <td colspan="3">Total</td>
          <td colspan="2"><strong class="tp__total">${dinheiro(total)}</strong></td>
        </tr></tfoot>
      </table>

      <div class="carrinho__acoes">
        <button class="btn btn--linha" type="submit">Atualizar quantidades</button>
        <a class="btn btn--acao" href="/pedido/">Fechar pedido</a>
      </div>
      <p class="carrinho__nota">O frete e o prazo são combinados no fechamento —
        eles mudam com a cidade e com a metragem, e um valor chutado aqui só
        atrapalharia a sua conta.</p>
    </form>`}
  </div>
</section>`;

  return pagina({ titulo: "Meu pedido", descricao: "Itens separados para orçamento.",
    atual: "", canonical: "/carrinho/", corpo });
}

/* ==========================================================================
   FECHAMENTO

   Não há pagamento online nesta primeira versão, e a decisão é do negócio:
   em atacado têxtil o valor final depende de frete por metragem e de acerto
   comercial. O pedido chega ao painel e a loja confirma — que é como a venda
   já acontece hoje no balcão.

   O que o site faz é tirar da loja o trabalho de digitar o pedido.
   ========================================================================== */
function paginaFechar(req) {
  const { linhas, total } = montar(lerCarrinho(req));
  if (!linhas.length) return null;

  const corpo = `
<nav class="migalha env" aria-label="Você está aqui">
  <a href="/">Início</a> <span>›</span> <a href="/carrinho/">Meu pedido</a>
  <span>›</span> <b>Fechar</b>
</nav>

<section class="secao secao--curta">
  <div class="env fechar">
    <form class="fechar__form" method="post" action="/pedido/enviar">
      <div class="cab"><span class="cab__sobre">Último passo</span>
        <h1>Para quem é o pedido</h1></div>

      <div class="campo"><label for="f-nome">Seu nome *</label>
        <input id="f-nome" name="nome" required autocomplete="name" maxlength="120"></div>
      <div class="campo"><label for="f-emp">Confecção</label>
        <input id="f-emp" name="empresa" autocomplete="organization" maxlength="120"></div>
      <div class="campo"><label for="f-doc">CNPJ ou CPF</label>
        <input id="f-doc" name="documento" maxlength="20" inputmode="numeric"></div>
      <div class="campo"><label for="f-tel">WhatsApp *</label>
        <input id="f-tel" name="telefone" required inputmode="tel" autocomplete="tel" maxlength="20"></div>
      <div class="campo"><label for="f-mail">E-mail</label>
        <input id="f-mail" name="email" type="email" autocomplete="email" maxlength="160"></div>
      <div class="campo"><label for="f-cid">Cidade *</label>
        <input id="f-cid" name="cidade" required maxlength="80" autocomplete="address-level2"></div>

      <fieldset class="campo campo--radio">
        <legend>Como prefere receber</legend>
        <label><input type="radio" name="entrega" value="retirada" checked>
          Retirar na loja (Caruaru ou Toritama)</label>
        <label><input type="radio" name="entrega" value="transportadora">
          Enviar por transportadora</label>
      </fieldset>

      <div class="campo"><label for="f-obs">Observação</label>
        <textarea id="f-obs" name="observacao" rows="3" maxlength="600"
          placeholder="Prazo, lote, alguma preferência"></textarea></div>

      <button class="btn btn--acao btn--largo" type="submit">Enviar pedido</button>
      <p class="amostra__lgpd">Ao enviar, a loja recebe o pedido e responde pelo
        WhatsApp com frete e prazo. Seus dados são usados só para isso.</p>
    </form>

    <aside class="fechar__resumo" aria-label="Resumo do pedido">
      <h2>Resumo</h2>
      <ul>
        ${linhas.map((l) => `<li>
          <span>${esc(l.artigo)} · ${esc(l.cor)}</span>
          <b>${l.quantidade} ${esc(l.unidade)}</b>
          <em>${dinheiro(l.subtotal)}</em></li>`).join("")}
      </ul>
      <p class="fechar__total"><span>Total</span> <strong>${dinheiro(total)}</strong></p>
      <p class="fechar__nota">Frete e prazo combinados na confirmação.</p>
      <a class="btn--texto" href="/carrinho/">Voltar e ajustar</a>
    </aside>
  </div>
</section>`;

  return pagina({ titulo: "Fechar pedido", descricao: "Dados para a loja confirmar o pedido.",
    atual: "", canonical: "/pedido/", corpo });
}

/* ========================================================================== */
function gravarPedido(dados, itensCarrinho) {
  const { linhas, total } = montar(itensCarrinho);
  if (!linhas.length) return null;

  /* Código legível para quem atende no balcão. A data na frente faz o pedido
     ser localizável por dia sem consulta ao banco. */
  const d = new Date();
  const codigo = `IZ-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}` +
    `${String(d.getDate()).padStart(2, "0")}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;

  const r = Q.roda(`
    INSERT INTO pedidos (codigo, nome, empresa, documento, telefone, email,
                         cidade, entrega, observacao, total)
    VALUES (?,?,?,?,?,?,?,?,?,?)`,
    codigo, dados.nome, dados.empresa || "", dados.documento || "",
    dados.telefone, dados.email || "", dados.cidade,
    dados.entrega === "transportadora" ? "transportadora" : "retirada",
    dados.observacao || "", total);

  for (const l of linhas) {
    Q.roda(`INSERT INTO pedido_itens (pedido_id, cor_id, descricao, quantidade, preco, subtotal)
            VALUES (?,?,?,?,?,?)`,
      r.lastInsertRowid, l.cor_id,
      `${l.artigo} · ${l.cor}${l.codigo ? " (" + l.codigo + ")" : ""}`,
      l.quantidade, l.preco, l.subtotal);
  }
  return { codigo, total, linhas };
}

function paginaObrigado(codigo, total, linhas) {
  const resumo = linhas.map((l) => `${l.quantidade}${l.unidade} de ${l.artigo} (${l.cor})`).join(", ");
  const corpo = `
<section class="secao">
  <div class="env obrigado">
    <span class="obrigado__selo" aria-hidden="true">✓</span>
    <h1>Pedido enviado</h1>
    <p class="obrigado__cod">Número do pedido: <strong>${esc(codigo)}</strong></p>
    <p>A loja recebeu e vai responder pelo WhatsApp com o frete, o prazo e a
      confirmação do lote. Guarde este número — é por ele que a gente acha o
      seu pedido no balcão.</p>
    <p class="obrigado__total">Total dos tecidos: <strong>${dinheiro(total)}</strong>
      <span>(sem frete)</span></p>
    <div class="obrigado__acoes">
      <a class="btn btn--acao" target="_blank" rel="noopener"
         href="${zap(`Olá! Acabei de enviar o pedido ${codigo}: ${resumo}`)}">
        Adiantar pelo WhatsApp</a>
      <a class="btn btn--linha" href="/catalogo/">Continuar vendo tecidos</a>
    </div>
  </div>
</section>`;
  return pagina({ titulo: "Pedido enviado", descricao: "", atual: "", canonical: "/pedido/", corpo });
}

module.exports = {
  lerCarrinho, gravarCarrinho, montar,
  paginaCarrinho, paginaFechar, gravarPedido, paginaObrigado,
};
