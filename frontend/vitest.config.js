import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.js",
  },
  // NÃO remover: o transform de teste do Vitest usa o runtime CLÁSSICO de JSX,
  // então sem isto todo componente quebra com "React is not defined" — mesmo
  // com React 19 e com o build de produção (vite.config.js) usando o runtime
  // automático. Foi verificado removendo: 4 suites caem na hora.
  esbuild: { jsxInject: `import React from 'react'` },
});
