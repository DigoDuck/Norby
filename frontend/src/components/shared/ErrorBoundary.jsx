import { Component } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

/**
 * Rede de segurança para erros de render.
 *
 * Sem isto, qualquer exceção durante o render desmonta a árvore inteira e a
 * página fica em branco, sem nada clicável — só um reload manual recupera.
 * Não substitui tratar o erro na origem (ver `apiErrorMessage`): existe para
 * o caso que ninguém previu, para que a falha vire uma tela com saída em vez
 * de um app que sumiu.
 */
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    // Sem serviço de telemetria no projeto; o console é onde o erro fica
    // recuperável em desenvolvimento.
    console.error("Erro não tratado na interface:", error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="min-h-screen bg-norby-night flex items-center justify-center p-6">
        <div className="glass-card max-w-md w-full p-8 text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-norby-danger/15">
            <AlertTriangle className="text-norby-danger" size={22} />
          </div>
          <h1 className="text-xl font-semibold text-norby-ivory">
            Algo quebrou por aqui
          </h1>
          <p className="mt-2 text-sm text-norby-ivory/60 leading-relaxed">
            A tela não conseguiu carregar. Seus dados estão salvos e nada foi
            perdido. Recarregue para continuar.
          </p>
          <Button
            onClick={() => window.location.reload()}
            className="mt-6 bg-norby-teal text-norby-night hover:bg-norby-teal/90"
          >
            Recarregar
          </Button>
        </div>
      </div>
    );
  }
}
