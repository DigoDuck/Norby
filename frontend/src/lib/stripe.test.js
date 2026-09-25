import { describe, expect, it } from "vitest";

import { urlDoStripe } from "./stripe";

describe("urlDoStripe", () => {
  it.each([
    "https://checkout.stripe.com/c/pay/cs_live_1",
    "https://billing.stripe.com/p/session/live_1",
  ])("aceita o Stripe hospedado: %s", (url) => {
    expect(urlDoStripe(url)).toBe(url);
  });

  it.each([
    ["outro domínio", "https://evil.example/pay"],
    ["sufixo enganoso", "https://checkout.stripe.com.evil.example/pay"],
    ["subdomínio não usado", "https://dashboard.stripe.com/"],
    ["sem TLS", "http://checkout.stripe.com/c/pay/cs_1"],
    ["esquema javascript", "javascript:alert(1)"],
    ["credencial embutida", "https://user@evil.example/"],
    ["relativa", "/settings"],
    ["vazia", ""],
    ["ausente", undefined],
  ])("recusa %s", (_caso, url) => {
    expect(urlDoStripe(url)).toBeNull();
  });
});
