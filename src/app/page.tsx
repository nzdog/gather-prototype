import { Calendar, Users, Share2, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { getUser } from '@/lib/auth/session';

export default async function LandingPage() {
  const user = await getUser();

  return (
    <div className="min-h-screen bg-gradient-to-br from-accent-light/10 via-white to-accent/5">
        <div className="max-w-5xl mx-auto px-4 py-16">
          {/* Hero Section */}
          <div className="text-center mb-16">
            <div className="flex justify-center mb-6">
              <Image
                src="/brand/gather_lockup_horizontal_all-sage.svg"
                alt="Gather"
                width={280}
                height={80}
                className="h-20 w-auto"
              />
            </div>
            <p className="text-2xl text-gray-600 mb-12 max-w-2xl mx-auto">
              Coordinate group events without the chaos
            </p>

            {/* Primary CTA */}
            <Link
              href={user ? "/plan/events" : "/auth/signin"}
              className="inline-flex items-center gap-3 px-12 py-5 bg-accent text-white text-xl font-bold rounded-xl hover:bg-accent-dark transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              {user ? "Your Events" : "Get Started"}
            </Link>
          </div>

        {/* How It Works */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">How it works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200">
              <div className="w-14 h-14 bg-accent-light/30 rounded-full flex items-center justify-center mb-4">
                <Calendar className="w-7 h-7 text-accent" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">1. Plan</h3>
              <p className="text-gray-600">
                Create your event and define what needs to be done. Organize tasks into teams and
                categories.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200">
              <div className="w-14 h-14 bg-sage-100 rounded-full flex items-center justify-center mb-4">
                <Users className="w-7 h-7 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">2. Assign</h3>
              <p className="text-gray-600">
                Distribute responsibilities to team members. Everyone sees exactly what they're
                bringing.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-200">
              <div className="w-14 h-14 bg-sage-100 rounded-full flex items-center justify-center mb-4">
                <Share2 className="w-7 h-7 text-sage-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">3. Share</h3>
              <p className="text-gray-600">
                Send personalized links to participants. They confirm their items—no app required.
              </p>
            </div>
          </div>
        </div>

        {/* Benefits */}
        <div className="bg-accent-light/10 rounded-2xl p-10 mb-12 border border-accent-light/30">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            Built for real events
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="flex gap-3">
              <CheckCircle className="w-6 h-6 text-accent flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">No coordination chaos</h4>
                <p className="text-gray-600 text-sm">
                  Everyone sees what they need to bring—nothing gets forgotten or duplicated.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <CheckCircle className="w-6 h-6 text-accent flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">No app required</h4>
                <p className="text-gray-600 text-sm">
                  Participants get a simple link—they can view and confirm on any device.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <CheckCircle className="w-6 h-6 text-accent flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">Real-time visibility</h4>
                <p className="text-gray-600 text-sm">
                  See who's confirmed and what's still needed—all in one place.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <CheckCircle className="w-6 h-6 text-accent flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">Perfect for families</h4>
                <p className="text-gray-600 text-sm">
                  Designed for gatherings, holidays, reunions—any event with shared
                  responsibilities.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Secondary Links */}
        <div className="text-center space-y-4">
          <p className="text-gray-500 text-sm">
            Want to explore first?{' '}
            <a href="/demo" className="text-accent hover:text-accent-dark underline font-medium">
              Try the interactive demo
            </a>
          </p>
          <p className="text-gray-500 text-sm">
            Browse{' '}
            <a href="/plan/templates" className="text-accent hover:text-accent-dark underline font-medium">
              event templates
            </a>
            {' '}to get started quickly
          </p>
        </div>
      </div>
    </div>
  );
}
