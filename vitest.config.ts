import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    restoreMocks: true,
    mockReset: true,
    include: ["test/**/*.spec.ts"],
    typecheck: {
      enabled: true,
      include: ["test/**/*.spec.ts"],
      tsconfig: "./tsconfig.json",
    },
    coverage: {
      include: ["src/extension.ts", "src/isMatch.ts"],
    },
  },
});
