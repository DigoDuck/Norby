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

// Campo com ícone à esquerda. O ícone é decorativo — o placeholder já nomeia o
// campo — então fica aria-hidden para não duplicar o rótulo no leitor de tela.
function Field({ icon, error, children }) {
  // Variável, não desestruturação no parâmetro: o varsIgnorePattern '^[A-Z_]'
  // do eslint.config.js só perdoa variáveis, e sem eslint-plugin-react o uso
  // em JSX não conta como uso. Mesmo idioma do Sidebar.
  const Icon = icon;
  return (
    <div>
      <div className="relative">
        <Icon
          size={18}
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-content-3"
        />
        {children}
      </div>
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
}

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
    <div className="app-mesh relative min-h-screen w-full overflow-x-hidden bg-bg-base">
      {/* Marca no topo. Só no desktop: abaixo de lg o card já traz o tile, e
          repetir a marca em duas alturas numa tela estreita é ruído. */}
      <header className="absolute left-8 top-8 z-10 hidden items-center gap-3 lg:flex">
        <div className="brand-tile h-11 w-11">
          <NorbyMark size={24} color="currentColor" />
        </div>
        <div>
          <p className="text-lg font-bold leading-none text-content">Norby</p>
          <p className="mt-1 text-xs text-content-2">Seu norte financeiro</p>
        </div>
      </header>

      {/* max-w-[92rem]: com 86rem a coluna do meio ficava em 368px e o anel
          sozinho já media 352px, então painel e anel não cabiam lado a lado e
          um cortava o outro. As três larguras saem dessa conta, não do olho. */}
      <main className="mx-auto grid min-h-screen w-full max-w-[92rem] items-center gap-12 px-6 py-12 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)_27rem] lg:gap-6 lg:px-10 lg:py-16">
        {/* Proposta de valor. Abaixo de lg desce para baixo do card: quem volta
            para entrar quer o formulário primeiro, não o argumento de venda. */}
        <section className="order-2 lg:order-1">
          <p className="control-raised inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-content">
            <NorthStar size={15} className="text-accent" />
            IA que entende suas finanças
          </p>

          {/* A ênfase de "pessoal" é cor sólida, não gradiente: gradient text é
              ban do DESIGN.md e some no modo de alto contraste do Windows. */}
          <h1 className="mt-7 text-balance text-4xl font-bold leading-[1.12] tracking-tight text-content xl:text-[2.7rem]">
            Seu assistente financeiro <span className="text-accent">pessoal</span>
          </h1>

          <p className="mt-5 max-w-md text-pretty text-base leading-relaxed text-content-2">
            Planeje, acompanhe e tome decisões melhores com insights inteligentes
            e total clareza.
          </p>

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
          className="relative order-3 hidden h-[32rem] lg:order-2 lg:block"
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

          {/* Contêiner posicionado em vez de posicionar o próprio anel: a regra
              .hero-ring.hero-ring--inline tem duas classes e venceria o
              `absolute`/`w-*` do Tailwind, que valem uma.
              Sem pódio: o toro não tem base no asset, e a cáustica do HeroRing
              já apoia a peça. Um cilindro em CSS ficava invisível nos dois
              temas (a cor sai de --surface, que é o próprio fundo). */}
          <div className="absolute left-[29%] top-1/2 w-[18rem] -translate-x-1/2 -translate-y-1/2">
            <HeroRing className="hero-ring--inline" />
          </div>
        </div>

        {/* Card de acesso */}
        <div className="order-1 w-full justify-self-center lg:order-3">
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

            {/* Abas. A seleção usa .nav-active, a mesma pílula de vidro do item
                ativo da sidebar — repetir aqui o gradiente do CTA deixaria dois
                botões idênticos no card e o olho não saberia qual é a ação. */}
            <div
              role="tablist"
              aria-label="Entrar ou cadastrar"
              className="mt-7 flex gap-1 rounded-full bg-line/[0.06] p-1"
            >
              {["login", "register"].map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={`flex-1 rounded-full py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-focus-offset ${
                    mode === m
                      ? "nav-active text-accent dark:text-content"
                      : "text-content-2 hover:text-content"
                  }`}
                >
                  {m === "login" ? "Entrar" : "Cadastrar"}
                </button>
              ))}
            </div>

            <form className="mt-5 space-y-3" onSubmit={handleSubmit(onSubmit)}>
              {mode === "register" && (
                <Field icon={User} error={errors.name?.message}>
                  <Input placeholder="Seu nome" {...register("name")} className={inputCls} />
                </Field>
              )}

              <Field icon={Mail} error={errors.email?.message}>
                <Input
                  type="email"
                  placeholder="Email"
                  autoComplete="email"
                  {...register("email")}
                  className={inputCls}
                />
              </Field>

              <Field icon={Lock} error={errors.password?.message}>
                <Input
                  type={showPass ? "text" : "password"}
                  placeholder="Senha"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  {...register("password")}
                  className={`${inputCls} pr-12`}
                />
                <button
                  type="button"
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
                <Field icon={Lock} error={errors.confirmPassword?.message}>
                  <Input
                    type="password"
                    placeholder="Confirmar senha"
                    autoComplete="new-password"
                    {...register("confirmPassword")}
                    className={inputCls}
                  />
                </Field>
              )}

              {/* Recuperação de senha ainda não tem rota no backend (/auth expõe
                  register, login, refresh, logout, me e me/export). Fica
                  desabilitada com o aviso visível ao lado: um link morto que
                  não leva a lugar nenhum seria pior do que assumir a lacuna. */}
              {mode === "login" && (
                <div className="flex items-center justify-end gap-2 pt-0.5">
                  <button
                    type="button"
                    disabled
                    aria-describedby="reset-status"
                    className="text-sm text-content-3"
                  >
                    Esqueceu a senha?
                  </button>
                  {/* .chip-neutral já é o rótulo de estado do projeto. O 11px
                      com --content-3 que eu tinha usado media 4,16:1 no tema
                      claro, abaixo do mínimo de 4,5:1 para texto normal. */}
                  <span id="reset-status" className="chip-neutral">
                    em breve
                  </span>
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
                    <p className="mt-1.5 text-xs text-danger">
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
      </main>
    </div>
  );
}
