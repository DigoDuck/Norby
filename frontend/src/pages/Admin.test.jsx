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
  canceling: 0,
  past_due: 0,
  mrr_net_brl: "18.81",
  signups_7d: 2,
  signups_prev_7d: 3,
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
  // O admin logado (beforeEach) aparece na própria lista devolvida pela API,
  // como no backend de verdade — precisa disto para testar que a própria
  // linha não ganha botão de ação.
  {
    id: "admin1",
    name: "Root",
    email: "root@norby.dev",
    created_at: "2025-01-01T00:00:00Z",
    premium_until: null,
    ai_trial_ends_at: null,
    subscription_status: null,
    cancel_at_period_end: false,
    is_admin: true,
  },
];

function renderAdmin() {
  render(
    <MemoryRouter>
      <Admin />
    </MemoryRouter>,
  );
}

// Timeout maior: o Dialog do Base UI monta em portal, e a máquina de CI pode
// demorar mais que o padrão de 1s sob carga.
async function fillPassword(value) {
  fireEvent.change(await screen.findByLabelText("Sua senha atual", {}, { timeout: 3000 }), {
    target: { value },
  });
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
    // MRR líquido em BRL (vem como string decimal da API).
    expect(screen.getByText("R$ 18,81")).toBeInTheDocument();
    // IA hoje: chamadas / limite do projeto.
    expect(screen.getByText("5 / 500")).toBeInTheDocument();
  });

  it("mostra o que ameaça a receita e os cadastros com a semana anterior", async () => {
    // O MRR antigo somava quem já cancelou e quem teve o cartão recusado. Os
    // dois agora têm card próprio, com cor quando não são zero: é onde há
    // algo a fazer (falar com quem cancelou, cobrar quem teve o cartão
    // recusado).
    adminApi.metrics.mockResolvedValue({
      data: { ...METRICS, canceling: 2, past_due: 1 },
    });
    renderAdmin();

    const cancelando = await screen.findByText("Cancelando");
    expect(cancelando.nextElementSibling).toHaveTextContent("2");
    expect(cancelando.nextElementSibling).toHaveClass("text-warning");

    const recusado = screen.getByText("Pagamento recusado");
    expect(recusado.nextElementSibling).toHaveTextContent("1");
    expect(recusado.nextElementSibling).toHaveClass("text-danger");

    expect(screen.getByText("MRR líquido")).toBeInTheDocument();
    expect(screen.getByText("Cadastros (7 dias)").nextElementSibling).toHaveTextContent("2");
    expect(screen.getByText("semana anterior: 3")).toBeInTheDocument();
  });

  it("não pinta de alerta quando não há ninguém cancelando nem recusado", async () => {
    renderAdmin();
    const cancelando = await screen.findByText("Cancelando");
    expect(cancelando.nextElementSibling).toHaveClass("text-content");
    expect(screen.getByText("Pagamento recusado").nextElementSibling).toHaveClass("text-content");
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

    const linha = screen.getByText("alice@test.com").closest("li");
    fireEvent.click(
      within(linha).getByRole("button", { name: "Cancelar assinatura" }),
    );

    await fillPassword("secret123");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() =>
      expect(adminApi.cancelSubscription).toHaveBeenCalledWith("u1", "secret123"),
    );
    // A lista E as métricas recarregam após o sucesso.
    await waitFor(() => expect(adminApi.users).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(adminApi.metrics).toHaveBeenCalledTimes(2));
  });

  it("senha errada mostra o erro sem fechar o diálogo", async () => {
    adminApi.deleteUser.mockRejectedValue({
      response: { status: 401, data: { detail: "Senha incorreta" } },
    });
    renderAdmin();
    await screen.findByText("alice@test.com");

    const linha = screen.getByText("alice@test.com").closest("li");
    fireEvent.click(within(linha).getByRole("button", { name: "Excluir conta" }));

    await fillPassword("senhaerrada");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(await screen.findByText("Senha incorreta")).toBeInTheDocument();
    // O diálogo continua aberto: o campo de senha ainda está na tela.
    expect(screen.getByLabelText("Sua senha atual")).toBeInTheDocument();
  });

  it("a própria linha do admin logado não tem botão de ação", async () => {
    renderAdmin();

    const linha = (await screen.findByText("root@norby.dev")).closest("li");
    expect(within(linha).queryByRole("button")).not.toBeInTheDocument();
  });

  it("mantém a tela montada e avisa quando a releitura falha após uma ação bem-sucedida", async () => {
    adminApi.deleteUser.mockResolvedValue({ status: 204 });
    renderAdmin();
    await screen.findByText("alice@test.com");

    const linha = screen.getByText("alice@test.com").closest("li");
    fireEvent.click(within(linha).getByRole("button", { name: "Excluir conta" }));
    await fillPassword("secret123");

    // A exclusão em si funciona; só a releitura seguinte falha desta vez.
    adminApi.users.mockRejectedValueOnce(new Error("falha de rede"));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    // O diálogo fecha: a ação pedida teve sucesso.
    await waitFor(() =>
      expect(screen.queryByLabelText("Sua senha atual")).not.toBeInTheDocument(),
    );
    // Cabeçalho e lista continuam na tela — não é o estado de erro de carga
    // (que substitui a página inteira).
    expect(screen.getByRole("heading", { name: "Admin" })).toBeInTheDocument();
    expect(screen.getByText("alice@test.com")).toBeInTheDocument();
    // Aviso inline de que os números podem estar desatualizados.
    expect(
      await screen.findByText(/não foi possível atualizar os dados/i),
    ).toBeInTheDocument();
  });
});
