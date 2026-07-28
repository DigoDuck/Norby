import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authApi } from "../api/auth";
import { useAuthStore } from "@/store/authStore";
import { apiErrorMessage } from "@/lib/utils";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Eye, EyeOff } from "lucide-react";
import Aurora from "../components/Aurora";
import NorbyMark from "../components/shared/Logo";
import NorbyRing from "../components/shared/NorbyRing";

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "Mínimo de 8 caracteres"),
});

const registerSchema = loginSchema
  .extend({
    name: z.string().min(3, "Nome obrigatório"),
    // Alinha com a regra do backend: 8+ chars, ao menos uma letra e um número.
    password: z
      .string()
      .min(8, "Mínimo de 8 caracteres")
      .regex(/[A-Za-z]/, "Inclua ao menos uma letra")
      .regex(/\d/, "Inclua ao menos um número"),
    confirmPassword: z.string(),
    acceptedTerms: z.boolean().refine((v) => v === true, {
      message: "Você precisa aceitar os Termos e a Política de Privacidade",
    }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Senhas não coincidem",
    path: ["confirmPassword"],
  });

const inputCls =
  "bg-line/5 border-line/10 text-content placeholder:text-content-3 focus-visible:ring-focus";

export default function Auth() {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const schema = mode === "login" ? loginSchema : registerSchema;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema) });

  async function onSubmit(data) {
    setLoading(true);
    setError(null);
    try {
      const res =
        mode === "login"
          ? await authApi.login({ email: data.email, password: data.password })
          : await authApi.register({
              name: data.name,
              email: data.email,
              password: data.password,
              accept_privacy: data.acceptedTerms,
            });

      login(res.data.access_token, res.data.refresh_token, res.data.user);
      navigate("/dashboard");
    } catch (err) {
      if (!err.response) {
        setError("Não foi possível conectar ao servidor. Tente novamente em instantes.");
      } else if (err.response.status === 401) {
        setError("Email ou senha incorretos.");
      } else {
        setError(apiErrorMessage(err, "Algo deu errado. Tente novamente."));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-mesh relative flex min-h-screen w-full items-center justify-center overflow-x-hidden bg-bg-base p-4">
      {/* Aurora ambiente, sempre atrás da camada de contraste */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <Aurora
          colorStops={["#637AFA", "#A78BFA", "#22D3EE"]}
          amplitude={1}
          blend={0.6}
        />
        <div className="absolute inset-0 bg-bg-base/70" />
      </div>

      <div className="relative z-10 flex w-full max-w-5xl items-center justify-center gap-20">
        <NorbyRing
          size={280}
          className="hidden lg:block motion-safe:animate-[ring-float_11s_ease-in-out_infinite]"
        />

        <div className="w-full max-w-md py-6">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-fill text-accent-contrast">
              <NorbyMark size={30} color="currentColor" />
            </div>
            <h1 className="text-2xl font-bold text-content">Norby</h1>
            <p className="mt-1 text-sm text-content-2">seu norte financeiro</p>
          </div>

          {/* Card */}
          <div className="glass w-full max-w-md p-8">
            {/* Tabs */}
            <div className="mb-6 flex gap-1 rounded-full bg-line/5 p-1">
              {["login", "register"].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`flex-1 rounded-full py-2 text-sm font-medium transition-all ${
                    mode === m
                      ? "bg-accent-fill text-accent-contrast"
                      : "text-content-2 hover:text-content"
                  }`}
                >
                  {m === "login" ? "Entrar" : "Cadastrar"}
                </button>
              ))}
            </div>

            {/* Form */}
            <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
              {mode === "register" && (
                <div>
                  <Input placeholder="Seu nome" {...register("name")} className={inputCls} />
                  {errors.name && (
                    <p className="text-danger text-xs mt-1">{errors.name.message}</p>
                  )}
                </div>
              )}
              <div>
                <Input type="email" placeholder="Email" {...register("email")} className={inputCls} />
                {errors.email && (
                  <p className="text-danger text-xs mt-1">{errors.email.message}</p>
                )}
              </div>

              <div className="relative">
                <Input
                  type={showPass ? "text" : "password"}
                  placeholder="Senha"
                  {...register("password")}
                  className={`${inputCls} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-content-3 hover:text-content"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  <span className="sr-only">
                    {showPass ? "Ocultar senha" : "Mostrar senha"}
                  </span>
                </button>
                {errors.password && (
                  <p className="text-danger text-xs mt-1">{errors.password.message}</p>
                )}
              </div>

              {mode === "register" && (
                <div>
                  <Input
                    type="password"
                    placeholder="Confirmar Senha"
                    {...register("confirmPassword")}
                    className={inputCls}
                  />
                  {errors.confirmPassword && (
                    <p className="text-danger text-xs mt-1">
                      {errors.confirmPassword.message}
                    </p>
                  )}
                </div>
              )}

              {mode === "register" && (
                <div>
                  <label className="flex items-start gap-2 text-xs text-content-2">
                    <input
                      type="checkbox"
                      {...register("acceptedTerms")}
                      className="mt-0.5 accent-accent"
                    />
                    <span>
                      Li e aceito os{" "}
                      <Link to="/termos" target="_blank" className="text-accent hover:underline">
                        Termos de Uso
                      </Link>{" "}
                      e a{" "}
                      <Link
                        to="/privacidade"
                        target="_blank"
                        className="text-accent hover:underline"
                      >
                        Política de Privacidade
                      </Link>
                      .
                    </span>
                  </label>
                  {errors.acceptedTerms && (
                    <p className="text-danger text-xs mt-1">
                      {errors.acceptedTerms.message}
                    </p>
                  )}
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-danger/20 bg-danger/10 p-3 text-sm text-danger">
                  {error}
                </div>
              )}
              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-accent-fill text-accent-contrast hover:bg-accent-fill/90 font-medium"
              >
                {loading ? "Carregando..." : mode === "login" ? "Entrar" : "Criar Conta"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
