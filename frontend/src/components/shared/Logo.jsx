// Monograma Norby: N coroado pela estrela-norte (brand book v3).
// O path é intocável. color = cor do traço/estrela; o default herda a cor do
// texto, então o consumidor decide via token (text-accent-contrast sobre o
// chip preenchido, text-accent sobre superfície).
export default function NorbyMark({ size = 28, color = "currentColor", className }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M9 23 L9 11 L21 23 L21 13"
        stroke={color}
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M21 3 L22 7 L24.5 8 L22 9 L21 13 L20 9 L17.5 8 L20 7 Z" fill={color} />
    </svg>
  );
}
