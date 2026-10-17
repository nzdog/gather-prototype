import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { readUnsubscribeToken, unsubscribeOneClickPath } from '@/lib/unsubscribe-token';
import {
  unsubscribeConfirmSentence,
  unsubscribeDoneSentence,
} from '@/lib/eligibility/email-opt-out';
import { firstNameOf } from '@/lib/messages/ask-register';
import { UnsubscribeConfirm } from './confirm';

/**
 * [[GTC-296]] — RULING 1's CONFIRM PAGE.
 *
 * ⚠ THE SECOND SENTENCE IS WHY THIS PAGE EXISTS RATHER THAN A BARE ONE-CLICK. Ruling 1 makes
 * the no PER EVENT, and a person who presses unsubscribe reasonably believes they have stopped
 * hearing from the service. Saying what the no does NOT cover — *"Alice can still email you
 * about other events"* — is what makes a narrow scope honest instead of a technicality. The
 * words are in `src/lib/eligibility/email-opt-out.ts` so the page and the suite read one copy.
 *
 * ⚠ THE PAGE DOES NOT WRITE. A GET that changed state would be unsubscribing people by way of
 * a mail client's link prefetcher, and several prefetch. The write is the POST next door.
 */
export const dynamic = 'force-dynamic';

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const subject = readUnsubscribeToken(token);
  // A token this process did not sign — or any token at all when the secret is unset. Nothing
  // exists at this address, and the page says no more than that.
  if (!subject) notFound();

  const [event, existing] = await Promise.all([
    prisma.event.findUnique({
      where: { id: subject.eventId },
      select: { name: true, host: { select: { name: true } } },
    }),
    prisma.emailOptOut.findUnique({
      where: { personId_eventId: { personId: subject.personId, eventId: subject.eventId } },
      select: { id: true },
    }),
  ]);
  if (!event) notFound();

  const hostFirstName = firstNameOf(event.host?.name ?? 'your host');
  const words = { hostFirstName, eventName: event.name };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto px-6 py-16">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          {existing ? (
            <p className="text-gray-900 text-lg">{unsubscribeDoneSentence(words)}</p>
          ) : (
            <>
              <p className="text-gray-900 text-lg mb-6">{unsubscribeConfirmSentence(words)}</p>
              <UnsubscribeConfirm action={unsubscribeOneClickPath(token)} words={words} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
