import { describe, it, expect } from "vitest";
import { goalSchema } from "./schemas";

describe("goalSchema", () => {
  it("accepts a valid savings goal", () => {
    const r = goalSchema.safeParse({ name: "Trip", type: "SAVINGS", target_amount: "1000" });
    expect(r.success).toBe(true);
  });

  it("rejects target <= 0", () => {
    const r = goalSchema.safeParse({ name: "Trip", type: "SAVINGS", target_amount: "0" });
    expect(r.success).toBe(false);
  });

  it("requires category for budget", () => {
    const r = goalSchema.safeParse({ name: "Cap", type: "BUDGET", target_amount: "300" });
    expect(r.success).toBe(false);
  });
});
