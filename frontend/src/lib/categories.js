export const EXPENSE_CATEGORIES = [
  "Alimentação",
  "Moradia",
  "Transporte",
  "Saúde",
  "Educação",
  "Lazer",
  "Compras",
  "Contas & Serviços",
  "Outros",
];

export const INCOME_CATEGORIES = [
  "Salário",
  "Freelance/Extra",
  "Investimentos",
  "Reembolso",
  "Presente",
  "Outros",
];

// Alias de compatibilidade: consumidores sem tipo (ex.: orçamento de metas)
// usam categorias de despesa.
export const CATEGORIES = EXPENSE_CATEGORIES;

// Lista de categorias válidas para o tipo de lançamento.
export function categoriesFor(type) {
  return type === "INCOME" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

// Mantém a categoria se ela for válida para o tipo; senão cai na 1ª da lista.
export function reconcileCategory(type, current) {
  const list = categoriesFor(type);
  return list.includes(current) ? current : list[0];
}
