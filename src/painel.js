"use strict";
/* ==========================================================================
   PAINEL — a base comum de /admin e /restrito

   ---------------------------------------------------------------------------
   POR QUE UMA BASE, E NÃO DOIS PAINÉIS INDEPENDENTES

   Os dois painéis têm públicos diferentes (quem escreve o site × quem cuida do
   estoque), mas a MESMA porta de entrada: senha, sessão, freio de tentativa,
   registro do que foi feito. Duplicar isso significaria corrigir uma falha de
   autenticação em dois lugares — e esquecer o segundo.

   O que NÃO é comum fica em cada painel: o menu, as telas e as permissões.
   ========================================================================== */
const crypto = require("node:crypto");
const { Q, txt } = require("./db");

const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/* ==========================================================================
   SENHA

   scrypt, com sal de 16 bytes por usuário e comparação em tempo constante.

   O custo de scrypt é o ponto: ele é lento DE PROPÓSITO. Quem levar o arquivo
   do banco embora não consegue testar milhões de senhas por segundo, que é o
   que torna um vazamento de hash rápido (SHA-256 puro) equivalente a um
   vazamento de senhas em texto.
   ========================================================================== */
function cifrar(senha) {
  const sal = crypto.randomBytes(16).toString("hex");
  const h = crypto.scryptSync(String(senha), sal, 64).toString("hex");
  return `${sal}:${h}`;
}

function conferir(senha, guardado) {
  try {
    const [sal, h] = String(guardado).split(":");
    if (!sal || !h) return false;
    const a = Buffer.from(h, "hex");
    const b = crypto.scryptSync(String(senha), sal, 64);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

/* ==========================================================================
   FREIO DE TENTATIVA — dois baldes, e os dois importam

   Por IP, para o robô que varre a internet testando senhas comuns.
   Por CONTA, para quem sabe QUEM usa o painel e mira só naquele usuário —
   esse troca de IP à vontade, e o balde por IP nunca o pega.

   Um balde só sempre deixa passar uma das duas famílias de ataque.
   ========================================================================== */
const tentativas = new Map();
function podeTentar(chave, limite = 6, janelaMs = 15 * 60 * 1000) {
  const agora = Date.now();
  const b = tentativas.get(chave) || { n: 0, ate: agora + janelaMs };
  if (agora > b.ate) { b.n = 0; b.ate = agora + janelaMs; }
  return b.n < limite;
}
function anotarFalha(chave, janelaMs = 15 * 60 * 1000) {
  const agora = Date.now();
  const b = tentativas.get(chave) || { n: 0, ate: agora + janelaMs };
  if (agora > b.ate) { b.n = 0; b.ate = agora + janelaMs; }
  b.n += 1;
  tentativas.set(chave, b);
  if (tentativas.size > 5000) tentativas.clear();
}
function limparFalhas(chave) { tentativas.delete(chave); }

const ipDe = (req) => (req.headers["x-forwarded-for"] || "").split(",").pop().trim()
  || req.socket.remoteAddress || "";

/* ==========================================================================
   SESSÃO

   Cookie HttpOnly com Path do PAINEL, não do site. Assim o cookie do painel
   não viaja em cada requisição de página pública — menos superfície e menos
   bytes em toda visita anônima.
   ========================================================================== */
function abrirSessao(res, usuarioId, prefixo) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expira = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
  Q.roda("INSERT INTO sessoes (token, usuario_id, expira) VALUES (?,?,?)",
    token, usuarioId, expira);
  Q.roda("UPDATE usuarios SET entrou = datetime('now') WHERE id = ?", usuarioId);
  Q.roda("DELETE FROM sessoes WHERE expira < datetime('now')");
  res.setHeader("Set-Cookie",
    `ses_${prefixo}=${token}; Path=/${prefixo}; HttpOnly; SameSite=Lax; Max-Age=${12 * 3600}`);
  return token;
}

function fecharSessao(req, res, prefixo) {
  const t = cookie(req, `ses_${prefixo}`);
  if (t) Q.roda("DELETE FROM sessoes WHERE token = ?", t);
  res.setHeader("Set-Cookie", `ses_${prefixo}=; Path=/${prefixo}; HttpOnly; Max-Age=0`);
}

function cookie(req, nome) {
  const m = new RegExp(`(?:^|;\\s*)${nome}=([^;]*)`).exec(req.headers.cookie || "");
  return m ? decodeURIComponent(m[1]) : "";
}

function quemE(req, prefixo) {
  const t = cookie(req, `ses_${prefixo}`);
  if (!t) return null;
  return Q.um(`
    SELECT u.id, u.usuario, u.nome, u.papel FROM sessoes s
      JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.token = ? AND s.expira > datetime('now') AND u.ativo = 1`, t) || null;
}

const podeVer = (u, painel) =>
  !!u && (u.papel === "dono" || (painel === "admin" ? u.papel === "admin" : u.papel === "estoque"));

function anotar(usuario, acao, alvo = "", detalhe = "") {
  try {
    Q.roda("INSERT INTO auditoria (usuario, acao, alvo, detalhe) VALUES (?,?,?,?)",
      usuario, acao, String(alvo), String(detalhe).slice(0, 400));
  } catch { /* trilha nunca derruba a operação que ela registra */ }
}

/* ==========================================================================
   TELA DE ENTRADA

   Um erro só, genérico: "usuário ou senha não conferem". Dizer "esse usuário
   não existe" entrega ao atacante metade do trabalho — ele descobre quais
   contas existem antes de começar a adivinhar senha.
   ========================================================================== */
function telaEntrada(prefixo, titulo, erro = "") {
  return `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)} — ${esc(txt("marca.nome", "Izatec"))}</title>
<meta name="robots" content="noindex,nofollow">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/css/design-system.css">
<link rel="stylesheet" href="/assets/css/painel.css">
</head><body class="entrada">
<form class="entrada__cx" method="post" action="/${prefixo}/entrar">
  <div class="entrada__marca">
    <svg viewBox="0 0 96 96" width="56" height="56" role="img" aria-label="Izatec">
      <circle cx="34" cy="26" r="15" fill="var(--petala-agua)" opacity=".85"/>
      <circle cx="58" cy="20" r="15" fill="var(--petala-laranja)" opacity=".85"/>
      <circle cx="74" cy="38" r="15" fill="var(--petala-ouro)" opacity=".85"/>
      <circle cx="70" cy="60" r="15" fill="var(--petala-limao)" opacity=".85"/>
      <circle cx="52" cy="70" r="15" fill="var(--petala-verde)" opacity=".85"/>
      <circle cx="32" cy="64" r="15" fill="var(--petala-uva)" opacity=".85"/>
      <circle cx="22" cy="44" r="15" fill="var(--petala-caramelo)" opacity=".85"/>
      <circle cx="46" cy="44" r="17" fill="none" stroke="var(--acao)" stroke-width="7"/>
    </svg>
  </div>
  <h1>${esc(titulo)}</h1>
  ${erro ? `<p class="aviso aviso--erro">${esc(erro)}</p>` : ""}
  <label>Usuário<input name="usuario" required autofocus autocomplete="username"></label>
  <label>Senha<input name="senha" type="password" required autocomplete="current-password"></label>
  <button class="btn btn--acao btn--largo" type="submit">Entrar</button>
  <a class="entrada__voltar" href="/">← Voltar ao site</a>
</form>
</body></html>`;
}

/* ==========================================================================
   CASCA DO PAINEL — menu lateral, topo e conteúdo

   O menu é lista de grupos, e não uma barra horizontal: painel de loja cresce
   em telas (são doze aqui), e barra horizontal com doze itens vira menu
   suspenso dentro de menu suspenso.
   ========================================================================== */
function casca({ prefixo, titulo, usuario, menu, atual, corpo, versao }) {
  return `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)} — ${esc(txt("marca.nome", "Izatec"))}</title>
<meta name="robots" content="noindex,nofollow">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/css/design-system.css">
<link rel="stylesheet" href="/assets/css/painel.css">
</head><body class="painel">
<aside class="lado">
  <a class="lado__marca" href="/${prefixo}/">
    <span class="lado__flor" aria-hidden="true"></span>
    <span><b>${esc(txt("marca.nome", "Izatec"))}</b>${esc(prefixo === "admin" ? "Site" : "Produtos")}</span>
  </a>
  <nav class="lado__nav" aria-label="Menu do painel">
    ${menu.map((g) => `
    <div class="lado__grupo">
      <h2>${esc(g.grupo)}</h2>
      ${g.itens.map((i) => `<a href="/${prefixo}/${i.rota}"
        class="lado__i${atual === i.rota ? " lado__i--on" : ""}"${
        atual === i.rota ? ' aria-current="page"' : ""}>${esc(i.rotulo)}${
        i.selo ? `<b class="lado__selo">${i.selo}</b>` : ""}</a>`).join("")}
    </div>`).join("")}
  </nav>
  <p class="lado__ver">v${esc(versao)}</p>
</aside>

<div class="corpo">
  <header class="pt">
    <h1>${esc(titulo)}</h1>
    <div class="pt__dir">
      <a class="pt__site" href="/" target="_blank" rel="noopener">Ver o site ↗</a>
      <span class="pt__eu">${esc(usuario.nome || usuario.usuario)}
        <em>${esc({ dono: "Dono", admin: "Site", estoque: "Produtos" }[usuario.papel])}</em></span>
      <form method="post" action="/${prefixo}/sair"><button class="pt__sair">Sair</button></form>
    </div>
  </header>
  <main class="conteudo">${corpo}</main>
</div>
<script src="/assets/js/painel.js" defer></script>
</body></html>`;
}

module.exports = {
  cifrar, conferir, podeTentar, anotarFalha, limparFalhas, ipDe,
  abrirSessao, fecharSessao, quemE, podeVer, anotar, cookie,
  telaEntrada, casca, esc,
};
