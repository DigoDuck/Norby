import { Children, cloneElement, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authApi } from "../api/auth";
import { useAuthStore } from "@/store/authStore";
import { apiErrorMessage } from "@/lib/utils";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LineChart,
  Lock,
  Mail,
  PieChart,
  ShieldCheck,
  User,
} from "lucide-react";
import NorbyMark from "../components/shared/Logo";
import NorthStar from "../components/shared/NorthStar";
import HeroRing from "../components/shared/HeroRing";

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
      .regex(/\d/, "Inclua ao menos um número")
      .refine(
        (value) => new TextEncoder().encode(value).length <= 72,
        "A senha deve ter no máximo 72 bytes (acentos contam 2)",
      ),
    confirmPassword: z.string(),
    acceptedTerms: z.boolean().refine((v) => v === true, {
      message: "Você precisa aceitar os Termos e a Política de Privacidade",
    }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Senhas não coincidem",
    path: ["confirmPassword"],
  });

// Visual próprio da tela de entrada (mais alto e arredondado que o dos
// formulários internos), por isso não usa o shadcnInputCls compartilhado.
const authInputCls =
  "h-14 rounded-2xl pl-12 bg-surface/60 border-line/10 text-content placeholder:text-content-3 focus-visible:ring-focus";

const benefits = [
  {
    icon: PieChart,
    title: "Visão completa das suas finanças",
    desc: "Tudo o que você precisa em um só lugar.",
  },
  {
    icon: LineChart,
    title: "Insights inteligentes com IA",
    desc: "Recomendações personalizadas para você.",
  },
  {
    icon: ShieldCheck,
    title: "Segurança e privacidade",
    desc: "Conexão criptografada e senha guardada só como hash.",
  },
];

// Campo com rótulo acessível e ícone decorativo à esquerda.
function Field({ id, label, icon, error, children }) {
  // Variável, não desestruturação no parâmetro: o varsIgnorePattern '^[A-Z_]'
  // do eslint.config.js só perdoa variáveis, e sem eslint-plugin-react o uso
  // em JSX não conta como uso. Mesmo idioma do Sidebar.
  const Icon = icon;
  const errorId = `${id}-error`;

  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="relative">
        <Icon
          size={18}
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-content-3"
        />
        {Children.map(children, (child, index) =>
          index === 0
            ? cloneElement(child, {
                id,
                "aria-invalid": error ? "true" : undefined,
                "aria-describedby": error ? errorId : undefined,
              })
            : child,
        )}
      </div>
      {error && (
        <p id={errorId} className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export default function Auth() {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
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
    <div className="app-mesh relative min-h-screen w-full overflow-x-hidden bg-bg-base">
      {/* Marca no topo. Só no desktop amplo: abaixo de xl o card já traz o tile, e
          repetir a marca em duas alturas numa tela estreita é ruído. */}
      <header className="absolute left-8 top-8 z-10 hidden items-center gap-3 xl:flex">
        <div className="brand-tile h-11 w-11">
          <NorbyMark size={24} color="currentColor" />
        </div>
        <div>
          <p className="text-lg font-bold leading-none text-content">Norby</p>
          <p className="mt-1 text-xs text-content-2">Seu norte financeiro</p>
        </div>
      </header>

      <main className="flex min-h-screen w-full items-center">
        <div className="auth-layout mx-auto grid w-full max-w-[100rem] items-center gap-12 px-6 py-12 xl:grid-cols-[minmax(0,22rem)_minmax(18rem,1fr)_minmax(0,30rem)] xl:gap-6 xl:py-16 2xl:grid-cols-[minmax(0,28rem)_minmax(24rem,1fr)_minmax(0,34rem)] 2xl:px-10">
        {/* Proposta de valor. Abaixo de xl desce para baixo do card: quem volta
            para entrar quer o formulário primeiro, não o argumento de venda. */}
        <section className="auth-copy relative z-10 order-2 xl:order-1">
          <div>
            <p className="control-raised inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-content">
              <NorthStar size={15} className="text-accent" />
              IA que entende suas finanças
            </p>

            {/* A ênfase de "pessoal" é cor sólida, não gradiente: gradient text é
                ban do DESIGN.md e some no modo de alto contraste do Windows. */}
            {/* O corpo maior só entra em 2xl. Em xl a coluna tem 352px e
                "financeiro pessoal" a 43,2px pede ~380px, então quebrava em
                três linhas e deixava "pessoal" órfã numa linha só. */}
            <h1 className="mt-7 text-balance text-4xl font-bold leading-[1.12] tracking-tight text-content 2xl:text-[2.7rem]">
              Seu assistente financeiro <span className="text-accent">pessoal</span>
            </h1>

            <p className="mt-5 max-w-md text-pretty text-base leading-relaxed text-content-2">
              Planeje, acompanhe e tome decisões melhores com insights inteligentes
              e total clareza.
            </p>
          </div>

          <ul className="mt-10 space-y-6">
            {benefits.map((b) => {
              const Icon = b.icon;
              return (
                <li key={b.title} className="flex items-start gap-4">
                  {/* Tile neutro com o ícone em azure: o princípio "um brilho só"
                      do PRODUCT.md reserva a cor para ação e seleção, então três
                      tintas decorativas aqui competiriam com o CTA. */}
                  <span className="control-raised grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-accent">
                    <Icon size={19} aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-content">{b.title}</span>
                    <span className="mt-0.5 block text-sm text-content-2">{b.desc}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Cena: anel + pódio + painéis de dashboard ao fundo. Puramente
            decorativa, e por isso inteira em aria-hidden — os valores são de
            exemplo e não podem ser anunciados como saldo de ninguém. */}
        <div
          aria-hidden="true"
          className="relative z-0 order-3 hidden h-[32rem] xl:order-2 xl:block"
        >
          <div className="ghost-panel absolute right-0 top-[6%] w-48 p-4 opacity-75">
            <p className="text-xs text-content-3">Saldo total</p>
            <p className="mt-1.5 text-xl font-bold tnum text-content-2">
              R$ 8.822,<span className="text-sm">00</span>
            </p>
            <p className="mt-1.5 text-[11px] text-content-3">↑ 13,1% vs. mês passado</p>
          </div>

          <div className="ghost-panel absolute right-0 top-[50%] w-44 p-4 opacity-75">
            <p className="text-xs text-content-3">Receitas</p>
            <p className="mt-1.5 text-lg font-bold tnum text-content-2">R$ 1.200,00</p>
            <div className="mt-2.5 h-1.5 w-2/3 rounded-full bg-income/40" />
          </div>

          {/* O palco cria o apoio óptico visto na referência sem introduzir
              outra camada de backdrop-filter. */}
          {/* Largura fixa em 22rem: o 2xl:w-[26rem] levava o anel a 416px numa
              coluna de 416px em 1536, sem deixar nada para o painel ao lado, e
              o "Receitas" saía cortado. Em telas maiores o scale do
              .auth-layout já amplia a peça. */}
          <div className="auth-ring-stage absolute left-[29%] top-1/2 w-[22rem] -translate-x-1/2 -translate-y-1/2">
            <HeroRing className="hero-ring--inline" />
          </div>
        </div>

        {/* Card de acesso */}
        <div className="relative z-10 order-1 w-full max-w-[34rem] justify-self-center xl:order-3">
          <div className="glass w-full p-8 sm:p-10">
            <div className="text-center">
              {/* mx-auto, não inline-grid: .brand-tile aplica display:grid e
                  vence o inline, então o text-center do pai não centralizaria. */}
              <div className="brand-tile mx-auto h-16 w-16">
                <NorbyMark size={34} color="currentColor" />
              </div>
              <h2 className="mt-5 text-2xl font-bold text-content">Norby</h2>
              <p className="mt-1 text-sm text-content-2">Seu norte financeiro</p>

              <div className="my-6 flex items-center gap-3">
                <span className="h-px flex-1 bg-line/10" />
                <NorthStar size={13} className="text-accent/70" />
                <span className="h-px flex-1 bg-line/10" />
              </div>

              <p className="text-pretty text-sm leading-relaxed text-content-2">
                {mode === "login"
                  ? "Acesse sua conta e acompanhe suas finanças com clareza."
                  : "Crie sua conta e comece a organizar suas finanças hoje."}
              </p>
            </div>

            {/* Alternância de modo: são botões pressionáveis, não abas com
                painéis navegáveis por teclado. */}
            <div
              role="group"
              aria-label="Entrar ou cadastrar"
              className="mt-7 flex gap-1 rounded-full bg-line/[0.06] p-1"
            >
              {["login", "register"].map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                  className={`flex-1 rounded-full py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-focus-offset ${
                    mode === m
                      ? // A aba já selecionada não ganha hover: clicar nela não
                        // faz nada, e prometer resposta seria mentira.
                        "auth-mode-active text-accent-contrast"
                      : "text-content-2 hover:bg-state/[0.05] hover:text-content"
                  }`}
                >
                  {m === "login" ? "Entrar" : "Cadastrar"}
                </button>
              ))}
            </div>

            <form className="mt-5 space-y-3" onSubmit={handleSubmit(onSubmit)}>
              {mode === "register" && (
                <Field
                  id="auth-name"
                  label="Seu nome"
                  icon={User}
                  error={errors.name?.message}
                >
                  <Input placeholder="Seu nome" {...register("name")} className={authInputCls} />
                </Field>
              )}

              <Field
                id="auth-email"
                label="Email"
                icon={Mail}
                error={errors.email?.message}
              >
                <Input
                  type="email"
                  placeholder="Email"
                  autoComplete="email"
                  {...register("email")}
                  className={authInputCls}
                />
              </Field>

              <Field
                id="auth-password"
                label="Senha"
                icon={Lock}
                error={errors.password?.message}
              >
                <Input
                  type={showPass ? "text" : "password"}
                  placeholder="Senha"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  {...register("password")}
                  className={`${authInputCls} pr-12`}
                />
                <button
                  type="button"
                  aria-controls="auth-password"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 rounded-md text-content-3 transition-colors hover:text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  <span className="sr-only">
                    {showPass ? "Ocultar senha" : "Mostrar senha"}
                  </span>
                </button>
              </Field>

              {mode === "register" && (
                <Field
                  id="auth-confirm-password"
                  label="Confirmar senha"
                  icon={Lock}
                  error={errors.confirmPassword?.message}
                >
                  <Input
                    type="password"
                    placeholder="Confirmar senha"
                    autoComplete="new-password"
                    {...register("confirmPassword")}
                    className={authInputCls}
                  />
                </Field>
              )}

              {/* Deixou de ser "em breve" com o #36: /auth/forgot-password
                  existe. O botão desabilitado e o chip saíram junto — rótulo de
                  estado que não corresponde mais ao estado é pior que nenhum. */}
              {mode === "login" && (
                <div className="flex justify-end pt-0.5">
                  <Link
                    to="/esqueci-senha"
                    className="text-sm text-accent hover:underline"
                  >
                    Esqueceu a senha?
                  </Link>
                </div>
              )}

              {mode === "register" && (
                <div>
                  <label className="flex items-start gap-2 text-xs text-content-2">
                    <input
                      id="auth-accepted-terms"
                      type="checkbox"
                      {...register("acceptedTerms")}
                      aria-invalid={errors.acceptedTerms ? "true" : undefined}
                      aria-describedby={
                        errors.acceptedTerms ? "auth-accepted-terms-error" : undefined
                      }
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
                    <p
                      id="auth-accepted-terms-error"
                      className="mt-1.5 text-xs text-danger"
                    >
                      {errors.acceptedTerms.message}
                    </p>
                  )}
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-danger/20 bg-danger/10 p-3 text-sm text-danger"
                >
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="hero-cta h-14 w-full justify-between px-6 text-base font-semibold"
              >
                {loading ? (
                  <>
                    <NorthStar size={18} className="star-loading" />
                    <span>{mode === "login" ? "Entrando..." : "Criando conta..."}</span>
                    <span className="w-[18px]" />
                  </>
                ) : (
                  <>
                    <span className="w-[18px]" />
                    <span>{mode === "login" ? "Entrar" : "Criar conta"}</span>
                    <ArrowRight size={18} aria-hidden="true" />
                  </>
                )}
              </Button>
            </form>

            <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-content-2">
              <ShieldCheck size={15} aria-hidden="true" className="shrink-0 text-accent" />
              Conexão criptografada e senha guardada só como hash.
            </p>
          </div>
        </div>
        </div>
      </main>
    </div>
  );
}
