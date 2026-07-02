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
  // O transform de teste usa o runtime clássico de JSX; injeta o React para os
  // componentes (.jsx) não precisarem importá-lo explicitamente.
  esbuild: { jsxInject: `import React from 'react'` },
});
