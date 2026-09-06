import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function Privacidade() {
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
            Política de Privacidade
          </h1>
          <p className="mt-2 text-sm text-content-3">
            Última atualização: 05/09/2026
          </p>

          <section>
            <h2 className="mb-3 mt-8 text-lg font-semibold text-content">
              1. Quem somos
            </h2>
            <p className="leading-relaxed text-content-2">
              O Norby é um organizador financeiro pessoal com apoio de IA. Esta
              política explica quais dados coletamos, com qual finalidade e quais
              são os seus direitos como titular, conforme a Lei Geral de Proteção
              de Dados (LGPD — Lei nº 13.709/2018).
            </p>
          </section>

          <section>
            <h2 className="mb-3 mt-8 text-lg font-semibold text-content">
              2. Dados que coletamos
            </h2>
            <ul className="list-disc space-y-1 pl-5 leading-relaxed text-content-2">
              <li><strong>Cadastro:</strong> nome, e-mail e senha (armazenada apenas como hash bcrypt — nunca em texto puro).</li>
              <li><strong>Financeiros:</strong> carteiras, transações, transações recorrentes e metas que você registra.</li>
              <li><strong>Interações com a IA:</strong> mensagens enviadas ao assistente e os insights gerados a partir dos seus dados financeiros.</li>
              <li><strong>Assinatura:</strong> apenas identificadores e datas, detalhados na seção 5. <strong>Nenhum dado de cartão.</strong></li>
              <li><strong>Técnicos:</strong> dados mínimos de sessão (tokens de autenticação) necessários para manter você conectado.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 mt-8 text-lg font-semibold text-content">
              3. Finalidade e base legal
            </h2>
            <p className="leading-relaxed text-content-2">Tratamos seus dados com as seguintes bases legais (art. 7º da LGPD):</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 leading-relaxed text-content-2">
              <li><strong>Execução de contrato (art. 7º, V):</strong> cadastro, autenticação e funcionamento do organizador financeiro — sem esses dados o serviço não existe. Também é a base do plano pago: sem os identificadores da seção 5 não há como saber que a assinatura está válida.</li>
              <li><strong>Consentimento (art. 7º, I):</strong> envio dos seus dados financeiros ao provedor de IA (Google Gemini) para gerar insights e responder no chat. Você pode deixar de usar os recursos de IA a qualquer momento. Nas condições atuais do serviço do Google, o conteúdo enviado à IA pode ser usado por ele para aprimorar seus produtos.</li>
              <li><strong>Cumprimento de obrigação legal/regulatória (art. 7º, II):</strong> quando aplicável, para atender determinações legais.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 mt-8 text-lg font-semibold text-content">
              4. Compartilhamento e transferência internacional
            </h2>
            <p className="leading-relaxed text-content-2">
              Não vendemos seus dados. Eles são compartilhados apenas com
              provedores necessários ao funcionamento do serviço, na condição de
              operadores e estritamente para as finalidades acima: a infraestrutura
              de hospedagem, o provedor de IA (Google Gemini) e, se você assinar, a{" "}
              <strong>Stripe</strong> para processar o pagamento. Esses provedores
              ficam fora do Brasil, então há transferência internacional de dados,
              feita nos termos do art. 33 da LGPD e limitada ao necessário para
              prestar o serviço.
            </p>
          </section>

          <section>
            <h2 className="mb-3 mt-8 text-lg font-semibold text-content">
              5. Pagamento e assinatura
            </h2>
            <p className="leading-relaxed text-content-2">
              O pagamento acontece inteiramente dentro da Stripe. Os dados do seu
              cartão são digitados no ambiente dela e{" "}
              <strong>nunca chegam aos servidores do Norby</strong>: não os
              recebemos, não os armazenamos e não temos como vê-los. O que fica
              guardado aqui é o mínimo para saber que sua assinatura está válida:
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 leading-relaxed text-content-2">
              <li>o identificador do seu cadastro na Stripe e o da assinatura;</li>
              <li>a data até quando o acesso Premium vale;</li>
              <li>a data do último aviso recebido da Stripe, usada para não aplicar avisos fora de ordem.</li>
            </ul>
            <p className="mt-3 leading-relaxed text-content-2">
              Dos avisos que a Stripe envia guardamos <strong>somente esses
              campos</strong>, nunca a mensagem original. É uma escolha de projeto,
              não um detalhe técnico: a mensagem original carrega dados como o
              e-mail usado na compra, e guardá-la deixaria informação sua fora do
              alcance do botão de excluir a conta. O histórico completo dos
              pagamentos fica com a Stripe, sujeito à política de privacidade dela.
            </p>
          </section>

          <section>
            <h2 className="mb-3 mt-8 text-lg font-semibold text-content">
              6. Seus direitos
            </h2>
            <p className="leading-relaxed text-content-2">A LGPD garante a você, entre outros direitos:</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 leading-relaxed text-content-2">
              <li><strong>Acesso e portabilidade:</strong> exporte uma cópia completa dos seus dados em <em>Configurações → Privacidade e dados → Exportar meus dados</em>.</li>
              <li><strong>Exclusão:</strong> apague definitivamente sua conta e todos os dados em <em>Configurações → Excluir minha conta</em>. A remoção é real, nos bancos PostgreSQL e MongoDB.</li>
              <li><strong>Correção:</strong> atualize seu nome e e-mail em <em>Configurações → Perfil</em>.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 mt-8 text-lg font-semibold text-content">
              7. Retenção
            </h2>
            <p className="leading-relaxed text-content-2">
              Seus dados são mantidos enquanto sua conta existir. Ao excluir a
              conta, eles são apagados de forma definitiva e não podem ser
              recuperados. Excluir a conta apaga o que está do nosso lado, incluindo
              os identificadores da seção 5; o registro dos pagamentos já feitos
              permanece com a Stripe pelo prazo que a legislação fiscal e financeira
              exige dela, o que está fora do nosso controle.
            </p>
          </section>

          <section>
            <h2 className="mb-3 mt-8 text-lg font-semibold text-content">
              8. Contato
            </h2>
            <p className="leading-relaxed text-content-2">
              Para exercer seus direitos ou tirar dúvidas sobre privacidade, fale
              com o controlador pelo e-mail{" "}
              <a className="text-accent hover:underline" href="mailto:privacidade@norby.com.br">
                privacidade@norby.com.br
              </a>
              . Sobre cobrança, cancelamento e reembolso, veja os{" "}
              <Link to="/termos" className="text-accent hover:underline">
                Termos de Uso
              </Link>
              .
            </p>
          </section>
        </article>
      </main>
    </div>
  );
}
