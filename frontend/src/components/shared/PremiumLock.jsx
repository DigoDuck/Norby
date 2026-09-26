import { Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

/**
 * Estado bloqueado pelo plano, um só para o app inteiro: diz o que o Premium
 * libera e leva à aba Plano das Configurações, onde fica o "Assinar".
 * Substitui recursos que antes apareciam e falhavam em silêncio no gratuito.
 */
export default function PremiumLock({ title, text, className = "" }) {
  const navigate = useNavigate();
  return (
    <div className={`flex flex-col items-center text-center gap-3 ${className}`}>
      <span className="grid place-items-center size-11 rounded-full bg-accent/10 text-accent">
        <Lock size={18} aria-hidden="true" />
      </span>
      <div>
        <p className="font-semibold text-content">{title}</p>
        <p className="text-sm text-content-2 mt-1 max-w-xs leading-relaxed">{text}</p>
      </div>
      <Button variant="secondary" onClick={() => navigate("/settings?aba=plano")}>
        Conhecer o plano Premium
      </Button>
    </div>
  );
}
