#!/usr/bin/env bash
# ==========================================================================
# IZATEC TECIDOS — verificador
#
#   ./verificar.sh                          confere o local
#   ./verificar.sh https://izatectecidos.com.br   confere local E de fora
#
# Serve para responder UMA pergunta com precisão: o site está de pé, e o que
# exatamente está quebrado quando não está.
#
# ---------------------------------------------------------------------------
# LOCAL E DE FORA SÃO MEDIDAS DIFERENTES, e a distinção é o valor deste arquivo
#
# · local ok  + fora ruim  → nginx, certificado, DNS ou firewall
# · local ruim + fora ruim → o Node
# · local ruim + fora ok   → há OUTRO processo atendendo na porta
#
# Sem separar as duas, "o site caiu" vira meia hora de tentativa e erro. Já
# aconteceu: acusei o firewall quando o problema era uma rota quebrada.
# ==========================================================================
set -uo pipefail   # sem -e: aqui a graça é continuar e RELATAR cada falha

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNIDADE="${IZATEC_UNIDADE:-izatec}"
PORTA="${IZATEC_PORTA:-5198}"
LOCAL="http://127.0.0.1:${PORTA}"
FORA="${1:-}"

oks=0; avisos=0; erros=0
ok()    { printf '  \033[1;32m✓\033[0m %s\n' "$*"; oks=$((oks+1)); }
aviso() { printf '  \033[1;33m!\033[0m %s\n' "$*"; avisos=$((avisos+1)); }
falha() { printf '  \033[1;31m✖\033[0m %s\n' "$*"; erros=$((erros+1)); }
titulo(){ printf '\n\033[1;34m%s\033[0m\n' "$*"; }

# `codigo <url>` — devolve o status HTTP, ou 000 se nem conectou.
codigo() { curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$1" 2>/dev/null || echo 000; }

# ==========================================================================
titulo "Serviço"
if command -v systemctl >/dev/null 2>&1; then
  if systemctl is-active --quiet "${UNIDADE}.service"; then
    ok "${UNIDADE}.service ativo desde $(systemctl show -p ActiveEnterTimestamp --value "${UNIDADE}.service")"
  else
    falha "${UNIDADE}.service NÃO está ativo — systemctl status ${UNIDADE}"
  fi
  if systemctl is-enabled --quiet "${UNIDADE}.service"; then
    ok "sobe sozinho depois de um reboot"
  else
    aviso "não está habilitado: um reboot deixa o site fora do ar"
  fi
  if systemctl list-timers --all 2>/dev/null | grep -q "${UNIDADE}.backup"; then
    ok "o temporizador de backup está registrado"
  else
    aviso "sem temporizador de backup — o banco não está sendo copiado sozinho"
  fi
fi

# ==========================================================================
titulo "Local (${LOCAL})"
c=$(codigo "${LOCAL}/saude")
if [ "$c" = "200" ]; then
  ok "/saude responde 200 — $(curl -s --max-time 5 "${LOCAL}/saude")"
else
  falha "/saude devolveu ${c} (esperado 200)"
fi

for rota in / /catalogo/ /feed/ /sobre/ /contato/ /robots.txt /sitemap.xml; do
  c=$(codigo "${LOCAL}${rota}")
  [ "$c" = "200" ] && ok "${rota} → 200" || falha "${rota} → ${c}"
done

# O painel TEM de pedir senha. Um 200 com o menu do painel significa que a
# autenticação parou de funcionar — é o pior defeito possível aqui.
for painel in /admin/ /restrito/; do
  corpo=$(curl -s --max-time 8 "${LOCAL}${painel}" 2>/dev/null)
  if echo "$corpo" | grep -q 'name="senha"'; then
    ok "${painel} pede senha"
  else
    falha "${painel} NÃO está pedindo senha — verifique agora"
  fi
done

# Código-fonte pela web: um servidor que autoriza por EXTENSÃO deixa
# GET /server.js responder 200. Este autoriza por LUGAR — confirmar sempre.
for arq in /server.js /package.json /src/db.js /data/izatec.db; do
  c=$(codigo "${LOCAL}${arq}")
  if [ "$c" = "404" ] || [ "$c" = "303" ]; then
    ok "${arq} não sai pela web (${c})"
  else
    falha "${arq} respondeu ${c} — código-fonte exposto"
  fi
done

# ==========================================================================
titulo "Banco"
BANCO="${RAIZ}/data/izatec.db"
if [ -f "$BANCO" ]; then
  ok "banco presente ($(du -h "$BANCO" | cut -f1))"
  if command -v node >/dev/null 2>&1; then
    saida=$(cd "$RAIZ" && node -e "
      const {Q}=require('./src/db');
      const n=(t)=>Q.um('SELECT COUNT(*) c FROM '+t).c;
      console.log(n('artigos'),n('cores'),n('pedidos'),n('usuarios'),
        Q.um('SELECT COUNT(*) c FROM cores WHERE ativo=1 AND preco<=0').c);
    " 2>/dev/null)
    if [ -n "$saida" ]; then
      set -- $saida
      ok "$1 artigos · $2 cores · $3 pedidos · $4 usuários"
      [ "$4" -gt 0 ] || falha "NENHUM usuário cadastrado — os painéis estão inacessíveis"
      if [ "$5" -gt 0 ]; then
        aviso "$5 cores sem preço: o site mostra 'Pedir orçamento' no lugar do botão de comprar"
      else
        ok "todas as cores ativas têm preço publicado"
      fi
    else
      falha "não consegui ler o banco"
    fi
  fi
else
  falha "banco NÃO encontrado em ${BANCO}"
fi

n=$(ls -1 "${RAIZ}/backups"/izatec-*.db 2>/dev/null | wc -l | tr -d ' ')
if [ "$n" -gt 0 ]; then
  ultima=$(ls -1t "${RAIZ}/backups"/izatec-*.db 2>/dev/null | head -1)
  ok "${n} cópias · a mais recente é de $(date -r "$ultima" '+%d/%m %H:%M' 2>/dev/null || echo '?')"
else
  falha "NENHUMA cópia de segurança em backups/"
fi

# ==========================================================================
if [ -n "$FORA" ]; then
  titulo "De fora (${FORA})"
  c=$(codigo "${FORA}/saude")
  if [ "$c" = "200" ]; then
    ok "/saude responde de fora"
  else
    falha "/saude de fora devolveu ${c}"
    [ "$c" = "000" ] && aviso "não conectou: DNS, firewall ou certificado — meça o VIZINHO antes de acusar o firewall"
    [ "$c" = "502" ] && aviso "502: o nginx está de pé e o Node não — journalctl -u ${UNIDADE}"
  fi

  for rota in / /catalogo/ /feed/; do
    c=$(codigo "${FORA}${rota}")
    [ "$c" = "200" ] && ok "${rota} → 200" || falha "${rota} → ${c}"
  done

  # Compressão: a falta dela foi o gargalo de TTFB em outro site do parque.
  if curl -s -I -H 'Accept-Encoding: gzip' --max-time 8 "${FORA}/" 2>/dev/null | grep -qi 'content-encoding: gzip'; then
    ok "o HTML sai comprimido (gzip)"
  else
    aviso "SEM gzip: o HTML gerado sai com 40–90 KB em vez de menos de 10"
  fi

  if [[ "$FORA" == https://* ]] && command -v openssl >/dev/null 2>&1; then
    host="${FORA#https://}"; host="${host%%/*}"
    fim=$(echo | openssl s_client -connect "${host}:443" -servername "$host" 2>/dev/null \
          | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
    if [ -n "$fim" ]; then
      dias=$(( ( $(date -d "$fim" +%s 2>/dev/null || echo 0) - $(date +%s) ) / 86400 ))
      if [ "$dias" -gt 20 ]; then ok "certificado válido por mais ${dias} dias"
      elif [ "$dias" -gt 0 ]; then aviso "o certificado vence em ${dias} dias"
      else falha "certificado VENCIDO"; fi
    else
      aviso "não consegui ler o certificado"
    fi
  fi

  host="${FORA#https://}"; host="${host#http://}"; host="${host%%/*}"

  # ==========================================================================
  # O CANONICAL E O ROBOTS — o par que decide o que o Google faz
  #
  # Canonical apontando para outro endereço manda indexar outro site, e nada
  # na tela denuncia. Num endereço de TRABALHO, o robots tem de estar fechado:
  # um site em aprovação indexado vira cópia do site real na busca, os dois
  # competem, e tirar do índice depois leva semanas.
  # ==========================================================================
  canon=$(curl -s --max-time 8 "${FORA}/" 2>/dev/null \
          | grep -o 'rel="canonical" href="[^"]*"' | head -1 | sed 's/.*href="//;s/"//')
  if [ -z "$canon" ]; then
    falha "a home não trouxe canonical"
  elif [ "${canon#"$FORA"}" != "$canon" ]; then
    ok "canonical aponta para este endereço (${canon})"
  else
    falha "canonical aponta para OUTRO endereço: ${canon} — confira IZATEC_SITE no .env"
  fi

  robots=$(curl -s --max-time 8 "${FORA}/robots.txt" 2>/dev/null)
  tag=$(curl -s -I --max-time 8 "${FORA}/" 2>/dev/null | grep -i 'x-robots-tag' | tr -d '\r')

  case "$host" in
    *.projetos.luizaugust.me|localhost*|127.0.0.1*)
      if echo "$robots" | grep -q '^Disallow: /$'; then
        ok "endereço de trabalho: robots.txt fecha o site inteiro"
      else
        falha "endereço de TRABALHO sem 'Disallow: /' — o Google vai indexar a cópia"
      fi
      if [ -n "$tag" ]; then ok "e manda ${tag}"
      else falha "sem X-Robots-Tag: quem chegar por link é indexado mesmo assim"; fi
      ;;
    *)
      if echo "$robots" | grep -q "^Sitemap: ${FORA}/sitemap.xml"; then
        ok "robots.txt aponta o sitemap deste endereço"
      else
        aviso "o robots.txt não aponta o sitemap deste endereço"
      fi
      [ -z "$tag" ] && ok "sem noindex — o site é indexável" \
                    || falha "domínio público com ${tag} — o site está invisível no Google"

      # www só existe em domínio raiz; num subdomínio o teste não faz sentido.
      c=$(codigo "https://www.${host}/")
      if [ "$c" = "301" ] || [ "$c" = "308" ]; then ok "www redireciona (${c})"
      else aviso "www devolveu ${c} — esperado 301"; fi
      ;;
  esac
fi

# ==========================================================================
printf '\n\033[1;34m%s\033[0m\n' "─────────────────────────────────────────"
printf '  %d ok · %d avisos · %d erros\n\n' "$oks" "$avisos" "$erros"
[ "$erros" -eq 0 ] || exit 1
