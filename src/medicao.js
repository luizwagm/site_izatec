"use strict";
/* ==========================================================================
   MEDIÇÃO — Google Analytics 4 e Meta Pixel

   ---------------------------------------------------------------------------
   NADA DISPARA ANTES DO ACEITE, E ISSO NÃO É EXCESSO DE ZELO

   GA4 e Meta Pixel gravam cookie e mandam o comportamento do visitante para
   fora do país. Pela LGPD isso exige base legal, e a que a ANPD reconhece para
   marketing é o CONSENTIMENTO — dado antes, livre e informado.

   O padrão do mercado (carregar o script na hora e mostrar uma faixa dizendo
   "ao continuar navegando você concorda") não cumpre isso: quando a faixa
   aparece, o dado já foi enviado. Aqui o script só entra no HTML depois do
   clique em "Aceitar", e "Recusar" é um botão de verdade, do mesmo tamanho.

   ---------------------------------------------------------------------------
   O QUE ISSO CUSTA E O QUE ISSO GANHA

   Custa uma fatia da medição: quem recusa não é contado no GA4. Ganha duas
   coisas — a loja fica em conformidade, e a CONTAGEM PRÓPRIA (a tabela
   `acessos`, sem cookie e sem terceiro) continua contando todo mundo. O painel
   nunca fica cego, porque ele nunca dependeu do Google para saber quantas
   pessoas entraram.
   ========================================================================== */
const { txt } = require("./db");

/* Um ID que não é ID quebraria a página com erro de script. Os dois formatos
   são conhecidos e a conferência é barata: G-XXXXXXX no GA4, só dígitos no
   Pixel. Campo em branco simplesmente não gera nada. */
const ga4Valido = (v) => /^G-[A-Z0-9]{4,20}$/i.test(String(v || "").trim());
const pixelValido = (v) => /^\d{8,20}$/.test(String(v || "").trim());

function configurada() {
  return ga4Valido(txt("medicao.ga4", "")) || pixelValido(txt("medicao.pixel", ""));
}

/* ==========================================================================
   O QUE VAI PARA O <head>

   O carregador fica no HTML de TODA página, mas ele não carrega nada por conta
   própria: só age se encontrar o consentimento já guardado. Sem consentimento,
   é um punhado de bytes parado.
   ========================================================================== */
function cabeca() {
  const ga4 = String(txt("medicao.ga4", "")).trim();
  const pixel = String(txt("medicao.pixel", "")).trim();
  if (!configurada()) return "";

  return `
<script>
/* Medição da Izatec — só entra depois do aceite. Ver src/medicao.js. */
(function () {
  var GA4 = ${JSON.stringify(ga4Valido(ga4) ? ga4 : "")};
  var PIXEL = ${JSON.stringify(pixelValido(pixel) ? pixel : "")};

  function ligarGA4() {
    if (!GA4 || window.__ga4) return; window.__ga4 = 1;
    var s = document.createElement("script"); s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA4;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    gtag("js", new Date());
    /* anonimizar o IP é obrigação nossa, não opção do Google */
    gtag("config", GA4, { anonymize_ip: true });
  }

  function ligarPixel() {
    if (!PIXEL || window.__pixel) return; window.__pixel = 1;
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
    (window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', PIXEL); fbq('track', 'PageView');
  }

  window.izatecMedir = function () { ligarGA4(); ligarPixel(); };

  /* Consentimento vale por seis meses. Prazo indefinido não existe na LGPD —
     e seis meses é o que o mercado pratica sem incomodar quem já respondeu. */
  try {
    var g = /(?:^|;\\s*)izatec_medir=([^;]*)/.exec(document.cookie);
    if (g && g[1] === "sim") window.izatecMedir();
  } catch (e) {}
})();
</script>`;
}

/* ==========================================================================
   O AVISO

   Fica no rodapé da tela, não no meio dela. Modal cobrindo a página empurra a
   pessoa a clicar em qualquer coisa para ver o produto — e "aceite" obtido
   assim não é aceite, é pedágio.
   ========================================================================== */
function aviso() {
  if (!configurada()) return "";
  return `
<div class="consentimento" id="consentimento" hidden>
  <p><strong>A gente mede o que funciona.</strong>
    Usamos Google Analytics e Meta Pixel para saber quais tecidos são mais
    procurados. Nenhum dado seu é vendido, e o site funciona igual se você
    recusar — a nossa contagem de visitas não depende disso.</p>
  <div class="consentimento__acoes">
    <button class="btn btn--acao btn--sm" type="button" data-medir="sim">Aceitar</button>
    <button class="btn btn--linha btn--sm" type="button" data-medir="nao">Recusar</button>
  </div>
</div>
<script>
(function () {
  var cx = document.getElementById("consentimento");
  if (!cx) return;
  if (/(?:^|;\\s*)izatec_medir=/.test(document.cookie)) return;   /* já respondeu */
  cx.hidden = false;
  cx.addEventListener("click", function (e) {
    var b = e.target.closest("[data-medir]"); if (!b) return;
    var v = b.dataset.medir;
    document.cookie = "izatec_medir=" + v + "; Path=/; Max-Age=" + (180 * 24 * 3600) + "; SameSite=Lax";
    cx.hidden = true;
    if (v === "sim" && window.izatecMedir) window.izatecMedir();
  });
})();
</script>`;
}

module.exports = { cabeca, aviso, configurada, ga4Valido, pixelValido };
