import NorthStar from "./NorthStar";

// Anel iridescente da Norby — a única concessão decorativa do app
// (PRODUCT.md › Design Principles). Feito em CSS: conic-gradient mascarado
// em anel, glow por trás e flutuação lenta. Sem canvas, sem WebGL, sem asset:
// escala em qualquer resolução, custa zero byte e os dois temas saem de três
// variáveis. O véu branco (--ring-veil) é o que dá o vidro leitoso no claro.
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
          background:
            "conic-gradient(from 200deg, #22D3EE, #637AFA, #A78BFA, #FB923C, #22D3EE)",
          filter: "blur(44px)",
          opacity: "var(--ring-glow)",
        }}
      />
      {/* Anel */}
      <div
        className="absolute inset-0 rounded-full motion-safe:animate-[ring-spin_28s_linear_infinite]"
        style={{
          background:
            "conic-gradient(from 200deg, #22D3EE, #637AFA, #A78BFA, #F472B6, #FB923C, #34D399, #22D3EE)",
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
