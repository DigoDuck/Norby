// Ritmo financeiro: dos últimos N dias, em quantos o usuário gastou dentro do
// próprio ritmo diário.
//
// A regra anterior era "no azul = receitas do dia >= despesas do dia". Para quem
// vive de salário isso é impossível de satisfazer: a renda entra num único dia do
// mês, então nos outros ~29 dias a receita é zero e QUALQUER gasto pintava o dia
// de vermelho. A sequência não media disciplina, media o calendário — ficava em 0
// permanentemente.
//
// Aqui a renda da janela é diluída por dia ("ritmo diário") e um dia está no
// ritmo quando o gasto dele fica abaixo dessa cota. Isso compara fluxo diário com
// fluxo diário, que é o que o nome do painel promete.

const pad2 = (n) => String(n).padStart(2, "0");

const dayKey = (d) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/**
 * @param {Array<{date: string, type: 'INCOME'|'EXPENSE', amount: string|number}>} transactions
 * @param {number} days  tamanho da janela, terminando em `today`
 * @param {Date} today
 */
export function computeRitmo(transactions, days, today = new Date()) {
  const spentByDay = new Map();
  const activeDays = new Set();
  let windowIncome = 0;

  for (const t of transactions) {
    const key = String(t.date).slice(0, 10);
    const amount = parseFloat(t.amount);
    if (!Number.isFinite(amount)) continue;
    activeDays.add(key);
    if (t.type === "INCOME") windowIncome += amount;
    else spentByDay.set(key, (spentByDay.get(key) || 0) + amount);
  }

  // Sem receita na janela não há ritmo a calcular: qualquer cota seria inventada.
  const hasPace = windowIncome > 0;
  const dailyPace = hasPace ? windowIncome / days : 0;

  const cells = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - i,
    );
    const key = dayKey(d);
    const spent = spentByDay.get(key) ?? 0;
    cells.push({
      key,
      // Da Date local, nunca de new Date(key): "2026-09-25" seria lido como UTC
      // e, em UTC-3, viraria quinta.
      weekday: d.getDay(),
      spent,
      active: activeDays.has(key),
      onPace: hasPace && spent <= dailyPace,
    });
  }

  // Sequência atual: dias no ritmo contando de hoje para trás.
  let streak = 0;
  for (let i = cells.length - 1; i >= 0 && cells[i].onPace; i--) streak++;

  return {
    cells,
    dailyPace,
    hasPace,
    hasActivity: activeDays.size > 0,
    onPaceCount: cells.filter((c) => c.onPace).length,
    streak,
  };
}

/**
 * Folga do dia: 1 = não gastou nada, 0 = gastou exatamente a cota.
 * Usado só para a intensidade do heatmap — escalar pelo maior líquido positivo
 * (regra anterior) fazia o dia do salário achatar todos os outros para o tom
 * mais fraco.
 */
export function headroom(cell, dailyPace) {
  if (dailyPace <= 0) return 0;
  return Math.max(0, 1 - cell.spent / dailyPace);
}

/**
 * Intensidade da célula. 1 = dia sem lançamento (no ritmo por omissão, como a
 * frase do painel já conta), 2-4 = dia com gasto por folga, over = estourou.
 * Sem cota tudo é 0: não dá para estourar um ritmo que não existe.
 */
export function heatLevel(cell, dailyPace) {
  if (dailyPace <= 0) return 0;
  if (!cell.active) return 1;
  if (!cell.onPace) return "over";
  const folga = headroom(cell, dailyPace);
  if (folga > 0.66) return 4;
  if (folga > 0.33) return 3;
  return 2;
}

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/**
 * Grade estilo GitHub: cada coluna é uma semana de domingo a sábado. A primeira
 * coluna começa com `null` até o dia da semana do primeiro dia da janela; a
 * última termina em hoje, sem completar.
 * `months[c]` é o rótulo da coluna c: o mês que começa nela, ou o da janela na
 * primeira coluna.
 */
export function heatGrid(cells) {
  const slots = [...Array(cells[0]?.weekday ?? 0).fill(null), ...cells];
  const weeks = [];
  for (let i = 0; i < slots.length; i += 7) weeks.push(slots.slice(i, i + 7));

  const mes = (key) => MESES[Number(key.slice(5, 7)) - 1];
  const months = weeks.map((week, c) => {
    const inicio = week.find((cell) => cell?.key.endsWith("-01"));
    if (inicio) return mes(inicio.key);
    return c === 0 ? mes(week.find(Boolean).key) : "";
  });
  return { weeks, months };
}
