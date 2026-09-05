import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import { PRECO_MENSAL } from "@/lib/plano";

/**
 * Identidade do fornecedor.
 *
 * O Decreto nº 7.962/2013, art. 2º, I e II, exige que o site de comércio
 * eletrônico traga o NOME e o CPF/CNPJ de quem vende, mais um endereço
 * eletrônico de contato. Não é recomendação, é condição para cobrar.
 *
 * PREENCHER ANTES DE LIGAR O PAYWALL EM PRODUÇÃO. Fica isolado aqui de
 * propósito: é uma edição de duas linhas, e assim o CPF entra no repositório
 * por decisão consciente de quem edita, não porque veio junto num commit
 * grande. Enquanto `nome` estiver vazio a seção mostra só o e-mail.
 */
const FORNECEDOR = {
  nome: "",
  documento: "",
  email: "contato@norby.com.br",
};

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
            Última atualização: 05/09/2026
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
              . Se você assinar o plano pago, valem também as condições das seções
              6 a 10, que tratam de preço, cobrança, cancelamento e reembolso.
            </p>
          </section>

          <section>
            <h2 className="mb-3 mt-8 text-lg font-semibold text-content">
              2. Quem oferece o serviço
            </h2>
            <ul className="list-disc space-y-1 pl-5 leading-relaxed text-content-2">
              {FORNECEDOR.nome && (
                <li>
                  <strong>Fornecedor:</strong> {FORNECEDOR.nome}
                </li>
              )}
              {FORNECEDOR.documento && (
                <li>
                  <strong>CPF/CNPJ:</strong> {FORNECEDOR.documento}
                </li>
              )}
              <li>
                <strong>Contato:</strong>{" "}
                <a className="text-accent hover:underline" href={`mailto:${FORNECEDOR.email}`}>
                  {FORNECEDOR.email}
                </a>{" "}
                — este é o canal oficial para dúvidas, cancelamento e reembolso.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 mt-8 text-lg font-semibold text-content">
              3. O serviço
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
              4. Conteúdo gerado por IA
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
              5. Sua conta
            </h2>
            <ul className="list-disc space-y-1 pl-5 leading-relaxed text-content-2">
              <li>Você é responsável por manter a confidencialidade da sua senha.</li>
              <li>Os dados que você registra devem ser seus e verdadeiros.</li>
              <li>Você pode exportar seus dados ou excluir a conta a qualquer momento, nas Configurações.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 mt-8 text-lg font-semibold text-content">
              6. Planos e o que cada um inclui
            </h2>
            <ul className="list-disc space-y-1 pl-5 leading-relaxed text-content-2">
              <li>
                <strong>Gratuito:</strong> até 2 carteiras e sem acesso à
                inteligência artificial.
              </li>
              <li>
                <strong>Teste de IA:</strong> toda conta nova recebe{" "}
                <strong>7 dias de inteligência artificial</strong>, sem cartão e sem
                cobrança. Durante o teste o limite de 2 carteiras continua valendo,
                e ao fim dele nada é cobrado: a conta simplesmente volta a ser
                gratuita.
              </li>
              <li>
                <strong>Premium:</strong> carteiras ilimitadas e acesso à
                inteligência artificial enquanto a assinatura estiver válida.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 mt-8 text-lg font-semibold text-content">
              7. Preço, cobrança e renovação
            </h2>
            <ul className="list-disc space-y-1 pl-5 leading-relaxed text-content-2">
              <li>
                O plano Premium custa <strong>{PRECO_MENSAL} por mês</strong>, em reais.
              </li>
              <li>
                A cobrança é <strong>mensal e renovada automaticamente</strong> na
                mesma data de cada mês, até que você cancele. Não há fidelidade nem
                multa por cancelar.
              </li>
              <li>
                O pagamento é processado pela <strong>Stripe</strong>. Os dados do
                seu cartão são digitados no ambiente dela e{" "}
                <strong>não passam nem são armazenados pelo Norby</strong>.
              </li>
              <li>
                A data da próxima renovação fica visível em{" "}
                <em>Configurações → Plano</em>.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 mt-8 text-lg font-semibold text-content">
              8. Cancelamento
            </h2>
            <p className="leading-relaxed text-content-2">
              Você cancela sozinho, a qualquer momento, em{" "}
              <em>Configurações → Plano → Gerenciar assinatura</em>, sem precisar
              falar com ninguém e sem justificar. É o mesmo número de cliques que
              contratar, como manda o art. 5º do Decreto nº 7.962/2013. O
              cancelamento interrompe as cobranças seguintes e{" "}
              <strong>o acesso Premium continua até o fim do período que você já
              pagou</strong>. Se preferir, peça o cancelamento pelo e-mail da seção 2.
            </p>
          </section>

          <section>
            <h2 className="mb-3 mt-8 text-lg font-semibold text-content">
              9. Direito de arrependimento e reembolso
            </h2>
            <ul className="list-disc space-y-1 pl-5 leading-relaxed text-content-2">
              <li>
                <strong>7 dias para desistir, com devolução integral.</strong> Por
                ser uma contratação feita pela internet, o art. 49 do Código de
                Defesa do Consumidor garante que você desista em até 7 dias corridos
                a contar da contratação e receba de volta{" "}
                <strong>tudo o que pagou</strong>, sem precisar dar motivo.
              </li>
              <li>
                <strong>Como pedir:</strong> escreva para o e-mail da seção 2. O
                estorno é feito pela Stripe, no mesmo meio de pagamento usado na
                compra, e o prazo até o valor aparecer na fatura depende do seu
                banco ou da bandeira do cartão.
              </li>
              <li>
                <strong>Depois dos 7 dias</strong>, o cancelamento vale para as
                renovações futuras e não gera devolução do mês em curso, porque o
                acesso continua até o fim dele. Se uma renovação for cobrada depois
                de você ter pedido o cancelamento,{" "}
                <strong>essa cobrança é devolvida integralmente</strong>.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 mt-8 text-lg font-semibold text-content">
              10. O que acontece com seus dados ao cancelar
            </h2>
            <p className="leading-relaxed text-content-2">
              <strong>Cancelar não apaga nada.</strong> Sua conta volta a ser
              gratuita e todo o histórico continua lá. A inteligência artificial
              deixa de responder no vencimento; as carteiras que excedem o limite do
              plano gratuito seguem abertas por mais{" "}
              <strong>72 horas</strong> e, depois disso, ficam somente leitura, sem
              perder um lançamento sequer e continuando a contar nos seus totais.
              Voltando a assinar, tudo se reabre. Para apagar de verdade, use{" "}
              <em>Configurações → Excluir minha conta</em>, o que é irreversível.
            </p>
          </section>

          <section>
            <h2 className="mb-3 mt-8 text-lg font-semibold text-content">
              11. Limitação de responsabilidade
            </h2>
            <p className="leading-relaxed text-content-2">
              O serviço é fornecido "como está". Na máxima extensão permitida pela
              lei, o Norby não se responsabiliza por perdas decorrentes do uso da
              ferramenta ou de indisponibilidades temporárias. Nada aqui afasta os
              direitos que o Código de Defesa do Consumidor garante a você.
            </p>
          </section>

          <section>
            <h2 className="mb-3 mt-8 text-lg font-semibold text-content">
              12. Alterações nos termos e no preço
            </h2>
            <p className="leading-relaxed text-content-2">
              Estes termos podem ser atualizados, e mudanças relevantes serão
              comunicadas dentro do aplicativo. Um{" "}
              <strong>aumento de preço nunca se aplica sem aviso</strong>: ele é
              informado com pelo menos 30 dias de antecedência e passa a valer
              apenas nas renovações seguintes, para que você possa cancelar antes
              se não concordar.
            </p>
          </section>

          <section>
            <h2 className="mb-3 mt-8 text-lg font-semibold text-content">
              13. Contato
            </h2>
            <p className="leading-relaxed text-content-2">
              Dúvidas, cancelamento e reembolso pelo e-mail{" "}
              <a className="text-accent hover:underline" href={`mailto:${FORNECEDOR.email}`}>
                {FORNECEDOR.email}
              </a>
              .
            </p>
          </section>
        </article>
      </main>
    </div>
  );
}
