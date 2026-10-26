import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';

// Load backend/.env so integration tests find DATABASE_URL/REDIS_URL when present.
dotenv.config({ quiet: true });

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
