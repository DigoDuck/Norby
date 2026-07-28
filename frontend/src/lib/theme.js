// Fonte da verdade visual do tema: o atributo data-theme no <html>. O
// localStorage é só persistência — quem manda no render é o DOM, aplicado pelo
// script inline do index.html antes do bundle (evita flash de tema errado).
// Por isso não existe store de tema: um store criaria uma segunda verdade que
// pode divergir do que o script já pintou na tela.
const KEY = "norby-theme";
const THEMES = ["dark", "light"];

export function getTheme() {
  const attr = document.documentElement.dataset.theme;
  return THEMES.includes(attr) ? attr : "dark";
}

export function setTheme(theme) {
  const next = THEMES.includes(theme) ? theme : "dark";
  document.documentElement.dataset.theme = next;
  // Alinha os controles nativos (scrollbar, date picker, autofill) ao tema.
  document.documentElement.style.colorScheme = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Storage bloqueado (janela anônima, cookies desligados): o tema vale para
    // a sessão atual e volta a dark no próximo carregamento. Não é fatal.
  }
  return next;
}
