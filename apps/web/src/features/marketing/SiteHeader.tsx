'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Top navigation shown on the public marketing pages (home + pricing). Logo on
 * the left links home. On desktop, pricing + sign-in links and a CTA sit on the
 * right; on mobile those collapse into a hamburger that opens a full-screen menu
 * with a close button, the nav links, and the CTA pinned to the bottom.
 */

const NAV_LINKS = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/signin', label: 'Sign in' },
];

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  // Lock body scroll while the full-screen menu is open, and allow Esc to close.
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <>
      <header className="border-border/60 sticky top-0 z-30 w-full border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center" aria-label="PostPilot home">
          <Image
            src="/logo.png"
            alt="PostPilot"
            width={124}
            height={25}
            className="h-5 w-auto"
            priority
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 sm:flex sm:gap-2">
          {NAV_LINKS.map((link) => (
            <Button key={link.href} asChild variant="ghost" size="sm">
              <Link href={link.href}>{link.label}</Link>
            </Button>
          ))}
          <Button asChild size="sm">
            <Link href="/signin?mode=signup">Get started</Link>
          </Button>
        </nav>

        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          aria-expanded={menuOpen}
          className="text-foreground hover:bg-muted -mr-2 inline-flex size-10 items-center justify-center rounded-md sm:hidden"
        >
            <Menu className="size-6" />
          </button>
        </div>
      </header>

      {/* Mobile full-screen menu — rendered outside <header> so it isn't trapped
          by the header's backdrop-blur containing block (which would clip a
          fixed overlay to the 64px header height). */}
      {menuOpen && (
        <div className="bg-background fixed inset-0 z-50 flex flex-col sm:hidden">
          <div className="flex h-16 items-center justify-between border-b border-border/60 px-6">
            <Link
              href="/"
              className="flex items-center"
              aria-label="PostPilot home"
              onClick={() => setMenuOpen(false)}
            >
              <Image src="/logo.png" alt="PostPilot" width={124} height={25} className="h-5 w-auto" />
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
              className="text-foreground hover:bg-muted -mr-2 inline-flex size-10 items-center justify-center rounded-md"
            >
              <X className="size-6" />
            </button>
          </div>

          <nav className="flex flex-1 flex-col gap-1 px-6 py-8">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="text-foreground hover:bg-muted -mx-3 rounded-md px-3 py-3 text-lg font-medium"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="border-t border-border/60 px-6 py-6">
            <Button asChild size="lg" className="w-full">
              <Link href="/signin?mode=signup" onClick={() => setMenuOpen(false)}>
                Get started
              </Link>
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
