/* ==========================================================================
   IZATEC — o pouco de JavaScript que o site usa

   REGRA DA CASA: nada aqui é necessário para o site funcionar.

   O menu do celular abre; sem script, os links continuam na página (o menu
   nasce visível e o script é que o esconde). Os filtros do catálogo são links
   de verdade. O carrinho é formulário com POST. Se este arquivo não carregar —
   e no polo tem gente navegando em 3G ruim — o site inteiro continua vendendo.

   Isso não é purismo: é a diferença entre perder a venda e não perder.
   ========================================================================== */
(function () {
  "use strict";

  /* ------------------------------------------------------- menu do celular */
  var botao = document.querySelector(".topo__menu");
  var menu = document.getElementById("nav-movel");
  if (botao && menu) {
    botao.addEventListener("click", function () {
      var aberto = botao.getAttribute("aria-expanded") === "true";
      botao.setAttribute("aria-expanded", String(!aberto));
      botao.setAttribute("aria-label", aberto ? "Abrir o menu" : "Fechar o menu");
      menu.hidden = aberto;
      document.body.classList.toggle("trava", !aberto);
    });
    /* Esc fecha: quem abriu sem querer no meio da leitura não precisa procurar
       o X com o polegar. */
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !menu.hidden) botao.click();
    });
  }

  /* --------------------------------------------- sombra do topo ao rolar */
  var topo = document.querySelector(".topo");
  if (topo) {
    var marcar = function () { topo.classList.toggle("topo--rolado", window.scrollY > 8); };
    marcar();
    window.addEventListener("scroll", marcar, { passive: true });
  }

  /* ==========================================================================
     TROCA DE COR NA PÁGINA DO ARTIGO

     Sem recarregar a página. O que muda é a amostra de cor, o nome, o sinal de
     estoque e — importante — o campo escondido com o id da cor, que é o que o
     formulário envia. Trocar o visual sem trocar o id venderia a cor errada.
     ========================================================================== */
  var cores = document.querySelectorAll(".produto__cores .cor");
  if (cores.length) {
    var foto = document.getElementById("p-foto");
    var nome = document.getElementById("p-cor-nome");
    var estoque = document.getElementById("p-estoque");
    var campo = document.getElementById("p-cor-id");

    cores.forEach(function (b) {
      b.addEventListener("click", function () {
        cores.forEach(function (o) {
          o.classList.remove("cor--on"); o.setAttribute("aria-pressed", "false");
        });
        b.classList.add("cor--on"); b.setAttribute("aria-pressed", "true");

        if (foto) {
          foto.style.setProperty("--tom", b.dataset.hex);
          /* A foto esmaece por um instante e deixa o tom novo aparecer por
             baixo. Sem isso, trocar de cor não muda NADA visível quando o
             artigo tem foto — e a pessoa clica de novo achando que travou. */
          foto.classList.add("trocando");
          clearTimeout(foto._voltar);
          foto._voltar = setTimeout(function () { foto.classList.remove("trocando"); }, 240);
        }
        if (campo) campo.value = b.dataset.id;
        if (nome) {
          nome.innerHTML = "";
          nome.appendChild(document.createTextNode(b.dataset.nome));
          if (b.dataset.cod) {
            var s = document.createElement("span");
            s.textContent = " · " + b.dataset.cod;
            nome.appendChild(s);
          }
        }
        if (estoque) {
          var q = Number(b.dataset.estoque || 0);
          var classe = q <= 0 ? "fim" : (q < 100 ? "atencao" : "ok");
          var rot = q <= 0 ? "Sob encomenda" : (q < 100 ? "Últimos metros" : "Disponível");
          estoque.innerHTML = "";
          var e = document.createElement("span");
          e.className = "sinal sinal--" + classe;
          e.textContent = rot;
          estoque.appendChild(e);
        }
      });
    });
  }

  /* ==========================================================================
     MÁSCARA DE TELEFONE

     Só nos campos de telefone, e só formatando o que a pessoa digita — nunca
     recusando. Máscara que bloqueia caractere é máscara que trava quem tem
     número de outro estado ou colou o número com o +55 na frente.
     ========================================================================== */
  document.querySelectorAll('input[inputmode="tel"]').forEach(function (i) {
    i.addEventListener("input", function () {
      var d = i.value.replace(/\D/g, "").slice(0, 11);
      if (d.length > 10) i.value = "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
      else if (d.length > 6) i.value = "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
      else if (d.length > 2) i.value = "(" + d.slice(0, 2) + ") " + d.slice(2);
      else i.value = d;
    });
  });

  /* ==========================================================================
     REVELAR AO ROLAR

     IntersectionObserver, e não evento de scroll. A diferença importa: um
     `onscroll` dispara dezenas de vezes por segundo e obriga a ler a posição
     de cada elemento — em celular antigo, dentro de um galpão, isso trava a
     rolagem. O observador é o navegador avisando a gente, uma vez, quando o
     bloco entra na tela.

     `unobserve` depois de revelar: o bloco já apareceu, não há mais nada para
     observar. Sem isso, a lista de observados só cresce.
     ========================================================================== */
  var paraRevelar = document.querySelectorAll(".revelar");

  function mostrarTudo() {
    Array.prototype.forEach.call(paraRevelar, function (el) {
      el.classList.add("revelar--on");
    });
  }

  if (paraRevelar.length && "IntersectionObserver" in window) {
    var olho = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("revelar--on");
        olho.unobserve(e.target);
      });
    }, {
      /* -12% embaixo: o bloco começa a aparecer um pouco ANTES de encostar na
         borda da tela. Revelar exatamente na borda faz o movimento acontecer
         fora do campo de visão e parecer que nada aconteceu. */
      rootMargin: "0px 0px -12% 0px",
      threshold: 0.05,
    });
    paraRevelar.forEach(function (el) { olho.observe(el); });

    /* ======================================================================
       A SONDA — o observador está mesmo vivo?

       Esconder conteúdo esperando um evento é uma aposta, e esta é a apólice.
       Se o IntersectionObserver não chamar de volta — navegador que não está
       compondo quadros, webview limitada, implementação incompleta — os
       blocos ficariam invisíveis para SEMPRE. O site pareceria meio vazio e
       ninguém entenderia por quê, porque não haveria erro nenhum no console.

       O teste é direto e não depende de rolagem: observo um elemento que com
       certeza está na tela (o cabeçalho) e vejo se a chamada acontece. Toda
       implementação viva responde de imediato, mesmo antes de qualquer
       rolagem. Silêncio em 900ms significa que não dá para confiar nele —
       então mostro tudo e o site fica parado, que é o pior aceitável.

       (Uma primeira versão testava "nada foi revelado em 1s". Estava errada
       dos dois lados: numa home cujo primeiro bloco está a 1200px do topo,
       nada é revelado no primeiro segundo mesmo com o observador vivo.)
       ====================================================================== */
    var sonda = document.querySelector(".topo") || document.body;
    var vivo = false;
    var testador = new IntersectionObserver(function () { vivo = true; });
    testador.observe(sonda);

    setTimeout(function () {
      testador.disconnect();
      if (vivo) return;                  /* tudo certo: segue no observador */
      olho.disconnect();
      mostrarTudo();
    }, 900);
  } else {
    /* Navegador sem o observador (ou script parcial): mostra tudo. Nunca
       deixar conteúdo escondido esperando algo que não vai acontecer. */
    mostrarTudo();
  }

  /* ==========================================================================
     BARRA DE LEITURA DA MATÉRIA

     Só existe na página de matéria. Anima `transform: scaleX`, não `width`:
     largura obriga o navegador a recalcular o layout a cada quadro da rolagem.
     ========================================================================== */
  var barra = document.querySelector("#progresso span");
  if (barra) {
    var artigo = document.querySelector(".materia");
    var pintar = function () {
      var alvo = artigo || document.body;
      var inicio = alvo.offsetTop;
      var total = alvo.offsetHeight - window.innerHeight;
      var andou = total > 0 ? (window.scrollY - inicio) / total : 0;
      barra.style.transform = "scaleX(" + Math.min(1, Math.max(0, andou)) + ")";
      barra.style.width = "100%";
    };
    pintar();
    window.addEventListener("scroll", pintar, { passive: true });
    window.addEventListener("resize", pintar);
  }

  /* ------------------------------------------- não enviar o mesmo duas vezes
     Pedido enviado duas vezes por clique nervoso vira dois pedidos no painel e
     um telefonema da loja para desfazer. */
  document.querySelectorAll("form").forEach(function (f) {
    f.addEventListener("submit", function () {
      var b = f.querySelector('button[type="submit"]:not([name])');
      if (b) { setTimeout(function () { b.disabled = true; b.classList.add("btn--indo"); }, 0); }
    });
  });
})();
