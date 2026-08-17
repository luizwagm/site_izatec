"use strict";
/* ==========================================================================
   BAIXAR AS FOTOS DO BANCO DE IMAGENS

     node ferramentas/baixar-banco.cjs

   ---------------------------------------------------------------------------
   AS FOTOS FICAM NO NOSSO DISCO, e não apontadas para o servidor do Pexels

   Três razões concretas:

   · uma imagem vinda de terceiro conta ao terceiro quem visitou a página, e a
     LGPD trata isso como transferência de dado sem base legal;
   · se o Pexels mudar a URL ou sair do ar, o site fica sem imagem nenhuma;
   · servida do nosso nginx, a foto entra no cache e no gzip junto com o resto.

   ---------------------------------------------------------------------------
   O NOME DO ARQUIVO GUARDA O ID DA FOTO

   `fam-jeans-4049757.jpg` — o número no fim é o id no Pexels. Sem ele, daqui a
   um ano ninguém consegue conferir a licença nem achar a foto original. O
   crédito completo fica em `assets/img/banco/CREDITOS.md`.

   Licença Pexels: uso comercial livre, sem atribuição obrigatória. A gente
   credita mesmo assim, porque saber a origem de um arquivo é o que permite
   trocá-lo depois sem medo.
   ========================================================================== */
const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");

const PASTA = path.join(__dirname, "..", "assets", "img", "banco");
fs.mkdirSync(PASTA, { recursive: true });

/* Largura por uso. Não existe motivo para uma foto de cartão de 15rem chegar
   com 2400px: são 400 KB desperdiçados em cada visita pelo celular no galpão. */
const L = { capa: 1800, larga: 1400, cartao: 800, quadro: 700 };

const FOTOS = [
  /* ------------------------------------------------------------ capa e seções */
  ["capa-tecidos",      9824794,  L.capa,  "Rolos de tecido coloridos na loja"],
  ["capa-jeans",        17329670, L.capa,  "Depósito de tecidos em rolos"],
  ["sec-producao",      17710109, L.larga, "Fila de máquinas industriais de costura"],
  ["sec-loja",          12008104, L.larga, "Rolos de tecido na prateleira"],
  ["sobre-medida",      6636369,  L.larga, "Mãos com fita métrica, medindo"],

  /* ------------------------------------------------------- as oito famílias */
  ["fam-jeans",         4049757,  L.quadro, "Textura de jeans"],
  ["fam-sarja",         36346049, L.quadro, "Tecido bege de trama aparente"],
  ["fam-malha",         6275942,  L.quadro, "Malha de algodão"],
  ["fam-moletom",       5908251,  L.quadro, "Algodão amassado, felpa"],
  ["fam-tricoline",     34634858, L.quadro, "Tecidos claros na prateleira da loja"],
  ["fam-viscose",       20531147, L.quadro, "Tecidos estampados de caimento solto"],
  ["fam-alfaiataria",   36106019, L.quadro, "Tecido listrado preto e cinza"],
  ["fam-aviamentos",    4618282,  L.quadro, "Linhas, botões e alfinetes"],

  /* ------------------------------------------------------------- os artigos */
  ["art-jeans-3d",      10133274, L.cartao, "Jeans dobrado"],
  ["art-jeans-pesado",  173207,   L.cartao, "Trama de jeans em close"],
  ["art-jeans-leve",    19203176, L.cartao, "Tecido de algodão azul claro"],
  ["art-sarja",         18372335, L.cartao, "Tecido azul de trama diagonal"],
  ["art-malha",         13368318, L.cartao, "Superfície de malha azul"],
  ["art-moletom",       6757420,  L.cartao, "Fibras bege, superfície felpuda"],
  ["art-tricoline",     6461399,  L.cartao, "Fita métrica sobre tecido escuro"],
  ["art-viscose",       35150389, L.cartao, "Jeans com zíper e botão"],

  /* ---------------------------------------------------------------- o Feed */
  ["feed-ficha",        10133280, L.larga, "Costura do jeans em close"],
  ["feed-rendimento",   4622403,  L.larga, "Costureira com fita métrica no ateliê"],
  ["feed-sarja-jeans",  10133275, L.larga, "Tecidos jeans empilhados"],
];

const url = (id, w) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${w}`;

function baixar(endereco, alvo) {
  return new Promise((ok, falha) => {
    https.get(endereco, { headers: { "User-Agent": "Izatec/1.2 (site da loja)" } }, (res) => {
      /* Redirecionamento é comum no CDN. Sem seguir, o arquivo gravado é uma
         página de 300 bytes que o navegador mostra como imagem quebrada. */
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return baixar(res.headers.location, alvo).then(ok, falha);
      }
      if (res.statusCode !== 200) { res.resume(); return falha(new Error("HTTP " + res.statusCode)); }
      const arquivo = fs.createWriteStream(alvo);
      res.pipe(arquivo);
      arquivo.on("finish", () => arquivo.close(() => ok()));
      arquivo.on("error", falha);
    }).on("error", falha);
  });
}

/* Um JPEG começa com FF D8 FF. Conferir isso é o que separa "baixou" de
   "baixou uma página de erro com nome .jpg" — que só se descobre olhando o
   site com a imagem quebrada. */
function ehJpeg(caminho) {
  try {
    const fd = fs.openSync(caminho, "r");
    const b = Buffer.alloc(3);
    fs.readSync(fd, b, 0, 3, 0);
    fs.closeSync(fd);
    return b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF;
  } catch { return false; }
}

(async () => {
  console.log(`\n  Baixando ${FOTOS.length} fotos para ${PASTA}\n`);
  let novas = 0, tinha = 0, ruins = [];

  for (const [nome, id, largura, descricao] of FOTOS) {
    const arquivo = `${nome}-${id}.jpg`;
    const alvo = path.join(PASTA, arquivo);

    if (fs.existsSync(alvo) && ehJpeg(alvo)) {
      tinha++; console.log(`    · ${arquivo} (já estava)`); continue;
    }

    try {
      await baixar(url(id, largura), alvo);
      if (!ehJpeg(alvo)) { fs.unlinkSync(alvo); throw new Error("não é JPEG"); }
      const kb = Math.round(fs.statSync(alvo).size / 1024);
      novas++; console.log(`    ✓ ${arquivo.padEnd(34)} ${String(kb).padStart(4)} KB — ${descricao}`);
    } catch (e) {
      ruins.push(`${arquivo}: ${e.message}`);
      console.log(`    ✖ ${arquivo} — ${e.message}`);
    }
  }

  /* ------------------------------------------------------------- créditos */
  const creditos = `# Fotos de banco de imagem

Todas do **Pexels** — licença livre para uso comercial, sem atribuição
obrigatória. Creditamos mesmo assim: saber a origem de um arquivo é o que
permite trocá-lo depois sem medo de licença.

O número no fim do nome do arquivo é o **id da foto no Pexels**.
Para ver a original: \`https://www.pexels.com/photo/<id>/\`

| arquivo | id | o que é |
|---|---|---|
${FOTOS.map(([n, id, , d]) => `| \`${n}-${id}.jpg\` | ${id} | ${d} |`).join("\n")}

Para rebaixar tudo: \`node ferramentas/baixar-banco.cjs\`
(o que já existe e está íntegro não é baixado de novo).
`;
  fs.writeFileSync(path.join(PASTA, "CREDITOS.md"), creditos);

  console.log(`\n  ${novas} baixadas · ${tinha} já estavam · ${ruins.length} falharam`);
  if (ruins.length) { ruins.forEach((r) => console.log(`    ✖ ${r}`)); process.exitCode = 1; }
  const total = fs.readdirSync(PASTA).filter((f) => f.endsWith(".jpg"))
    .reduce((s, f) => s + fs.statSync(path.join(PASTA, f)).size, 0);
  console.log(`  acervo: ${(total / 1024 / 1024).toFixed(1)} MB\n`);
})();
