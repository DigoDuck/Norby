import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

// Rascunho de portfólio — não substitui revisão jurídica.
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
            Última atualização: 29/06/2026
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
              <li><strong>Técnicos:</strong> dados mínimos de sessão (tokens de autenticação) necessários para manter você conectado.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 mt-8 text-lg font-semibold text-content">
              3. Finalidade e base legal
            </h2>
            <p className="leading-relaxed text-content-2">Tratamos seus dados com as seguintes bases legais (art. 7º da LGPD):</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 leading-relaxed text-content-2">
              <li><strong>Execução de contrato (art. 7º, V):</strong> cadastro, autenticação e funcionamento do organizador financeiro — sem esses dados o serviço não existe.</li>
              <li><strong>Consentimento (art. 7º, I):</strong> envio dos seus dados financeiros ao provedor de IA (Google Gemini) para gerar insights e responder no chat. Você pode deixar de usar os recursos de IA a qualquer momento.</li>
              <li><strong>Cumprimento de obrigação legal/regulatória (art. 7º, II):</strong> quando aplicável, para atender determinações legais.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 mt-8 text-lg font-semibold text-content">
              4. Compartilhamento
            </h2>
            <p className="leading-relaxed text-content-2">
              Não vendemos seus dados. Eles são compartilhados apenas com
              provedores necessários ao funcionamento do serviço, como a
              infraestrutura de hospedagem e o provedor de IA (Google Gemini),
              estritamente para as finalidades acima.
            </p>
          </section>

          <section>
            <h2 className="mb-3 mt-8 text-lg font-semibold text-content">
              5. Seus direitos
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
              6. Retenção
            </h2>
            <p className="leading-relaxed text-content-2">
              Seus dados são mantidos enquanto sua conta existir. Ao excluir a
              conta, eles são apagados de forma definitiva e não podem ser
              recuperados.
            </p>
          </section>

          <section>
            <h2 className="mb-3 mt-8 text-lg font-semibold text-content">
              7. Contato
            </h2>
            <p className="leading-relaxed text-content-2">
              Para exercer seus direitos ou tirar dúvidas sobre privacidade, fale
              com o controlador pelo e-mail{" "}
              <a className="text-accent hover:underline" href="mailto:privacidade@norby.app">
                privacidade@norby.app
              </a>
              .
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
