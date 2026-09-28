import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { transfersApi } from "@/api/transfers";
import PagamentosDialog from "./PagamentosDialog";

vi.mock("@/api/transfers", () => ({
  transfersApi: { list: vi.fn(), create: vi.fn(), delete: vi.fn() },
}));

const CARTAO = { id: "c1", name: "Cartão", balance: "-300.00", kind: "CREDIT_CARD" };
const CONTA = { id: "a1", name: "Conta", balance: "1000.00", kind: "ACCOUNT" };

function renderizar(onChange = vi.fn()) {
  render(
    <PagamentosDialog
      cartao={CARTAO}
      contas={[CONTA, CARTAO]}
      onChange={onChange}
      trigger={<button type="button">Pagamentos</button>}
    />,
  );
  return onChange;
}

describe("PagamentosDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("busca ao abrir e lista os pagamentos com a conta de origem", async () => {
    transfersApi.list.mockResolvedValue({
      data: [
        { id: "t1", from_wallet_id: "a1", to_wallet_id: "c1", amount: "300.00", date: "2026-09-20" },
      ],
    });
    renderizar();

    fireEvent.click(await screen.findByRole("button", { name: "Pagamentos", expanded: false }));

    expect(await screen.findByText(/de Conta/)).toBeInTheDocument();
    expect(transfersApi.list).toHaveBeenCalledWith({ wallet_id: "c1" });
  });

  it("lista vazia diz que não há pagamento, sem inventar linha", async () => {
    transfersApi.list.mockResolvedValue({ data: [] });
    renderizar();

    fireEvent.click(await screen.findByRole("button", { name: "Pagamentos", expanded: false }));
    expect(await screen.findByText("Nenhum pagamento registrado.")).toBeInTheDocument();
  });

  it("excluir pede confirmação antes de chamar a API", async () => {
    transfersApi.list.mockResolvedValue({
      data: [{ id: "t1", from_wallet_id: "a1", to_wallet_id: "c1", amount: "300.00", date: "2026-09-20" }],
    });
    renderizar();

    fireEvent.click(await screen.findByRole("button", { name: "Pagamentos", expanded: false }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Excluir pagamento", expanded: false }),
    );

    // O diálogo de confirmação abriu, mas ninguém confirmou ainda.
    expect(await screen.findByText("Excluir este pagamento?")).toBeInTheDocument();
    expect(transfersApi.delete).not.toHaveBeenCalled();
  });

  it("confirmar exclusão devolve à lista atualizada, avisa quem usa e chama a API uma vez", async () => {
    transfersApi.list
      .mockResolvedValueOnce({
        data: [{ id: "t1", from_wallet_id: "a1", to_wallet_id: "c1", amount: "300.00", date: "2026-09-20" }],
      })
      .mockResolvedValueOnce({ data: [] });
    transfersApi.delete.mockResolvedValue({});
    const onChange = renderizar();

    fireEvent.click(await screen.findByRole("button", { name: "Pagamentos", expanded: false }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Excluir pagamento", expanded: false }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Excluir" }));

    await waitFor(() => expect(transfersApi.delete).toHaveBeenCalledWith("t1"));
    expect(await screen.findByText("Nenhum pagamento registrado.")).toBeInTheDocument();
    expect(onChange).toHaveBeenCalled();
    expect(transfersApi.delete).toHaveBeenCalledTimes(1);
  });

  it("falha ao carregar mostra erro com jeito de tentar de novo", async () => {
    transfersApi.list.mockRejectedValueOnce(new Error("500")).mockResolvedValueOnce({ data: [] });
    renderizar();

    fireEvent.click(await screen.findByRole("button", { name: "Pagamentos", expanded: false }));
    fireEvent.click(await screen.findByRole("button", { name: /tentar de novo/i }));

    await waitFor(() => expect(transfersApi.list).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Nenhum pagamento registrado.")).toBeInTheDocument();
  });
});
