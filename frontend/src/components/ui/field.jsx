import { cn } from "@/lib/utils";

export function Field({ label, htmlFor, error, children, className }) {
  // Sem htmlFor não existe um controle único para associar — é o caso do grupo
  // Segmented, que são vários botões. Um <label> apontando para nada não nomeia
  // nada; <span> é honesto, e quem chama passa o mesmo texto como ariaLabel do
  // grupo, que é o que de fato dá nome acessível ao conjunto.
  const Rotulo = htmlFor ? "label" : "span";
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <Rotulo htmlFor={htmlFor} className="block text-xs font-medium text-content-2">
          {label}
        </Rotulo>
      )}
      {children}
      {error && <p className="text-danger text-xs">{error}</p>}
    </div>
  );
}
