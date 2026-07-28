import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HeroRing from "./HeroRing";

describe("HeroRing", () => {
  it("mantém os dois assets disponíveis para a troca de tema sem remontar o hero", () => {
    const { container } = render(<HeroRing />);

    expect(container.querySelector('[data-ring-theme="dark"]')).toHaveAttribute(
      "src",
      expect.stringContaining("hero-ring-dark"),
    );
    expect(container.querySelector('[data-ring-theme="light"]')).toHaveAttribute(
      "src",
      expect.stringContaining("hero-ring-light"),
    );
  });

  it("expõe o toro e a cáustica apenas como decoração", () => {
    const { container } = render(<HeroRing />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector('[data-hero-caustic="true"]')).toBeInTheDocument();
  });
});
