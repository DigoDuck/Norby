// Toda cor vem de um token em canal RGB declarado em src/index.css. O
// <alpha-value> preserva os modificadores do Tailwind (bg-surface/70).
const c = (v) => `rgb(var(${v}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
        colors: {
          "bg-base": c("--bg-base"),
          surface: c("--surface"),
          "surface-inset": c("--surface-inset"),

          content: c("--content"),
          "content-2": c("--content-2"),
          "content-3": c("--content-3"),

          line: c("--line"),
          state: c("--state-hover"),
          overlay: c("--overlay"),

          accent: c("--accent"),
          "accent-fill": c("--accent-fill"),
          "accent-contrast": c("--accent-contrast"),
          focus: c("--focus"),
          "focus-offset": c("--focus-offset"),

          income: c("--income"),
          expense: c("--expense"),
          danger: c("--danger"),
          warning: c("--warning"),

          "chart-1": c("--chart-1"),
          "chart-2": c("--chart-2"),
          "chart-3": c("--chart-3"),
          "chart-4": c("--chart-4"),
          "chart-5": c("--chart-5"),
          "chart-6": c("--chart-6"),
          "grid-line": c("--grid-line"),
          axis: c("--axis"),

          // Aliases shadcn: os primitivos em ui/ referenciam estes nomes.
          background: c("--bg-base"),
          foreground: c("--content"),
          card: { DEFAULT: c("--surface"), foreground: c("--content") },
          popover: { DEFAULT: c("--surface-inset"), foreground: c("--content") },
          primary: { DEFAULT: c("--accent-fill"), foreground: c("--accent-contrast") },
          secondary: { DEFAULT: c("--surface-inset"), foreground: c("--content") },
          muted: { DEFAULT: c("--surface-inset"), foreground: c("--content-2") },
          destructive: { DEFAULT: c("--danger"), foreground: c("--accent-contrast") },
          border: c("--line"),
          input: c("--line"),
          ring: c("--focus"),

          // Ponte enquanto as páginas ainda não migradas usam norby-*.
          // Removida na Task 18, quando não sobrar nenhum consumidor.
          norby: {
            night: c("--bg-base"),
            surface: c("--surface"),
            surface2: c("--surface-inset"),
            teal: c("--accent"),
            "teal-soft": c("--accent"),
            ivory: c("--content"),
            income: c("--income"),
            expense: c("--content-3"),
            danger: c("--danger"),
          },
        },
        fontFamily: {
          sans: ["'Geist Variable'", "system-ui", "sans-serif"],
          heading: ["'Geist Variable'", "system-ui", "sans-serif"],
        },
        ringWidth: { 3: "3px" },
        keyframes: {
          // Pulso do orbe da IA: sutil (assinatura), nunca em conteúdo de dado
          "orb-pulse": {
            "0%, 100%": { opacity: "0.85", transform: "scale(1)" },
            "50%": { opacity: "1", transform: "scale(1.03)" },
          },
          "fade-up": {
            from: { opacity: "0", transform: "translateY(6px)" },
            to: { opacity: "1", transform: "translateY(0)" },
          },
        },
        animation: {
          "orb-pulse": "orb-pulse 4s ease-in-out infinite",
          "fade-up": "fade-up 0.25s ease-out both",
        },
    },
  },
  plugins: [],
}

