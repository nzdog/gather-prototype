import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Gather - Event Coordination',
  description: 'Coordination app for multi-day gatherings',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
