#!/usr/bin/env bash
# ==========================================================================
# IZATEC TECIDOS — criar o site no servidor
#
#   sudo ./criar-site.sh                              → izatec.projetos.luizaugust.me
#   sudo ./criar-site.sh izatectecidos.com.br         → o domínio de verdade
#   sudo ./criar-site.sh <dominio> <porta> [email]
#
# Cria o vhost do nginx, emite o certificado e testa a renovação. Roda UMA vez
# por domínio; depois é o deploy.sh que entrega versão nova.
#
# ---------------------------------------------------------------------------
# DUAS COISAS QUE MUDAM ENTRE O SUBDOMÍNIO E O DOMÍNIO DE VERDADE
#
# 1. NÃO EXISTE www NUM SUBDOMÍNIO. `www.izatec.projetos.luizaugust.me` não é
#    endereço nenhum, e pedir certificado para ele faz o certbot falhar por
#    inteiro — derrubando junto o domínio que estava certo. O www só entra
#    quando o domínio é raiz E resolve para cá.
#
# 2. SOB `*.projetos.luizaugust.me` O NAVEGADOR RECUSA `http://`. O domínio pai
#    tem HSTS com includeSubDomains, então o navegador exige HTTPS ANTES de
#    conhecer o site. O certificado não é um passo posterior: é pré-requisito
#    para conseguir abrir a página uma primeira vez.
#
#    O certbot NÃO é afetado — ele valida por HTTP com um cliente próprio, que
#    ignora HSTS. Quem trava é você, testando no navegador antes da hora.
# ==========================================================================
set -uo pipefail

DOMINIO="${1:-izatec.projetos.luizaugust.me}"
PORTA="${2:-5198}"
EMAIL="${3:-luizwagm@gmail.com}"
RAIZ="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"

verde()   { printf "\033[1;32m%s\033[0m\n" "$1"; }
amarelo() { printf "\033[1;33m%s\033[0m\n" "$1"; }
vermelho(){ printf "\033[1;31m%s\033[0m\n" "$1"; }
azul()    { printf "\033[1;34m%s\033[0m\n" "$1"; }

[ "$(id -u)" -eq 0 ] || { vermelho "Rode com sudo."; exit 1; }

# É subdomínio? Conta os pontos: 2 ou mais e não é domínio raiz. Serve para
# decidir sobre o www e sobre o aviso de indexação.
PONTOS=$(echo "$DOMINIO" | tr -cd '.' | wc -c)
SUBDOMINIO=0
case "$DOMINIO" in *.projetos.luizaugust.me) SUBDOMINIO=1 ;; esac
[ "$PONTOS" -ge 3 ] && SUBDOMINIO=1

azul "── Izatec · criar site ───────────────────────────────"
echo "     domínio : $DOMINIO"
echo "     porta   : $PORTA"
echo "     tipo    : $([ "$SUBDOMINIO" -eq 1 ] && echo 'subdomínio de trabalho (sem www, fora do índice)' || echo 'domínio público (com www, indexável)')"
echo

# ------------------------------------------------------------- 1. o DNS
echo "1/6  Conferindo o DNS"
MEUS_IPS=$(
  { ip -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1
    curl -4 -s --max-time 8 https://ifconfig.me 2>/dev/null
    curl -6 -s --max-time 8 https://ifconfig.me 2>/dev/null
  } | sort -u | grep -v '^$'
)
[ -n "${IP_SERVIDOR:-}" ] && MEUS_IPS="$MEUS_IPS
$IP_SERVIDOR"

resolve() { dig +short "$2" "$1" 2>/dev/null | grep -E '^[0-9a-fA-F.:]+$' | tail -1; }
daqui()   { [ -n "$1" ] && echo "$MEUS_IPS" | grep -qxF "$1"; }

A=$(resolve "$DOMINIO" A); AAAA=$(resolve "$DOMINIO" AAAA)
echo "     este servidor : $(echo "$MEUS_IPS" | tr '\n' ' ')"
echo "     $DOMINIO : ${A:-—} ${AAAA:-}"

if daqui "$A" || daqui "$AAAA"; then
  verde "     o domínio resolve para este servidor"
else
  vermelho "     o DNS não aponta para cá."
  vermelho "     Crie um registro A: $DOMINIO -> $(echo "$MEUS_IPS" | grep -m1 '\.')"
  vermelho "     Com certeza do DNS: sudo IP_SERVIDOR=<ip> $0 $DOMINIO $PORTA"
  exit 1
fi

# O www só entra se for domínio RAIZ e resolver para cá. Um -d que não resolve
# derruba o certificado inteiro, inclusive a parte que estava certa.
DOMINIOS="-d $DOMINIO"
if [ "$SUBDOMINIO" -eq 0 ]; then
  A_WWW=$(resolve "www.$DOMINIO" A); AAAA_WWW=$(resolve "www.$DOMINIO" AAAA)
  if daqui "$A_WWW" || daqui "$AAAA_WWW"; then
    DOMINIOS="$DOMINIOS -d www.$DOMINIO"
    verde "     www também resolve para cá — entra no mesmo certificado"
  else
    amarelo "     www.$DOMINIO não resolve para cá — certificado só do domínio raiz"
  fi
else
  echo "     subdomínio: sem www (não existe, e pedir derrubaria o certificado)"
fi

# ------------------------------------------------------ 2. a aplicação
echo "2/6  Testando a aplicação em 127.0.0.1:$PORTA"
CODIGO=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://127.0.0.1:$PORTA/saude" || echo 000)
if [ "$CODIGO" != "200" ]; then
  vermelho "     /saude respondeu $CODIGO — a aplicação não está no ar."
  vermelho "     sudo systemctl status izatec"
  exit 1
fi
verde "     no ar — $(curl -s --max-time 5 "http://127.0.0.1:$PORTA/saude")"

# ---------------------------------------------- 3. o endereço na aplicação
# O canonical, o JSON-LD, o sitemap e o robots saem do IZATEC_SITE. Sem esta
# linha o site anunciaria ao Google um endereço que não é o dele.
echo "3/6  Gravando o endereço em .env"
ENV="$RAIZ/.env"
touch "$ENV"; chmod 600 "$ENV"
if grep -q '^IZATEC_SITE=' "$ENV" 2>/dev/null; then
  sed -i "s|^IZATEC_SITE=.*|IZATEC_SITE=https://$DOMINIO|" "$ENV"
else
  echo "IZATEC_SITE=https://$DOMINIO" >> "$ENV"
fi
# O segredo que assina o carrinho: sorteado uma vez e guardado. Trocar depois
# esvazia o carrinho de quem estava comprando.
grep -q '^IZATEC_SEGREDO=' "$ENV" 2>/dev/null || \
  echo "IZATEC_SEGREDO=$(openssl rand -hex 32)" >> "$ENV"
chown deploy:deploy "$ENV" 2>/dev/null || true
verde "     IZATEC_SITE=https://$DOMINIO"
[ "$SUBDOMINIO" -eq 1 ] && amarelo "     endereço de trabalho: o site vai sair FORA do índice do Google"

# ------------------------------------------------------------ 4. o vhost
echo "4/6  Criando o vhost"
ARQ="/etc/nginx/sites-available/$DOMINIO"
[ -f "$ARQ" ] && { cp "$ARQ" "$ARQ.bak-$(date +%F-%H%M%S)"; amarelo "     já existia — guardei uma cópia .bak"; }

SERVIDORES="$DOMINIO"
[ "$SUBDOMINIO" -eq 0 ] && SERVIDORES="$DOMINIO www.$DOMINIO"

cat > "$ARQ" <<NGINX
# Gerado por criar-site.sh — Izatec Tecidos
# Confira com \`nginx -T\`, não com \`nginx -t\`: o -t aprova bloco que o nginx
# nem carregou (link quebrado, arquivo fora do include).

limit_req_zone \$binary_remote_addr zone=izatec_forms:10m rate=20r/m;

server {
    listen 80;
    listen [::]:80;
    server_name $SERVIDORES;

    # O certbot precisa alcançar isto. Fica ANTES de qualquer redirect.
    location ^~ /.well-known/acme-challenge/ { root /var/www/html; }

    access_log /var/log/nginx/$DOMINIO.access.log;
    error_log  /var/log/nginx/$DOMINIO.error.log;

    # Formulário da loja não passa de alguns KB. Teto baixo elimina uma classe
    # inteira de abuso antes de o pedido chegar ao Node.
    client_max_body_size 1m;

    # ------------------------------------------------------------------
    # COMPRESSÃO. O HTML é gerado a cada pedido e sai com 40 a 90 KB; com
    # gzip cai para menos de 10. A falta disto foi o gargalo de TTFB em
    # outro site do parque — o nginx só comprime text/html por padrão.
    # ------------------------------------------------------------------
    gzip on;
    gzip_vary on;
    gzip_min_length 512;
    gzip_proxied any;
    gzip_comp_level 5;
    gzip_types text/plain text/css text/javascript application/javascript
               application/json application/xml image/svg+xml
               application/manifest+json;

    # ------------------------------------------------------------------
    # ESTÁTICOS. As 24 fotos do acervo pesam 4,4 MB no total: sem cache, o
    # visitante rebaixa tudo a cada página. Servidos do disco, sem acordar
    # o Node.
    # ------------------------------------------------------------------
    location ^~ /assets/ {
        alias $RAIZ/assets/;
        expires 7d;
        add_header Cache-Control "public, must-revalidate" always;
        access_log off;
        try_files \$uri =404;
    }

    # Freio de borda dos formulários: o pedido nem acorda o processo.
    location ~ ^/(contato|amostra|pedido/enviar)\$ {
        limit_req zone=izatec_forms burst=5 nodelay;
        proxy_pass http://127.0.0.1:$PORTA;
        include /etc/nginx/proxy_izatec.conf;
    }

    location / {
        proxy_pass http://127.0.0.1:$PORTA;
        include /etc/nginx/proxy_izatec.conf;
    }
}
NGINX

# Os cabeçalhos do proxy num arquivo só. O X-Forwarded-For usa
# \$proxy_add_x_forwarded_for, que ACRESCENTA o IP real ao FIM da lista — por
# isso a aplicação lê o ÚLTIMO item. O primeiro é texto escrito pelo cliente, e
# ler dali já desligou a trava de força bruta em quatro servidores do parque.
cat > /etc/nginx/proxy_izatec.conf <<'PROXY'
proxy_http_version 1.1;
proxy_set_header Host              $host;
proxy_set_header X-Real-IP         $remote_addr;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_connect_timeout 10s;
proxy_read_timeout    30s;
PROXY

ln -sf "$ARQ" "/etc/nginx/sites-enabled/$DOMINIO"
if ! nginx -t 2>&1 | sed 's/^/     /'; then
  vermelho "     configuração inválida — nada foi recarregado"
  exit 1
fi
systemctl reload nginx
verde "     vhost ativo em HTTP"

# ------------------------------------------------------- 5. o certificado
echo "5/6  Emitindo o certificado"
if [ "$SUBDOMINIO" -eq 1 ]; then
  echo "     (sob *.projetos.luizaugust.me o navegador recusa http:// por HSTS —"
  echo "      até aqui a página não abre em navegador nenhum. É esperado.)"
fi
# shellcheck disable=SC2086
if certbot --nginx $DOMINIOS --redirect --agree-tos --no-eff-email -m "$EMAIL" --non-interactive; then
  verde "     certificado emitido e HTTPS ativo"
else
  vermelho "     o certbot falhou — veja /var/log/letsencrypt/letsencrypt.log"
  [ "$SUBDOMINIO" -eq 1 ] && vermelho "     sem certificado, este endereço NÃO abre no navegador (HSTS)."
  exit 1
fi

# ------------------------------------------- 6. reiniciar e conferir
echo "6/6  Reiniciando o serviço com o endereço novo e conferindo"
# O IZATEC_SITE é lido na subida: sem reiniciar, o canonical continua o antigo.
systemctl restart izatec.service
sleep 2

HTTPS=$(curl -s -o /dev/null -w "%{http_code}" "https://$DOMINIO/" || echo 000)
CANON=$(curl -s "https://$DOMINIO/" | grep -o 'rel="canonical" href="[^"]*"' | head -1)
ROBOTS=$(curl -s "https://$DOMINIO/robots.txt" | head -4 | tr '\n' ' ')
TAG=$(curl -s -I "https://$DOMINIO/" | grep -i 'x-robots-tag' | tr -d '\r')

echo "     https://$DOMINIO      -> $HTTPS"
echo "     $CANON"
echo "     robots.txt: $ROBOTS"
[ -n "$TAG" ] && echo "     $TAG"

certbot renew --dry-run >/dev/null 2>&1 \
  && verde "     renovação automática testada" \
  || amarelo "     o teste de renovação falhou — rode 'certbot renew --dry-run'"

echo
if [ "$HTTPS" = "200" ]; then
  verde "Pronto: https://$DOMINIO no ar."
  [ "$SUBDOMINIO" -eq 1 ] && amarelo "Fora do índice do Google, como deve ser um endereço de trabalho."
  echo
  echo "  Confira: ./verificar.sh https://$DOMINIO"
else
  amarelo "HTTPS respondeu $HTTPS — veja /var/log/nginx/$DOMINIO.error.log"
  exit 1
fi
