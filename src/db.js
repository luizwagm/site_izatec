"use strict";
/* ==========================================================================
   IZATEC TECIDOS — banco

   SQLite, um arquivo. O site inteiro sai daqui: textos, tecidos, estoque,
   pedidos e Feed. Não há HTML com conteúdo escrito dentro — o que o painel
   grava é o que a página mostra no pedido seguinte, sem passo de publicação
   que alguém possa esquecer de rodar.

   ---------------------------------------------------------------------------
   O ESQUEMA SEGUE O NEGÓCIO, e o negócio aqui é ATACADO TÊXTIL

   Três decisões que vêm disso, e que um esquema de loja comum não teria:

   1. O PRODUTO É O ARTIGO; o que se vende é a COR. "Jeans 3D com elastano" é
      um artigo com ficha técnica única (composição, gramatura, largura); o que
      tem preço, foto e estoque é cada cor daquele artigo. Misturar os dois
      obrigaria a repetir a ficha técnica em cada cor — e no dia em que a
      gramatura mudasse, ela mudaria em algumas e não em outras.

   2. PREÇO POR FAIXA DE QUANTIDADE. Quem leva 10 metros e quem leva um rolo de
      100 não pagam o mesmo, e esconder isso obriga o cliente a ligar para
      perguntar — que é justamente o passo que ele queria evitar entrando no
      site às 22h.

   3. AMOSTRA É PEDIDO. Confecção não compra rolo sem ver e sentir o tecido.
      A amostra tem tabela própria porque ela é o lead mais qualificado do
      negócio: quem pede amostra está a um passo de comprar.
   ========================================================================== */
const path = require("node:path");
const fs = require("node:fs");
const Database = require("better-sqlite3");

const RAIZ = path.join(__dirname, "..");
const CAMINHO = process.env.IZATEC_DB || path.join(RAIZ, "data", "izatec.db");

fs.mkdirSync(path.dirname(CAMINHO), { recursive: true });

const db = new Database(CAMINHO);
/* WAL: leitura e escrita não se bloqueiam. Numa loja, um pedido sendo gravado
   não pode travar a página de quem está navegando o catálogo. */
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
/* ------------------------------------------------------------------ textos
   Cada trecho editável do site é uma linha. 'grupo' é a tela do painel onde
   ele aparece, para o admin não virar uma lista de duzentos campos soltos. */
CREATE TABLE IF NOT EXISTS config (
  chave  TEXT PRIMARY KEY,
  valor  TEXT NOT NULL DEFAULT '',
  grupo  TEXT NOT NULL DEFAULT 'geral',
  rotulo TEXT NOT NULL DEFAULT '',
  tipo   TEXT NOT NULL DEFAULT 'texto',   -- texto | area | imagem | url | cor
  ordem  INTEGER NOT NULL DEFAULT 0
);

/* ---------------------------------------------------------------- famílias
   As oito do logotipo. 'cor' guarda o NOME da variável CSS, não o hexadecimal:
   assim a paleta vive num lugar só (design-system.css) e o banco não fica com
   uma cor que ninguém lembra de atualizar. */
CREATE TABLE IF NOT EXISTS familias (
  id       INTEGER PRIMARY KEY,
  slug     TEXT NOT NULL UNIQUE,
  nome     TEXT NOT NULL,
  resumo   TEXT NOT NULL DEFAULT '',
  cor      TEXT NOT NULL DEFAULT 'jeans',
  ordem    INTEGER NOT NULL DEFAULT 0,
  ativo    INTEGER NOT NULL DEFAULT 1
);

/* ---------------------------------------------------------------- artigos
   A ficha técnica mora AQUI, uma vez só.

   'gramatura' em g/m² e 'largura' em centímetros, como números — não texto.
   É o que permite filtrar "acima de 300 g/m²", que é como um confeccionista
   procura tecido para calça. Guardado como "340g" viraria string e o filtro
   morreria no primeiro produto escrito diferente. */
CREATE TABLE IF NOT EXISTS artigos (
  id            INTEGER PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  familia_id    INTEGER NOT NULL REFERENCES familias(id),
  nome          TEXT NOT NULL,
  chamada       TEXT NOT NULL DEFAULT '',
  descricao     TEXT NOT NULL DEFAULT '',
  composicao    TEXT NOT NULL DEFAULT '',
  gramatura     INTEGER,                       -- g/m²
  largura       INTEGER,                       -- cm, largura útil
  encolhimento  TEXT NOT NULL DEFAULT '',
  elastano      INTEGER NOT NULL DEFAULT 0,    -- 0/1: tem elasticidade?
  indicacao     TEXT NOT NULL DEFAULT '',      -- para que serve
  unidade       TEXT NOT NULL DEFAULT 'm',     -- m | kg | pç
  minimo        REAL NOT NULL DEFAULT 1,       -- corte mínimo
  destaque      INTEGER NOT NULL DEFAULT 0,
  ativo         INTEGER NOT NULL DEFAULT 1,
  criado        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_artigo_familia ON artigos(familia_id, ativo);

/* ------------------------------------------------------------------- cores
   O que tem preço, foto e estoque.

   'estoque' em metros. Zero NÃO some do site: tecido esgotado que volta é
   comum, e sumir da lista faz o cliente achar que a loja não trabalha mais
   com aquilo. Fica visível, marcado, com aviso de reposição. */
CREATE TABLE IF NOT EXISTS cores (
  id         INTEGER PRIMARY KEY,
  artigo_id  INTEGER NOT NULL REFERENCES artigos(id) ON DELETE CASCADE,
  nome       TEXT NOT NULL,
  codigo     TEXT NOT NULL DEFAULT '',
  hex        TEXT NOT NULL DEFAULT '#cccccc',
  foto       TEXT NOT NULL DEFAULT '',
  preco      REAL NOT NULL DEFAULT 0,
  estoque    REAL NOT NULL DEFAULT 0,
  ordem      INTEGER NOT NULL DEFAULT 0,
  ativo      INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS ix_cor_artigo ON cores(artigo_id, ativo);

/* ------------------------------------------------------------- faixas
   Preço por quantidade. 'de' em metros; o preço vale a partir dali.
   Sem 'ate': a faixa seguinte é que define o fim, e guardar os dois abriria
   espaço para intervalo com buraco no meio. */
CREATE TABLE IF NOT EXISTS faixas (
  id         INTEGER PRIMARY KEY,
  artigo_id  INTEGER NOT NULL REFERENCES artigos(id) ON DELETE CASCADE,
  de         REAL NOT NULL,
  preco      REAL NOT NULL,
  rotulo     TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ix_faixa_artigo ON faixas(artigo_id, de);

/* ----------------------------------------------------------------- pedidos */
CREATE TABLE IF NOT EXISTS pedidos (
  id          INTEGER PRIMARY KEY,
  codigo      TEXT NOT NULL UNIQUE,
  nome        TEXT NOT NULL,
  empresa     TEXT NOT NULL DEFAULT '',
  documento   TEXT NOT NULL DEFAULT '',
  telefone    TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  cidade      TEXT NOT NULL DEFAULT '',
  entrega     TEXT NOT NULL DEFAULT 'retirada',  -- retirada | transportadora
  observacao  TEXT NOT NULL DEFAULT '',
  total       REAL NOT NULL DEFAULT 0,
  situacao    TEXT NOT NULL DEFAULT 'novo',      -- novo|confirmado|separando|enviado|entregue|cancelado
  criado      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS pedido_itens (
  id          INTEGER PRIMARY KEY,
  pedido_id   INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  cor_id      INTEGER REFERENCES cores(id),
  /* O nome é COPIADO no momento do pedido, e não lido por join na hora de
     mostrar. Se o artigo for renomeado ou sair de linha depois, o pedido
     antigo continua dizendo o que foi vendido de fato. */
  descricao   TEXT NOT NULL,
  quantidade  REAL NOT NULL,
  preco       REAL NOT NULL,
  subtotal    REAL NOT NULL
);

/* ---------------------------------------------------------------- amostras
   O lead mais qualificado do negócio: quem pede amostra está a um passo de
   comprar. Por isso tem tabela própria, e não vira "contato genérico". */
CREATE TABLE IF NOT EXISTS amostras (
  id         INTEGER PRIMARY KEY,
  nome       TEXT NOT NULL,
  empresa    TEXT NOT NULL DEFAULT '',
  telefone   TEXT NOT NULL,
  cidade     TEXT NOT NULL DEFAULT '',
  artigos    TEXT NOT NULL DEFAULT '',   -- JSON: o que ele quer ver
  situacao   TEXT NOT NULL DEFAULT 'novo',
  criado     TEXT NOT NULL DEFAULT (datetime('now'))
);

/* ------------------------------------------------------------------ contato */
CREATE TABLE IF NOT EXISTS contatos (
  id        INTEGER PRIMARY KEY,
  nome      TEXT NOT NULL,
  telefone  TEXT NOT NULL DEFAULT '',
  email     TEXT NOT NULL DEFAULT '',
  assunto   TEXT NOT NULL DEFAULT '',
  mensagem  TEXT NOT NULL DEFAULT '',
  lido      INTEGER NOT NULL DEFAULT 0,
  criado    TEXT NOT NULL DEFAULT (datetime('now'))
);

/* --------------------------------------------------------------------- feed */
CREATE TABLE IF NOT EXISTS feed (
  id        INTEGER PRIMARY KEY,
  slug      TEXT NOT NULL UNIQUE,
  titulo    TEXT NOT NULL,
  resumo    TEXT NOT NULL DEFAULT '',
  corpo     TEXT NOT NULL DEFAULT '',
  capa      TEXT NOT NULL DEFAULT '',
  etiqueta  TEXT NOT NULL DEFAULT '',
  publicado INTEGER NOT NULL DEFAULT 1,
  data      TEXT NOT NULL DEFAULT (date('now')),
  criado    TEXT NOT NULL DEFAULT (datetime('now'))
);

/* ------------------------------------------------------------------ acessos
   Contagem por dia e por página, sem cookie e sem terceiro. O IP entra como
   HASH com sal — dá para contar visitante único sem guardar de quem é o
   endereço, que é dado pessoal pela LGPD. */
CREATE TABLE IF NOT EXISTS acessos (
  id      INTEGER PRIMARY KEY,
  dia     TEXT NOT NULL,
  rota    TEXT NOT NULL,
  ip_hash TEXT NOT NULL DEFAULT '',
  criado  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_acesso_dia ON acessos(dia, rota);

/* ==========================================================================
   QUEM ENTRA NOS PAINÉIS

   Um cadastro só, com PAPEL — e não duas tabelas de usuário, uma por painel.
   A dona da loja usa os dois: ela edita o texto da home de manhã e cadastra a
   cor nova de jeans à tarde. Dois cadastros significariam duas senhas para a
   mesma pessoa, e a segunda vira um bilhete colado no monitor.

     admin   → só as seções do site (textos, Feed, mensagens)
     estoque → só os produtos (artigos, cores, preço, pedidos)
     dono    → os dois

   A senha é guardada como scrypt com sal por usuário. Nunca em texto, e nunca
   com hash sem sal — que é o mesmo que texto, para senha curta.
   ========================================================================== */
CREATE TABLE IF NOT EXISTS usuarios (
  id       INTEGER PRIMARY KEY,
  usuario  TEXT NOT NULL UNIQUE,
  nome     TEXT NOT NULL DEFAULT '',
  senha    TEXT NOT NULL,               -- sal:hash (scrypt)
  papel    TEXT NOT NULL DEFAULT 'admin' CHECK (papel IN ('admin','estoque','dono')),
  ativo    INTEGER NOT NULL DEFAULT 1,
  entrou   TEXT,
  criado   TEXT NOT NULL DEFAULT (datetime('now'))
);

/* A sessão vive no banco, não em memória: um restart do serviço no meio do
   expediente derrubaria todo mundo do painel sem motivo. */
CREATE TABLE IF NOT EXISTS sessoes (
  token      TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira     TEXT NOT NULL,
  criado     TEXT NOT NULL DEFAULT (datetime('now'))
);

/* Trilha do que foi mexido nos painéis. Numa loja com mais de uma pessoa
   editando preço, "quem baixou o valor do jeans?" é pergunta que aparece. */
CREATE TABLE IF NOT EXISTS auditoria (
  id       INTEGER PRIMARY KEY,
  usuario  TEXT NOT NULL DEFAULT '',
  acao     TEXT NOT NULL,
  alvo     TEXT NOT NULL DEFAULT '',
  detalhe  TEXT NOT NULL DEFAULT '',
  criado   TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

/* ==========================================================================
   COLUNAS QUE CHEGARAM DEPOIS

   `CREATE TABLE IF NOT EXISTS` não altera tabela que já existe — quem já tinha
   o banco rodando não ganharia a coluna nova, e o site quebraria na primeira
   consulta que a usasse. Aqui cada coluna é acrescentada se faltar, o que faz
   a atualização do banco do cliente acontecer sozinha na subida.
   ========================================================================== */
function coluna(tabela, nome, definicao) {
  const tem = db.prepare(`PRAGMA table_info(${tabela})`).all()
    .some((c) => c.name === nome);
  if (!tem) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${nome} ${definicao}`);
}
coluna("familias", "foto", "TEXT NOT NULL DEFAULT ''");
coluna("artigos",  "foto", "TEXT NOT NULL DEFAULT ''");

/* ==========================================================================
   CONSULTAS — uma camada fina, só para não espalhar SQL pelo projeto
   ========================================================================== */
const Q = {
  todos: (sql, ...p) => db.prepare(sql).all(...p),
  um:    (sql, ...p) => db.prepare(sql).get(...p),
  roda:  (sql, ...p) => db.prepare(sql).run(...p),
  db,
};

/* Texto do site com valor padrão embutido. O padrão fica AQUI, na chamada, e
   não numa tabela de "valores iniciais": assim a página sempre tem o que
   mostrar, mesmo que a linha nunca tenha sido criada. */
function txt(chave, padrao = "") {
  const l = Q.um("SELECT valor FROM config WHERE chave = ?", chave);
  return l && l.valor !== "" ? l.valor : padrao;
}

/* Grava um texto e, se ele não existir, cria já com grupo e rótulo — é isso
   que faz o campo aparecer no painel sem eu ter de cadastrá-lo antes. */
function ajuste(chave, valor, meta = {}) {
  const existe = Q.um("SELECT chave FROM config WHERE chave = ?", chave);
  if (existe) {
    Q.roda("UPDATE config SET valor = ? WHERE chave = ?", String(valor), chave);
  } else {
    Q.roda(
      `INSERT INTO config (chave, valor, grupo, rotulo, tipo, ordem)
       VALUES (?, ?, ?, ?, ?, ?)`,
      chave, String(valor), meta.grupo || "geral", meta.rotulo || chave,
      meta.tipo || "texto", meta.ordem || 0);
  }
}

/* O preço de uma quantidade, dentro das faixas do artigo. Fica no servidor —
   nunca no navegador — porque preço calculado na tela é preço que o cliente
   consegue mudar antes de enviar. */
function precoPara(artigoId, quantidade, precoBase) {
  /* FAIXA COM PREÇO ZERO É FAIXA NÃO PREENCHIDA, e não tecido de graça.

     O caso apareceu na primeira prova da loja: a loja preencheu o preço base
     de todas as cores e não preencheu as faixas, que vieram zeradas do
     cadastro inicial. Um pedido de 150 kg caía na faixa de 50 e saía por
     R$ 0,00 — sem erro nenhum na tela, e a loja só descobriria ao separar a
     mercadoria.

     Zero aqui é ausência de informação. Na dúvida, vale o preço base, que é o
     mais alto — errar para cima a loja corrige na confirmação; errar para
     baixo ela descobre entregando de graça. */
  const faixas = Q.todos(
    "SELECT de, preco FROM faixas WHERE artigo_id = ? AND preco > 0 ORDER BY de DESC",
    artigoId);
  for (const f of faixas) if (quantidade >= f.de) return f.preco;
  return precoBase;
}

module.exports = { Q, txt, ajuste, precoPara, CAMINHO, db };
