import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: __dirname,
    include: ["server/**/*.test.ts", "web/src/**/*.test.{ts,tsx}"],
  },
});
