import { formatBRL } from "@/lib/utils";

// Valor BRL com os centavos rebaixados. Centavos são informação secundária,
// não acento: colorir de azul competiria com os links de ação. O tamanho vem
// do contexto via `className`; só a cor dos centavos é fixa.
export default function Money({
  value,
  className = "",
  centsClassName = "text-content-2",
}) {
  const formatted = formatBRL(value);
  const idx = formatted.lastIndexOf(",");
  if (idx === -1) return <span className={`tnum ${className}`}>{formatted}</span>;
  return (
    <span className={`tnum ${className}`}>
      {formatted.slice(0, idx)}
      <span className={centsClassName}>{formatted.slice(idx)}</span>
    </span>
  );
}
