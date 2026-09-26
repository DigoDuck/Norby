import { createElement } from "react";
import { Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

/**
 * Estado bloqueado pelo plano, um só para o app inteiro: diz o que o Premium
 * libera e leva à aba Plano das Configurações, onde fica o "Assinar".
 * Substitui recursos que antes apareciam e falhavam em silêncio no gratuito.
 *
 * `titleAs`: o nível do título no contexto (h1 quando o cadeado é a página
 * inteira, h3 dentro de um card que já tem h2). Leitor de tela navega por
 * cabeçalho; um <p> em negrito não aparece nessa navegação.
 */
export default function PremiumLock({ title, text, titleAs = "h3", className = "" }) {
  const navigate = useNavigate();
  return (
    <div className={`flex flex-col items-center text-center gap-3 ${className}`}>
      <span className="grid place-items-center size-11 rounded-full bg-accent/10 text-accent">
        <Lock size={18} aria-hidden="true" />
      </span>
      <div>
        {createElement(titleAs, { className: "font-semibold text-content" }, title)}
        <p className="text-sm text-content-2 mt-1 max-w-xs leading-relaxed">{text}</p>
      </div>
      <Button variant="secondary" onClick={() => navigate("/settings?aba=plano")}>
        Conhecer o plano Premium
      </Button>
    </div>
  );
}
