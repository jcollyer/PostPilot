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
      },
    },
  },
  plugins: [],
};
