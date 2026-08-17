"use strict";
/* ==========================================================================
   USUÁRIO — criar e trocar senha pela linha de comando

     node ferramentas/usuario.cjs criar  <usuario> <senha> [admin|estoque|dono]
     node ferramentas/usuario.cjs senha  <usuario> <senha>
     node ferramentas/usuario.cjs listar

   POR QUE ISSO EXISTE, se o painel já gerencia usuários: porque o primeiro
   acesso não tem de onde vir. E porque no dia em que o dono esquecer a senha,
   quem tem acesso ao servidor precisa de um caminho — sem esse caminho, a
   alternativa vira mexer no banco na mão, com SQL, às pressas.

   A senha NÃO entra no histórico do shell se for passada por variável:
     SENHA=xxxx node ferramentas/usuario.cjs criar dona "$SENHA" dono
   ========================================================================== */
const { Q } = require("../src/db");
const P = require("../src/painel");

const [, , acao, usuario, senha, papel] = process.argv;

function sair(msg) { console.error(msg); process.exit(1); }

if (acao === "listar") {
  const us = Q.todos("SELECT usuario, nome, papel, ativo, entrou FROM usuarios ORDER BY usuario");
  if (!us.length) return console.log("Nenhum usuário cadastrado.");
  console.log("\n  usuário            papel      ativo  último acesso");
  console.log("  " + "─".repeat(58));
  for (const u of us)
    console.log(`  ${u.usuario.padEnd(18)} ${u.papel.padEnd(10)} ${u.ativo ? " sim " : " NÃO "}  ${u.entrou || "nunca"}`);
  console.log("");
  process.exit(0);
}

if (!usuario || !senha) sair(
  "Uso:\n" +
  "  node ferramentas/usuario.cjs criar  <usuario> <senha> [admin|estoque|dono]\n" +
  "  node ferramentas/usuario.cjs senha  <usuario> <senha>\n" +
  "  node ferramentas/usuario.cjs listar");

if (String(senha).length < 8) sair("A senha precisa de pelo menos 8 caracteres.");
const user = String(usuario).toLowerCase().replace(/[^a-z0-9._-]/g, "");
if (!user) sair("Usuário inválido. Use letras minúsculas, números, ponto e traço.");

if (acao === "criar") {
  if (Q.um("SELECT id FROM usuarios WHERE usuario = ?", user))
    sair(`O usuário "${user}" já existe. Use "senha" para trocar a senha dele.`);
  const pp = ["admin", "estoque", "dono"].includes(papel) ? papel : "admin";
  Q.roda("INSERT INTO usuarios (usuario, nome, senha, papel) VALUES (?,?,?,?)",
    user, user, P.cifrar(senha), pp);
  console.log(`\n  ✔ usuário "${user}" criado com acesso "${pp}".`);
  console.log(`    ${pp === "estoque" ? "" : "/admin    → textos, Feed e mensagens\n    "}` +
              `${pp === "admin" ? "" : "/restrito → artigos, preço, estoque e pedidos"}\n`);
} else if (acao === "senha") {
  const u = Q.um("SELECT id FROM usuarios WHERE usuario = ?", user);
  if (!u) sair(`Usuário "${user}" não encontrado.`);
  Q.roda("UPDATE usuarios SET senha = ? WHERE id = ?", P.cifrar(senha), u.id);
  /* Trocar a senha encerra as sessões abertas daquele usuário: quem troca a
     senha por desconfiança precisa que a sessão do intruso caia junto. */
  Q.roda("DELETE FROM sessoes WHERE usuario_id = ?", u.id);
  console.log(`\n  ✔ senha de "${user}" trocada. As sessões abertas foram encerradas.\n`);
} else {
  sair(`Ação desconhecida: "${acao}". Use criar, senha ou listar.`);
}
