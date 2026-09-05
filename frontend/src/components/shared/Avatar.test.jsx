import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { useAuthStore } from "@/store/authStore";
import Avatar from "./Avatar";

const ESTADO = useAuthStore.getState();

afterEach(() => useAuthStore.setState(ESTADO, true));

describe("Avatar", () => {
  it("falls back to the first letter of the name when there is no photo", () => {
    useAuthStore.setState({ photo: null });
    render(<Avatar name="diogo" />);
    expect(screen.getByText("D")).toBeInTheDocument();
  });

  it("shows a U when there is no name either", () => {
    useAuthStore.setState({ photo: null });
    render(<Avatar name={undefined} />);
    expect(screen.getByText("U")).toBeInTheDocument();
  });

  it("renders the photo from the store, not a URL the browser would fetch", () => {
    // A rota é fechada e `<img src>` não manda o token: se algum dia isto virar
    // um src apontando para /auth/me/photo, a foto some da tela em produção.
    useAuthStore.setState({ photo: "data:image/webp;base64,AAAA" });
    const { container } = render(<Avatar name="Diogo" />);
    const img = container.querySelector("img");
    expect(img.getAttribute("src")).toBe("data:image/webp;base64,AAAA");
    expect(screen.queryByText("D")).not.toBeInTheDocument();
  });

  it("leaves the image out of the accessibility tree", () => {
    // O nome está escrito ao lado nos dois usos; descrever a foto faria o
    // leitor de tela repetir a mesma informação.
    useAuthStore.setState({ photo: "data:image/webp;base64,AAAA" });
    const { container } = render(<Avatar name="Diogo" />);
    expect(container.querySelector("img").getAttribute("alt")).toBe("");
  });
});
