import process from "node:process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "./categories";

// npm run test roda em frontend/ (local e na CI).
const backend = JSON.parse(
  readFileSync(path.resolve(process.cwd(), "../backend/app/categories.json"), "utf-8"),
);

describe("categorias do front e do backend", () => {
  it("são as mesmas, na mesma ordem", () => {
    expect(backend.expense).toEqual(EXPENSE_CATEGORIES);
    expect(backend.income).toEqual(INCOME_CATEGORIES);
  });
});
