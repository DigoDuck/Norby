import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { billingApi } from "@/api/billing";
import { authApi } from "@/api/auth";
import { useAuthStore } from "@/store/authStore";
import { PRECO_MENSAL } from "@/lib/plano";
import PlanCard from "./PlanCard";

vi.mock("@/api/billing", () => ({
  billingApi: {
    checkoutSession: vi.fn(),
    portalSession: vi.fn(),
    confirmCheckout: vi.fn(),
  },
}));

vi.mock("@/api/auth", () => ({
  authApi: { me: vi.fn() },
}));

const LIBERADO = {
  ai_allowed: true,
  wallet_cap_applies: false,
  premium_until: null,
  ai_trial_ends_at: null,
  subscription_status: null,
  cancel_at_period_end: false,
};

function renderCard(plan, { url = "/settings" } = {}) {
  useAuthStore.getState().login("access", {
    name: "Alice",
    email: "alice@test.com",
    plan,
  });
  render(
    <MemoryRouter initialEntries={[url]}>
      <PlanCard />
    </MemoryRouter>,
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => useAuthStore.getState().logout());

describe("PlanCard", () => {
  it("offers nothing while the paywall is off", () => {
    // Estado de produção hoje: os dois booleanos reportam liberado, então o
    // premium não entrega nada a mais. Oferecer assinatura aqui seria cobrar
    // por ar — e é por isso que a CTA NÃO se guia por "esta pessoa é free?",
    // que seria a regra óbvia e errada.
    renderCard(LIBERADO);
    expect(screen.queryByRole("button", { name: "Assinar" })).not.toBeInTheDocument();
    expect(screen.queryByText("Plano")).not.toBeInTheDocument();
  });

  it("offers a subscription once the paywall actually restricts the person", () => {
    renderCard({ ...LIBERADO, ai_allowed: false, wallet_cap_applies: true });
    expect(screen.getByRole("button", { name: "Assinar" })).toBeInTheDocument();
  });

  it("offers it to someone capped on wallets even while the AI trial is running", () => {
    // Faixa real: o trial concede só IA, o teto de carteiras segue valendo.
    renderCard({ ...LIBERADO, ai_allowed: true, wallet_cap_applies: true });
    expect(screen.getByRole("button", { name: "Assinar" })).toBeInTheDocument();
  });

  it("sends the person to the hosted Checkout", async () => {
    const assign = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ assign });
    billingApi.checkoutSession.mockResolvedValue({
      data: { url: "https://checkout.stripe.com/c/pay/cs_1" },
    });
    renderCard({ ...LIBERADO, ai_allowed: false, wallet_cap_applies: true });

    fireEvent.click(screen.getByRole("button", { name: "Assinar" }));

    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_1"),
    );
  });

  it("says it failed instead of pretending the redirect is coming", async () => {
    billingApi.checkoutSession.mockRejectedValue({
      response: { data: { detail: "Assinatura ainda não disponível" } },
    });
    renderCard({ ...LIBERADO, ai_allowed: false, wallet_cap_applies: true });

    fireEvent.click(screen.getByRole("button", { name: "Assinar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Assinatura ainda não disponível",
    );
  });

  it("distinguishes renewing from ending, which only cancel_at_period_end knows", () => {
    const fim = new Date(Date.now() + 20 * 86400000).toISOString();
    renderCard({
      ...LIBERADO,
      premium_until: fim,
      subscription_status: "active",
      cancel_at_period_end: true,
    });
    expect(screen.getByText(/termina em/i)).toBeInTheDocument();
    expect(screen.queryByText(/renova em/i)).not.toBeInTheDocument();
  });

  it("surfaces a declined payment, which lives only in the status", () => {
    renderCard({
      ...LIBERADO,
      premium_until: new Date(Date.now() + 86400000).toISOString(),
      subscription_status: "past_due",
    });
    expect(screen.getByText(/pagamento recusado/i)).toBeInTheDocument();
  });

  it("does not offer a second subscription to someone who already pays", () => {
    renderCard({
      ...LIBERADO,
      premium_until: new Date(Date.now() + 86400000).toISOString(),
      subscription_status: "active",
      wallet_cap_applies: false,
    });
    expect(screen.queryByRole("button", { name: "Assinar" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Gerenciar assinatura" }),
    ).toBeInTheDocument();
  });

  it("confirms the checkout on the way back, without waiting for the webhook", async () => {
    // A razão de o `session_id` existir na URL: o redirect chega antes do
    // webhook, e sem isto a pessoa volta de uma compra boa e lê que é free.
    billingApi.confirmCheckout.mockResolvedValue({});
    authApi.me.mockResolvedValue({
      data: {
        name: "Alice",
        plan: {
          ...LIBERADO,
          premium_until: new Date(Date.now() + 30 * 86400000).toISOString(),
          subscription_status: "active",
        },
      },
    });

    renderCard(
      { ...LIBERADO, ai_allowed: false, wallet_cap_applies: true },
      { url: "/settings?checkout=success&session_id=cs_test_1" },
    );

    await waitFor(() =>
      expect(billingApi.confirmCheckout).toHaveBeenCalledWith("cs_test_1"),
    );
    await waitFor(() =>
      expect(useAuthStore.getState().user.plan.subscription_status).toBe("active"),
    );
  });

  it("does not call confirm when there is no session in the URL", () => {
    renderCard({ ...LIBERADO, ai_allowed: false, wallet_cap_applies: true });
    expect(billingApi.confirmCheckout).not.toHaveBeenCalled();
  });

  it("states price, renewal and the withdrawal right beside the subscribe button", () => {
    // Art. 6º, III do CDC: informação clara ANTES de contratar. O Checkout do
    // Stripe repete o valor na tela seguinte, mas quem clica aqui já tem de
    // saber o que está clicando.
    renderCard({ ...LIBERADO, ai_allowed: false, wallet_cap_applies: true });

    expect(screen.getByRole("link", { name: "Termos de Uso" })).toHaveAttribute(
      "href",
      "/termos",
    );
    const cartao = screen.getByText("Plano").closest("div.glass");
    expect(cartao.textContent).toContain(PRECO_MENSAL);
    expect(cartao.textContent).toContain("renovação automática");
    expect(cartao.textContent).toContain("7 dias");
  });

  it("does not pitch the price to someone who already subscribed", () => {
    // Quem já assinou vê o cartão pelo botão de gerenciar, e repetir a oferta
    // ali é ruído: a informação prévia serve a quem ainda vai decidir.
    renderCard({
      ...LIBERADO,
      subscription_status: "active",
      premium_until: "2099-01-01T00:00:00Z",
    });

    expect(screen.getByRole("button", { name: "Gerenciar assinatura" })).toBeInTheDocument();
    const cartao = screen.getByText("Plano").closest("div.glass");
    expect(cartao.textContent).not.toContain(PRECO_MENSAL);
  });
});
