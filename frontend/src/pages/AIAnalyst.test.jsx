import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { aiApi } from "@/api/ai";
import { importsApi } from "@/api/imports";
import { walletsApi } from "@/api/wallets";
import { useAuthStore } from "@/store/authStore";
import AIAnalyst from "./AIAnalyst";

vi.mock("@/api/ai", () => ({
  aiApi: { getInsight: vi.fn(), getSessions: vi.fn(), chat: vi.fn(), getSession: vi.fn() },
}));
vi.mock("@/api/imports", () => ({ importsApi: { preview: vi.fn(), confirm: vi.fn() } }));
vi.mock("@/api/wallets", () => ({ walletsApi: { list: vi.fn() } }));

const PREMIUM = {
  ai_allowed: true, wallet_cap_applies: false, premium_until: "2026-12-01T00:00:00Z",
  ai_trial_ends_at: null, subscription_status: "active", cancel_at_period_end: false,
};

const PREVIA = {
  document_type: "ACCOUNT_STATEMENT", format: "csv", ignored: 0,
  default_wallet_id: "conta", default_card_id: null,
  items: [{
    date: "2026-08-10", description: "Mercado", amount: "52.30", direction: "OUT",
    kind: "PURCHASE", launch_as: "EXPENSE", category: "Alimentação", duplicate_in: [],
  }],
};

function renderizar() {
  useAuthStore.getState().login("access", { name: "Alice", email: "a@t.com", plan: PREMIUM });
  render(<MemoryRouter><AIAnalyst /></MemoryRouter>);
}

const anexo = () => screen.getByLabelText("Anexar fatura ou extrato");

describe("AIAnalyst, anexo de fatura ou extrato", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom não implementa scrollIntoView, que a página chama ao mudar as mensagens.
    Element.prototype.scrollIntoView = vi.fn();
    aiApi.getSessions.mockResolvedValue({ data: [] });
    aiApi.getInsight.mockResolvedValue({ data: {} });
    walletsApi.list.mockResolvedValue({
      data: [{ id: "conta", name: "Conta corrente", balance: "100.00", kind: "ACCOUNT", created_at: "2026-07-01T00:00:00Z" }],
    });
  });

  it("a dica de formato fica visível, não só no tooltip", () => {
    // No celular não existe hover: um title nunca aparece.
    renderizar();
    expect(screen.getByText(/CSV ou OFX são lidos com mais precisão que PDF/)).toBeVisible();
  });

  it("anexar lê o arquivo e mostra a revisão na conversa", async () => {
    importsApi.preview.mockResolvedValue({ data: PREVIA });
    renderizar();

    const arquivo = new File(["Data,Valor\n"], "extrato.csv", { type: "text/csv" });
    fireEvent.change(anexo(), { target: { files: [arquivo] } });

    expect(screen.getByText("Arquivo: extrato.csv")).toBeInTheDocument();
    expect(await screen.findByText(/Encontrei 1 lançamento no seu extrato/)).toBeInTheDocument();
    expect(importsApi.preview).toHaveBeenCalledWith(arquivo);
  });

  it("recusa arquivo acima de 1 MB sem chamar a API", async () => {
    renderizar();

    const grande = new File([new Uint8Array(1_048_577)], "grande.pdf", { type: "application/pdf" });
    fireEvent.change(anexo(), { target: { files: [grande] } });

    expect(await screen.findByText(/passa de 1 MB/)).toBeInTheDocument();
    expect(importsApi.preview).not.toHaveBeenCalled();
  });

  it("erro na leitura vira fala da assistente", async () => {
    importsApi.preview.mockRejectedValue(
      Object.assign(new Error("422"), { response: { status: 422, data: { detail: "Não encontrei lançamentos neste arquivo." } } }),
    );
    renderizar();

    fireEvent.change(anexo(), { target: { files: [new File(["x"], "a.csv")] } });

    expect(await screen.findByRole("alert")).toHaveTextContent("Não encontrei lançamentos neste arquivo.");
  });

  it("enquanto lê, mostra o aviso de espera e trava um segundo anexo", async () => {
    let terminar;
    importsApi.preview.mockReturnValue(new Promise((resolve) => { terminar = resolve; }));
    renderizar();

    fireEvent.change(anexo(), { target: { files: [new File(["x"], "a.csv")] } });

    expect(await screen.findByRole("status")).toHaveTextContent(/Lendo seu arquivo/);
    expect(screen.getByRole("button", { name: "Anexar fatura ou extrato" })).toBeDisabled();
    // Nova conversa não descarta a leitura em andamento (já foi paga).
    fireEvent.click(screen.getAllByRole("button", { name: /Nova conversa/ })[0]);
    expect(screen.getByText(/Lendo seu arquivo/)).toBeInTheDocument();
    terminar({ data: PREVIA });
    await waitFor(() => expect(screen.getByRole("button", { name: "Anexar fatura ou extrato" })).toBeEnabled());
  });

  it("não deixa anexar enquanto uma conversa anterior carrega", async () => {
    let carregar;
    aiApi.getSessions.mockResolvedValue({ data: [{ session_id: "old", first_message: "Conversa antiga" }] });
    aiApi.getSession.mockReturnValue(new Promise((resolve) => { carregar = resolve; }));
    renderizar();

    fireEvent.click((await screen.findAllByRole("button", { name: "Conversa antiga" }))[0]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Anexar fatura ou extrato" })).toBeDisabled());
    // O handler também recusa, não só o botão.
    fireEvent.change(anexo(), { target: { files: [new File(["x"], "a.csv")] } });
    expect(importsApi.preview).not.toHaveBeenCalled();

    carregar({ data: { messages: [{ role: "assistant", content: "Histórico recebido" }] } });
    expect(await screen.findByText("Histórico recebido")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Anexar fatura ou extrato" })).toBeEnabled());
  });
});
