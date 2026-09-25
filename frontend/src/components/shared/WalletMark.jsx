import { Banknote } from "lucide-react";
import { banco } from "@/lib/bancos";
import { CHART_SERIES, hashIndex } from "@/lib/palette";

// Cor do chip, determinística e só apresentação. Chaveada pelo BANCO quando
// existe um, para que todas as carteiras do mesmo banco fiquem iguais entre si;
// sem banco, cai no nome, que é como sempre foi.
const chipColor = (chave) => CHART_SERIES[hashIndex(chave, CHART_SERIES.length)];

/**
 * Marca da carteira. Três formas, nesta ordem:
 *  - banco com logo: o logo real num quadrado branco;
 *  - Dinheiro: ícone de cédula no chip tingido;
 *  - banco sem logo: a sigla do catálogo; sem banco (ou slug desconhecido):
 *    a inicial do nome. As duas no chip tingido.
 * O nome da carteira sempre aparece ao lado, então a marca é decorativa.
 *
 * @param {{ bank?: string|null, name?: string }} wallet
 * @param {string} [className]  tamanho, canto e fonte
 */
export default function WalletMark({ wallet, className = "w-12 h-12 rounded-2xl text-lg" }) {
  const b = banco(wallet.bank);

  if (b?.logo) {
    // Branco fixo nos dois temas, de propósito: os logos são desenhados para
    // fundo claro, e o do C6 (preto) sumiria no card escuro.
    return (
      <div
        className={`flex items-center justify-center shrink-0 bg-white border border-line/10 ${className}`}
      >
        <img src={b.logo} alt="" draggable="false" className="w-[68%] h-[68%] object-contain" />
      </div>
    );
  }

  const color = chipColor(wallet.bank || wallet.name);
  return (
    <div
      className={`flex items-center justify-center font-semibold shrink-0 ${className}`}
      style={{
        background: `color-mix(in srgb, ${color} 13%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 24%, transparent)`,
        color,
      }}
    >
      {b?.slug === "dinheiro" ? (
        <Banknote className="w-1/2 h-1/2" aria-hidden="true" />
      ) : (
        b?.marca || wallet.name?.[0]?.toUpperCase() || "?"
      )}
    </div>
  );
}
