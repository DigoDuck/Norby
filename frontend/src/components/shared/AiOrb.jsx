import NorthStar from "./NorthStar";

// Orbe da IA: a presença visual do assistente (DESIGN.md › Signature).
// Gradiente radial teal com a estrela-norte no centro; pulso lento é o
// único motion ambiente permitido no app. `pulse=false` para contextos
// estáticos (listas, avatares de mensagem).
export default function AiOrb({ size = 40, pulse = true, className = "" }) {
  return (
    <div
      aria-hidden="true"
      className={`relative shrink-0 rounded-full flex items-center justify-center shadow-lg shadow-norby-teal/25 ${
        pulse ? "animate-orb-pulse" : ""
      } ${className}`}
      style={{
        width: size,
        height: size,
        background:
          "radial-gradient(circle at 32% 28%, #6FD4C6 0%, #2DB5A3 55%, #156358 100%)",
      }}
    >
      <NorthStar size={Math.round(size * 0.5)} color="#07100F" />
    </div>
  );
}
