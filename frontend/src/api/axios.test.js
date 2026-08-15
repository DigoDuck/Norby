import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// O módulo cria a instância e registra os interceptors no import. Para exercitar
// o handler de erro sem rede, capturamos o callback que ele registra.
let onRejected;
const instancia = vi.fn();

vi.mock("axios", () => {
  const create = vi.fn(() => {
    instancia.interceptors = {
      request: { use: vi.fn() },
      response: { use: vi.fn((_ok, err) => { onRejected = err; }) },
    };
    return instancia;
  });
  return { default: { create, post: vi.fn() } };
});

const { useAuthStore } = await import("@/store/authStore");
const axios = (await import("axios")).default;
await import("./axios");

const erro401 = (url = "/transactions/") => ({
  response: { status: 401 },
  config: { url, headers: {} },
});

describe("interceptor de refresh", () => {
  let hrefOriginal;

  beforeEach(() => {
    vi.clearAllMocks();
    instancia.mockResolvedValue({ data: "ok" });
    useAuthStore.setState({
      token: "velho",
      refreshToken: "refresh-valido",
      user: { name: "Alice" },
      isAuthenticated: true,
    });
    hrefOriginal = window.location.href;
    delete window.location;
    window.location = { href: hrefOriginal };
  });

  afterEach(() => {
    window.location = { href: hrefOriginal };
  });

  it("renova o token no 401 e repete a requisição", async () => {
    axios.post.mockResolvedValue({
      data: { access_token: "novo", refresh_token: "refresh-novo" },
    });

    await onRejected(erro401());

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().token).toBe("novo");
    // A requisição original é reenviada, agora com o token novo.
    expect(instancia).toHaveBeenCalledTimes(1);
    expect(instancia.mock.calls[0][0].headers.Authorization).toBe("Bearer novo");
  });

  it("desloga quando o refresh falha", async () => {
    axios.post.mockRejectedValue(new Error("refresh expirado"));

    await expect(onRejected(erro401())).rejects.toBeTruthy();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(window.location.href).toBe("/");
  });

  it("duas requisições concorrentes disparam um refresh só", async () => {
    // Sem a fila, N requisições em voo no momento da expiração disparariam N
    // refreshes, e a rotação invalidaria os sucessores umas das outras.
    let liberar;
    axios.post.mockReturnValue(
      new Promise((r) => {
        liberar = () => r({ data: { access_token: "novo", refresh_token: "rn" } });
      }),
    );

    const a = onRejected(erro401("/transactions/"));
    const b = onRejected(erro401("/wallets/"));
    liberar();
    await Promise.all([a, b]);

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(instancia).toHaveBeenCalledTimes(2);
  });

  it("não tenta renovar nos próprios endpoints de auth", async () => {
    await expect(onRejected(erro401("/auth/login"))).rejects.toBeTruthy();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("desloga direto quando não há refresh token guardado", async () => {
    useAuthStore.setState({ refreshToken: null });

    await expect(onRejected(erro401())).rejects.toBeTruthy();

    expect(axios.post).not.toHaveBeenCalled();
    expect(window.location.href).toBe("/");
  });
});
