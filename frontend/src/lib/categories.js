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

// Emoji por categoria. Vive aqui, junto das listas que espelha, porque existiam
// DOIS mapas divergentes (Dashboard e Relatórios): Alimentação era 🍔 num e 🍽️
// no outro, Transporte 🚇 contra 🚗, Saúde 💊 contra 🩺. Ícone que muda de tela
// para tela deixa de identificar a categoria, que é a única função dele.
const CATEGORY_EMOJI = {
  "Alimentação": "🍽️",
  "Moradia": "🏠",
  "Transporte": "🚗",
  "Saúde": "🩺",
  "Educação": "📚",
  "Lazer": "🎬",
  "Compras": "🛍️",
  "Contas & Serviços": "🧾",
  "Salário": "💼",
  "Freelance/Extra": "✨",
  "Investimentos": "📈",
  "Reembolso": "↩️",
  "Presente": "🎁",
  "Outros": "🏷️",
};

/** Emoji da categoria; cai no genérico por tipo quando a categoria é desconhecida. */
export function emojiForCategory(category, type) {
  return CATEGORY_EMOJI[category] ?? (type === "INCOME" ? "🪙" : "💸");
}

// Opções do seletor de tipo de LANÇAMENTO. Estavam duplicadas byte a byte em
// Relatórios e Recorrências. (Metas tem um TYPE_OPTIONS próprio, mas é outro
// conceito — tipo de meta —, por isso não entra aqui.)
export const TRANSACTION_TYPE_OPTIONS = [
  {
    value: "EXPENSE",
    label: "Despesa",
    activeClass: "bg-expense/[0.15] text-expense ring-1 ring-inset ring-expense/30",
  },
  {
    value: "INCOME",
    label: "Receita",
    activeClass: "bg-income/[0.15] text-income ring-1 ring-inset ring-income/30",
  },
];
