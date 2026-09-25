import { banco } from "@/lib/bancos";
import { CHART_SERIES, hashIndex } from "@/lib/palette";

// Cor do chip, determinística e só apresentação. Chaveada pelo BANCO quando
// existe um, para que todas as carteiras do mesmo banco fiquem iguais entre si;
// sem banco, cai no nome, que é como sempre foi.
const chipColor = (chave) => CHART_SERIES[hashIndex(chave, CHART_SERIES.length)];

/**
 * Marca da carteira: a sigla do banco (ou a inicial do nome) num quadrado
 * tingido. Usada na página de Carteiras e no card de saldo do dashboard.
 *
 * @param {{ bank?: string|null, name?: string }} wallet
 * @param {string} [className]  tamanho, canto e fonte
 */
export default function WalletMark({ wallet, className = "w-12 h-12 rounded-2xl text-lg" }) {
  const b = banco(wallet.bank);
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
      {b ? b.marca : wallet.name?.[0]?.toUpperCase() || "?"}
    </div>
  );
}
