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
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("grid gap-2", className)}
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
              "rounded-xl py-2 text-sm font-medium transition-all",
              isActive
                ? (opt.activeClass ?? "bg-accent-fill text-accent-contrast")
                : "bg-line/5 text-content-2 hover:text-content"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
