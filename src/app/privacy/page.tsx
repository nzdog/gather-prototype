export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: 3 February 2026</p>

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
              <a href="mailto:privacy@gather.nz" className="text-accent hover:underline">
                privacy@gather.nz
              </a>
            </p>
          </section>

          {/* What We Collect */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">What We Collect</h2>
            <p className="text-gray-700 mb-3">
              We only collect information needed to coordinate your events:
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
                <strong className="text-gray-900">SMS data:</strong> message delivery status,
                opt-out preferences
              </div>

              <div>
                <strong className="text-gray-900">Payment data:</strong> Stripe handles payment
                processing. We store only the Stripe session ID, not card details.
              </div>

              <div>
                <strong className="text-gray-900">Usage data:</strong> page visits, link opens,
                response timestamps
              </div>

              <div>
                <strong className="text-gray-900">Cookies:</strong> a single session cookie for
                authentication (no tracking cookies)
              </div>

              <div>
                <strong className="text-gray-900">Analytics:</strong> usage data may be collected
                via analytics services
              </div>
            </div>
          </section>

          {/* How We Use It */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">How We Use It</h2>
            <ul className="space-y-2 text-gray-700">
              <li>• To coordinate events between hosts and invitees</li>
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
                • <strong>Twilio</strong> — SMS delivery
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
                • <strong>Anthropic</strong> — AI plan generation (event details sent to generate
                plans)
              </li>
            </ul>

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
              <li>• Opt-out is immediate and permanent for that event</li>
              <li>• We only send to New Zealand mobile numbers</li>
              <li>• Recognized opt-out keywords: STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT</li>
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
              <a href="mailto:privacy@gather.nz" className="text-accent hover:underline">
                privacy@gather.nz
              </a>
            </p>
          </section>

          {/* Data Retention */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Data Retention</h2>
            <ul className="space-y-2 text-gray-700">
              <li>• Event data is retained for 12 months after the event date, then deleted</li>
              <li>• Account data is retained while the account is active</li>
              <li>• SMS opt-out records are retained permanently to respect opt-out preferences</li>
            </ul>
          </section>

          {/* Cookies */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Cookies</h2>
            <ul className="space-y-2 text-gray-700">
              <li>• We use a single session cookie for authentication</li>
              <li>• No tracking cookies</li>
              <li>• Analytics cookies may be used</li>
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
