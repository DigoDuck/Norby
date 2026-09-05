import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail } from "lucide-react";

import { authApi } from "@/api/auth";
import { forgotSchema } from "@/lib/schemas";
import { apiErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CartaoAcesso from "@/components/shared/CartaoAcesso";

export default function EsqueciSenha() {
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(forgotSchema) });

  async function onSubmit({ email }) {
    setErro("");
    try {
      await authApi.forgotPassword(email);
      setEnviado(true);
    } catch (err) {
      // Só falha de rede ou 503 chegam aqui: a rota responde igual exista o
      // e-mail ou não, então não há erro "e-mail não encontrado" a mostrar.
      setErro(apiErrorMessage(err, "Não foi possível enviar agora. Tente de novo."));
    }
  }

  // A confirmação NÃO diz se a conta existe. Dizer "enviamos para você"
  // transformaria esta tela num verificador de quem tem conta no Norby, que é
  // a mesma enumeração que o backend evita respondendo sempre igual.
  if (enviado) {
    return (
      <CartaoAcesso
        titulo="Confira seu e-mail"
        descricao="Se este endereço tiver uma conta, o link de redefinição já está a caminho. Ele vale por 30 minutos e só pode ser usado uma vez."
      >
        <p className="text-center text-sm leading-relaxed text-content-3">
          Não chegou? Verifique a caixa de spam antes de pedir outro.
        </p>
      </CartaoAcesso>
    );
  }

  return (
    <CartaoAcesso
      titulo="Esqueceu a senha?"
      descricao="Informe o e-mail da sua conta e enviamos um link para você criar uma nova."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="mb-2 block text-xs font-medium text-content-2">
            E-mail
          </label>
          <div className="relative">
            <Mail
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-content-3"
            />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="voce@exemplo.com"
              className="pl-10"
              aria-invalid={errors.email ? "true" : undefined}
              aria-describedby={errors.email ? "email-error" : undefined}
              {...register("email")}
            />
          </div>
          {errors.email && (
            <p id="email-error" className="mt-1.5 text-xs text-danger">
              {errors.email.message}
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
          {isSubmitting ? "Enviando…" : "Enviar link"}
        </Button>
      </form>
    </CartaoAcesso>
  );
}
