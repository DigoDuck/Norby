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
carteiras, transações, recorrências, metas (SAVINGS/BUDGET) e a Norby IA
(Gemini), que gera score, leitura do mês e chat. Plano gratuito com limite de 2
carteiras e sem IA; o Norby+ libera os dois. Sucesso = o usuário confia nos
números à primeira vista e volta todo dia sem fricção.

## Brand Personality

Confiável, calmo, preciso. Uma bússola: ferramenta sólida, de leitura
instantânea, em que um único ponto de safira aponta onde olhar. Superfícies
opacas, números em tinta e cinza, nenhum brilho decorativo. Escuro por padrão
(preto neutro, para conferir as contas à noite), claro por escolha do usuário.
Voz em pt-BR, direta e sem jargão bancário ou técnico; a Norby IA fala como uma
copiloto, não como uma consultora pomposa.

## Anti-references

- A paleta âmbar antiga (era Lumea): nunca reintroduzir dourado/laranja como acento.
- O vidro iridescente (tema anterior, removido em 2026-09-25): blur, glassmorphism,
  glow, mesh de fundo, anel 3D, gradiente iridescente fora do logo.
- Neon: cor clara e saturada ao mesmo tempo. A cor do Norby é tom de joia.
- Gradiente roxo-azul genérico de SaaS/fintech.
- Dashboard-template: hero-metric com gradiente, cards idênticos em grade.
- Emoji como ícone.
- Banco digital que "vende" (badges, confete, banner de upsell). Norby organiza, não
  vende: o Norby+ aparece só onde um recurso está bloqueado, e diz isso antes da ação.

## Design Principles

1. **Números primeiro.** Todo layout existe para deixar um número legível em 1s.
   Figuras tabulares, hierarquia por escala, ruído zero ao redor do dado.
2. **Um foco por tela.** O safira preenchido aparece em um lugar só (no dashboard,
   a Sobra do mês). Ação principal é tinta; azul em texto é link ou seleção. Estados
   inativos ficam em neutros.
3. **A estrela orienta.** O motivo estrela-norte (do monograma) é o marcador de
   posição do app: item ativo, presença da IA, loading. Em nenhum outro lugar.
4. **Nenhum número inventado.** Valor desconhecido não vira R$ 0,00: carregando é
   esqueleto, falha é aviso com "Tentar de novo". Totais fecham entre si (a pizza
   soma o mesmo que o tile de Despesas).
5. **Familiaridade ganha de surpresa.** Padrões de produto consagrados
   (sidebar, tabelas, dialogs); a personalidade vive no acabamento, não em
   affordances inventadas.
6. **Funcionalidade é sagrada.** Redesign não tira capacidade do usuário:
   informação duplicada pode sair, recurso não.

## Accessibility & Inclusion

- Contraste mínimo WCAG AA (4.5:1 corpo, 3:1 texto grande e elementos gráficos)
  **medido no pixel renderizado**, nos dois temas: o valor do token isolado não
  vale como prova.
- Foco visível em todo elemento interativo; alvo de toque de 24px ou mais.
- `prefers-reduced-motion` respeitado em toda animação.
- Semântica de cor nunca é o único canal (setas/sinais acompanham verde/vermelho).
- Nada de emoji em título ou rótulo: o leitor de tela lê o nome do emoji.
- Interface em pt-BR; valores em BRL com `tabular-nums`.
