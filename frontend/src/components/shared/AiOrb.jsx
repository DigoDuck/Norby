import NorbyRing from "./NorbyRing";

// Presença visual da IA (DESIGN.md › Signature). Passou a ser o anel da marca
// em escala pequena: mesma assinatura do hero, um elemento só em vez de dois
// competindo. `pulse=false` para contextos estáticos (listas, avatares).
export default function AiOrb({ size = 40, pulse = true, className = "" }) {
  return (
    <div
      aria-hidden="true"
      className={`shrink-0 ${pulse ? "motion-safe:animate-orb-pulse" : ""} ${className}`}
    >
      <NorbyRing size={size} withStar />
    </div>
  );
}
