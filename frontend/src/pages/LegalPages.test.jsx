import { render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

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

  it("aponta o contato para um domínio que é nosso", () => {
    // Isto já esteve errado: as duas páginas nasceram apontando para
    // `norby.app`, que nunca foi nosso. Num documento legal isso não é typo.
    // O Decreto 7.962/2013 exige endereço eletrônico do fornecedor e a LGPD
    // exige canal do controlador, e um e-mail que ninguém recebe é PIOR que
    // nenhum, porque parece um: a pessoa escreve, ninguém responde, e o
    // registro mostra que ela tentou.
    const { container } = renderPage(Page);

    expect(container.textContent).toContain("@norby.com.br");
    expect(container.textContent).not.toMatch(/norby\.app/);
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

// A identidade do fornecedor é a única parte destas páginas que NÃO vive no
// código: o CPF vem do painel da Vercel, porque a lei o quer visível no site e
// este repositório é público. Estes dois testes guardam as duas pontas.
describe("Termos de Uso: a identidade do fornecedor vem do build", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("mostra nome e documento quando o build os traz", () => {
    vi.stubEnv("VITE_FORNECEDOR_NOME", "Fulano de Tal");
    vi.stubEnv("VITE_FORNECEDOR_CPF", "000.000.000-00");

    const texto = renderPage(Termos).container.textContent;

    expect(texto).toContain("Fulano de Tal");
    expect(texto).toContain("000.000.000-00");
  });

  it("sem as variáveis, omite o fornecedor em vez de inventar um", () => {
    // Este teste também é o guarda do repositório público: se alguém voltar a
    // escrever o nome ou o CPF na unha dentro do componente, ele quebra aqui,
    // porque o estado vazio deixaria de ser alcançável.
    vi.stubEnv("VITE_FORNECEDOR_NOME", "");
    vi.stubEnv("VITE_FORNECEDOR_CPF", "");

    const texto = renderPage(Termos).container.textContent;

    expect(texto).not.toContain("Fornecedor:");
    expect(texto).not.toContain("CPF/CNPJ:");
    expect(texto).toContain("contato@norby.com.br");
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
