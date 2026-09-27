import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { transfersApi } from "@/api/transfers";
import PagarFaturaDialog from "./PagarFaturaDialog";

vi.mock("@/api/transfers", () => ({
  transfersApi: { list: vi.fn(), create: vi.fn(), delete: vi.fn() },
}));

const CARTAO = { id: "c1", name: "Cartão", balance: "-300.00", kind: "CREDIT_CARD" };
const CONTA = { id: "a1", name: "Conta", balance: "1000.00", kind: "ACCOUNT" };

function renderizar(cartao = CARTAO, onDone = vi.fn()) {
  render(
    <PagarFaturaDialog
      cartao={cartao}
      contas={[CONTA]}
      onDone={onDone}
      trigger={<button type="button">Pagar fatura</button>}
    />,
  );
  return onDone;
}

describe("PagarFaturaDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("abre com a fatura atual e transfere da conta para o cartão", async () => {
    transfersApi.create.mockResolvedValue({ data: {} });
    const onDone = renderizar();

    fireEvent.click(await screen.findByRole("button", { name: "Pagar fatura", expanded: false }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar pagamento" }));

    await waitFor(() => expect(transfersApi.create).toHaveBeenCalled());
    expect(transfersApi.create.mock.calls[0][0]).toMatchObject({
      from_wallet_id: "a1",
      to_wallet_id: "c1",
      amount: 300,
    });
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("cartão sem fatura não envia valor zero", async () => {
    renderizar({ ...CARTAO, balance: "0.00" });

    fireEvent.click(await screen.findByRole("button", { name: "Pagar fatura", expanded: false }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar pagamento" }));

    expect(await screen.findByText("Informe um valor.")).toBeInTheDocument();
    expect(transfersApi.create).not.toHaveBeenCalled();
  });

  it("sem conta de origem, explica em vez de mostrar um form inútil", async () => {
    render(
      <PagarFaturaDialog
        cartao={CARTAO}
        contas={[]}
        onDone={vi.fn()}
        trigger={<button type="button">Pagar fatura</button>}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Pagar fatura", expanded: false }));
    expect(await screen.findByText(/crie uma conta/i)).toBeInTheDocument();
  });
});
