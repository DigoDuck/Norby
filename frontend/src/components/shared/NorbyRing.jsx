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

// O anel grande da referência NÃO é o mesmo objeto: medindo o PNG, o corpo dele
// é azul-escuro (moda 28 56 120) com dois brilhos estreitos. Espectro cheio nos
// 360° é o que fazia o herói sair neon. O toro vem de --ring-torus para que cada
// tema traga o seu (escuro no dark, leitoso no light).
const RING_VARIANT = {
  spectrum: RING_SPECTRUM,   // orbe da IA: iridescente inteiro
  glass: "var(--ring-torus)", // herói: vidro escuro com especular
};

export default function NorbyRing({
  size = 220,
  withStar = false,
  variant = "spectrum",
  className = "",
}) {
  const paint = RING_VARIANT[variant] ?? RING_SPECTRUM;
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
          background: paint,
          filter: "blur(44px)",
          opacity: "var(--ring-glow)",
        }}
      />
      {/* Anel */}
      <div
        className="absolute inset-0 rounded-full motion-safe:animate-[ring-spin_28s_linear_infinite]"
        style={{
          background: paint,
          WebkitMask: ringMask,
          mask: ringMask,
        }}
      />
      {/* Véu leitoso: no claro transforma o espectro de "energia" em vidro
          fosco. O toro não precisa — já vem pronto do token do tema. */}
      {variant === "spectrum" && (
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: "rgba(255,255,255,var(--ring-veil))",
            WebkitMask: ringMask,
            mask: ringMask,
          }}
        />
      )}
      {withStar && (
        <NorthStar size={Math.round(size * 0.16)} className="relative text-content" />
      )}
    </div>
  );
}
