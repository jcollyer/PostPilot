'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, Settings } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getInitials } from '@/lib/utils';
import { signOutAction } from '@/server/actions';
import { NotificationsBell } from '@/components/NotificationsBell';

interface NavBarProps {
  name: string | null | undefined;
  email: string | null | undefined;
  image: string | null | undefined;
}

const LINKS = [
  { href: '/home', label: 'Home' },
  { href: '/media', label: 'Library' },
  { href: '/queue', label: 'Queue' },
];

/**
 * Global navigation for the signed-in app. Sticky, because the queue is long
 * and "pause" should never be more than a glance away.
 *
 * The current section is marked with an ink rule sitting on the header's own
 * bottom border — deliberately not lime. In this app lime means "the engine is
 * running", and spending it on "you are here" would cost it that meaning.
 */
export function NavBar({ name, email, image }: NavBarProps) {
  const pathname = usePathname();
  const initials = getInitials(name ?? email);

  return (
    <header className="bg-background/85 border-border sticky top-0 z-30 border-b backdrop-blur-md">
      <div className="container flex h-14 items-center gap-3 sm:gap-6">
        <Link
          href="/home"
          aria-label="PostPilot home"
          className="focus-visible:ring-ring -m-1 flex items-center rounded p-1 focus-visible:outline-none focus-visible:ring-2"
        >
          <Image
            src="/logo.png"
            alt="PostPilot"
            width={124}
            height={25}
            className="h-[18px] w-auto"
            priority
          />
        </Link>

        <nav aria-label="Sections" className="-mb-px flex items-center self-stretch">
          {LINKS.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`focus-visible:ring-ring relative flex items-center px-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 sm:px-3 ${
                  active
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground font-normal'
                }`}
              >
                {link.label}
                <span
                  aria-hidden
                  className={`bg-foreground absolute inset-x-1.5 bottom-0 h-0.5 origin-center rounded-full transition-transform duration-200 ease-out sm:inset-x-2 ${
                    active ? 'scale-x-100' : 'scale-x-0'
                  }`}
                />
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <NotificationsBell />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Open account menu"
                className="focus-visible:ring-ring ring-offset-background rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                <span className="bg-foreground text-background relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full text-xs font-semibold tracking-wide">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={image}
                      alt={name ?? email ?? 'User avatar'}
                      className="absolute inset-0 h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span>{initials}</span>
                  )}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="truncate font-normal">
                <span className="text-muted-foreground block text-xs">Signed in as</span>
                <span className="text-foreground block truncate font-medium">{email}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings" className="w-full cursor-pointer">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <form action={signOutAction}>
                <DropdownMenuItem asChild>
                  <button type="submit" className="w-full cursor-pointer text-left">
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </button>
                </DropdownMenuItem>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
