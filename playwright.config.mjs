import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./Testing/playwright",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure" },
  webServer: [
    { command: "node 03_services/api/src/server.mjs", port: 3001, reuseExistingServer: true },
    { command: "node 02_apps/web/server.mjs", port: 3000, reuseExistingServer: true }
  ]
});
