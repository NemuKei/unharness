import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { thirdPartyNotices } from "./scripts/license-notices.mjs";
export default defineConfig({
  root: "web",
  plugins: [react(), thirdPartyNotices()],
  build: { outDir: "../dist", emptyOutDir: true },
});
