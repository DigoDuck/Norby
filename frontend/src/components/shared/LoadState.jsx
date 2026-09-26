import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Esqueleto no formato final dos cards: a página não pula quando os dados
 * chegam, e nada de "R$ 0,00" ou "nenhuma ainda" enquanto não se sabe.
 */
export function LoadingCards({ count = 3, className = "min-h-[160px]" }) {
  return Array.from({ length: count }, (_, i) => (
    <div
      key={i}
      aria-hidden="true"
      className={`panel p-6 flex flex-col gap-3 motion-safe:animate-pulse ${className}`}
    >
      <div className="size-10 rounded-lg bg-line/[0.07]" />
      <div className="h-3 w-1/3 rounded-full bg-line/[0.07]" />
      <div className="h-6 w-1/2 rounded-full bg-line/[0.07]" />
    </div>
  ));
}

/**
 * Falha de carregamento dita como falha, com o que faltou e um jeito de
 * tentar de novo. Nunca o texto cru do servidor.
 *
 * @param {string} what  o que não carregou, ex.: "suas carteiras"
 */
export function LoadError({ what, onRetry, className = "" }) {
  return (
    <div
      role="alert"
      className={`panel p-8 flex flex-col items-center text-center gap-3 ${className}`}
    >
      <span className="grid place-items-center size-11 rounded-full bg-danger/10 text-danger">
        <TriangleAlert size={20} aria-hidden="true" />
      </span>
      <div>
        <p className="font-semibold text-content">Não conseguimos carregar {what}</p>
        <p className="text-sm text-content-2 mt-1">
          Pode ser a conexão. Seus dados continuam salvos.
        </p>
      </div>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          <RefreshCw size={14} aria-hidden="true" /> Tentar de novo
        </Button>
      )}
    </div>
  );
}
