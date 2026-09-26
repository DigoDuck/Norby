import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useAuthStore } from "@/store/authStore";
import { LIMITE_CARTEIRAS_GRATIS, usePlano } from "./plan";

const comPlano = (plan) => useAuthStore.setState({ user: { name: "A", plan } });

describe("usePlano", () => {
  afterEach(() => useAuthStore.setState({ user: null }));

  it("gratuito: IA bloqueada e limite de carteiras", () => {
    comPlano({ ai_allowed: false, wallet_cap_applies: true });
    const { result } = renderHook(() => usePlano());
    expect(result.current).toEqual({ iaLiberada: false, limiteCarteiras: LIMITE_CARTEIRAS_GRATIS });
  });

  it("premium: nada bloqueado", () => {
    comPlano({ ai_allowed: true, wallet_cap_applies: false });
    const { result } = renderHook(() => usePlano());
    expect(result.current).toEqual({ iaLiberada: true, limiteCarteiras: null });
  });

  it("sem o campo plan não bloqueia nada: o backend segue sendo o portão", () => {
    comPlano(undefined);
    const { result } = renderHook(() => usePlano());
    expect(result.current).toEqual({ iaLiberada: true, limiteCarteiras: null });
  });
});
