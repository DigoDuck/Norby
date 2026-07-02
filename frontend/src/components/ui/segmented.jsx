import { cn } from "@/lib/utils";

/**
 * Segmented toggle for 2-3 mutually exclusive options.
 *
 * @param {string} value - The currently selected value.
 * @param {(value: string) => void} onChange - Called when an option is selected.
 * @param {{ value: string; label: string; activeClass?: string }[]} options - The options to display.
 * @param {string} [className] - Additional classes for the container.
 */
export function Segmented({ value, onChange, options, className }) {
  const n = options.length;

  return (
    <div
      className={cn("grid gap-2", className)}
      style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-xl py-2 text-sm font-medium transition-all",
              isActive
                ? (opt.activeClass ?? "bg-norby-teal text-norby-night")
                : "bg-white/5 text-norby-ivory/70 hover:text-norby-ivory"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
