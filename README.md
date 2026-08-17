# Izatec Tecidos

Site e loja virtual da Izatec Tecidos — Caruaru e Toritama/PE.
Node puro (sem framework), SQLite, páginas geradas do banco a cada pedido.

**Versão 1.3.0** · porta **5198** · hoje em `izatec.projetos.luizaugust.me`

---

## O que é, em uma frase

Um catálogo de tecidos com **ficha técnica na frente** — composição, gramatura,
largura útil e encolhimento — onde o confeccionista filtra pelo que a peça dele
exige, vê o preço por faixa de quantidade e fecha o pedido sem ligar para a loja.

---

## Como rodar

```bash
npm install
npm run semear     # conteúdo inicial — pode rodar quantas vezes quiser
npm start          # http://127.0.0.1:5198
```

Na primeira subida, o servidor cria o usuário `dono` com uma senha **sorteada**
e a escreve no log **uma única vez**. Anote. Se perder:

```bash
node ferramentas/usuario.cjs senha dono <nova-senha>
```

### Provas

```bash
npm test
```

140 verificações, em banco temporário. **Nunca tocam o banco de trabalho.**

---

## Os dois painéis, e por que são dois

| | `/admin` | `/restrito` |
|---|---|---|
| **quem usa** | quem cuida do site | quem cuida do estoque |
| **o que faz** | textos das seções, Feed, mensagens, amostras, acessos, usuários | artigos, cores, preço, estoque, faixas, famílias, pedidos |
| **ritmo** | muda duas vezes por ano | muda toda semana |

Papéis: `admin` (só o site), `estoque` (só os produtos), `dono` (os dois).

A separação não é gosto. Quem cadastra tecido o dia inteiro não deve passar por
dez telas de texto institucional para chegar onde trabalha — e quem mexe em
estoque não precisa poder reescrever a página inteira do site.

**A sessão de um painel não vale no outro**: o cookie tem `Path` próprio. É
esperado que entrar no `/restrito` não abra o `/admin`.

---

## Preço — leia antes de publicar

O cadastro inicial vem com **preço zerado de propósito**. Preço chutado que o
cliente esquece de corrigir é pior do que preço em branco.

Enquanto uma cor estiver a zero:

* o site troca **"Adicionar ao pedido"** por **"Pedir orçamento"**;
* o `/restrito` mostra um aviso vermelho na tela inicial com a contagem;
* o `verificar.sh` reporta quantas cores estão sem preço.

Preencha em **/restrito → Estoque e preço** (todas as cores numa tela só).

**Faixa com preço zero é faixa não preenchida, não tecido de graça.** O sistema
ignora faixas zeradas e usa o preço base. Isso já evitou uma venda de 250 kg
por R$ 0,00 durante a construção.

---

## Loja

O pedido **não tem pagamento online** nesta versão, e a decisão é do negócio: em
atacado têxtil o valor final depende de frete por metragem e de acerto
comercial. O pedido chega ao painel com código (`IZ-AAAAMMDD-XXXX`) e a loja
confirma pelo WhatsApp — que é como a venda já acontece no balcão. O que o site
faz é tirar da loja o trabalho de digitar o pedido.

O carrinho vive num **cookie assinado** (HMAC), guardando só id de cor e
quantidade. **O preço nunca vem do navegador** — é recalculado do banco na hora
de mostrar e na hora de gravar.

A chave de assinatura vem de `IZATEC_SEGREDO`; sem ela, é sorteada uma vez e
guardada no banco (grupo `sistema`, invisível no painel). **Trocar a chave
esvazia os carrinhos abertos** — não é perda de dado, mas o cliente que estava
montando o pedido volta e encontra a tela vazia.

---

## Medição (GA4 e Meta Pixel)

Configure em **/admin → Textos das seções → Medição e integrações**.

Com os campos vazios, o site **não carrega Google nem Meta e não mostra aviso de
cookie nenhum**. Ao preencher, o aviso de consentimento aparece sozinho e a
medição só dispara **depois do aceite** — o script nem entra na página antes
disso. "Recusar" é um botão do mesmo tamanho de "Aceitar".

A contagem de visitas do painel é **própria** (tabela `acessos`, IP em hash com
sal do dia, sem cookie e sem terceiro) e continua funcionando dos dois jeitos.
O painel nunca fica cego porque nunca dependeu do Google.

---

## O endereço do site

Hoje o site roda em **`izatec.projetos.luizaugust.me`** — endereço de trabalho,
para o cliente aprovar. O endereço público será `izatectecidos.com.br`.

O domínio vive numa variável só, em `.env`:

```
IZATEC_SITE=https://izatec.projetos.luizaugust.me
```

Ela manda no **canonical**, no **JSON-LD**, no **sitemap** e no **robots.txt**.
Escrito dentro do código, o domínio vira uma caçada no dia da virada — e o que
sempre sobra é o canonical, que é justamente o que manda o Google indexar o
endereço errado.

### O endereço de trabalho nasce invisível para o Google

Qualquer endereço em `.projetos.luizaugust.me` (ou `localhost`) é tratado como
trabalho **automaticamente**. Não há caixinha para marcar:

* `robots.txt` responde `Disallow: /` e **não** aponta sitemap — apontar seria
  dizer as duas coisas ao mesmo tempo;
* `sitemap.xml` sai vazio;
* **toda** resposta leva `X-Robots-Tag: noindex, nofollow, noarchive`, inclusive
  CSS e imagem;
* a página traz `<meta name="robots">` — porque link de aprovação circula no
  WhatsApp, e nem todo robô lê o robots.txt antes de seguir um link.

Isso não é zelo excessivo. Um site em aprovação indexado vira uma **cópia** do
site real na busca: os dois competem pela mesma consulta, o Google escolhe um
sozinho e às vezes escolhe o de teste — com preço velho e texto provisório.
Tirar do índice depois leva semanas.

### O dia da virada

```bash
sudo ./criar-site.sh izatectecidos.com.br
```

O script grava o `IZATEC_SITE` novo, cria o vhost, emite o certificado,
reinicia o serviço e confere o canonical. Depois:

```bash
./verificar.sh https://izatectecidos.com.br
```

---

## Operação no servidor

### Instalar

```bash
cp .env.exemplo .env && chmod 600 .env

sudo cp operacao/izatec.service        /etc/systemd/system/
sudo cp operacao/izatec.backup.service /etc/systemd/system/
sudo cp operacao/izatec.backup.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now izatec.service izatec.backup.timer
```

Com o serviço no ar, o vhost e o certificado saem de um comando só:

```bash
sudo ./criar-site.sh
```

Sem argumento ele usa `izatec.projetos.luizaugust.me` e a porta 5198. Ele
confere o DNS, testa `/saude`, grava o `.env`, gera o vhost (com gzip, cache de
estáticos e freio de formulário), emite o certificado, reinicia o serviço e
mostra o canonical e o robots que ficaram valendo.

**Sob `*.projetos.luizaugust.me` o navegador recusa `http://`.** O domínio pai
tem HSTS com `includeSubDomains`, então o navegador exige HTTPS antes mesmo de
conhecer o site: **o certificado é pré-requisito para abrir a página uma
primeira vez, não um passo posterior.** O certbot não é afetado — ele valida com
um cliente próprio, que ignora HSTS. Quem trava é você, testando cedo demais.

**Num subdomínio não existe `www`.** Pedir certificado para
`www.izatec.projetos.luizaugust.me` faz o certbot falhar por inteiro,
derrubando junto o domínio que estava certo. O script só inclui o `www` quando
o domínio é raiz **e** resolve para este servidor.

### Entregar uma versão nova

```bash
./deploy.sh
```

Faz backup → puxa o código → instala dependências → semeia o que faltar →
**roda as provas** → reinicia → espera `/saude` responder → **confere o
canonical e o robots**.

Se as provas falharem, **o serviço não é reiniciado** e o site continua no ar
com a versão anterior.

### Conferir

```bash
./verificar.sh                              # local
./verificar.sh https://izatec.projetos.luizaugust.me   # local e de fora
```

Separar as duas medidas é o valor do arquivo:

| local | de fora | onde procurar |
|---|---|---|
| ok | ruim | nginx, certificado, DNS ou firewall |
| ruim | ruim | o Node |
| ruim | ok | há **outro** processo atendendo na porta |

---

## Fotos e movimento

### As fotos

24 fotos de acervo (**Pexels**, licença livre para uso comercial) vivem em
`assets/img/banco/`, servidas do nosso próprio servidor. Não são apontadas para
o Pexels de propósito: imagem vinda de terceiro conta ao terceiro quem visitou a
página, e a URL deles pode mudar sem aviso.

O crédito de cada uma está em `assets/img/banco/CREDITOS.md`. O número no fim do
nome do arquivo é o id da foto no Pexels.

```bash
node ferramentas/baixar-banco.cjs   # rebaixa o que faltar; não repete o que já está
```

**Trocar por foto da Izatec:** aponte o campo para outro arquivo.

| onde | campo |
|---|---|
| artigo | /restrito → Artigos → abrir a ficha → *Foto do artigo* |
| família | /restrito → Famílias → coluna *Foto* |
| matéria | /admin → Feed → abrir a matéria → *Foto de capa* |

Campo em branco cai na foto do acervo; sem nenhuma das duas, o cartão mostra a
**cor real** do tecido com a trama por cima — que é honesto e continua bonito.

Toda imagem sai com `width`, `height` e `alt`. A capa é a única sem `lazy`:
capa com lazy chega depois, e a primeira coisa que o visitante vê é um buraco.

### O movimento

Nada aqui muda o layout — só `transform` e `opacity`, as duas propriedades que o
navegador anima na placa de vídeo. Animar altura ou margem trava a rolagem em
celular de galpão, que é onde este site é usado.

* **capa** — Ken Burns de 28s (zoom de 6%), entrada escalonada do título, régua
  que se desenha como fita métrica sendo puxada;
* **cartões** — foto com zoom de 6% no hover, cartão sobe 4px, nome acende no
  vermelho, tira da família engorda;
* **rolagem** — blocos sobem com fade ao entrar na tela;
* **matéria** — barra de leitura no topo;
* **botão de ação** — um reflexo atravessa uma vez.

**Quem pede menos movimento no sistema recebe a página parada** — incluindo o
Ken Burns, que é infinito e precisa ser desligado de vez, não só acelerado.

**Se o JavaScript falhar, o site aparece inteiro e parado.** A classe `js` no
`<html>` é o que autoriza o CSS a esconder os blocos que serão revelados; sem
ela, nada é escondido.

Há ainda uma **sonda**: o script observa o cabeçalho (que está sempre na tela) e
confere se o `IntersectionObserver` responde. Se ficar em silêncio por 900ms,
não dá para confiar nele — o script mostra tudo. Esconder conteúdo esperando um
evento é uma aposta, e essa é a apólice: sem ela, um observador que não responde
deixaria 21 blocos invisíveis para sempre, sem nenhum erro no console.

---

## Armadilhas conhecidas (não repita)

**Crase dentro de comentário HTML fecha o template literal.** As páginas são
template literals com comentários `<!-- -->` dentro; uma crase ali quebra o
arquivo, e o erro aponta para uma linha dezenas de linhas depois da verdadeira.
Me pegou **seis vezes** nesta construção. O `npm test` agora tem um guarda que
diz o arquivo, a linha e a frase.

**`nginx -t` mente.** Ele diz "syntax is ok" para um bloco que o nginx nem
carregou (arquivo fora do include, link quebrado). Confira com **`nginx -T`**,
que imprime a configuração realmente em uso.

**Nunca `pkill -f "node server.js"`.** Todos os sites do servidor rodam esse
mesmo comando, com o mesmo usuário. Um `pkill` assim já derrubou o site de outro
cliente no meio do expediente. Pare pelo systemd, pela unidade.

**Nunca `chown -R root` na pasta.** O dono do código é `deploy`, senão a
entrega seguinte não escreve na própria pasta. A contenção é do systemd.

**Nunca `MemoryDenyWriteExecute` na unit.** Essa trava mata o V8 com `5/TRAP`
segundos depois de subir. O sintoma parece queda de rede.

**Ler o PRIMEIRO item do `X-Forwarded-For` é ler texto do atacante.** O IP real
é o **último** — o que o nosso nginx acrescentou. O servidor já lê certo; se
alguém mexer nisso, a trava de força bruta deixa de existir.

**`.gitignore` sem barra inicial casa em qualquer profundidade.** `dados/`
engoliria `src/infra/dados/`. Tudo aqui está ancorado com `/`.

**Arquivo `.sh` com CRLF não roda no Linux** — o `\r` vira parte do comando e o
shell responde "command not found" num arquivo que parece perfeito.

**`cp izatec.db backup.db` produz backup quebrado.** O banco roda em WAL e parte
dos dados está no arquivo `-wal`. Use `ferramentas/backup.cjs`, que faz
`VACUUM INTO` e **confere a cópia depois de gravar**.

---

## Estrutura

```
server.js                  rotas, estáticos por LUGAR, freio de envio
src/
  db.js                    esquema e consultas · precoPara()
  layout.js                <head>, cabeçalho, rodapé, logo em SVG
  paginas.js               home, cartão de artigo
  catalogo.js              lista com filtros em link, página do artigo
  loja.js                  carrinho assinado, fechamento, pedido
  feed.js                  índice e matéria · texto simples → HTML
  institucional.js         A Izatec, Contato, 404
  medicao.js               GA4 e Pixel, só depois do aceite
  endereco.js              o domínio e a regra de indexação
  imagens.js               acervo de fotos, alt e reserva de espaço
  painel.js                base comum: senha, sessão, freio, casca
  admin.js                 painel do site
  restrito.js              painel dos produtos
assets/css/design-system.css   a marca (cor, tipo, ritmo, forma)
assets/css/site.css            componentes do site
assets/css/painel.css          componentes dos painéis
ferramentas/semear.cjs         conteúdo inicial, idempotente
ferramentas/backup.cjs         VACUUM INTO + conferência
ferramentas/usuario.cjs        criar usuário e trocar senha
ferramentas/baixar-banco.cjs   baixa as 24 fotos do Pexels
assets/img/banco/              o acervo + CREDITOS.md
testes/provar.cjs              140 verificações
operacao/                      systemd e nginx
criar-site.sh · deploy.sh · verificar.sh
.env.exemplo                   as variáveis, documentadas
```

---

## O que ainda não existe

Declarado, não esquecido:

* **Pagamento online** (Pix/cartão) — o pedido hoje é confirmado pela loja.
* **Integração com ERP** — depende de saber qual sistema a Izatec usa.
* **Envio de e-mail** de aviso de pedido — o campo existe em
  `/admin → Medição e integrações`, falta o SMTP.
* **Fotos da própria Izatec** — o site já vem com 24 fotos de acervo (Pexels).
  Trocar por foto da loja é apontar o campo para outro arquivo, no painel.
  Upload direto pelo navegador fica para quando houver foto para subir.
* **Chat da equipe** — o LA-Chat é módulo instalável e entra depois.

---

Desenvolvido por [LA Software House](https://luizaugust.me)
