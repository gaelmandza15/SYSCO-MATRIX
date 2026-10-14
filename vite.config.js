import { defineConfig } from "vite";
import { resolve } from "path";

// Tauri attend un port fixe pour la fenêtre en dev.
// Port dédié à ce projet pour éviter les collisions avec les autres
// applications Tauri/Vite de la machine (1420 est la valeur par défaut
// du template Tauri et peut être occupée par un autre projet).
const DEV_PORT = 1425;
const HMR_PORT = 1426;

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  clearScreen: false,
  server: {
    port: DEV_PORT,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: HMR_PORT }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  build: {
    target: "es2021",
    outDir: "dist",
  },
});
