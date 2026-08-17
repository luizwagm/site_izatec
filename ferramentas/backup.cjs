"use strict";
/* ==========================================================================
   BACKUP — cópia consistente do banco

     node ferramentas/backup.cjs

   ---------------------------------------------------------------------------
   POR QUE NÃO `cp izatec.db backup.db`

   O banco roda em modo WAL: parte do que já foi gravado está no arquivo
   `-wal`, não no `.db`. Copiar só o `.db` com o site no ar produz um arquivo
   que ABRE sem erro e está faltando os últimos pedidos — o pior tipo de
   backup, o que só se descobre quebrado no dia da restauração.

   `VACUUM INTO` resolve: o próprio SQLite escreve um banco novo, completo e
   já compactado, sem parar o site.

   As cópias antigas são apagadas DEPOIS de a nova estar gravada, e nunca a
   última. Se o disco encher no meio, o que sobra é a cópia velha — e não
   nenhuma.
   ========================================================================== */
const fs = require("node:fs");
const path = require("node:path");
const { db, CAMINHO } = require("../src/db");

const RAIZ = path.join(__dirname, "..");
const PASTA = process.env.IZATEC_BACKUPS || path.join(RAIZ, "backups");
const MANTER = Number(process.env.IZATEC_BACKUPS_MANTER) || 14;

fs.mkdirSync(PASTA, { recursive: true });

const agora = new Date();
const carimbo = agora.toISOString().slice(0, 19).replace(/[:T]/g, "-");
const alvo = path.join(PASTA, `izatec-${carimbo}.db`);

db.prepare(`VACUUM INTO ?`).run(alvo);

const tamanho = (fs.statSync(alvo).size / 1024 / 1024).toFixed(2);
console.log(`  ✔ backup gravado: ${alvo} (${tamanho} MB)`);

/* --------------------------------------------------------- faxina */
const copias = fs.readdirSync(PASTA)
  .filter((f) => /^izatec-.*\.db$/.test(f))
  .sort()                     /* o carimbo ISO ordena por data sozinho */
  .reverse();

if (copias.length > MANTER) {
  for (const velha of copias.slice(MANTER)) {
    fs.unlinkSync(path.join(PASTA, velha));
    console.log(`    · apagada a cópia antiga ${velha}`);
  }
}
console.log(`  ${Math.min(copias.length, MANTER)} cópias guardadas (limite ${MANTER}).`);

/* Uma conferência de sanidade: o backup ABRE e tem as tabelas?
   Backup que ninguém testa é esperança, não backup. */
const Database = require("better-sqlite3");
const conf = new Database(alvo, { readonly: true });
const n = conf.prepare(
  "SELECT COUNT(*) c FROM sqlite_master WHERE type='table'").get().c;
const artigos = conf.prepare("SELECT COUNT(*) c FROM artigos").get().c;
conf.close();
console.log(`  ✔ conferido: ${n} tabelas, ${artigos} artigos dentro da cópia.`);
console.log(`\n  Para restaurar: pare o serviço e copie a cópia por cima de`);
console.log(`  ${CAMINHO} (apagando também os arquivos -wal e -shm).\n`);
