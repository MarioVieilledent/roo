import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API = process.env.API_URL ?? "http://127.0.0.1:3001";

// `--mode lan` (npm run dev:lan) serves over HTTPS with a self-signed
// certificate generated locally: phones only allow microphone access on
// secure origins, and plain http://<lan-ip> is not one.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === "lan" ? [basicSsl({ name: "roo" })] : [])],
  server: {
    port: 6400,
    proxy: { "/api": { target: API, changeOrigin: true } },
  },
  preview: {
    proxy: { "/api": { target: API, changeOrigin: true } },
  },
}));
