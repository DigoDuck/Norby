import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authApi } from "../api/auth";
import { useAuthStore } from "@/store/authStore";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Eye, EyeOff } from "lucide-react";
import Aurora from "../components/Aurora";
import NorbyMark from "../components/shared/Logo";

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
  "bg-white/5 border-white/10 text-norby-ivory placeholder:text-norby-ivory/30 focus-visible:ring-norby-teal";

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
            });

      login(res.data.access_token, res.data.refresh_token, res.data.user);
      navigate("/dashboard");
    } catch (err) {
      if (!err.response) {
        setError("Não foi possível conectar ao servidor. Tente novamente em instantes.");
      } else if (err.response.status === 401) {
        setError("Email ou senha incorretos.");
      } else {
        setError(err.response.data?.detail || "Algo deu errado. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-norby-night flex items-center justify-center p-4">
      {/* Fundo Aurora teal */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <Aurora colorStops={["#2DB5A3", "#6FD4C6", "#156358"]} amplitude={1} blend={0.6} />
        <div className="absolute inset-0 bg-norby-night/70 backdrop-blur-[20px]" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-norby-teal mb-4 shadow-lg shadow-norby-teal/30">
            <NorbyMark size={30} color="#07100F" />
          </div>
          <h1 className="text-2xl font-bold text-norby-ivory">Norby</h1>
          <p className="text-norby-ivory/60 text-sm mt-1">seu norte financeiro</p>
        </div>

        {/* Card */}
        <div className="glass-card p-8">
          {/* Tabs */}
          <div className="flex gap-1 p-1 rounded-full bg-white/5 mb-6">
            {["login", "register"].map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2 rounded-full text-sm font-medium transition-all ${
                  mode === m
                    ? "bg-norby-teal text-norby-night"
                    : "text-norby-ivory/50 hover:text-norby-ivory"
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
                  <p className="text-norby-danger text-xs mt-1">{errors.name.message}</p>
                )}
              </div>
            )}
            <div>
              <Input type="email" placeholder="Email" {...register("email")} className={inputCls} />
              {errors.email && (
                <p className="text-norby-danger text-xs mt-1">{errors.email.message}</p>
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
                className="absolute right-3 top-1/2 -translate-y-1/2 text-norby-ivory/30 hover:text-norby-ivory/70"
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              {errors.password && (
                <p className="text-norby-danger text-xs mt-1">{errors.password.message}</p>
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
                  <p className="text-norby-danger text-xs mt-1">
                    {errors.confirmPassword.message}
                  </p>
                )}
              </div>
            )}

            {mode === "register" && (
              <div>
                <label className="flex items-start gap-2 text-xs text-norby-ivory/60">
                  <input
                    type="checkbox"
                    {...register("acceptedTerms")}
                    className="mt-0.5 accent-norby-teal"
                  />
                  <span>
                    Li e aceito os{" "}
                    <Link to="/termos" target="_blank" className="text-norby-teal hover:underline">
                      Termos de Uso
                    </Link>{" "}
                    e a{" "}
                    <Link to="/privacidade" target="_blank" className="text-norby-teal hover:underline">
                      Política de Privacidade
                    </Link>
                    .
                  </span>
                </label>
                {errors.acceptedTerms && (
                  <p className="text-norby-danger text-xs mt-1">{errors.acceptedTerms.message}</p>
                )}
              </div>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-norby-danger/10 border border-norby-danger/20 text-norby-danger text-sm">
                {error}
              </div>
            )}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-norby-teal hover:bg-norby-teal-soft text-norby-night font-medium shadow-lg shadow-norby-teal/30"
            >
              {loading ? "Carregando..." : mode === "login" ? "Entrar" : "Criar Conta"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
