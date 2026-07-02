# Product

## Register

product

## Users

Pessoas físicas organizando as próprias finanças (o desenvolvedor é também o
usuário primário). Contexto: uso desktop, geralmente à noite, em sessões curtas
de conferência ("como estou este mês?") ou de lançamento de transações. O
trabalho a ser feito: registrar receitas/despesas, acompanhar saldo, metas e
recorrências, e receber leitura de IA sobre o próprio comportamento financeiro.

## Product Purpose

Norby é um organizador financeiro pessoal com IA ("seu norte financeiro"):
carteiras, transações, recorrências, metas (SAVINGS/BUDGET) e um analista IA
(Gemini) que gera score, insights e chat. Sucesso = o usuário confia nos
números à primeira vista e volta todo dia sem fricção.

## Brand Personality

Confiável, calmo, preciso. Um instrumento de navegação noturna: painel escuro,
dados nítidos, um único brilho teal orientando a atenção. Voz em pt-BR, direta
e sem jargão bancário; a IA fala como um copiloto, não como um consultor pomposo.

## Anti-references

- A paleta âmbar antiga (era Lumea) — nunca reintroduzir dourado/laranja como accent.
- Gradiente roxo-azul genérico de SaaS/fintech.
- Dashboard-template: hero-metric com gradiente, cards idênticos em grade, glassmorphism decorativo.
- Banco digital que "vende" (upsell, badges, confete). Norby organiza, não vende.

## Design Principles

1. **Números primeiro.** Todo layout existe para deixar um número legível em 1s.
   Figuras tabulares, hierarquia por escala, ruído zero ao redor do dado.
2. **Um brilho só.** O teal marca ação primária, seleção e a presença da IA.
   Nunca decoração. Estados inativos ficam em neutros.
3. **A estrela orienta.** O motivo estrela-norte (do monograma) é o marcador de
   posição do app: item ativo, presença da IA, loading. Em nenhum outro lugar.
4. **Familiaridade ganha de surpresa.** Padrões de produto consagrados
   (sidebar, tabelas, dialogs); a personalidade vive no acabamento, não em
   affordances inventadas.
5. **Funcionalidade é sagrada.** Redesign nunca remove, esconde ou altera
   comportamento — só aparência e ergonomia.

## Accessibility & Inclusion

- Contraste mínimo WCAG AA (4.5:1 corpo, 3:1 texto grande) sobre os fundos escuros.
- `prefers-reduced-motion` respeitado em toda animação.
- Semântica de cor nunca é o único canal (setas/sinais acompanham verde/vermelho).
- Interface em pt-BR; valores em BRL com `tabular-nums`.
