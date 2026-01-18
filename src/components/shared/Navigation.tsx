'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FileText, Plus, Home, Calendar, CreditCard, LogOut, LogIn } from 'lucide-react';
import { useState } from 'react';
import Image from 'next/image';

type User = {
  id: string;
  email: string;
  name: string | null;
} | null;

type NavigationProps = {
  user?: User;
};

export default function Navigation({ user }: NavigationProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

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

  const navItems = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/plan/events', label: 'Your Events', icon: Calendar },
    { href: '/plan/templates', label: 'Templates', icon: FileText },
    { href: '/plan/new', label: 'New Event', icon: Plus },
    { href: '/billing', label: 'Billing', icon: CreditCard },
  ];

  return (
    <nav className="bg-white border-b border-gray-200">
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

            <div className="flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-50 text-accent'
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
          <div className="flex items-center gap-3">
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
        </div>
      </div>
    </nav>
  );
}
