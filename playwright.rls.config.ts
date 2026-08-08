import { defineConfig } from "@playwright/test";

// Standalone config for the RLS enforcement suite. The main
// playwright.config.ts wraps a Lovable CI package that is not installed in
// the sandbox, so this suite runs with a plain local config:
//   RLS_TEST_SUPPORT_SECRET=... bunx playwright test --config=playwright.rls.config.ts
export default defineConfig({
  testDir: "./tests",
  testMatch: "rls.spec.ts",
  timeout: 240_000,
  workers: 1,
  retries: 0,
  reporter: [["line"]],
});
