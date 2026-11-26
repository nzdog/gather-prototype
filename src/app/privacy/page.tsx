// [[GTC-415]]: the page's address is Gather's one contact address, written once, in
// src/lib/email-footer.ts.
import { GATHER_CONTACT_EMAIL } from '@/lib/email-footer';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: 27 November 2026</p>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 space-y-8">
          {/* Who We Are */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Who We Are</h2>
            <p className="text-gray-700 mb-3">
              Gather is a coordination tool for group events, operated by Nigel as a sole trader in
              New Zealand.
            </p>
            <p className="text-gray-700">
              Contact:{' '}
              <a href={`mailto:${GATHER_CONTACT_EMAIL}`} className="text-accent hover:underline">
                {GATHER_CONTACT_EMAIL}
              </a>
            </p>
          </section>

          {/* What We Collect */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">What We Collect</h2>
            <p className="text-gray-700 mb-3">
              We only collect information needed to coordinate your events, and a count of visits to
              a few of our pages:
            </p>

            <div className="space-y-3 text-gray-700">
              <div>
                <strong className="text-gray-900">Account information:</strong> name, email address
              </div>

              <div>
                <strong className="text-gray-900">Event data:</strong> event names, dates, venues,
                guest counts
              </div>

              <div>
                <strong className="text-gray-900">People data:</strong> names, email addresses,
                phone numbers, dietary requirements
              </div>

              <div>
                <strong className="text-gray-900">Assignment data:</strong> what items people are
                bringing, accept/decline responses, RSVP status
              </div>

              <div>
                <strong className="text-gray-900">Text message data:</strong> whether each text was
                delivered, whether you have opted out of texts or back in, and any reply you send to
                one of our texts
              </div>

              <div>
                <strong className="text-gray-900">Payment data:</strong> Stripe handles payment
                processing. Card details go to Stripe, not to Gather. We keep Stripe&apos;s
                reference numbers for your payment or subscription, the amount paid and the dates.
              </div>

              <div>
                <strong className="text-gray-900">Usage data:</strong> when someone first opens a
                link we sent them, and when they answer
              </div>

              <div>
                <strong className="text-gray-900">Browser details:</strong> when someone first opens
                a link we sent them, we keep the description their browser sends of itself (such as
                the browser and device type), cut to 200 characters. Hosts do not see it.
              </div>

              <div>
                <strong className="text-gray-900">Visit counts:</strong> each time the home page,
                the demo page, the sample&apos;s start page or the new-event page is opened, Gather
                writes one line to its server log with the page&apos;s name and where the visitor
                came from: the name of the website their browser reports (such as facebook.com),
                &quot;internal&quot; for one of Gather&apos;s own pages, or &quot;direct&quot; if
                the browser does not say. Nothing else about the visitor is written: no internet
                address, no browser description, no cookie and no full web address. If the link
                carried one of Gather&apos;s own campaign labels (such as facebook), that label is
                written too.
              </div>

              <div>
                <strong className="text-gray-900">Cookies:</strong> a sign-in cookie, and a cookie
                for the invitation link you opened (no tracking cookies)
              </div>

              <div>
                <strong className="text-gray-900">Sample events:</strong> if you start one on the
                demo page, Gather keeps a short code made from your internet address with a secret
                key, to allow 3 samples an hour. It is deleted with the sample. Gather does not
                store your internet address itself.
              </div>
            </div>
          </section>

          {/* How We Use It */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">How We Use It</h2>
            <ul className="space-y-2 text-gray-700">
              <li>• To coordinate events between hosts and invitees</li>
              <li>
                • If you&apos;re part of a household, Gather tells its contact person what
                you&apos;ve been asked to bring.
              </li>
              <li>• To send SMS nudges and email invitations</li>
              <li>• To process payments via Stripe</li>
              <li>• To improve the service</li>
            </ul>
          </section>

          {/* Who We Share It With */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Who We Share It With</h2>
            <p className="text-gray-700 mb-3">
              We share your information only with service providers necessary to run Gather:
            </p>

            <ul className="space-y-2 text-gray-700 mb-3">
              <li>
                • <strong>TNZ</strong> — text message delivery
              </li>
              <li>
                • <strong>Resend</strong> — email delivery
              </li>
              <li>
                • <strong>Stripe</strong> — payment processing
              </li>
              <li>
                • <strong>Railway</strong> — hosting and infrastructure
              </li>
              <li>
                • <strong>Anthropic</strong> — AI plan making (event details and dietary needs;
                sometimes the names of guests bringing items)
              </li>
            </ul>

            <p className="text-gray-700 mb-3">
              Our hosting provider (Railway) also keeps its own record of each request to the site,
              including the visitor&apos;s internet address and browser description, for up to 90
              days.
            </p>

            <p className="text-gray-700 font-medium">
              We do not sell personal data. We do not share data with advertisers.
            </p>
          </section>

          {/* Data Storage */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Data Storage</h2>
            <p className="text-gray-700">
              Data is stored on servers which may be located outside New Zealand (likely United
              States via Railway and cloud providers). This is disclosed in accordance with the New
              Zealand Privacy Act 2020.
            </p>
          </section>

          {/* SMS Communications */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">SMS Communications</h2>
            <p className="text-gray-700 mb-3">
              We send SMS nudges to phone numbers provided by event hosts.
            </p>

            <ul className="space-y-2 text-gray-700">
              <li>
                • Recipients can reply <strong>STOP</strong> at any time to opt out
              </li>
              <li>
                • Opting out stops all texts from Gather, for every event, whoever invited you.
                Reply START to get them again.
              </li>
              <li>
                • Invitations and reminders are texted only to New Zealand numbers. A thank-you
                after the event can also go to an Australian number.
              </li>
              <li>
                • A reply that begins with STOP, OPTOUT, OPT OUT, OPT-OUT, UNSUB or UNSUBSCRIBE opts
                you out, in capitals or not. A reply of just START, SUBSCRIBE, UNSTOP, OPTIN, OPT IN
                or OPT-IN opts you back in.
              </li>
              <li>
                • If you reply to one of our texts, we show your reply to the person who invited
                you, keep it with the event it was about, and delete it with that event&apos;s data.
              </li>
            </ul>
          </section>

          {/* Your Rights */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">
              Your Rights (NZ Privacy Act 2020)
            </h2>
            <p className="text-gray-700 mb-3">You have the right to:</p>

            <ul className="space-y-2 text-gray-700 mb-3">
              <li>• Request access to your personal information</li>
              <li>• Request correction of inaccurate information</li>
              <li>• Request deletion of your data</li>
            </ul>

            <p className="text-gray-700">
              To exercise these rights, contact us at{' '}
              <a href={`mailto:${GATHER_CONTACT_EMAIL}`} className="text-accent hover:underline">
                {GATHER_CONTACT_EMAIL}
              </a>
            </p>
          </section>

          {/* Data Retention */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Data Retention</h2>
            <ul className="space-y-2 text-gray-700">
              <li>
                • Event data is kept until the host deletes the event, or until you ask us to delete
                it. Nothing deletes it automatically.
              </li>
              <li>
                • Deleting an event removes its plan, guest list, answers, invitation links,
                messages and text replies. People&apos;s names and contact details are kept.
              </li>
              <li>• Sample events made on the demo page are deleted by Gather the next day.</li>
              <li>• Account data is retained while the account is active</li>
              <li>• SMS opt-out records are retained permanently to respect opt-out preferences</li>
              <li>
                • Records of email addresses and phone numbers that cannot receive our messages are
                kept permanently, so we stop trying them.
              </li>
              <li>
                • Visit-count lines are kept in our hosting provider&apos;s logs (Railway) for up to
                90 days, then deleted. Daily totals, which say nothing about any visitor, may be
                kept longer.
              </li>
            </ul>
          </section>

          {/* Cookies */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Cookies</h2>
            <ul className="space-y-2 text-gray-700">
              <li>
                • A sign-in cookie keeps you signed in. It lasts 30 days, or 2 hours for a sample
                event. Signing out removes it.
              </li>
              <li>
                • When you open an invitation link, your browser keeps that link&apos;s code in a
                cookie for 8 hours. It is sent only to Gather&apos;s pages for that kind of link.
              </li>
              <li>• No tracking cookies</li>
              <li>
                • Gather also saves some things in your own browser so you don&apos;t lose them: an
                unsaved household form for up to 7 days, and a new event&apos;s details until you
                finish creating it.
              </li>
            </ul>
          </section>

          {/* Changes */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Changes to This Policy</h2>
            <p className="text-gray-700">
              We may update this policy from time to time. Material changes will be communicated via
              email to active users.
            </p>
          </section>
        </div>

        <div className="mt-8 text-center">
          <a href="/" className="text-sm text-gray-500 hover:text-gray-700 hover:underline">
            Back to Home
          </a>
        </div>
      </div>
    </div>
  );
}
