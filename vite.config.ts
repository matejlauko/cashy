import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

const root = import.meta.dirname;

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  resolve: { alias: { "@": resolve(root, "src") } },
  // Port 3000 matches APP_URL in .dev.vars and the Google OAuth redirect URI.
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
  environments: {
    // HTML entry points belong to the browser build only. A top-level
    // build.rollupOptions.input is also applied to the Worker build and fails it.
    client: {
      build: {
        rollupOptions: {
          input: {
            index: resolve(root, "index.html"),
            login: resolve(root, "login.html"),
            cliAuth: resolve(root, "cli/auth.html"),
          },
        },
      },
    },
  },
});
