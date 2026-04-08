import type { Metadata } from 'next';
import './globals.css';
import Navigation from '@/components/shared/Navigation';
import Providers from '@/components/shared/Providers';
import { getUser } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Gather - Event Coordination',
  description: 'Coordination app for multi-day gatherings',
  icons: {
    icon: '/brand/gather_symbol_32px_mono-black.svg',
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();

  return (
    <html lang="en">
      <body>
        <Providers>
          <Navigation user={user} />
          {children}
        </Providers>
      </body>
    </html>
  );
}
