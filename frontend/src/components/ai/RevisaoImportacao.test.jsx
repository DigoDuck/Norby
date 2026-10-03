import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { importsApi } from "@/api/imports";
import RevisaoImportacao from "./RevisaoImportacao";

vi.mock("@/api/imports", () => ({ importsApi: { preview: vi.fn(), confirm: vi.fn() } }));

const CONTA = { id: "conta", name: "Conta corrente", balance: "3000.00", kind: "ACCOUNT", created_at: "2026-07-01T00:00:00Z" };
const CARTAO = { id: "cartao", name: "Cartão Nubank", balance: "-300.00", kind: "CREDIT_CARD", created_at: "2026-07-01T00:00:00Z" };

const item = (extra = {}) => ({
  date: "2026-08-10", description: "Mercado", amount: "52.30", direction: "OUT",
  kind: "PURCHASE", launch_as: "EXPENSE", category: "Alimentação", duplicate_in: [], duplicate_pairs: [],
  ...extra,
});

const PREVIA = {
  document_type: "ACCOUNT_STATEMENT", format: "csv", ignored: 2,
  default_wallet_id: "conta", default_card_id: "cartao",
  items: [
    item(),
    item({ description: "Salário", amount: "3000.00", direction: "IN", kind: "INCOME", launch_as: "INCOME", category: "Salário" }),
    item({ description: "Pagamento de fatura", amount: "300.00", kind: "CARD_PAYMENT", launch_as: "TRANSFER", category: null }),
    item({ description: "Caixinha", amount: "100.00", kind: "TRANSFER", launch_as: "IGNORE", category: null }),
  ],
};

function renderizar(previa = PREVIA) {
  render(
    <MemoryRouter>
      <RevisaoImportacao previa={previa} carteiras={[CONTA, CARTAO]} />
    </MemoryRouter>,
  );
}

describe("RevisaoImportacao", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mostra entradas e saídas separadas e as linhas ignoradas pela leitura", () => {
    renderizar();
    const entram = screen.getByRole("group", { name: "Vão entrar" });
    expect(within(entram).getByText(/R\$ 3\.000,00/)).toBeInTheDocument();
    // 52,30 + 300,00 (a caixinha vem como Ignorar).
    expect(within(entram).getByText(/R\$ 352,30/)).toBeInTheDocument();
    // No arquivo entra tudo, inclusive a caixinha ignorada: 352,30 + 100,00.
    const arquivo = screen.getByRole("group", { name: "No arquivo" });
    expect(within(arquivo).getByText(/R\$ 452,30/)).toBeInTheDocument();
    expect(screen.getByText(/2 linhas não puderam ser lidas/)).toBeInTheDocument();
  });

  it("usa a frase correta para cada tipo de documento", () => {
    renderizar({ ...PREVIA, document_type: "CARD_INVOICE" });
    expect(screen.getByText(/Encontrei 4 lançamentos na sua fatura/)).toBeInTheDocument();
  });

  it("desmarcar uma linha atualiza os totais", () => {
    renderizar();
    fireEvent.click(screen.getByRole("checkbox", { name: "Incluir Mercado" }));
    const resumo = screen.getByRole("group", { name: "Vão entrar" });
    expect(within(resumo).getByText(/R\$ 300,00/)).toBeInTheDocument();
  });

  it("linha já lançada na carteira vem desmarcada e sinalizada", () => {
    renderizar({ ...PREVIA, items: [item({ duplicate_in: ["conta"] })] });
    expect(screen.getByRole("checkbox", { name: "Incluir Mercado" })).not.toBeChecked();
    expect(screen.getByText("já lançado")).toBeInTheDocument();
  });

  it("PDF avisa que a leitura é menos precisa", () => {
    renderizar({ ...PREVIA, format: "pdf" });
    expect(screen.getByText(/PDF é lido com menos precisão/)).toBeInTheDocument();
  });

  it("lançar envia as linhas revisadas e mostra o resumo", async () => {
    importsApi.confirm.mockResolvedValue({ data: { transactions: 2, transfers: 1 } });
    renderizar();

    fireEvent.click(screen.getByRole("button", { name: "Lançar 3 lançamentos" }));

    await waitFor(() => expect(importsApi.confirm).toHaveBeenCalledTimes(1));
    const enviado = importsApi.confirm.mock.calls[0][0];
    expect(enviado.wallet_id).toBe("conta");
    expect(enviado.already_in_balance).toBe(false);
    expect(enviado.items).toHaveLength(3);
    expect(enviado.items[2]).toMatchObject({ launch_as: "TRANSFER", transfer_wallet_id: "cartao" });
    expect(await screen.findByRole("status")).toHaveTextContent(/3 lançamentos na Conta corrente/);
    expect(screen.getByRole("link", { name: "Ver no Extrato" })).toHaveAttribute("href", "/transactions");
  });

  it("já no saldo: o saldo mostrado não muda e vai no envio", async () => {
    importsApi.confirm.mockResolvedValue({ data: { transactions: 2, transfers: 1 } });
    renderizar();

    fireEvent.click(screen.getByRole("checkbox", { name: /já estão no meu saldo atual/ }));
    expect(screen.getByText(/Saldo \(Conta corrente\) não muda/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lançar 3 lançamentos" }));

    await waitFor(() => expect(importsApi.confirm).toHaveBeenCalled());
    expect(importsApi.confirm.mock.calls[0][0].already_in_balance).toBe(true);
  });

  it("trocar Ignorar por Despesa mostra a categoria e entra nos totais", () => {
    renderizar();
    fireEvent.change(screen.getByRole("combobox", { name: "Lançar como: Caixinha" }), {
      target: { value: "EXPENSE" },
    });
    expect(screen.getByRole("combobox", { name: "Categoria: Caixinha" })).toHaveValue("Outros");
    const resumo = screen.getByRole("group", { name: "Vão entrar" });
    // 52,30 + 300,00 + 100,00 da caixinha, agora lançada.
    expect(within(resumo).getByText(/R\$ 452,30/)).toBeInTheDocument();
  });

  it("não deixa lançar transferência sem destino", () => {
    renderizar({ ...PREVIA, default_card_id: null });
    const botao = screen.getByRole("button", { name: /Lançar/ });
    expect(botao).toBeDisabled();
    expect(screen.getByText("Escolha a carteira de destino de 1 transferência.")).toBeInTheDocument();
    expect(botao).toHaveAccessibleDescription("Escolha a carteira de destino de 1 transferência.");
  });

  it("com dois cartões, escolher o destino já pago desmarca o pagamento", () => {
    // Sem cartão padrão o destino nasce vazio; a marca tem de acompanhar a
    // escolha, senão o pagamento já lançado entraria de novo.
    const outro = { ...CARTAO, id: "outro", name: "Cartão Inter" };
    render(
      <MemoryRouter>
        <RevisaoImportacao
          previa={{
            ...PREVIA, default_card_id: null,
            items: [item({ description: "Pagamento de fatura", amount: "300.00", kind: "CARD_PAYMENT",
              launch_as: "TRANSFER", category: null, duplicate_pairs: [["conta", "cartao"]] })],
          }}
          carteiras={[CONTA, CARTAO, outro]}
        />
      </MemoryRouter>,
    );
    const marca = screen.getByRole("checkbox", { name: "Incluir Pagamento de fatura" });
    const destino = screen.getByRole("combobox", { name: "Destino: Pagamento de fatura" });
    expect(marca).toBeChecked();
    fireEvent.change(destino, { target: { value: "cartao" } });
    expect(marca).not.toBeChecked();
    fireEvent.change(destino, { target: { value: "outro" } });
    expect(marca).toBeChecked();
  });

  it("erro ao lançar aparece e permite tentar de novo", async () => {
    importsApi.confirm.mockRejectedValue(new Error("500"));
    renderizar();

    fireEvent.click(screen.getByRole("button", { name: "Lançar 3 lançamentos" }));

    expect(await screen.findByText(/Não foi possível lançar/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lançar 3 lançamentos" })).toBeEnabled();
  });

  it("tentar de novo depois de um erro manda a mesma chave", async () => {
    importsApi.confirm
      .mockRejectedValueOnce(new Error("rede"))
      .mockResolvedValueOnce({ data: { transactions: 2, transfers: 1 } });
    renderizar();

    fireEvent.click(screen.getByRole("button", { name: "Lançar 3 lançamentos" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Lançar 3 lançamentos" }));
    await screen.findByText(/3 lançamentos na Conta corrente/);

    const [primeira, segunda] = importsApi.confirm.mock.calls.map(([dados]) => dados.idempotency_key);
    expect(primeira).toMatch(/^[0-9a-f-]{36}$/);
    expect(segunda).toBe(primeira);
  });
});
