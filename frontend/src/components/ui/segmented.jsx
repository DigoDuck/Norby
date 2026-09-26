import { cn } from "@/lib/utils";

/**
 * Segmented toggle for 2-3 mutually exclusive options.
 *
 * @param {string} value - The currently selected value.
 * @param {(value: string) => void} onChange - Called when an option is selected.
 * @param {{ value: string; label: string; activeClass?: string }[]} options - The options to display.
 * @param {string} [className] - Additional classes for the container.
 * @param {string} [ariaLabel] - Nome acessível do grupo (ex.: "Tipo").
 */
export function Segmented({ value, onChange, options, className, ariaLabel }) {
  const n = options.length;

  return (
    // Trilho com pílula, a mesma linguagem do Entrar/Cadastrar do login: as
    // opções leem como UMA escolha, não como três botões soltos.
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("grid gap-1 rounded-full bg-line/[0.06] p-1", className)}
      style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            // Sem aria-pressed, a seleção existe só como cor de fundo — e o
            // DESIGN.md proíbe cor como canal semântico único.
            aria-pressed={isActive}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? (opt.activeClass ?? "bg-content text-bg-base")
                : "text-content-2 hover:text-content"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
