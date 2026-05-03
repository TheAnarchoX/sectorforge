import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: "jsdom",
    setupFiles: "./vitest.setup.ts",
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reportsDirectory: "../../artifacts/coverage/frontend",
      reporter: ["text-summary", "html", "cobertura"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/main.tsx",
        "src/types/**",
        "**/*.d.ts",
        "**/*.test.*",
        "**/test/**",
      ],
      thresholds: {
        lines: 90,
      },
    },
  },
});
