/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
        colors: {
          norby: {
            night: "#07100F",
            surface: "#0E1B19",
            surface2: "#152624",
            teal: "#2DB5A3",
            "teal-soft": "#6FD4C6",
            ivory: "#EFFAF8",
            income: "#5FBF7E",
            expense: "#8A8580",
            danger: "#E06A4A",
          },
          // Aliases shadcn → paleta norby (mesmos hex; os primitivos ui/
          // referenciam esses tokens, que antes não existiam e viravam no-op).
          background: "#07100F",
          foreground: "#EFFAF8",
          card: { DEFAULT: "#0E1B19", foreground: "#EFFAF8" },
          popover: { DEFAULT: "#152624", foreground: "#EFFAF8" },
          primary: { DEFAULT: "#2DB5A3", foreground: "#07100F" },
          secondary: { DEFAULT: "#152624", foreground: "#EFFAF8" },
          muted: { DEFAULT: "rgba(255,255,255,0.05)", foreground: "rgba(239,250,248,0.60)" },
          destructive: { DEFAULT: "#E06A4A", foreground: "#EFFAF8" },
          border: "rgba(255,255,255,0.10)",
          input: "rgba(255,255,255,0.10)",
          ring: "#2DB5A3",
        },
        fontFamily: {
          sans: ["Inter", "sans-serif"],
          heading: ["Inter", "sans-serif"],
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

