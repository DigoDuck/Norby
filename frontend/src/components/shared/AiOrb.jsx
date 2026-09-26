import NorthStar from "./NorthStar";

// Presença da IA: a estrela-norte em azul num círculo tingido. Era o tile
// iridescente pulsando, o último resto do tema de vidro; o gradiente ficou só
// no logo, onde é marca, e a IA fala com a mesma cor de acento do resto.
export default function AiOrb({ size = 40, className = "" }) {
  return (
    <div
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={`grid place-items-center shrink-0 rounded-full bg-accent/[0.12] text-accent ${className}`}
    >
      <NorthStar size={Math.round(size * 0.42)} />
    </div>
  );
}
