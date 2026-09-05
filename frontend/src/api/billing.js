import api from "./axios";

export const billingApi = {
  // Devolve a URL do Checkout hospedado; quem redireciona é a tela.
  checkoutSession: () => api.post("/billing/checkout-session"),
  // Customer Portal: cancelar, trocar cartão, ver faturas.
  portalSession: () => api.post("/billing/portal-session"),
  // Chamado na VOLTA do Checkout, com o id que o Stripe põe na URL. Existe
  // porque o redirect chega antes do webhook — sem isto a pessoa volta de uma
  // compra bem-sucedida e lê que não é premium.
  confirmCheckout: (sessionId) =>
    api.post("/billing/confirm-checkout", { session_id: sessionId }),
};
