# Design — Norby "Petróleo Confiável"

Tema dark único (não há modo claro). Cena física: uso desktop à noite; o app é
um painel de instrumentos calmo sob pouca luz ambiente.

## Color

Paleta fechada — hex imutáveis, definidos em `frontend/tailwind.config.js`
(namespace Tailwind `norby-*`). Variações só por opacidade (`/70`, `/15`…).

| Token | Hex | Papel |
|---|---|---|
| `norby-night` | `#07100F` | Fundo do body |
| `norby-surface` | `#0E1B19` | Cards e sidebar |
| `norby-surface2` | `#152624` | Superfície elevada (tooltip, hover, dialog) |
| `norby-teal` | `#2DB5A3` | Accent: ação primária, seleção, presença da IA |
| `norby-teal-soft` | `#6FD4C6` | Accent claro: valores em destaque, hover do accent |
| `norby-ivory` | `#EFFAF8` | Texto principal |
| `norby-income` | `#5FBF7E` | Semântico: receita/positivo |
| `norby-expense` | `#8A8580` | Semântico: neutro de despesa |
| `norby-danger` | `#E06A4A` | Semântico: gasto/negativo/destrutivo |

- Estratégia: **Restrained** — neutros escuros + teal ≤10% da superfície.
- Texto secundário: `ivory/60` mínimo para corpo; `ivory/40` só para labels grandes/uppercase.
- Cores categóricas de gráfico (donut): `#2DB5A3`, `#5B8DEF`, `#E0B341`, `#E0725C`, `#7BD88F`, `#6FD4C6` — uso exclusivo em data-viz.
- Fundo Aurora teal (`components/Aurora.jsx`) atrás de overlay `night/60`: o glow é ambiente, nunca compete com dado.

## Typography

- **Família única: Inter** (identidade fechada do brand book). Sem display font.
- Escala fixa em rem, ratio ~1.2: `text-[11px]` labels uppercase `tracking-widest` · `text-xs` meta · `text-sm` corpo de UI · `text-base` prosa · `text-xl` título de card · `text-3xl` título de página/saudação · `text-4xl` valor-herói (saldo).
- Números monetários e tabelas: `font-variant-numeric: tabular-nums` (classe `.tnum`), `tracking-tight` em valores grandes.
- Centavos de valores-herói em tamanho menor e `ivory/50` (padrão do rascunho aprovado).

## Signature

**A estrela-norte de 4 pontas** (path do monograma em `components/shared/Logo.jsx`)
é o marcador de posição do app — e só isso:

1. Indicador do item ativo da sidebar.
2. Orbe da IA: gradiente radial `teal → teal-soft → transparente` com a estrela
   no centro (card Leitura da IA, chat, hero do dashboard).
3. Loading: estrela pulsando no lugar de spinner genérico.

O monograma (N + estrela) é intocável: nenhum path/stroke muda.

## Components

- **Card:** `bg-norby-surface/70 border border-white/[0.06] rounded-3xl` +
  `backdrop-blur-xl` (classe `.glass-card`). Hover: borda `white/[0.14]`.
  Sem nested cards; blocos internos usam `bg-white/[0.03] rounded-2xl`.
- **Botão primário:** pill (`rounded-full`), `bg-norby-teal text-norby-night`,
  h-10, hover `bg-norby-teal-soft`, `active:scale-[0.98]`. Glow teal só aqui.
- **Botão secundário:** pill outline `border-white/10 text-norby-ivory hover:bg-white/5`.
- **Chip de tendência:** pill `bg-norby-income/15 text-norby-income` (ou danger)
  com seta; nunca texto solto.
- **Inputs:** `bg-white/5 border-white/10 rounded-xl`, foco `ring-norby-teal`.
- **Estados obrigatórios:** default, hover, focus-visible, active, disabled,
  loading, empty (que ensina a agir), error.
- Ícones: **lucide-react** exclusivamente.

## Layout

- Shell: sidebar 16rem fixa + conteúdo `max-w-7xl` com `p-8`.
- Bento grid no dashboard: `gap-5`, cards de proporções variadas; densidade
  cresce para baixo (hero → widgets → tabelas).
- Padding interno de card: `p-6` (compacto `p-5`).

## Motion

- 150–250ms, `ease-out`; nada de bounce/elastic.
- Motion comunica estado (hover, seleção, feedback, loading) — sem coreografia
  de page-load; entrada máxima: fade único e rápido.
- Orbe da IA: pulso lento e sutil (opacity/scale ≤3%), o único motion ambiente.
- `@media (prefers-reduced-motion: reduce)` desativa tudo, sempre.

## Anti-padrões (deste projeto)

- Âmbar/dourado/laranja como accent (era Lumea) — proibido.
- `#000` puro; bloco teal chapado em navegação (compete com o CTA).
- Side-stripe borders, gradient text, eyebrow uppercase em toda seção.
- Spinner circular genérico (usar a estrela).
