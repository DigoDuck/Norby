import { render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { PRECO_MENSAL } from "@/lib/plano";
import Privacidade from "./Privacidade";
import Termos from "./Termos";

function renderPage(Page) {
  return render(
    <MemoryRouter>
      {createElement(Page)}
    </MemoryRouter>,
  );
}

describe.each([
  ["Termos de Uso", Termos],
  ["Política de Privacidade", Privacidade],
])("%s", (title, Page) => {
  it("mantém todo o documento em uma única superfície de leitura", () => {
    const { container } = renderPage(Page);

    const main = screen.getByRole("main");
    const article = within(main).getByRole("article");

    expect(main).toHaveClass("mx-auto", "max-w-3xl");
    expect(container.querySelectorAll(".glass")).toHaveLength(1);
    expect(article).toHaveClass("glass", "p-8");
    expect(article.querySelector("section.glass")).not.toBeInTheDocument();
    expect(within(article).getByRole("heading", { level: 1, name: title }))
      .toBeInTheDocument();

    for (const heading of within(article).getAllByRole("heading", { level: 2 })) {
      expect(heading).toHaveClass(
        "text-lg",
        "font-semibold",
        "text-content",
        "mt-8",
        "mb-3",
      );
      expect(heading.nextElementSibling).toHaveClass(
        "text-content-2",
        "leading-relaxed",
      );
    }
  });
});

// Conteúdo que existe por obrigação legal, não por estilo. Um refactor de
// layout que reescreva estas páginas continua passando no teste de estrutura
// acima mesmo tendo apagado o direito de arrependimento — daí estes.
describe("Termos de Uso: o que a cobrança obriga a informar", () => {
  it("informa preço, renovação automática e cancelamento sem intermediário", () => {
    const { container } = renderPage(Termos);
    const texto = container.textContent;

    expect(texto).toContain(PRECO_MENSAL);
    expect(texto).toContain("renovada automaticamente");
    expect(texto).toContain("Gerenciar assinatura");
    expect(texto).toContain("Não há fidelidade nem multa por cancelar");
  });

  it("informa o direito de arrependimento de 7 dias com devolução integral", () => {
    // Art. 49 do CDC. É o item mais fácil de perder numa reescrita e o mais
    // caro de não ter: o direito existe mesmo sem estar escrito, mas não
    // informá-lo é a infração.
    const { container } = renderPage(Termos);
    const texto = container.textContent;

    expect(texto).toContain("art. 49");
    expect(texto).toContain("7 dias corridos");
    expect(texto).toContain("tudo o que pagou");
  });

  it("diz o que acontece com os dados de quem cancela", () => {
    const { container } = renderPage(Termos);
    const texto = container.textContent;

    expect(texto).toContain("Cancelar não apaga nada");
    expect(texto).toContain("72 horas");
  });
});

describe("Política de Privacidade: o que o pagamento acrescentou", () => {
  it("declara que dado de cartão nunca chega ao Norby", () => {
    const { container } = renderPage(Privacidade);
    const texto = container.textContent;

    expect(texto).toContain("nunca chegam aos servidores do Norby");
    expect(texto).toContain("Stripe");
  });

  it("declara a transferência internacional", () => {
    // Stripe e Gemini ficam fora do Brasil. Omitir isso seria a política
    // descrever um tratamento que não é o que acontece.
    const { container } = renderPage(Privacidade);
    expect(container.textContent).toContain("art. 33");
  });
});
