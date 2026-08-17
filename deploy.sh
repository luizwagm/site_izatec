#!/usr/bin/env bash
# ==========================================================================
# IZATEC TECIDOS — deploy
#
#   ./deploy.sh
#
# Roda NO SERVIDOR, como o usuário `deploy`, de dentro da pasta do projeto.
#
# ---------------------------------------------------------------------------
# TRÊS COISAS QUE ESTE ARQUIVO NÃO FAZ, DE PROPÓSITO
#
# 1. Não roda `pkill -f "node server.js"`. Todos os sites do servidor rodam
#    exatamente esse comando, com o mesmo usuário — um pkill assim já derrubou
#    o site de outro cliente no meio do expediente. Aqui quem para é o systemd,
#    pela unidade, que sabe qual processo é qual.
#
# 2. Não faz `chown -R root`. O dono do código é `deploy`, senão a entrega
#    seguinte não consegue escrever na própria pasta. A contenção quem faz é o
#    systemd, não a permissão do arquivo.
#
# 3. Não segue em frente depois de um erro. `set -euo pipefail` e, no pipe, o
#    `pipefail` é o que segura: sem ele, `comando_que_falha | tee log` retorna
#    zero e o deploy continua sobre um passo quebrado.
# ==========================================================================
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$RAIZ"

UNIDADE="${IZATEC_UNIDADE:-izatec}"
PORTA="${IZATEC_PORTA:-5198}"

# O endereço público sai do .env, que é quem manda no canonical e no robots.
# Lido aqui só para MOSTRAR no fim — o serviço lê o arquivo por conta própria.
ENDERECO=$(grep -m1 '^IZATEC_SITE=' "$RAIZ/.env" 2>/dev/null | cut -d= -f2-)
ENDERECO="${ENDERECO:-https://izatec.projetos.luizaugust.me}"

azul()  { printf '\033[1;34m%s\033[0m\n' "$*"; }
verde() { printf '\033[1;32m%s\033[0m\n' "$*"; }
erro()  { printf '\033[1;31m%s\033[0m\n' "$*" >&2; }

azul "── Izatec · deploy ──────────────────────────────────"

# ---------------------------------------------------------------- 1. backup
# ANTES de qualquer coisa. Se a migração de esquema der errado, o que salva é
# a cópia de agora — não a de ontem de madrugada.
azul "1/6  cópia de segurança do banco"
node ferramentas/backup.cjs | sed 's/^/     /'

# ------------------------------------------------------------------ 2. código
azul "2/6  buscando o código novo"
ANTES="$(git rev-parse HEAD)"
git fetch --quiet origin
# Conferir ANTES de puxar: `git status` mostra se há trabalho não commitado no
# servidor (alguém editou um arquivo direto lá — acontece).
if [ -n "$(git status --porcelain)" ]; then
  erro "     Há alterações não commitadas NO SERVIDOR. Resolva antes de continuar:"
  git status --short | sed 's/^/       /'
  exit 1
fi
git pull --ff-only --quiet
DEPOIS="$(git rev-parse HEAD)"

if [ "$ANTES" = "$DEPOIS" ]; then
  echo "     nada novo ($(git rev-parse --short HEAD))"
else
  echo "     $(git rev-parse --short "$ANTES") → $(git rev-parse --short "$DEPOIS")"
  git log --oneline "$ANTES..$DEPOIS" | sed 's/^/       /'
fi

# ------------------------------------------------------------ 3. dependências
azul "3/6  dependências"
npm ci --omit=dev --silent
echo "     ok"

# ------------------------------------------------------------------ 4. dados
# `semear` é idempotente: acrescenta o que falta e não toca no que a loja já
# cadastrou. É o que permite mandar uma família nova de tecido junto com o
# código, sem passo manual.
azul "4/6  conteúdo inicial (só o que faltar)"
node ferramentas/semear.cjs | tail -8 | sed 's/^/     /'

# ------------------------------------------------------------------ 5. provas
# As provas rodam num banco temporário e NÃO tocam o banco do cliente. Se
# falharem, o serviço nem é reiniciado — o site fica no ar com a versão velha,
# que é o comportamento certo.
azul "5/6  provando antes de subir"
if ! node testes/provar.cjs > /tmp/izatec-provas.log 2>&1; then
  erro "     As provas FALHARAM. O serviço NÃO foi reiniciado."
  erro "     O site continua no ar com a versão anterior."
  tail -20 /tmp/izatec-provas.log | sed 's/^/       /' >&2
  exit 1
fi
tail -2 /tmp/izatec-provas.log | sed 's/^/     /'

# ---------------------------------------------------------------- 6. serviço
azul "6/6  reiniciando o serviço"
sudo systemctl restart "${UNIDADE}.service"

# Espera o site RESPONDER, e não apenas o systemd dizer "active". Um serviço
# pode estar "active" e o Node ainda estar abrindo o banco.
for i in $(seq 1 20); do
  if curl -fsS --max-time 2 "http://127.0.0.1:${PORTA}/saude" > /tmp/izatec-saude.json 2>/dev/null; then
    verde ""
    verde "  ✔ no ar — $(cat /tmp/izatec-saude.json)"
    echo   "    endereço: ${ENDERECO}"

    # ==========================================================================
    # O CANONICAL É CONFERIDO A CADA ENTREGA
    #
    # É o defeito mais caro e mais silencioso desta arquitetura: um canonical
    # apontando para o endereço errado manda o Google indexar outro site, e
    # nada na tela denuncia. Um .env sem IZATEC_SITE, ou um serviço que subiu
    # sem ler o arquivo, produz exatamente isso — e passa despercebido por
    # semanas.
    # ==========================================================================
    CANON=$(curl -fsS --max-time 5 "http://127.0.0.1:${PORTA}/" 2>/dev/null \
            | grep -o 'rel="canonical" href="[^"]*"' | head -1 | sed 's/.*href="//;s/"//')
    if [ -n "$CANON" ] && [ "${CANON#"$ENDERECO"}" != "$CANON" ]; then
      echo "    canonical: ${CANON} ✔"
    else
      erro ""
      erro "  ! o canonical saiu como '${CANON}', e não sob '${ENDERECO}'."
      erro "    Confira IZATEC_SITE no .env — o site está anunciando o endereço errado."
    fi

    if grep -q '^Disallow: /$' <(curl -fsS --max-time 5 "http://127.0.0.1:${PORTA}/robots.txt" 2>/dev/null); then
      echo "    robots: FORA do índice (endereço de trabalho)"
    else
      echo "    robots: indexável"
    fi
    verde ""
    exit 0
  fi
  sleep 1
done

erro ""
erro "  ✖ o serviço subiu mas /saude não respondeu em 20s."
erro "    journalctl -u ${UNIDADE} -n 50 --no-pager"
erro ""
exit 1
