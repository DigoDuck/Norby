import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authApi } from "../api/auth";
import { useAuthStore } from "@/store/authStore";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { MoonStar, Eye, EyeOff } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "Mínimo de 8 caracteres"),
});

const registerSchema = loginSchema
  .extend({
    name: z.string().min(3, "Nome obrigatório"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Senhas não coincidem",
    path: ["confirmPassword"],
  });

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
  } = useForm({
    resolver: zodResolver(schema),
  });

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

      login(res.data.access_token, res.data.user);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.detail || "Algo deu errado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[url('/bg_norby.png')] bg-cover bg-center bg-no-repeat flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-violet-900 mb-4 shadow-lg shadow-violet-900/30">
            <MoonStar size={28} className="text-white" />
          </div>
          <h1 className="text-2xl text-black">Norby</h1>
          <p className="text-black/80">
            Seu organizador financeiro inteligente
          </p>
        </div>
        {/* Card */}
        <div className="glass-card p-8">
          {/* Tabs */}
          <div className="flex gap-1 p-1 rounded-xl bg-black/15 mb-6">
            {["login", "register"].map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                  mode === m
                    ? "bg-violet-600 text-white shadow-sm"
                    : "text-white/60 hover:text-white/100"
                }`}
              >
                {m == "login" ? "Entrar" : "Cadastrar"}
              </button>
            ))}
          </div>
          {/* Form */}
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            {mode === "register" && (
              <div>
                <Input
                  placeholder="Seu nome"
                  {...register("name")}
                  className="bg-black/5 border-black/10 text-black placeholder:text-black/50 focus-visible:ring-violet-500 pr-10"
                />
                {errors.name && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.name.message}
                  </p>
                )}
              </div>
            )}
            <div>
              <Input
                type="email"
                placeholder="Email"
                {...register("email")}
                className="bg-black/5 border-black/10 text-black placeholder:text-black/50 focus-visible:ring-violet-500 pr-10"
              />
              {errors.email && (
                <p className="text-red-500 text-xs mt-1">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="relative">
              <Input
                type={showPass ? "text" : "password"}
                placeholder="Senha"
                {...register("password")}
                className="bg-black/5 border-black/10 text-black placeholder:text-black/50 focus-visible:ring-violet-500 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-black/30 hover:text-black/60"
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              {errors.password && (
                <p className="text-red-500 text-xs mt-1">
                  {errors.password.message}
                </p>
              )}
            </div>

            {mode === "register" && (
              <div>
                <Input
                  type="password"
                  placeholder="Confirmar Senha"
                  {...register("confirmPassword")}
                  className="bg-black/5 border-black/10 text-black placeholder:text-black/50 focus-visible:ring-violet-500 pr-10"
                />
                {errors.confirmPassword && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.confirmPassword.message}
                  </p>
                )}
              </div>
            )}

            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
                {error}
              </div>
            )}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-violet-600 hover:bg-violet-500 text-black font-medium shadow-lg shadow-violet-600/30"
            >
              {loading
                ? "Caregando..."
                : mode === "login"
                  ? "Entrar"
                  : "Criar Conta"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
