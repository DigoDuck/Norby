import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import nubankLogo from "@/assets/banks/nubank.svg";
import WalletMark from "./WalletMark";

describe("WalletMark", () => {
  it("banco com logo mostra o logo, decorativo (o nome já está ao lado)", () => {
    const { container } = render(<WalletMark wallet={{ bank: "nubank", name: "Roxinho" }} />);
    const img = container.querySelector("img");
    expect(img.getAttribute("src")).toBe(nubankLogo);
    expect(img).toHaveAttribute("alt", "");
  });

  it("Dinheiro não é banco: vira cédula, sem logo", () => {
    const { container } = render(<WalletMark wallet={{ bank: "dinheiro", name: "Carteira" }} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("sem banco, ou com slug que o catálogo não conhece, cai na inicial", () => {
    const { container: semBanco } = render(<WalletMark wallet={{ bank: null, name: "reserva" }} />);
    expect(semBanco.textContent).toBe("R");
    const { container: desconhecido } = render(
      <WalletMark wallet={{ bank: "banco-extinto", name: "antiga" }} />,
    );
    expect(desconhecido.textContent).toBe("A");
  });
});
