import { beforeEach, describe, expect, it, vi } from "vitest";

import api from "./axios";
import { accountApi } from "./account";

vi.mock("./axios", () => ({
  default: {
    delete: vi.fn(),
    get: vi.fn(),
  },
}));

describe("accountApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("envia confirmação e senha atual ao excluir a conta", async () => {
    api.delete.mockResolvedValue({ status: 204 });

    await accountApi.deleteAccount("secret123");

    expect(api.delete).toHaveBeenCalledWith("/auth/me", {
      data: { confirm: true, password: "secret123" },
    });
  });
});
