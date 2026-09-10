import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { thirdPartyNotices } from "./scripts/license-notices.mjs";
export default defineConfig({
  root: "site",
  plugins: [react(), thirdPartyNotices()],
  server: { host: "127.0.0.1" },
  preview: { host: "127.0.0.1" },
  build: { outDir: "../site-dist", emptyOutDir: true },
});
