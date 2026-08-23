'use client';

import { useEffect } from 'react';

/**
 * Marks <html> with `data-app-theme="app"` while an authenticated (app) page is
 * mounted. The (app) wrapper carries the same theme via the `.app-theme` class
 * for its own subtree, but Radix overlays (dropdowns, dialogs, sheets) portal
 * to <body> — outside that subtree — so the html attribute ensures they inherit
 * the app's warm neutrals too. Setting it on <html> also paints the overscroll
 * gutter, which would otherwise flash the marketing white. The attribute is
 * removed on unmount, restoring the public palette.
 */
export function AppThemeScope() {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-app-theme', 'app');
    return () => {
      root.removeAttribute('data-app-theme');
    };
  }, []);

  return null;
}
