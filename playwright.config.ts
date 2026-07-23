import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: 0,
	// Locally: Playwright's core-based default. On CI: exactly 2, matched to the
	// ubuntu-latest runner's 2 vCPUs — deterministic and within its resources.
	workers: process.env.CI ? 2 : undefined,
	reporter: 'list',
	use: {
		baseURL: 'http://localhost:4173',
		timezoneId: 'UTC',
		colorScheme: 'light',
		viewport: { width: 400, height: 900 },
	},
	projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
	webServer: {
		command: 'npm run preview -- --port 4173 --strictPort',
		url: 'http://localhost:4173',
		reuseExistingServer: !process.env.CI,
	},
});
