'use client';

/**
 * [[GTC-460]] Stage 3, step 3a — /plan/contacts: one page for the host, reachable from anywhere
 * (ruling 157). A page, not an API route: nothing is asked of the server (rulings 44 and 53). What it
 * shows is `ContactsScreen`; the list lives in this browser.
 *
 * [[GTC-468]]: for a sample visitor it shows `SampleContactsNote` instead (R2), so a list is never
 * loaded in a sample. The flag is read here, with React's own `useContext`.
 */
import { useContext } from 'react';
import ContactsScreen from '@/components/contacts/ContactsScreen';
import SampleContactsNote from '@/components/contacts/SampleContactsNote';
import { SampleViewerContext } from '@/components/shared/SampleViewer';

export default function ContactsPage() {
  const sample = useContext(SampleViewerContext);
  return sample ? <SampleContactsNote /> : <ContactsScreen />;
}
