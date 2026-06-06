const net = require('net');

/** Find an available port starting from the preferred port. */
async function getAvailablePort(preferred = 19876) {
  for (let port = preferred; port < preferred + 100; port++) {
    const available = await new Promise(resolve => {
      const server = net.createServer();
      server.unref();
      server.on('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve(true));
      });
    });
    if (available) return port;
  }
  throw new Error('No available port found');
}

// Determine the test port at config load time.
// We use a port that won't conflict with a running Docker container on 8080.
const TEST_PORT = process.env.TEST_PORT || '19876';

module.exports = defineConfig({
  testDir: './tests/e2e',
  globalSetup: require.resolve('./tests/e2e/global-setup.js'),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  timeout: 90000,
  use: {
    baseURL: process.env.TEST_URL || `http://localhost:${TEST_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 20000,
    navigationTimeout: 60000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  // Run local dev server before starting the tests on a non-conflicting port
  webServer: {
    command: 'npm run server:test',
    url: `http://localhost:${TEST_PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      PORT: TEST_PORT,
      CPL_TEST_MODE: 'true',
      CPL_JWT_SECRET: 'test-secret'
    }
  },
});
