import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

// Rascunho de portfólio — não substitui revisão jurídica.
export default function Termos() {
  return (
    <div className="app-mesh min-h-screen bg-bg-base px-4 py-8 text-content sm:py-12">
      <main className="mx-auto max-w-3xl">
        <Link
          to="/"
          className="mb-8 inline-flex items-center gap-2 text-accent hover:underline"
        >
          <ArrowLeft size={16} /> Voltar
        </Link>

        <article className="glass p-8">
          <h1 className="text-3xl font-bold tracking-tight text-content">
            Termos de Uso
          </h1>
          <p className="mt-2 text-sm text-content-3">
            Última atualização: 29/06/2026
          </p>

          <section>
            <h2 className="mb-3 mt-8 text-lg font-semibold text-content">
              1. Aceitação
            </h2>
            <p className="leading-relaxed text-content-2">
              Ao criar uma conta e usar o Norby, você concorda com estes Termos de
              Uso e com a nossa{" "}
              <Link to="/privacidade" className="text-accent hover:underline">
                Política de Privacidade
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-3 mt-8 text-lg font-semibold text-content">
              2. O serviço
            </h2>
            <p className="leading-relaxed text-content-2">
              O Norby é uma ferramenta de organização financeira pessoal com apoio
              de inteligência artificial. Ele ajuda a registrar transações, metas e
              a obter insights. <strong>O Norby não é uma instituição financeira</strong> e
              não realiza movimentações de dinheiro.
            </p>
          </section>

          <section>
            <h2 className="mb-3 mt-8 text-lg font-semibold text-content">
              3. Conteúdo gerado por IA
            </h2>
            <p className="leading-relaxed text-content-2">
              Os insights e respostas do assistente são gerados automaticamente e
              podem conter erros. Eles têm caráter <strong>informativo</strong> e não
              constituem aconselhamento financeiro, contábil ou de investimento.
              Decisões tomadas com base neles são de sua responsabilidade.
            </p>
          </section>

          <section>
            <h2 className="mb-3 mt-8 text-lg font-semibold text-content">
              4. Sua conta
            </h2>
            <ul className="list-disc space-y-1 pl-5 leading-relaxed text-content-2">
              <li>Você é responsável por manter a confidencialidade da sua senha.</li>
              <li>Os dados que você registra devem ser seus e verdadeiros.</li>
              <li>Você pode exportar seus dados ou excluir a conta a qualquer momento, nas Configurações.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 mt-8 text-lg font-semibold text-content">
              5. Limitação de responsabilidade
            </h2>
            <p className="leading-relaxed text-content-2">
              O serviço é fornecido "como está". Na máxima extensão permitida pela
              lei, o Norby não se responsabiliza por perdas decorrentes do uso da
              ferramenta ou de indisponibilidades temporárias.
            </p>
          </section>

          <section>
            <h2 className="mb-3 mt-8 text-lg font-semibold text-content">
              6. Alterações
            </h2>
            <p className="leading-relaxed text-content-2">
              Estes termos podem ser atualizados. Mudanças relevantes serão
              comunicadas dentro do aplicativo.
            </p>
          </section>

          <p className="mt-8 border-t border-line/10 pt-4 text-xs leading-relaxed text-content-3">
            Este documento é um rascunho de um projeto de portfólio e não constitui
            aconselhamento jurídico.
          </p>
        </article>
      </main>
    </div>
  );
}
