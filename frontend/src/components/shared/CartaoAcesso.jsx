import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import NorbyMark from "@/components/shared/Logo";

/**
 * Moldura das telas de acesso que não são o login (issue #36).
 *
 * Existe compartilhada porque "esqueci a senha" e "redefinir senha" são o mesmo
 * momento partido em dois, com um e-mail no meio: se as duas telas não forem
 * idênticas, a segunda parece de outro site — exatamente a desconfiança que
 * não se pode provocar em quem acabou de clicar num link recebido por e-mail.
 *
 * Não reaproveita o card do `Auth.jsx` de propósito: aquele carrega o anel, o
 * painel lateral e as abas de login/cadastro, e nada disso serve aqui.
 */
export default function CartaoAcesso({ titulo, descricao, children }) {
  return (
    <div className="app-mesh flex min-h-screen items-center justify-center bg-bg-base px-4 py-10 text-content">
      <main className="w-full max-w-md">
        <div className="glass p-8 sm:p-10">
          <div className="text-center">
            <div className="brand-tile mx-auto h-14 w-14">
              <NorbyMark size={30} color="currentColor" />
            </div>
            <h1 className="mt-5 text-xl font-bold text-content">{titulo}</h1>
            <p className="mt-2 text-pretty text-sm leading-relaxed text-content-2">
              {descricao}
            </p>
          </div>

          <div className="mt-7">{children}</div>
        </div>

        <div className="mt-6 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-content-2 hover:text-content"
          >
            <ArrowLeft size={15} /> Voltar para o login
          </Link>
        </div>
      </main>
    </div>
  );
}
