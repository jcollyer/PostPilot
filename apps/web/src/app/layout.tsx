import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';

import { TRPCProvider } from '@/lib/trpc/Provider';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SaaS Template',
  description: 'A blank-slate starter with auth, database, and a typed API.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="bg-background text-foreground min-h-dvh font-sans">
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
