import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";
import tailwind from "@tailwindcss/vite";

export default defineConfig({
  plugins: [solid(), tailwind()],
  server: {
    proxy: {
      "/api": "http://localhost:3811",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
