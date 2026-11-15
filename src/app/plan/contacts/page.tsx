'use client';

/**
 * [[GTC-460]] Stage 3, step 3a — /plan/contacts: one page for the host, reachable from anywhere
 * (ruling 157). A page, not an API route: nothing is asked of the server (rulings 44 and 53). What it
 * shows is `ContactsScreen`; the list lives in this browser.
 */
import ContactsScreen from '@/components/contacts/ContactsScreen';

export default function ContactsPage() {
  return <ContactsScreen />;
}
