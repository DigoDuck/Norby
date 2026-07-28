import { useState } from "react";
import { getTheme, setTheme } from "@/lib/theme";

const OPTIONS = [
  {
    value: "dark",
    label: "Escuro",
    hint: "Padrão. Painel de instrumentos sob pouca luz.",
  },
  {
    value: "light",
    label: "Claro",
    hint: "Vidro leitoso sobre fundo lavanda.",
  },
];

function Preview({ theme }) {
  return (
    <div
      data-theme={theme}
      aria-hidden="true"
      className="app-mesh flex h-20 w-full gap-1.5 overflow-hidden rounded-xl bg-bg-base p-2 pointer-events-none"
    >
      <div className="w-1/4 rounded-md border border-line/10 bg-surface" />
      <div className="flex flex-1 flex-col gap-1.5">
        <div className="flex-1 rounded-md border border-line/10 bg-surface" />
        <div className="h-3 w-2/3 rounded-full bg-accent-fill" />
      </div>
    </div>
  );
}

export default function ThemeToggle() {
  const [theme, setLocal] = useState(getTheme);

  function choose(value) {
    setLocal(setTheme(value));
  }

  return (
    <div
      role="radiogroup"
      aria-label="Tema da interface"
      className="grid gap-3 sm:grid-cols-2"
    >
      {OPTIONS.map((option) => {
        const selected = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => choose(option.value)}
            className={`rounded-2xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-focus-offset ${
              selected
                ? "border-accent bg-accent/[0.08]"
                : "border-line/10 hover:border-line/20"
            }`}
          >
            <Preview theme={option.value} />
            <p className="mt-2.5 text-sm font-medium text-content">
              {option.label}
              {selected && <span className="text-accent"> · em uso</span>}
            </p>
            <p className="mt-0.5 text-xs text-content-2">{option.hint}</p>
          </button>
        );
      })}
    </div>
  );
}
