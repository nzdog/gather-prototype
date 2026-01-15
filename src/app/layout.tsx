import type { Metadata } from 'next';
import './globals.css';
import Navigation from '@/components/shared/Navigation';

export const metadata: Metadata = {
  title: 'Gather - Event Coordination',
  description: 'Coordination app for multi-day gatherings',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Navigation />
        {children}
      </body>
    </html>
  );
}
