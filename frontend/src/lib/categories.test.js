import { describe, it, expect } from "vitest";
import {
  categoriesFor,
  reconcileCategory,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
} from "./categories";

describe("categoriesFor", () => {
  it("returns income categories for INCOME", () => {
    expect(categoriesFor("INCOME")).toBe(INCOME_CATEGORIES);
  });
  it("returns expense categories for EXPENSE", () => {
    expect(categoriesFor("EXPENSE")).toBe(EXPENSE_CATEGORIES);
  });
});

describe("reconcileCategory", () => {
  it("keeps the category when valid for the type", () => {
    expect(reconcileCategory("EXPENSE", "Lazer")).toBe("Lazer");
  });
  it("falls back to the first of the new list when invalid", () => {
    // "Lazer" não existe em receitas → cai na 1ª de receita (Salário)
    expect(reconcileCategory("INCOME", "Lazer")).toBe(INCOME_CATEGORIES[0]);
  });
});
