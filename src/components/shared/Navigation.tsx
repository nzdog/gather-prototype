'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FileText, Plus, Home, Calendar, CreditCard, LogOut, LogIn, Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';

type User = {
  id: string;
  email: string;
} | null;

type NavigationProps = {
  user?: User;
};

export default function Navigation({ user }: NavigationProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  /*
   * [[GTC-358]] — ON A PHONE, A MENU BUTTON. Founder R1, verbatim: *"On a phone the bar shows the
   * Gather logo and a menu button (three lines). Tapping it opens the five links, your email and Sign
   * Out. On a computer the bar stays as it is."* Below 1280px (`xl`) the bar is the logo and the
   * button; from 1280px it is the bar exactly as it was (plan Q9: at 1280px the bar already reaches
   * 1264px with an ordinary email, so a narrower cut would still spill on a laptop).
   *
   * A disclosure, not an ARIA menu: a button with `aria-expanded` and `aria-controls`, and plain links
   * in the panel (plan Q10). It closes on the button, on any link (the route changes), on Escape
   * (focus back on the button) and on a tap outside. Its labels name what it does: "Open menu" /
   * "Close menu".
   */
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    const onOutside = (e: MouseEvent | TouchEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('touchstart', onOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('touchstart', onOutside);
    };
  }, [menuOpen]);

  // Hide navigation on token-based views (they have their own headers)
  const isTokenView =
    pathname?.startsWith('/h/') || pathname?.startsWith('/c/') || pathname?.startsWith('/p/');
  if (isTokenView) {
    return null;
  }

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
      });
      router.push('/');
      router.refresh();
    } catch (error) {
      console.error('Sign out error:', error);
      setIsSigningOut(false);
    }
  };

  // Use /demo as home if we're on demo page
  const isDemo = pathname === '/demo';
  const homeHref = isDemo ? '/demo' : '/';

  const navItems = [
    { href: homeHref, label: 'Home', icon: Home },
    { href: '/plan/events', label: 'Your Events', icon: Calendar },
    { href: '/plan/templates', label: 'Past Events', icon: FileText },
    { href: '/plan/new', label: 'New Event', icon: Plus },
    { href: '/billing', label: 'Billing', icon: CreditCard },
  ];

  return (
    <nav ref={navRef} className="relative bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/brand/gather_lockup_horizontal_mono-black.svg"
                alt="Gather"
                width={120}
                height={32}
                className="h-8 w-auto"
              />
            </Link>

            <div className="hidden xl:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-sage-50 text-accent'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Auth section */}
          <div className="hidden xl:flex items-center gap-3">
            {user ? (
              <>
                <span className="text-sm text-gray-600">{user.email}</span>
                <button
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <LogOut className="w-4 h-4" />
                  {isSigningOut ? 'Signing out...' : 'Sign Out'}
                </button>
              </>
            ) : (
              <Link
                href="/auth/signin"
                className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-accent text-white hover:bg-accent-dark transition-colors"
              >
                <LogIn className="w-4 h-4" />
                Sign In
              </Link>
            )}
          </div>

          {/* [[GTC-358]] — the phone's menu button, below 1280px. */}
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="site-menu"
            className="xl:hidden p-2 -mr-2 rounded-md text-gray-700 hover:bg-gray-50"
          >
            {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div
          id="site-menu"
          className="xl:hidden absolute left-0 right-0 top-full z-40 bg-white border-b border-gray-200 shadow-md"
        >
          <div className="px-4 py-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-3 rounded-md text-base font-medium ${
                    isActive ? 'bg-sage-50 text-accent' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
          <div className="px-4 py-3 border-t border-gray-100">
            {user ? (
              <>
                <p className="px-3 pb-2 text-sm text-gray-600 break-all">{user.email}</p>
                <button
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  className="flex w-full items-center gap-3 px-3 py-3 rounded-md text-base font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <LogOut className="w-5 h-5" />
                  {isSigningOut ? 'Signing out...' : 'Sign Out'}
                </button>
              </>
            ) : (
              <Link
                href="/auth/signin"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-md text-base font-medium bg-accent text-white hover:bg-accent-dark"
              >
                <LogIn className="w-5 h-5" />
                Sign In
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
