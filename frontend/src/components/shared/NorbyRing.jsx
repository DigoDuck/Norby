import NorthStar from "./NorthStar";

// Anel iridescente da Norby — a única concessão decorativa do app
// (PRODUCT.md › Design Principles). Feito em CSS: conic-gradient mascarado
// em anel, glow por trás e flutuação lenta. Sem canvas, sem WebGL, sem asset:
// escala em qualquer resolução, custa zero byte e os dois temas saem de três
// variáveis. O véu branco (--ring-veil) é o que dá o vidro leitoso no claro.
// Espectro decorativo do anel: ciano → índigo → violeta → magenta. Nenhum dos
// stops é cor semântica. Verde e laranja ficaram de fora de propósito — são os
// hexes de receita e alerta, e usá-los como enfeite contradiz "um brilho só"
// (PRODUCT.md) além de fazer o anel ler como arco-íris em vez do vidro
// iridescente da referência.
const RING_SPECTRUM =
  "conic-gradient(from 200deg, #22D3EE, #637AFA, #8B7BF7, #A78BFA, #E879F9, #F472B6, #22D3EE)";

export default function NorbyRing({ size = 220, withStar = false, className = "" }) {
  const thickness = Math.round(size * 0.13);
  const ringMask = `radial-gradient(farthest-side, transparent calc(100% - ${thickness}px), #000 calc(100% - ${thickness}px))`;

  return (
    <div
      aria-hidden="true"
      className={`relative shrink-0 grid place-items-center ${className}`}
      style={{ width: size, height: size, filter: "saturate(var(--ring-sat))" }}
    >
      {/* Glow ambiente */}
      <div
        className="absolute rounded-full"
        style={{
          inset: "-16%",
          background: RING_SPECTRUM,
          filter: "blur(44px)",
          opacity: "var(--ring-glow)",
        }}
      />
      {/* Anel */}
      <div
        className="absolute inset-0 rounded-full motion-safe:animate-[ring-spin_28s_linear_infinite]"
        style={{
          background: RING_SPECTRUM,
          WebkitMask: ringMask,
          mask: ringMask,
        }}
      />
      {/* Véu leitoso: no claro transforma o anel de "energia" em vidro fosco */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: "rgba(255,255,255,var(--ring-veil))",
          WebkitMask: ringMask,
          mask: ringMask,
        }}
      />
      {withStar && (
        <NorthStar size={Math.round(size * 0.16)} className="relative text-content" />
      )}
    </div>
  );
}
