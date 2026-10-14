/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Match the web app's palette so the two clients feel like one product.
        primary: {
          DEFAULT: '#2d3f63',
          foreground: '#ffffff',
        },
        muted: '#f1f5f9',
        mutedForeground: '#64748b',
        border: '#e2e8f0',
        destructive: '#ef4444',
        // DESIGN.md semantic roles (light appearance).
        ground: '#f8fafc',
        surface: '#ffffff',
        ink: {
          DEFAULT: '#0f172a',
          secondary: '#334155',
          tertiary: '#64748b',
          quiet: '#94a3b8',
        },
        hairline: '#e2e8f0',
        signal: {
          ok: '#047857',
          warn: '#b45309',
          critical: '#b91c1c',
        },
      },
    },
  },
  plugins: [],
};
