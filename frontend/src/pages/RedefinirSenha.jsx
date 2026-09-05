import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock } from "lucide-react";

import { authApi } from "@/api/auth";
import { resetSchema } from "@/lib/schemas";
import { apiErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CartaoAcesso from "@/components/shared/CartaoAcesso";

export default function RedefinirSenha() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();
  const [erro, setErro] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(resetSchema) });

  async function onSubmit({ password }) {
    setErro("");
    try {
      await authApi.resetPassword(token, password);
      // Sem login automático: a troca derruba TODAS as sessões no servidor, e
      // entrar sozinho aqui esconderia isso de quem precisa saber que os
      // outros aparelhos caíram. Entrar de novo é a confirmação de que a senha
      // nova funciona.
      navigate("/", { replace: true, state: { senhaRedefinida: true } });
    } catch (err) {
      setErro(
        apiErrorMessage(err, "Não foi possível redefinir. Peça um link novo e tente de novo."),
      );
    }
  }

  // Sem token na URL não há o que fazer, e o formulário só levaria a pessoa a
  // digitar uma senha para receber erro no envio.
  if (!token) {
    return (
      <CartaoAcesso
        titulo="Link incompleto"
        descricao="Este endereço não traz o código de redefinição. Abra o link direto do e-mail, sem copiar só um pedaço dele."
      >
        <Link
          to="/esqueci-senha"
          className="block text-center text-sm text-accent hover:underline"
        >
          Pedir um link novo
        </Link>
      </CartaoAcesso>
    );
  }

  return (
    <CartaoAcesso
      titulo="Criar uma nova senha"
      descricao="Ao salvar, todas as sessões abertas nos seus aparelhos serão encerradas."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="password" className="mb-2 block text-xs font-medium text-content-2">
            Nova senha
          </label>
          <div className="relative">
            <Lock
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-content-3"
            />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              className="pl-10"
              aria-invalid={errors.password ? "true" : undefined}
              aria-describedby={errors.password ? "password-error" : undefined}
              {...register("password")}
            />
          </div>
          {errors.password && (
            <p id="password-error" className="mt-1.5 text-xs text-danger">
              {errors.password.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="confirm" className="mb-2 block text-xs font-medium text-content-2">
            Repita a nova senha
          </label>
          <div className="relative">
            <Lock
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-content-3"
            />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              className="pl-10"
              aria-invalid={errors.confirm ? "true" : undefined}
              aria-describedby={errors.confirm ? "confirm-error" : undefined}
              {...register("confirm")}
            />
          </div>
          {errors.confirm && (
            <p id="confirm-error" className="mt-1.5 text-xs text-danger">
              {errors.confirm.message}
            </p>
          )}
        </div>

        {erro && (
          <p role="alert" className="text-xs text-danger">
            {erro}
          </p>
        )}

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-accent-fill font-medium text-accent-contrast hover:bg-accent-fill/90"
        >
          {isSubmitting ? "Salvando…" : "Salvar nova senha"}
        </Button>
      </form>
    </CartaoAcesso>
  );
}
