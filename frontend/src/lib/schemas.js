import { z } from "zod";

// Validação de criação de meta — espelha as regras do backend (GoalCreate).
export const goalSchema = z
  .object({
    name: z.string().min(1, "Informe o nome"),
    type: z.enum(["SAVINGS", "BUDGET"]),
    target_amount: z.coerce.number().positive("O valor deve ser maior que zero"),
    category: z.string().optional(),
    current_amount: z.coerce.number().min(0).optional(),
  })
  .refine((d) => d.type !== "BUDGET" || (d.category && d.category.trim().length > 0), {
    message: "Selecione uma categoria",
    path: ["category"],
  });

// Validação de criação/edição de transação.
export const transactionSchema = z.object({
  wallet_id: z.string().min(1, "Selecione uma carteira"),
  type: z.enum(["INCOME", "EXPENSE"]),
  amount: z.coerce.number().positive("Informe um valor maior que zero"),
  category: z.string().min(1, "Selecione uma categoria"),
  description: z.string().optional(),
  date: z.string().min(1, "Informe a data"),
});

// Validação de criação de recorrência — espelha as regras do backend.
export const recurringSchema = z
  .object({
    wallet_id: z.string().min(1, "Selecione uma carteira"),
    type: z.enum(["INCOME", "EXPENSE"]),
    amount: z.coerce.number().positive("O valor deve ser maior que zero"),
    category: z.string().min(1, "Selecione uma categoria"),
    frequency: z.enum(["MONTHLY", "WEEKLY"]),
    day_of_month: z.coerce.number().int().min(1).max(28).optional(),
    weekday: z.coerce.number().int().min(0).max(6).optional(),
  })
  .refine((d) => d.frequency !== "MONTHLY" || d.day_of_month != null, {
    message: "Informe o dia do mês",
    path: ["day_of_month"],
  })
  .refine((d) => d.frequency !== "WEEKLY" || d.weekday != null, {
    message: "Selecione o dia da semana",
    path: ["weekday"],
  });
