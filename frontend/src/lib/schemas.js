import { z } from "zod";

// Validação de criação de meta — espelha as regras do backend (GoalCreate).
export const goalSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    type: z.enum(["SAVINGS", "BUDGET"]),
    target_amount: z.coerce.number().positive("Target must be > 0"),
    category: z.string().optional(),
  })
  .refine((d) => d.type !== "BUDGET" || (d.category && d.category.trim().length > 0), {
    message: "Category is required for a budget",
    path: ["category"],
  });
