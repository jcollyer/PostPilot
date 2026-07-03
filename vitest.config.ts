import { defineConfig } from 'vitest/config';

/**
 * Root Vitest config for the whole monorepo. A single config keeps `npm test`
 * simple (one command, one report) while esbuild handles the packages'
 * bundler-style extensionless imports and TypeScript out of the box.
 *
 * Tests live next to the code they cover as `*.test.ts`. Add more packages here
 * simply by dropping `*.test.ts` files in — no config change needed.
 */
export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/**/src/**/*.test.ts', 'apps/**/src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/.turbo/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      include: ['packages/**/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts', '**/jobs/**', '**/dist/**'],
    },
  },
});
