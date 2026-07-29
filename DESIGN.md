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
`--shadow-card`, `--inner-highlight`, `--mesh`, `--glow-accent`.

**3. Iridescência** — `--iris-1` a `--iris-4` são canais, e não um gradiente
pronto, porque a cáustica do herói precisa dos stops soltos com alpha próprio.
Deles derivam `--iris` (a moldura) e `--iris-glow`. O `--iris-brand` é fixo nos
dois temas — ver Signature.

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

**O tile da marca** (`.brand-tile`) carrega o monograma sobre o gradiente
iridescente. Ele **não segue o tema**: a referência mostra os mesmos stops
saturados nos dois, e sobre os stops claros do tema light o monograma branco cai
para 1,45:1. Superfície acompanha o tema, marca é constante. A variante redonda
(`.brand-tile-round`) com a estrela no centro é a presença da IA.

**O anel** é **um só**: `shared/HeroRing.jsx`, o toro renderizado em
`assets/brand/`, usado no herói do dashboard e no login. Não existe segundo
anel. O `conic-gradient` em CSS que ocupava esse papel foi removido — ao lado do
asset ele lia como um círculo chapado, desenhado em outra perspectiva.

A cáustica que acompanha o toro deriva dos stops `--iris-*`; nenhum deles é cor
semântica, e nenhum pode virar sinal de receita, despesa ou alerta.

## Components

- **Card:** `.glass` — o **único** lugar com `backdrop-filter`. Blocos internos
  usam `.inset-panel`, superfície sólida: blur empilhado derruba o frame rate no
  mobile e não muda nada aos olhos no segundo nível.
- **Profundidade:** todo controle que precisa ler como objeto usa as mesmas três
  camadas — `--elev-1` (sombra embaixo), `--rim` (luz na aresta superior) e uma
  borda fina. A sombra é **tingida**, nunca cinza: na referência ela mede
  204 216 248 sobre uma página em 252 252 252, porque é a luz da cena que a
  colore. `--shadow-card` continua sendo só do card; controle dentro de card usa
  `--elev-1` e o card não ganha nada a mais, senão vira borrão.
- **Preenchimento de ação:** `--action-primary-fill` — gradiente que atravessa o
  matiz (azul → índigo → violeta), rim no topo, glow tingido embaixo.
  Iridescência aqui é **matiz, não claridade**: a referência clareia as pontas e
  com isso o texto branco dela cai para 2,33:1; o nosso mede 4,75:1 no pixel
  renderizado, sob o rótulo. Fixo nos dois temas, como o tile da marca.
  Tem **dois** consumidores, e os dois são sancionados pelo princípio 2 do
  PRODUCT.md (o azure marca ação primária **e seleção**): `.hero-cta`, o CTA
  primário, e `.auth-mode-active`, o modo selecionado no login. O antigo
  `.cta-primary` foi apagado em 2026-07-29, quando ficou sem nenhum uso.
- **Hover:** cresce a **luz em volta** (aura do pseudo + `--elev-glow`), nunca o
  brilho da superfície. `filter: brightness()` em botão preenchido com texto
  branco sempre derruba o contraste: medido, levava o CTA de 4,75:1 para 4,37:1
  e reprovava AA justamente quando o ponteiro chegava. Card sobe 2px; botão não
  sobe, porque o `Button` já traz `active:scale-[0.98]` e um transform apagaria
  o afundar do clique. Curva ease-out-quint, 180–200ms, sem bounce. Não recebem
  hover: controle não interativo (`.control-raised`) e item já selecionado.
- **Item ativo da navegação:** `.nav-active` — pílula elevada por cima de uma
  forma iridescente 3px mais larga, então só as fatias laterais aparecem. **Não**
  é moldura: no PNG o topo e a base não têm cor.
- **Controle elevado:** `.control-raised` — superfície sólida com elevação, para
  chip de data e afins. `.glass` ali só traria `backdrop-filter` que não faz
  nada num controle de 28px.
- **Moldura iridescente:** `.stroke-iris` — 1px de gradiente com miolo
  transparente, feito com `mask-composite`. Uso **definido**: CTA secundário e o
  primeiro insight da IA. Não é enfeite de card qualquer. O `.stroke-iris-glow`
  é opcional e some com o `@supports` de fallback, que degrada para borda sólida
  do acento.
- **Glow:** o limite de **dois por tela** vale para o glow difuso de card
  (`--glow-accent`). A moldura iridescente é padrão de componente e não conta
  nesse limite.
- **Célula de heatmap:** `.heat-cell` — azulejo com borda própria e gradiente
  diagonal. A cor entra por `backgroundColor` inline; o atalho `background`
  apagaria o gradiente do utilitário.
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
- A navegação **não tem rótulos de seção**: um filete separa preferências do
  resto. Com sete itens, dois cabeçalhos custam mais ruído do que organizam.
- Dashboard em **grade de 12 colunas**; proporções por `col-span`, não por
  frações arbitrárias.
- Padding interno de card: `p-6` (compacto `p-5`).

## Motion

- 150–250ms, `ease-out`; nada de bounce ou elastic.
- Motion comunica estado. Ambiente permitido: a flutuação lenta do anel do herói
  e o pulso da marca da IA. Nada mais.
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
