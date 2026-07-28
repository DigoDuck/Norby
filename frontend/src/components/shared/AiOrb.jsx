import NorthStar from "./NorthStar";

// Presença da IA (DESIGN.md › Signature): o tile iridescente da marca, redondo,
// com a estrela-norte no centro — que é o marcador usado no cabeçalho do card
// de leitura na referência. O anel em CSS saiu daqui: depois que o herói passou
// a usar o toro renderizado, um segundo círculo, chapado, brigava com ele.
export default function AiOrb({ size = 40, pulse = true, className = "" }) {
  return (
    <div
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={`brand-tile brand-tile-round shrink-0 ${
        pulse ? "motion-safe:animate-orb-pulse" : ""
      } ${className}`}
    >
      <NorthStar size={Math.round(size * 0.42)} />
    </div>
  );
}
