import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

// Rascunho de portfólio — não substitui revisão jurídica.
export default function Termos() {
  return (
    <div className="min-h-screen bg-norby-night text-norby-ivory">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-norby-teal hover:underline mb-8"
        >
          <ArrowLeft size={16} /> Voltar
        </Link>

        <h1 className="text-3xl font-bold tracking-tight">Termos de Uso</h1>
        <p className="text-norby-ivory/50 text-sm mt-2">
          Última atualização: 29/06/2026
        </p>

        <div className="mt-8 space-y-6 text-norby-ivory/80 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-norby-ivory">1. Aceitação</h2>
            <p>
              Ao criar uma conta e usar o Norby, você concorda com estes Termos de
              Uso e com a nossa{" "}
              <Link to="/privacidade" className="text-norby-teal hover:underline">
                Política de Privacidade
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-norby-ivory">2. O serviço</h2>
            <p>
              O Norby é uma ferramenta de organização financeira pessoal com apoio
              de inteligência artificial. Ele ajuda a registrar transações, metas e
              a obter insights. <strong>O Norby não é uma instituição financeira</strong> e
              não realiza movimentações de dinheiro.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-norby-ivory">3. Conteúdo gerado por IA</h2>
            <p>
              Os insights e respostas do assistente são gerados automaticamente e
              podem conter erros. Eles têm caráter <strong>informativo</strong> e não
              constituem aconselhamento financeiro, contábil ou de investimento.
              Decisões tomadas com base neles são de sua responsabilidade.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-norby-ivory">4. Sua conta</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Você é responsável por manter a confidencialidade da sua senha.</li>
              <li>Os dados que você registra devem ser seus e verdadeiros.</li>
              <li>Você pode exportar seus dados ou excluir a conta a qualquer momento, nas Configurações.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-norby-ivory">5. Limitação de responsabilidade</h2>
            <p>
              O serviço é fornecido "como está". Na máxima extensão permitida pela
              lei, o Norby não se responsabiliza por perdas decorrentes do uso da
              ferramenta ou de indisponibilidades temporárias.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-norby-ivory">6. Alterações</h2>
            <p>
              Estes termos podem ser atualizados. Mudanças relevantes serão
              comunicadas dentro do aplicativo.
            </p>
          </section>

          <p className="text-norby-ivory/40 text-xs pt-4">
            Este documento é um rascunho de um projeto de portfólio e não constitui
            aconselhamento jurídico.
          </p>
        </div>
      </div>
    </div>
  );
}
