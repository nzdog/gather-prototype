import type { Metadata } from 'next';
import './globals.css';
import Navigation from '@/components/shared/Navigation';
import Providers from '@/components/shared/Providers';
import { getUser } from '@/lib/auth/session';
import { SITE_URL, sharePreview } from '@/lib/share-preview';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Gather - Event Coordination',
  description: 'Coordination app for multi-day gatherings',
  icons: {
    icon: '/brand/gather_symbol_32px_mono-black.svg',
  },
  // [[GTC-461]]: the link preview on every page, with no og:url (see share-preview.ts).
  ...sharePreview(),
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();

  return (
    <html lang="en">
      <body>
        {/* [[GTC-435]]: the signed-in user's id only, for drafts kept in this browser. */}
        <Providers viewerId={user?.id ?? null}>
          <Navigation user={user} />
          {children}
        </Providers>
      </body>
    </html>
  );
}
