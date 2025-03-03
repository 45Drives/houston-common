// Import necessary libraries for testing
import { beforeAll, afterAll, afterEach, vi } from 'vitest';

// Global mock setup (example)
beforeAll(() => {
  console.log("🔧 Global setup before all tests run");
});

afterEach(() => {
  vi.clearAllMocks(); // Clears all mocks after each test
});

afterAll(() => {
  console.log("✅ Global cleanup after all tests complete");
});

// Example: Mocking global objects
globalThis.fetch = vi.fn();