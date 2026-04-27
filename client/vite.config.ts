import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwind from "@tailwindcss/vite";

export default defineConfig({
  plugins: [solid(), tailwind()],
  server: {
    proxy: {
      "/api": "http://localhost:3811",
    },
  },
});
