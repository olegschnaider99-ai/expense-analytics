import { defineConfig } from "vitest/config";

try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local is optional in CI, where secrets come from the environment.
}

export default defineConfig({});
