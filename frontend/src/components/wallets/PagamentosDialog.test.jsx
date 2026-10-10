import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { transfersApi } from "@/api/transfers";
import PagamentosDialog from "./PagamentosDialog";

vi.mock("@/api/transfers", () => ({
  transfersApi: { list: vi.fn(), summary: vi.fn(), create: vi.fn(), delete: vi.fn() },
}));

const CARTAO = { id: "c1", name: "Cartão", balance: "-300.00", kind: "CREDIT_CARD" };
const CONTA = { id: "a1", name: "Conta", balance: "1000.00", kind: "ACCOUNT" };

const RESERVA = { id: "r1", name: "Reserva", balance: "50.00", kind: "ACCOUNT" };

function renderizar(onChange = vi.fn(), carteira = CARTAO) {
  render(
    <PagamentosDialog
      carteira={carteira}
      contas={[CONTA, CARTAO, RESERVA]}
      onChange={onChange}
      trigger={<button type="button">Pagamentos</button>}
    />,
  );
  return onChange;
}

describe("PagamentosDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transfersApi.summary.mockResolvedValue({ data: { count: 1 } });
  });

  it("busca ao abrir e lista os pagamentos com a conta de origem", async () => {
    transfersApi.list.mockResolvedValue({
      data: [
        { id: "t1", from_wallet_id: "a1", to_wallet_id: "c1", amount: "300.00", date: "2026-09-20" },
      ],
    });
    renderizar();

    fireEvent.click(await screen.findByRole("button", { name: "Pagamentos", expanded: false }));

    expect(await screen.findByText(/de Conta/)).toBeInTheDocument();
    expect(transfersApi.list).toHaveBeenCalledWith({ wallet_id: "c1", limit: 50, offset: 0 });
  });

  it("numa conta, mostra as transferências que saíram e as que entraram", async () => {
    transfersApi.list.mockResolvedValue({
      data: [
        { id: "t1", from_wallet_id: "a1", to_wallet_id: "c1", amount: "300.00", date: "2026-09-20" },
        { id: "t2", from_wallet_id: "r1", to_wallet_id: "a1", amount: "40.00", date: "2026-09-18" },
      ],
    });
    renderizar(vi.fn(), CONTA);

    fireEvent.click(await screen.findByRole("button", { name: "Pagamentos", expanded: false }));

    expect(await screen.findByRole("heading", { name: "Transferências" })).toBeInTheDocument();
    expect(screen.getByText(/para Cartão/)).toBeInTheDocument();
    expect(screen.getByText(/de Reserva/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Excluir transferência" })).toHaveLength(2);
    expect(transfersApi.list).toHaveBeenCalledWith({ wallet_id: "a1", limit: 50, offset: 0 });
  });

  it("lista vazia diz que não há pagamento, sem inventar linha", async () => {
    transfersApi.summary.mockResolvedValue({ data: { count: 0 } });
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

  it("carrega mais páginas até mostrar todos os pagamentos", async () => {
    const pagina = (inicio, n) => Array.from({ length: n }, (_, i) => ({
      id: `t${inicio + i}`, from_wallet_id: "a1", to_wallet_id: "c1",
      amount: "1.00", date: "2026-09-01", description: null,
    }));
    transfersApi.summary.mockResolvedValue({ data: { count: 55 } });
    transfersApi.list
      .mockResolvedValueOnce({ data: pagina(0, 50) })
      .mockResolvedValueOnce({ data: pagina(50, 5) });
    renderizar();
    fireEvent.click(await screen.findByRole("button", { name: "Pagamentos", expanded: false }));

    expect(await screen.findByText("Mostrando 50 de 55")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Carregar mais" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Excluir pagamento" })).toHaveLength(55));
    expect(transfersApi.list).toHaveBeenLastCalledWith({ wallet_id: "c1", limit: 50, offset: 50 });
    expect(screen.queryByRole("button", { name: "Carregar mais" })).not.toBeInTheDocument();
    // O botão sumiu com a última página: o foco não pode cair no body, vai
    // para o primeiro item que acabou de chegar (issue #219).
    expect(screen.getAllByRole("listitem")[50]).toHaveFocus();
  });

  it("a lista rola dentro do diálogo, com título e fechar sempre visíveis", async () => {
    transfersApi.list.mockResolvedValue({ data: [{ id: "t1", from_wallet_id: "a1", to_wallet_id: "c1", amount: "1.00", date: "2026-09-01", description: null }] });
    renderizar();
    fireEvent.click(await screen.findByRole("button", { name: "Pagamentos", expanded: false }));
    const lista = await screen.findByRole("list", { name: "Pagamentos" });
    expect(lista.className).toMatch(/overflow-y-auto/);
    expect(lista.className).toMatch(/max-h-/);
  });
});
