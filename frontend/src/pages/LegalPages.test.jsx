import { render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

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
