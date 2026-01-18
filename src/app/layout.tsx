import type { Metadata } from 'next';
import './globals.css';
import Navigation from '@/components/shared/Navigation';
import { getUser } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Gather - Event Coordination',
  description: 'Coordination app for multi-day gatherings',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();

  return (
    <html lang="en">
      <body>
        <Navigation user={user} />
        {children}
      </body>
    </html>
  );
}
