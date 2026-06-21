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
          }
        }
    },
  },
  plugins: [],
}

