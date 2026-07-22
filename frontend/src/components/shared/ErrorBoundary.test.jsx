import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary";

function Explode() {
  throw new Error("render quebrou");
}

afterEach(() => vi.restoreAllMocks());

describe("ErrorBoundary", () => {
  it("renders the children when nothing fails", () => {
    render(
      <ErrorBoundary>
        <p>conteúdo normal</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("conteúdo normal")).toBeInTheDocument();
  });

  it("shows a recoverable screen instead of blanking the app when a child throws", () => {
    // O React loga o erro no console mesmo quando o boundary o captura.
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Explode />
      </ErrorBoundary>,
    );

    // Sem boundary a árvore inteira some e sobra tela branca; aqui tem saída.
    expect(screen.getByText("Algo quebrou por aqui")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recarregar" })).toBeInTheDocument();
  });
});
