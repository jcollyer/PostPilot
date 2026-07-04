'use client';

import { useEffect } from 'react';

/**
 * Marks <html> with `data-app-theme="blue"` while an authenticated (app) page
 * is mounted. The (app) wrapper carries the same theme via the `.app-theme`
 * class for its own subtree, but Radix overlays (dropdowns, dialogs, sheets)
 * portal to <body> — outside that subtree — so the html attribute ensures they
 * inherit the blue primary too. The attribute is removed on unmount, restoring
 * the marketing lime on public routes.
 */
export function AppThemeScope() {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-app-theme', 'blue');
    return () => {
      root.removeAttribute('data-app-theme');
    };
  }, []);

  return null;
}
