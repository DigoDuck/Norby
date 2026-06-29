import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

// Rascunho de portfólio — não substitui revisão jurídica.
export default function Privacidade() {
  return (
    <div className="min-h-screen bg-norby-night text-norby-ivory">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-norby-teal hover:underline mb-8"
        >
          <ArrowLeft size={16} /> Voltar
        </Link>

        <h1 className="text-3xl font-bold tracking-tight">Política de Privacidade</h1>
        <p className="text-norby-ivory/50 text-sm mt-2">
          Última atualização: 29/06/2026
        </p>

        <div className="prose-norby mt-8 space-y-6 text-norby-ivory/80 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-norby-ivory">1. Quem somos</h2>
            <p>
              O Norby é um organizador financeiro pessoal com apoio de IA. Esta
              política explica quais dados coletamos, com qual finalidade e quais
              são os seus direitos como titular, conforme a Lei Geral de Proteção
              de Dados (LGPD — Lei nº 13.709/2018).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-norby-ivory">2. Dados que coletamos</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Cadastro:</strong> nome, e-mail e senha (armazenada apenas como hash bcrypt — nunca em texto puro).</li>
              <li><strong>Financeiros:</strong> carteiras, transações, transações recorrentes e metas que você registra.</li>
              <li><strong>Interações com a IA:</strong> mensagens enviadas ao assistente e os insights gerados a partir dos seus dados financeiros.</li>
              <li><strong>Técnicos:</strong> dados mínimos de sessão (tokens de autenticação) necessários para manter você conectado.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-norby-ivory">3. Finalidade e base legal</h2>
            <p>Tratamos seus dados com as seguintes bases legais (art. 7º da LGPD):</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Execução de contrato (art. 7º, V):</strong> cadastro, autenticação e funcionamento do organizador financeiro — sem esses dados o serviço não existe.</li>
              <li><strong>Consentimento (art. 7º, I):</strong> envio dos seus dados financeiros ao provedor de IA (Google Gemini) para gerar insights e responder no chat. Você pode deixar de usar os recursos de IA a qualquer momento.</li>
              <li><strong>Cumprimento de obrigação legal/regulatória (art. 7º, II):</strong> quando aplicável, para atender determinações legais.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-norby-ivory">4. Compartilhamento</h2>
            <p>
              Não vendemos seus dados. Eles são compartilhados apenas com
              provedores necessários ao funcionamento do serviço, como a
              infraestrutura de hospedagem e o provedor de IA (Google Gemini),
              estritamente para as finalidades acima.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-norby-ivory">5. Seus direitos</h2>
            <p>A LGPD garante a você, entre outros direitos:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Acesso e portabilidade:</strong> exporte uma cópia completa dos seus dados em <em>Configurações → Privacidade e dados → Exportar meus dados</em>.</li>
              <li><strong>Exclusão:</strong> apague definitivamente sua conta e todos os dados em <em>Configurações → Excluir minha conta</em>. A remoção é real, nos bancos PostgreSQL e MongoDB.</li>
              <li><strong>Correção:</strong> atualize seu nome e e-mail em <em>Configurações → Perfil</em>.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-norby-ivory">6. Retenção</h2>
            <p>
              Seus dados são mantidos enquanto sua conta existir. Ao excluir a
              conta, eles são apagados de forma definitiva e não podem ser
              recuperados.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-norby-ivory">7. Contato</h2>
            <p>
              Para exercer seus direitos ou tirar dúvidas sobre privacidade, fale
              com o controlador pelo e-mail{" "}
              <a className="text-norby-teal hover:underline" href="mailto:privacidade@norby.app">
                privacidade@norby.app
              </a>
              .
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
