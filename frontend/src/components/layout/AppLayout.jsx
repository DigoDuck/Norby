import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { recurringApi } from "@/api/recurring";
import { accountApi } from "@/api/account";
import { useAuthStore } from "@/store/authStore";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";

export default function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const photoFor = useAuthStore((s) => s.photoFor);
  const setPhoto = useAuthStore((s) => s.setPhoto);

  // Materializa recorrências vencidas ao entrar na área autenticada.
  //
  // Aqui e não no App: o App roda o efeito de boot uma vez só, com deps vazias,
  // e quando o login acontece DENTRO da SPA ele não remonta — as recorrências
  // ficariam pendentes até um reload. O AppLayout, por estar atrás do
  // ProtectedRoute, monta nos dois caminhos: boot com token persistido e login
  // na sessão. Um ponto de chamada, as duas entradas cobertas.
  useEffect(() => {
    recurringApi.run().catch(() => {});
  }, []);

  // Baixa a foto de perfil UMA vez por versão (issue #35).
  //
  // Aqui pelo mesmo motivo das recorrências: é o ponto que monta tanto no boot
  // com token persistido quanto no login dentro da SPA. A rota é fechada, então
  // a foto não pode ser um `<img src>` — vem por axios com o token e vira data
  // URI no store, que o zustand persiste. `photoFor` é a versão que está em
  // mãos: igual à do usuário significa nada a fazer, e é o que impede um
  // download por montagem.
  const marca = user?.photo_updated_at ?? null;
  useEffect(() => {
    if (!marca) {
      if (photoFor) setPhoto(null, null); // foto removida em outro dispositivo
      return;
    }
    if (marca === photoFor) return;

    let vivo = true;
    accountApi
      .photo()
      .then(
        ({ data }) =>
          new Promise((resolve, reject) => {
            const leitor = new FileReader();
            leitor.onload = () => resolve(leitor.result);
            leitor.onerror = reject;
            leitor.readAsDataURL(data);
          }),
      )
      .then((dataUrl) => {
        if (vivo) setPhoto(dataUrl, marca);
      })
      // Falhar em baixar a foto não pode atrapalhar nada: a tela cai nas
      // iniciais, que é o mesmo estado de quem nunca enviou uma.
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [marca, photoFor, setPhoto]);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-bg-base app-mesh">
      <div className="relative z-10 flex h-screen p-0 lg:p-[18px]">
        <Sidebar />
        <MobileNav />

        <main className="flex-1 overflow-y-auto px-4 pt-16 pb-4 lg:px-6 lg:pt-5 lg:pb-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
