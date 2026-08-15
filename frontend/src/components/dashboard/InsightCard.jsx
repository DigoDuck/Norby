import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, Check, Sparkles } from "lucide-react";
import AiOrb from "@/components/shared/AiOrb";
import { Button } from "@/components/ui/button";

// Ícone contextual dos insights da IA (heurística simples em pt-BR).
function insightIcon(text) {
  const t = text.toLowerCase();
  if (/(caminho certo|parab|bom |ótimo|no azul|guarda|econom|caíram|caiu|reduz)/.test(t))
    return Check;
  if (/(crítico|urgente|déficit|acima|estour|exced|negativ|cuidado|risco|falta|imped|ausência|não )/.test(t))
    return AlertTriangle;
  return Sparkles;
}

/**
 * Painel "Leitura da IA" do dashboard.
 *
 * @param {{ summary_text?: string, suggested_action?: string|null } | null} insight
 */
export default function InsightCard({ insight }) {
  const navigate = useNavigate();
  const insightItems = insight?.summary_text?.split("|") || [];

  return (
    <div className="lg:col-span-4 relative overflow-hidden glass border-accent/20 p-6 flex flex-col gap-3">
      {/* Segundo e último glow do dashboard: presença da IA (ver DESIGN.md) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "var(--glow-accent)" }}
      />
      <div className="relative flex items-center gap-3">
        <AiOrb size={34} />
        <div>
          <h2 className="font-semibold text-content">Leitura da IA</h2>
          <p className="text-[11px] text-accent tracking-wide">
            resumo do seu comportamento
          </p>
        </div>
      </div>
      {insightItems.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-content-3 text-xs text-center">
          Adicione transações para gerar sua análise de IA
        </div>
      ) : (
        <div className="flex flex-col gap-2 flex-1">
          {insightItems.map((item, i) => {
            const text = item.trim();
            // 1º insight = destaque; demais ganham chip de ícone contextual
            if (i === 0) {
              return (
                <div
                  key={i}
                  className="stroke-iris p-3.5 rounded-xl text-[13px] font-semibold text-content leading-relaxed"
                >
                  {text}
                </div>
              );
            }
            const Icon = insightIcon(text);
            return (
              <div
                key={i}
                className="inset-panel flex items-start gap-3 p-3 text-xs text-content-2 leading-relaxed"
              >
                <span className="shrink-0 w-9 h-9 rounded-xl bg-accent/[0.12] border border-accent/25 grid place-items-center text-accent">
                  <Icon size={16} />
                </span>
                {text}
              </div>
            );
          })}
        </div>
      )}

      {insight?.suggested_action && (
        <div className="p-3 rounded-xl bg-accent/10 border border-accent/20">
          <p className="text-[11px] font-semibold text-accent mb-1 uppercase tracking-wider">
            Sugestão prática
          </p>
          <p className="text-xs text-content-2">{insight.suggested_action}</p>
        </div>
      )}

      <Button
        onClick={() => navigate("/ai")}
        variant="ghost"
        className="w-full stroke-iris bg-transparent text-accent font-semibold hover:bg-accent/[0.06]"
      >
        Conversar com a Norby <ArrowRight size={14} />
      </Button>
    </div>
  );
}
