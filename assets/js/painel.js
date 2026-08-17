/* ==========================================================================
   PAINEL — o mínimo de JavaScript

   Mesma regra do site: nada aqui é necessário para salvar. Se o arquivo não
   carregar, todos os formulários continuam funcionando por POST.

   O que ele acrescenta é o que evita PERDA DE TRABALHO — que num painel é o
   único incidente que realmente dói.
   ========================================================================== */
(function () {
  "use strict";

  /* ------------------------------------------------- aviso de saída suja
     A tela de estoque tem cem campos. Fechar a aba depois de ajustar oitenta
     deles e perder tudo é o tipo de acidente que faz a loja desistir do
     painel — e voltar a anotar preço no caderno. */
  var sujo = false;
  var formularios = document.querySelectorAll(".conteudo form");

  formularios.forEach(function (f) {
    f.addEventListener("input", function () { sujo = true; });
    f.addEventListener("submit", function () { sujo = false; });
  });

  window.addEventListener("beforeunload", function (e) {
    if (!sujo) return;
    e.preventDefault();
    e.returnValue = "";
  });

  /* ------------------------------------------------------- Ctrl+S salva
     Quem passa o dia numa grade de dados tenta Ctrl+S por reflexo. Sem isto,
     o atalho abre a caixa de "salvar página" do navegador — que é confuso e
     não salva nada. */
  document.addEventListener("keydown", function (e) {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "s") return;
    var f = document.querySelector(".conteudo form");
    if (!f) return;
    e.preventDefault();
    if (typeof f.requestSubmit === "function") f.requestSubmit(); else f.submit();
  });

  /* --------------------------------------------- confirmar o que não volta
     Já está nos botões via onclick, mas o atributo data-confirma permite
     acrescentar a confirmação sem escrever script inline em cada tela. */
  document.querySelectorAll("[data-confirma]").forEach(function (b) {
    b.addEventListener("click", function (e) {
      if (!window.confirm(b.dataset.confirma)) e.preventDefault();
    });
  });
})();
