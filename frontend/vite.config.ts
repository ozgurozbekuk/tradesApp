import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  envPrefix: ["VITE_", "CLERK_"],
  plugins: [react()],
  server: {
    port: 5173,
    host: true
  }
});
