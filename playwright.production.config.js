import { defineConfig, devices } from '@playwright/test';


export default defineConfig({
  testDir: './tests/production',
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4182',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'production', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4182 --strictPort',
    url: 'http://127.0.0.1:4182',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
