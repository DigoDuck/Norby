import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { adminApi } from "@/api/admin";
import { useAuthStore } from "@/store/authStore";
import Admin from "./Admin";

vi.mock("@/api/admin", () => ({
  adminApi: {
    metrics: vi.fn(),
    users: vi.fn(),
    cancelSubscription: vi.fn(),
    deleteUser: vi.fn(),
    sendRecoveryEmail: vi.fn(),
  },
}));

const METRICS = {
  users: 5,
  premium: 1,
  trial: 2,
  expired: 1,
  mrr_brl: 20,
  ai_calls_today: 5,
  ai_calls_project_limit: 500,
};

const USERS = [
  {
    id: "u1",
    name: "Alice",
    email: "alice@test.com",
    created_at: "2026-01-01T00:00:00Z",
    premium_until: "2027-01-01T00:00:00Z",
    ai_trial_ends_at: null,
    subscription_status: "active",
    cancel_at_period_end: false,
    is_admin: false,
  },
  {
    id: "u2",
    name: "Bob",
    email: "bob@test.com",
    created_at: "2026-02-01T00:00:00Z",
    premium_until: null,
    ai_trial_ends_at: "2027-01-01T00:00:00Z",
    subscription_status: null,
    cancel_at_period_end: false,
    is_admin: false,
  },
];

function renderAdmin() {
  render(
    <MemoryRouter>
      <Admin />
    </MemoryRouter>,
  );
}

describe("Admin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().login("access", {
      id: "admin1",
      name: "Root",
      email: "root@norby.dev",
      is_admin: true,
    });
    adminApi.metrics.mockResolvedValue({ data: METRICS });
    adminApi.users.mockResolvedValue({ data: USERS });
  });

  it("renderiza as métricas e a lista", async () => {
    renderAdmin();

    expect(await screen.findByText("alice@test.com")).toBeInTheDocument();
    expect(screen.getByText("bob@test.com")).toBeInTheDocument();

    // Usuários (métrica).
    expect(screen.getByText("5")).toBeInTheDocument();
    // MRR em BRL.
    expect(screen.getByText("R$ 20,00")).toBeInTheDocument();
    // IA hoje: chamadas / limite do projeto.
    expect(screen.getByText("5 / 500")).toBeInTheDocument();
  });

  it("filtra por nome ou e-mail", async () => {
    renderAdmin();
    await screen.findByText("alice@test.com");

    fireEvent.change(screen.getByLabelText("Buscar usuário"), {
      target: { value: "bob@" },
    });

    expect(screen.queryByText("alice@test.com")).not.toBeInTheDocument();
    expect(screen.getByText("bob@test.com")).toBeInTheDocument();
  });

  it("mostra o estado vazio quando o filtro não encontra ninguém", async () => {
    renderAdmin();
    await screen.findByText("alice@test.com");

    fireEvent.change(screen.getByLabelText("Buscar usuário"), {
      target: { value: "ninguemcomessenome" },
    });

    expect(
      await screen.findByText("Nenhum usuário com esse nome ou e-mail"),
    ).toBeInTheDocument();
  });

  it("cancelar assinatura pede a senha e chama a API", async () => {
    adminApi.cancelSubscription.mockResolvedValue({ status: 204 });
    renderAdmin();
    await screen.findByText("alice@test.com");

    const linha = screen.getByText("alice@test.com").closest("[data-user-row]");
    fireEvent.click(
      within(linha).getByRole("button", { name: "Cancelar assinatura" }),
    );

    // Timeout maior: o Dialog do Base UI monta em portal, e a máquina de CI
    // pode demorar mais que o padrão de 1s sob carga.
    fireEvent.change(await screen.findByLabelText("Sua senha atual", {}, { timeout: 3000 }), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() =>
      expect(adminApi.cancelSubscription).toHaveBeenCalledWith("u1", "secret123"),
    );
    // A lista recarrega após o sucesso.
    await waitFor(() => expect(adminApi.users).toHaveBeenCalledTimes(2));
  });

  it("senha errada mostra o erro sem fechar o diálogo", async () => {
    adminApi.deleteUser.mockRejectedValue({
      response: { status: 401, data: { detail: "Senha incorreta" } },
    });
    renderAdmin();
    await screen.findByText("alice@test.com");

    const linha = screen.getByText("alice@test.com").closest("[data-user-row]");
    fireEvent.click(within(linha).getByRole("button", { name: "Excluir conta" }));

    // Timeout maior: o Dialog do Base UI monta em portal, e a máquina de CI
    // pode demorar mais que o padrão de 1s sob carga.
    fireEvent.change(await screen.findByLabelText("Sua senha atual", {}, { timeout: 3000 }), {
      target: { value: "senhaerrada" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(await screen.findByText("Senha incorreta")).toBeInTheDocument();
    // O diálogo continua aberto: o campo de senha ainda está na tela.
    expect(screen.getByLabelText("Sua senha atual")).toBeInTheDocument();
  });
});
