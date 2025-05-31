import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    restoreMocks: true,
    mockReset: true,
    include: ["*.spec.ts"],
    coverage: {
      include: ["extension.ts", "helpers.ts"],
    },
  },
});
