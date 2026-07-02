import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import '@/styles/globals.css';

import { TRPCProvider } from '@/lib/trpc/Provider';

// Geist — a neutral Swiss-style grotesque used as a free, embeddable stand-in
// for Ramp's Lausanne. The matching TTF for Rive lives in /assets/fonts.
const geist = Geist({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'PostPilot — Your content queue on autopilot',
  description:
    'Upload once. Queue it. Walk away. PostPilot auto-publishes your short-form videos to TikTok, Instagram Reels, and YouTube Shorts — and only pings you when it genuinely needs you.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={geist.variable}>
      <body className="bg-background text-foreground min-h-dvh font-sans">
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
