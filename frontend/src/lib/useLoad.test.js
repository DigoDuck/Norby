import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLoad } from "./useLoad";

describe("useLoad", () => {
  it("começa carregando e termina ok", async () => {
    const load = vi.fn().mockResolvedValue();
    const { result } = renderHook(() => useLoad(load));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ok"));
  });

  it("falha vira erro, não lista vazia, e o tentar de novo recupera", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("rede")).mockResolvedValue();
    const { result } = renderHook(() => useLoad(load));
    await waitFor(() => expect(result.current.status).toBe("error"));
    await act(() => result.current.reload());
    expect(result.current.status).toBe("ok");
  });
});
