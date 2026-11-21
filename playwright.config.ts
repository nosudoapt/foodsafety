import { defineConfig, devices } from "@playwright/test";

// Exercise invitation fallbacks without changing production configuration.
const emailMode = process.env.BTB_TEST_EMAIL_MODE;

// Both browser and server-side Supabase calls resolve to the loopback fixture.
// The API handlers and session/role checks run as they do in the production app.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5101",
    timezoneId: "UTC",
    locale: "en-GB",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } }],
  webServer: [
    { command: "node e2e/mock-supabase.mjs", url: "http://127.0.0.1:5102/__test/health", reuseExistingServer: false },
    {
      command: "node e2e/serve.mjs",
      url: "http://127.0.0.1:5101/auth/sign-in",
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:5102",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "browser-test-anon-key",
        SUPABASE_URL: "http://127.0.0.1:5102",
        SUPABASE_SERVICE_ROLE_KEY: "browser-test-service-key",
        BTB_UPLOADER_PROFILE_ID: "10000000-0000-4000-8000-000000000099",
        RESEND_API_KEY: emailMode === "missing-sender" ? "" : "browser-test-resend-key",
        BTB_EMAIL_FROM: "BTB Tests <btb@example.test>",
        CRON_SECRET: emailMode === "missing-scheduler" ? "" : "browser-test-cron-secret",
        BTB_PASSWORD: "browser-test-shared-password",
        BTB_SHARED_LOGIN: "1",
        // Keep the sandbox offline: the invitation stays queued instead of
        // calling the real Resend API with a synthetic key.
        BTB_INVITE_SEND_NOW: "0",
        PLATFORM_ADMIN_BOOTSTRAP_TOKEN: "browser-test-bootstrap-token",
        DEMO_PLACEHOLDER: undefined as unknown as string,
        NEXT_TELEMETRY_DISABLED: "1",
        TZ: "UTC",
      },
    },
  ],
});
