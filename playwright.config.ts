import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";

process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(import.meta.dirname, ".playwright-browsers");

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  workers: 1,
  reporter: [["list"]],
});
