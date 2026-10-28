/**
 * [[GTC-415]] tweak 18 — THE ONE HELP LINE: "Need help? Email" and Gather's address as a mail
 * link. The founder's ruling (28 Oct 2026): one small line, its words and its address in one place,
 * the address read from GATHER_CONTACT_EMAIL in src/lib/email-footer.ts and never typed again.
 *
 * It goes on the error and not-found pages, the sign-in page, the sign-in link's error page and
 * the paying page's cancelled screen. Not on the paid-before screen, the cancel page (it has its
 * own) or any guest page. No hooks and no client marker: it draws the same on the server and in
 * the browser.
 */
import { GATHER_CONTACT_EMAIL } from '@/lib/email-footer';

export default function NeedHelp({ className = '' }: { className?: string }) {
  return (
    <p data-need-help="" className={`text-sm text-gray-500 ${className}`}>
      Need help? Email{' '}
      <a href={`mailto:${GATHER_CONTACT_EMAIL}`} className="text-accent hover:underline">
        {GATHER_CONTACT_EMAIL}
      </a>
    </p>
  );
}
