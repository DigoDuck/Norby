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
    // Espelha o LongText do backend (String(500) da coluna description).
    description: z.string().max(500, "Máximo de 500 caracteres").optional(),
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

// Recuperação de senha (#36). Espelha o `StrongPassword` do backend
// (schemas/common.py): 8 a 128 caracteres, ao menos uma letra e um número, e
// no máximo 72 BYTES — o bcrypt trunca ali e um acento ocupa mais de um byte.
// Espelhar aqui não substitui a validação do servidor, que continua sendo a
// que vale; serve para a pessoa descobrir o problema antes de gastar o link,
// que é de uso único.
const senhaForte = z
  .string()
  .min(8, "Mínimo de 8 caracteres")
  .max(128, "Máximo de 128 caracteres")
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), {
    message: "Use ao menos uma letra e um número",
  })
  .refine((v) => new TextEncoder().encode(v).length <= 72, {
    message: "Máximo de 72 bytes (acentos contam 2)",
  });

export const forgotSchema = z.object({
  email: z.string().min(1, "Informe o e-mail").email("E-mail inválido"),
});

export const resetSchema = z
  .object({
    password: senhaForte,
    confirm: z.string().min(1, "Repita a senha"),
  })
  .refine((d) => d.password === d.confirm, {
    message: "As senhas não conferem",
    path: ["confirm"],
  });

