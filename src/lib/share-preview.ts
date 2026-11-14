import type { Metadata } from 'next';

/**
 * [[GTC-461]] The link preview: what Facebook, LinkedIn, X, WhatsApp and Slack show when
 * someone shares a Gather link. The root layout puts it on every page.
 *
 * og:url is given on the front page only. On every page it would tell Facebook that each page,
 * invite links included, is the front page, and a shared invite link would open the front page.
 * With no og:url a crawler uses the address it fetched, which is right for every other page.
 */
export const SITE_URL = 'https://www.gatheringtogether.co.nz';

export const SHARE_TITLE = 'Gather: who’s bringing what, sorted';

export const SHARE_DESCRIPTION =
  'Share out the food and jobs for Christmas, birthdays and family reunions. Everyone confirms from a simple link, no app needed, so you can stop chasing.';

const SHARE_IMAGE = {
  url: '/brand/gather_share-preview_1200x630.png',
  width: 1200,
  height: 630,
  alt: 'Gather: making sure Jeremy brings the potatoes this time.',
};

/** The Open Graph and X card tags. Pass `url` on the front page only (see above). */
export function sharePreview(url?: string): Pick<Metadata, 'openGraph' | 'twitter'> {
  return {
    openGraph: {
      type: 'website',
      siteName: 'Gather',
      title: SHARE_TITLE,
      description: SHARE_DESCRIPTION,
      images: [SHARE_IMAGE],
      ...(url ? { url } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: SHARE_TITLE,
      description: SHARE_DESCRIPTION,
      images: [SHARE_IMAGE.url],
    },
  };
}
