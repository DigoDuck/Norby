---
name: Norby
description: Organizador financeiro pessoal com IA. Seu norte financeiro.
colors:
  bg-base: "#09090B"
  surface: "#111113"
  surface-inset: "#18181B"
  content: "#F4F4F5"
  content-2: "#A1A1AA"
  content-3: "#8E8E98"
  accent-text: "#4581FF"
  sapphire-fill: "#234AFE"
  focus: "#68A5FF"
  income: "#0DD986"
  expense: "#FF5260"
  danger-fill: "#DC2626"
  warning: "#FB923C"
  pie-1: "#68A5FF"
  pie-2: "#4581FF"
  pie-3: "#2356FF"
  pie-4: "#1938D7"
  pie-5: "#14279E"
  pie-rest: "#71717A"
  heat-idle: "#1F1F22"
  heat-empty: "#18203A"
  heat-low: "#1938D7"
  heat-mid: "#306BFE"
  heat-high: "#68A5FF"
  bg-base-light: "#F0F0F2"
  surface-light: "#FFFFFF"
  surface-inset-light: "#F5F5F6"
  content-light: "#09090B"
  content-2-light: "#52525B"
  content-3-light: "#686870"
  accent-text-light: "#2356FF"
  income-light: "#03663C"
  expense-light: "#BB061E"
  danger-fill-light: "#BB061E"
typography:
  page-title:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    letterSpacing: "-0.025em"
  figure-hero:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    letterSpacing: "-0.025em"
    fontFeature: "tnum"
  figure-tile:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    fontFeature: "tnum"
  card-title:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
  body:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  meta:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
  label:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    letterSpacing: "0.1em"
rounded:
  cell: "4px"
  control: "12px"
  tile: "16px"
  panel: "20px"
  pill: "9999px"
spacing:
  tile: "16px"
  panel: "24px"
  grid: "16px"
components:
  button-primary:
    backgroundColor: "{colors.content}"
    textColor: "{colors.bg-base}"
    rounded: "{rounded.pill}"
    height: "36px"
    padding: "0 16px"
  button-secondary:
    backgroundColor: "{colors.surface-inset}"
    textColor: "{colors.content}"
    rounded: "{rounded.pill}"
    height: "36px"
    padding: "0 16px"
  button-destructive:
    backgroundColor: "{colors.danger-fill}"
    textColor: "#FFFFFF"
    rounded: "{rounded.pill}"
    height: "36px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel}"
  kpi-tile:
    backgroundColor: "{colors.surface-inset}"
    textColor: "{colors.content}"
    rounded: "{rounded.tile}"
    padding: "{spacing.tile}"
  kpi-tile-focus:
    backgroundColor: "{colors.sapphire-fill}"
    textColor: "#FFFFFF"
    rounded: "{rounded.tile}"
    padding: "{spacing.tile}"
  input:
    backgroundColor: "{colors.surface-inset}"
    textColor: "{colors.content}"
    rounded: "{rounded.control}"
    height: "40px"
  chip:
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  segmented-active:
    backgroundColor: "{colors.content}"
    textColor: "{colors.bg-base}"
    rounded: "{rounded.pill}"
    height: "32px"
    padding: "0 12px"
  search-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.content}"
    rounded: "{rounded.pill}"
    height: "40px"
---

# Design System: Norby

## 1. Overview: A Bússola de Safira

**Creative North Star: "A Bússola de Safira"**

Uma bússola é uma ferramenta sólida, de leitura instantânea, com um único ponto de
cor que aponta o rumo. É isso que o Norby é: superfícies opacas e quietas, números
em tinta e cinza, e **um** foco em safira por tela dizendo onde olhar primeiro. A
cena física é a de quem confere o mês à noite, no desktop, sob luz baixa, e quer
acreditar no número em um segundo. Por isso o escuro é o padrão (preto neutro, não
azulado) e o claro é escolha do usuário, com paridade total entre os dois.

O sistema **rejeita** o que o Norby já foi: o vidro com blur, o brilho em volta das
coisas, o gradiente iridescente, o anel 3D e o neon (cor clara e saturada ao mesmo
tempo). Também rejeita o dashboard-template de SaaS, o arco-íris de categorias e o
emoji como ícone. A referência vigente é o dashboard **Finexy** (enviada pelo dono em
2026-09-25): saudação como cabeçalho, KPIs em blocos com um só preenchido na cor de
destaque, ação principal em tinta, três degraus de superfície. O laranja dela **não**
veio junto: o destaque do Norby é safira. O vão do cabeçalho do Dashboard leva
ferramentas (busca de lançamentos, troca de tema), nunca um número que já mora num KPI.

Mecânica de tema, inalterada: `data-theme="dark" | "light"` no `<html>` é a única
fonte de verdade; um script inline no `index.html` evita o flash; a escolha vive em
`localStorage` (`norby-theme`, falha cai em `dark`); `lib/theme.js` é o único ponto
de leitura e escrita; o tema do sistema não é consultado. A troca rápida é o botão de
sol e lua no topo do Dashboard (`ThemeButton`); a escolha com prévia fica em
Configurações > Aparência (`ThemeToggle`). Os tokens de cor são canais
RGB em `src/index.css`, expostos ao Tailwind como `rgb(var(--x) / <alpha-value>)`,
então `bg-surface/70` funciona. Layout: shell com sidebar de 16rem que vira gaveta
abaixo de `lg`; o dashboard só divide em 12 colunas a partir de `xl` (1280px), com `gap`
de 16px. Abaixo disso cada card ocupa a largura toda: entre 1024 e 1279px a divisão
4/5/3 quebrava o saldo e cortava o nome das carteiras. Card que muda de arranjo pela
própria largura usa container query, não breakpoint de tela (a pizza).

**Key Characteristics:**
- Superfície opaca em três degraus: página, painel, bloco interno.
- Um único preenchimento safira por tela; ação principal em tinta.
- Números em Geist com algarismos tabulares, centavos um degrau menores.
- Ícones Lucide de traço, nunca emoji.
- Nenhum número inventado: carregando é esqueleto, falha é aviso com "Tentar de novo".
- Movimento curto e com função: fade a cada rota, KPIs entrando em sequência, campos
  do login abrindo e fechando. `prefers-reduced-motion` zera tudo.

## 2. Colors: Tinta, Cinza e um Ponto de Safira

Paleta restrita: neutros sem tinta carregam a tela, e a cor aparece só onde tem
função (foco, seleção, sinal financeiro, dado).

### Primary
- **Safira Royal** (sapphire-fill, #234AFE): o preenchimento de destaque, no limite
  do sRGB. Aparece no tile focal do dashboard (Sobra do mês), no filtro selecionado e
  em barras de progresso. Texto branco sobre ele mede 6,0:1. Igual nos dois temas.
- **Safira de Texto** (accent-text, #4581FF no escuro / #2356FF no claro): links,
  valores clicáveis, ícone de item ativo, estrela da IA. 5,2:1 sobre o painel escuro,
  5,5:1 sobre branco.

### Neutral
- **Preto de Bússola** (bg-base, #09090B / claro #F0F0F2): a página. Quase preto,
  nunca #000: preto absoluto com texto branco borra em OLED e apaga a borda do card.
- **Painel** (surface, #111113 / claro #FFFFFF): cards e sidebar.
- **Bloco Interno** (surface-inset, #18181B / claro #F5F5F6): tiles de KPI, campos,
  bolhas do chat, botão secundário.
- **Tinta** (content, #F4F4F5 / claro #09090B): texto principal e o fundo do botão
  primário.
- **Cinza de Apoio** (content-2, #A1A1AA / claro #52525B): texto secundário.
- **Cinza de Rodapé** (content-3, #8E8E98 / claro #686870): meta e rótulos de 11px;
  passa 4,5:1 inclusive sobre o bloco interno.
- **Borda**: `--line` sempre com alpha (`border-line/10`); o card usa
  `--panel-border` (branco a 8% no escuro, tinta a 9% no claro).

### Semantic
- **Receita** (income, #0DD986 / claro #03663C) e **Despesa** (expense, #FF5260 /
  claro #BB061E): valores e chips de variação, sempre com sinal ou seta. Na tabela do
  Extrato a despesa fica em tinta; só a entrada é verde.
- **Vermelho de Ação** (danger-fill, #DC2626 / claro #BB061E): preenchimento de botão
  destrutivo, com 4,8:1 sob texto branco. `--danger` continua sendo o de texto.

### Data
- **Degraus de Safira** (pie-1 a pie-5): a pizza pinta por posição, maior fatia
  primeiro (a mais clara no escuro, a mais escura no claro); "Demais categorias" fica
  em cinza (pie-rest). Quem diz a categoria é a legenda, sempre visível.
- **Rampa do Ritmo** (heat-idle a heat-high, estouro em expense): sequencial em
  safira. O dia sem lançamento (heat-empty) fica quase na cor do fundo, como a casa
  vazia do GitHub; heat-idle só aparece quando não há cota.
- **Paleta categórica** (`--chart-1..9`): hoje só colore o chip da carteira sem banco.

### Named Rules
**The One Sapphire Rule.** O preenchimento safira aparece em um lugar por tela. Se
dois elementos disputam o azul cheio, um deles está errado.

**The Ink Action Rule.** Ação principal é tinta (preto no claro, branco no escuro),
nunca azul. Azul em botão significa seleção, não "clique aqui".

**The No Invented Number Rule.** Valor desconhecido nunca vira R$ 0,00: esqueleto
enquanto carrega, aviso com "Tentar de novo" quando falha.

## 3. Typography

**Fonte única:** Geist Variable (`@fontsource-variable/geist`), com system-ui de reserva.

**Character:** uma sans técnica e neutra que carrega título, rótulo e número. A
hierarquia vem de tamanho e peso, não de uma segunda família.

### Hierarchy
- **Título de página** (700, 30px, tracking -0.025em): "Boa noite, Diogo", "Extrato".
- **Número herói** (600, 36px, tabular): o saldo total. Centavos em 24px, cinza.
- **Número de tile** (600, 24px, 20px abaixo de `sm`, tabular): KPIs; quebra linha
  em vez de truncar.
- **Título de card** (600, 16px): "Ritmo financeiro", "Onde vai seu dinheiro".
- **Corpo de UI** (400, 14px, 1.5): texto de interface e formulários.
- **Meta** (400, 12px): subtítulos, datas, legendas.
- **Rótulo** (500, 11px, tracking 0.1em, caixa alta): cabeçalho de tabela e rótulos
  pontuais de dado (Metas, Admin, grupos do chat). Nunca como sobretítulo de seção.

### Named Rules
**The Tabular Money Rule.** Todo valor monetário usa `tabular-nums` e passa por
`formatBRL`/`formatSinal`: sinal de menos tipográfico (U+2212) antes do R$, "+R$" /
"−R$" em lançamentos, percentual com vírgula via `formatPct`.

**The Sentence Case Rule.** Títulos e botões em caixa de frase: "Nova transação",
nunca "Nova Transação". Caixa alta com tracking só no rótulo de dado (`.microlabel`).

## 4. Elevation

Plano por padrão. A profundidade vem de degrau de superfície e borda de 1px, não de
sombra: no escuro a sombra do card é nula (não se vê contra quase preto); no claro
existe uma só, curta e neutra, que assenta o card branco na página cinza. Sem blur,
sem glow, sem sombra tingida.

### Shadow Vocabulary
- **Assento do card, claro** (`box-shadow: 0 1px 2px rgb(9 9 11 / 0.05)`): todo `.panel` no tema claro.
- **Controle elevado** (`box-shadow: 0 1px 2px rgb(9 9 11 / 0.06)`; escuro `0 1px 2px rgb(0 0 0 / 0.4)`): chip de data e afins.

### Named Rules
**The Flat Glass-Free Rule.** Nenhum `backdrop-filter`, nenhum glow, nenhuma aura.
Se um elemento "brilha", ele está errado.

## 5. Components

### Buttons
- **Forma:** pílula (9999px), 36px de altura (40px no tamanho `lg`).
- **Primário:** fundo tinta, texto na cor da página; hover a 85%. É o default do
  componente `Button`: não se força cor por cima dele.
- **Secundário:** bloco interno com borda `line/15` (sem a borda ele lia como texto
  solto ou desabilitado).
- **Destrutivo:** Vermelho de Ação sob texto branco, só dentro de confirmação.
- **Foco:** anel de `--focus` com offset; botões crus caem na regra base de
  `:focus-visible` (contorno de 2px na cor de foco).
- **Alvo mínimo:** ícone de ação com área de 32px.

### Chips
- **Estilo:** pílula, 12px semibold; `chip-pos` e `chip-neg` com fundo do próprio
  sinal a 12% (a 20% o vermelho media 4,3:1), `chip-neutral` em cinza. Sempre com seta ou ícone: cor nunca é o
  único canal.

### Cards / Containers
- **Painel (`.panel`):** 20px de canto, superfície opaca, borda `--panel-border`,
  padding 24px. Hover de card clicável (`.panel-hover`) só clareia a borda.
- **Tile de KPI:** 16px de canto, bloco interno, padding 16px, rótulo + ícone Lucide
  num círculo + número + chip de variação; é um `role="group"` com o nome do KPI. O
  tile focal é safira com texto branco. Os quatro do mês são gratuitos: Sobra (focal),
  Receitas, Despesas e Taxa de poupança (sobra ÷ receita, "—" sem receita, sinal de
  menos tipográfico quando negativa, sem "−0%").
- **Score financeiro:** só no premium, num bloco à direita do saldo ("72/100"). Com a
  IA fora do ar (score nulo) o bloco some; o free não vê Score em lugar nenhum.
- **Pizza ("Onde vai seu dinheiro"):** 144px; legenda com barra de participação e o
  valor numa coluna de largura fixa, para as barras terem o mesmo trilho; legenda ao
  lado da pizza só quando o card tem 18rem de conteúdo (container query); rodapé
  centralizado com média por dia, maior despesa do mês e variação contra o mês
  anterior (alta de despesa em vermelho, queda em verde).
- **Totais do Extrato:** entradas, saídas e resultado do que está filtrado (mês,
  tipo, busca), de `/transactions/summary`, que usa o mesmo filtro da lista. Se o
  resumo falhar, os totais somem e a lista fica.
- **Estados:** carregando é esqueleto no formato final (`LoadingCards`, o grid do
  Dashboard, linhas no Extrato); a estrela pulsando é só o boot do app inteiro. Falha é
  `LoadError` com "Tentar de novo"; recurso do plano Premium é `PremiumLock` (cadeado + uma
  frase + "Conhecer o plano Premium"), nunca um vazio falso.

### Inputs / Fields
- **Estilo:** 12px de canto, 40px de altura, fundo `line/5`, borda `line/15`.
- **Foco:** anel de `--focus`. **Erro:** borda e mensagem em `--danger`, específica
  ("Informe um valor maior que zero").
- **Busca do topo:** pílula de 40px sobre `surface`, lupa à esquerda e a dica
  `Ctrl K` / `⌘ K` à direita (some ao digitar, onde fica o "x" nativo), com
  `aria-keyshortcuts`. Procura lançamentos: Enter leva ao Extrato com `?q=`; abaixo
  de 2 caracteres não navega. No celular ganha linha própria.

### Segmented
- **Estilo:** trilho em pílula (`line/6%`, padding 4px) com as opções dentro; a ativa
  vira uma pílula de tinta, ou tingida do tipo no formulário (receita verde, despesa
  vermelha). Mesma linguagem do Entrar/Cadastrar do login.
- **Semântica:** grupo nomeado com `aria-pressed` em cada opção: a seleção nunca é só
  cor. Usado no filtro de tipo do Extrato e nos formulários.

### Dialogs
- **Anatomia única:** título + subtítulo de uma linha; rodapé com "Cancelar"
  (secundário) à esquerda e a ação principal à direita. Confirmação de exclusão diz
  o que sai ("Almoço · −R$ 40,00 · 25/09/2026"). Fundo escurecido, sem blur.
- **Verbo:** apagar registro é **Excluir**, do botão que abre à confirmação ("Excluir
  esta transação?"). "Remover" só onde nada é apagado (a foto de perfil).
- **O que vai junto, em número:** excluir carteira diz "leva junto 81 lançamentos e
  o saldo de R$ 25.256,00. Não dá para desfazer." Sem a contagem, "os lançamentos
  dela", nunca um número inventado.

### Navigation
- **Sidebar:** item ativo com fundo neutro (`state/7%`), ícone em safira e a
  estrela-norte à direita; hover em `state/4%`. Rótulos em caixa de frase, sem
  cabeçalhos de seção. Abaixo de `lg` vira gaveta, com todas as rotas.
- **Subabas das Configurações:** coluna lateral fixa a partir de `lg`, fileira
  rolável no celular; a aba vive em `?aba=`, então o voltar funciona e o convite do
  Premium abre direto em `?aba=plano`.

### Assinaturas
- **Logo da marca:** o monograma N sobre o gradiente iridescente (`--iris-brand`), o
  único gradiente do app, fixo nos dois temas. O desenho do monograma é intocável.
- **Estrela-norte:** marca posição (item ativo), presença da IA (`AiOrb`: estrela em
  safira num círculo tingido) e carregamento (pulso). Em nenhum outro lugar.
- **Marca da carteira (`WalletMark`):** logo real do banco num quadrado branco fixo
  (os logos são desenhados para fundo claro); "Dinheiro" usa cédula; sem banco escolhido, vale o
  nome quando ele é o de um banco do catálogo ("Nubank", "BTG", "itau"); fora isso, a
  sigla ou a inicial no chip tingido. O catálogo tem 19 bancos e Dinheiro.
- **Ritmo financeiro:** grade estilo GitHub, 7 linhas (Dom a Sáb), quadrados de ~30px
  com canto de 4px; o número de semanas se ajusta à largura (até 26), medida antes da
  pintura; a célula nunca estica. Cota, sequência e status de cada dia saem sempre das
  26 semanas: a largura só decide quantas aparecem. Rodapé com a cota diária em reais.
- **Ícone de categoria (`CategoryIcon`):** um mapa Lucide em `lib/categories.js`,
  igual em todas as telas.

## 6. Do's and Don'ts

### Do:
- **Do** usar token semântico para toda cor (`bg-surface`, `text-content-2`,
  `bg-accent-fill`). Exceções documentadas: o gradiente do logo e o branco fixo do
  quadrado de logo de banco.
- **Do** medir contraste no pixel renderizado, nos dois temas: 4,5:1 para texto, 3:1
  para elementos gráficos. O valor do token sozinho não prova nada.
- **Do** manter um só preenchimento safira por tela (The One Sapphire Rule).
- **Do** dizer o plano antes da ação: recurso do plano Premium aparece como `PremiumLock`,
  limite de carteiras como "2 de 2 no plano gratuito". Um convite por tela, onde o
  recurso mora (no Dashboard do free, só o cadeado do card da Leitura).
- **Do** dar nome ao gráfico que é o único lugar de um dado (o Fluxo de caixa, com
  `title` e navegação por setas) e tirar do Tab o que já está em texto ao lado (a
  pizza, `aria-hidden`). Toda página tem um `h1`, nem que seja `sr-only`; o
  primeiro Tab é "Pular para o conteúdo".
- **Do** fazer a pizza fechar com o total do tile de Despesas ("Demais categorias").
- **Do** usar os movimentos do sistema, em ease-out-quint e sem bounce: `motion-page`
  (220ms, fade e 4px a cada rota), `motion-rise` (420ms, 8px, em sequência de 60ms via
  `--i`) e blocos que abrem e fecham animando a linha do grid (0fr ↔ 1fr, 300ms),
  nunca `height`, `inert` quando fechados. Estados de controle em 150–250ms.
  `prefers-reduced-motion` zera tudo.

### Don't:
- **Don't** reintroduzir vidro: `backdrop-filter`, glassmorphism, glow, mesh de fundo,
  gradiente iridescente fora do logo ou o anel 3D (removidos em 2026-09-25).
- **Don't** usar âmbar, dourado ou laranja como acento (a paleta da era Lumea).
- **Don't** usar o gradiente roxo-azul genérico de SaaS/fintech nem neon (cor clara e
  saturada ao mesmo tempo).
- **Don't** montar o dashboard-template: hero-metric com gradiente, cards idênticos em
  grade, glassmorphism decorativo.
- **Don't** usar emoji como ícone, nem no título (leitor de tela lê "mão acenando").
- **Don't** usar `border-left` ou `border-right` maior que 1px como faixa colorida
  (nem em bolha de chat).
- **Don't** pintar botão principal de azul, nem forçar cor por cima do `Button`.
- **Don't** usar `#000` puro, nem hex solto em componente.
- **Don't** mostrar R$ 0,00 ou "nenhuma ainda" para valor que não carregou.
- **Don't** usar badge, confete ou banner de upsell: o Norby organiza, não vende.
- **Don't** repetir no topo do Dashboard um número que já está num KPI.
