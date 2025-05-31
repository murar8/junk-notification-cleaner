import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    restoreMocks: true,
    mockReset: true,
    include: ["*.spec.ts"],
    exclude: ["*.js"],
    typecheck: {
      tsconfig: "./tsconfig.vitest.json",
    },
    coverage: {
      include: ["extension.ts", "helpers.ts"],
    },
  },
});
