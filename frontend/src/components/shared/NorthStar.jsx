// Estrela-norte de 4 pontas — o mesmo desenho da estrela do monograma
// (Logo.jsx), isolada e centralizada. É o marcador de posição do app:
// item ativo da sidebar, presença da IA (orbe) e loading. Não usar como
// decoração fora desses papéis (ver DESIGN.md › Signature).
export default function NorthStar({ size = 12, color = "currentColor", className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path d="M7 2 L8 6 L10.5 7 L8 8 L7 12 L6 8 L3.5 7 L6 6 Z" fill={color} />
    </svg>
  );
}
