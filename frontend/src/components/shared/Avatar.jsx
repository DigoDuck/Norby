import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";

/**
 * Foto de perfil, com a inicial do nome como fallback (issue #35).
 *
 * A foto vem do store como data URI, e não de uma `<img src="/auth/me/photo">`:
 * a rota exige token e `<img>` não manda header de autorização. Quem baixa é o
 * AppLayout, uma vez por mudança de `photo_updated_at`.
 *
 * `alt=""` é deliberado: nos dois lugares onde este componente aparece o nome
 * está escrito ao lado, então descrever a imagem faria o leitor de tela dizer a
 * mesma coisa duas vezes. Imagem decorativa quer alt vazio, não alt ausente.
 */
export default function Avatar({ name, className, fallbackClassName }) {
  const photo = useAuthStore((s) => s.photo);
  const inicial = name?.trim()?.[0]?.toUpperCase() || "U";

  if (photo) {
    return (
      <img
        src={photo}
        alt=""
        className={cn("rounded-full object-cover shrink-0", className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-full bg-accent-fill flex items-center justify-center font-bold text-accent-contrast shrink-0",
        className,
        fallbackClassName,
      )}
    >
      {inicial}
    </div>
  );
}
