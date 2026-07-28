# Design — Norby "Vidro Iridescente"

Dois temas, escuro e claro, com paridade total: nenhum recurso existe só num
deles. O escuro é o padrão. Cena física: painel de instrumentos sob vidro — o
conteúdo flutua sobre uma atmosfera fria, e o brilho é ambiente, nunca dado.

## Color

Não há hex solto em componente. Toda cor sai de um token, e os valores vieram
de amostragem por região dos PNGs de referência (`design-references/`).

Duas camadas de token, com propósitos diferentes:

**1. Cor, em canais RGB** — declarada em `src/index.css` e exposta ao Tailwind
por `rgb(var(--x) / <alpha-value>)`, de modo que `bg-surface/70` continua
funcionando. É o que o `tailwind.config.js` mapeia.

| Token | Papel |
|---|---|
| `--bg-base` | Fundo da página (azul-preto no escuro, quase branco no claro) |
| `--surface` / `--surface-inset` | Superfície sólida e bloco interno de card |
| `--content` / `-2` / `-3` | Texto principal, secundário, microlabel |
| `--line` | Bordas e divisórias — sempre com alpha (`border-line/10`) |
| `--accent` | Texto interativo: links, valores, ícone de ação |
| `--accent-fill` / `--accent-contrast` | Preenchimento de CTA e texto sobre ele |
| `--focus` / `--focus-offset` | Anel de foco e o respiro entre ele e o elemento |
| `--income` / `--expense` / `--danger` / `--warning` | Semânticos |
| `--chart-1..9` | Paleta categórica, exclusiva de data-viz |
| `--heat-0..4`, `--heat-over` | Escala sequencial do Ritmo financeiro |
| `--grid-line` / `--axis` | Malha e eixos de gráfico |

**2. Composição** — carregam alpha, blur e gradiente próprios, então ficam
fora do Tailwind: `--glass-bg`, `--glass-border`, `--glass-blur`,
`--shadow-card`, `--inner-highlight`, `--mesh`, `--glow-accent`, `--ring-torus`.

Regras:

- Os espectros funcionais **diferem entre os temas**, não são o mesmo valor
  invertido: o ciano de receita é `#22D3EE` no escuro e `#0C6680` no claro,
  porque o claro precisa de valor escuro para passar contraste.
- O vidro do escuro **esfria** a superfície (branco azulado a 4,5%), não só
  clareia. O do claro é branco a 72% com blur maior.
- `--accent` é azure e vive no texto; o índigo aparece apenas em `--accent-fill`.
- Paleta categórica ≠ escala sequencial. Reusar a do donut no heatmap faria o
  painel parecer que codifica categoria quando codifica intensidade.
- Cada categoria de despesa tem cor própria: são 9 em `lib/categories.js` e há
  9 tokens de gráfico. Menos que isso e duas fatias do mesmo donut saem iguais.

## Theming

`data-theme="dark" | "light"` no `<html>` é a **única** fonte de verdade. Não
há store, contexto nem classe paralela.

- Um script inline no `index.html` roda antes do bundle e evita o flash.
- Persistência em `localStorage` (`norby-theme`); qualquer falha cai em `dark`.
- O tema do sistema **não** é consultado: a escolha é do usuário, explícita.
- Tailwind: `darkMode: ["selector", '[data-theme="dark"]']`.
- `lib/theme.js` é o único ponto de leitura/escrita.

## Typography

- **Geist Variable** (`@fontsource-variable/geist`), família única.
- Escala fixa em rem, ratio ~1.2: `text-[11px]` microlabel uppercase
  `tracking-widest` · `text-xs` meta · `text-sm` corpo de UI · `text-base`
  prosa · `text-xl` título de card · `text-3xl` título de página · `text-4xl`
  valor-herói.
- Monetário e tabela: `font-variant-numeric: tabular-nums` (`.tnum`),
  `tracking-tight` em valores grandes.
- Hierarquia de microlabel vem de tamanho, caixa e tracking — não de apagar a
  cor até reprovar contraste.

## Signature

**A estrela-norte de 4 pontas** (path do monograma em `shared/Logo.jsx`) marca
posição: item ativo da sidebar, presença da IA, loading. O monograma é
intocável: nenhum path ou stroke muda.

**O anel** (`shared/NorbyRing.jsx`) é a única concessão decorativa do app, feito
em CSS puro — `conic-gradient` mascarado, sem canvas, sem WebGL, sem asset. São
dois objetos distintos, e trocá-los é erro:

- `variant="spectrum"` — iridescente nos 360°. É o orbe da IA.
- `variant="glass"` — corpo escuro com dois especulares estreitos, vindo de
  `--ring-torus`. É o anel de herói (dashboard e auth).

## Components

- **Card:** `.glass` — o **único** lugar com `backdrop-filter`. Blocos internos
  usam `.inset-panel`, superfície sólida: blur empilhado derruba o frame rate no
  mobile e não muda nada aos olhos no segundo nível.
- **Glow:** no máximo dois por tela (`--glow-accent`), sempre ambiente.
- **Botão primário:** pill `bg-accent-fill text-accent-contrast`.
- **Atalhos de fluxo:** pílulas tingidas (`bg-income/[0.12] text-income` e o
  par de despesa), mesmo peso entre si.
- **Chip de tendência:** `.chip-pos` / `.chip-neg` / `.chip-neutral`, sempre com
  seta — variação nunca é texto solto.
- **Foco:** `focus-visible` com anel de `--focus` e offset; nos primitivos a
  opacidade mínima é 70%, abaixo disso não alcança 3:1 sobre o vidro claro.
- **Estados obrigatórios:** default, hover, focus-visible, active, disabled,
  loading, empty (que ensina a agir), error.
- Ícones: **lucide-react** exclusivamente.

## Layout

- Shell: sidebar flutuante de 16rem (`lg:` para cima) que vira gaveta abaixo
  disso, com todas as rotas e o logout — nada some, só recolhe.
- Dashboard em **grade de 12 colunas**; proporções por `col-span`, não por
  frações arbitrárias.
- Padding interno de card: `p-6` (compacto `p-5`).

## Motion

- 150–250ms, `ease-out`; nada de bounce ou elastic.
- Motion comunica estado. Ambiente permitido: o giro lento do anel e o pulso do
  orbe. Nada mais.
- `@media (prefers-reduced-motion: reduce)` desativa tudo, sempre — verificado
  com a preferência emulada, não presumido.

## Accessibility

Contraste é medido contra o **vidro renderizado** (composto sobre o fundo da
página), nunca contra o token de superfície, e no navegador — o valor do token
sozinho mente. Onde a referência reprova AA, ela perde: o microlabel, o ciano de
receita e o vermelho de despesa do tema claro usam valores mais escuros que os
do PNG.

O nível 0 do heatmap fica abaixo de 3:1 de propósito: é ausência de lançamento,
e o valor de cada dia está no `title` da célula.

## Anti-padrões (deste projeto)

- Âmbar/dourado/laranja como accent (era Lumea) — proibido.
- Hex fixo em componente; `norby-*` (namespace morto) e `.glass-card` (ponte
  removida).
- Fundo em WebGL/canvas: o Aurora saiu porque o mesh CSS entrega a mesma
  atmosfera sem 50 kB de shader.
- Blur empilhado, glow em todo card, gradient text.
- Cor como único canal semântico; `#000` puro.
- Spinner circular genérico (usar a estrela).
