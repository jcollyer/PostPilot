import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// FlatCompat lets ESLint 9's flat config consume the legacy eslintrc-style
// `eslint-config-next` (which doesn't yet ship a flat config). This mirrors what
// `create-next-app` generates for Next 15 + ESLint 9.
const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'dist/**', 'next-env.d.ts'],
  },
  ...compat.config({
    extends: ['next/core-web-vitals'],
  }),
];

export default config;
