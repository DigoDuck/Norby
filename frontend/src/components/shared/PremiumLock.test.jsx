import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import PremiumLock from "./PremiumLock";

// Mostra onde o convite levou: rota e query string.
function Destino() {
  const { pathname, search } = useLocation();
  return <p>{`${pathname}${search}`}</p>;
}

describe("PremiumLock", () => {
  it("'Conhecer o plano Premium' abre as Configurações direto na aba Plano", async () => {
    // Antes o convite levava à página de Configurações e parava na aba Perfil:
    // a pessoa clicava em "conhecer" e não via o plano.
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route
            path="/dashboard"
            element={<PremiumLock title="A leitura da Norby faz parte do plano Premium" text="Assine." />}
          />
          <Route path="/settings" element={<Destino />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Conhecer o plano Premium" }));

    expect(await screen.findByText("/settings?aba=plano")).toBeInTheDocument();
  });
});
