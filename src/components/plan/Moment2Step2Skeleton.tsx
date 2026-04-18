'use client';

import { useEffect, useState } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PlanItem {
  name: string;
  quantity: number;
  unit: string;
  servingSize: string;
  notes?: string;
  dietaryTags?: string[];
}

interface PlanCategory {
  name: string;
  emoji: string;
  items: PlanItem[];
}

interface DietaryCoverage {
  requirement: string;
  covered: boolean;
  flaggedItems?: string[];
}

interface ThingsToConsiderItem {
  name: string;
  category: string;
}

export interface Moment2Plan {
  categories: PlanCategory[];
  dietaryCoverage: DietaryCoverage[];
  thingsToConsider: ThingsToConsiderItem[];
}

interface Moment2Step2SkeletonProps {
  eventName: string;
  plan: Moment2Plan | null;
  onApprove: () => void;
  onReady?: () => void;
}

// ─── Skeleton placeholders ──────────────────────────────────────────────────

const SKELETON_CATEGORIES = [
  { name: 'Mains', emoji: '🍖', placeholderCount: 3 },
  { name: 'Sides', emoji: '🥗', placeholderCount: 3 },
  { name: 'Dessert', emoji: '🍰', placeholderCount: 2 },
  { name: 'Drinks', emoji: '🍺', placeholderCount: 3 },
  { name: 'Setup & Cleanup', emoji: '🧹', placeholderCount: 2 },
];

// ─── Component ──────────────────────────────────────────────────────────────

export default function Moment2Step2Skeleton({
  eventName,
  plan,
  onApprove,
  onReady,
}: Moment2Step2SkeletonProps) {
  // Track which categories have been revealed (staggered animation)
  const [revealedCategories, setRevealedCategories] = useState<number>(0);
  const [showConsider, setShowConsider] = useState(false);
  const [fullyRendered, setFullyRendered] = useState(false);

  // Notify parent once streaming animation completes so it can transition to
  // the editable plan view. Skeleton handles loading/streaming; plan view
  // handles editing. Guarded against double-fire via onReady presence.
  useEffect(() => {
    if (fullyRendered && onReady) {
      onReady();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullyRendered]);

  // Stagger category reveal when plan arrives
  useEffect(() => {
    if (!plan) return;

    const totalCategories = plan.categories.length;
    let current = 0;

    const interval = setInterval(() => {
      current++;
      setRevealedCategories(current);
      if (current >= totalCategories) {
        clearInterval(interval);
        // Show things to consider after categories
        setTimeout(() => {
          setShowConsider(true);
          setTimeout(() => setFullyRendered(true), 200);
        }, 200);
      }
    }, 200);

    return () => clearInterval(interval);
  }, [plan]);

  const isLoading = !plan;
  const categories = plan?.categories ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-6 py-8 pb-32">
        {/* Title */}
        <h1 className="text-xl font-semibold text-gray-900 mb-1">
          Here&rsquo;s what I&rsquo;d suggest for {eventName}.
        </h1>
        {plan && (
          <p className="text-sm text-gray-500 mb-6">
            {plan.categories.reduce((sum, c) => sum + c.items.length, 0)} items across{' '}
            {plan.categories.length} categories.
          </p>
        )}
        {isLoading && (
          <p className="text-sm text-gray-400 mb-6 animate-pulse">Putting your plan together...</p>
        )}

        {/* Category sections */}
        <div className="space-y-6">
          {isLoading
            ? // Skeleton placeholders
              SKELETON_CATEGORIES.map((cat) => (
                <div key={cat.name}>
                  <h2 className="text-base font-medium text-gray-900 mb-3">
                    {cat.emoji} {cat.name}
                  </h2>
                  <div className="space-y-2">
                    {Array.from({ length: cat.placeholderCount }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 animate-pulse">
                        <div className="h-4 bg-gray-200 rounded flex-1" />
                        <div className="h-4 bg-gray-200 rounded w-20" />
                        <div className="h-4 bg-gray-200 rounded w-16" />
                      </div>
                    ))}
                  </div>
                </div>
              ))
            : // Real categories with staggered reveal
              categories.map((cat, catIdx) => (
                <div
                  key={cat.name}
                  className={`transition-all duration-300 ${
                    catIdx < revealedCategories
                      ? 'opacity-100 translate-y-0'
                      : 'opacity-0 translate-y-2'
                  }`}
                >
                  <h2 className="text-base font-medium text-gray-900 mb-3">
                    {cat.emoji} {cat.name}
                  </h2>
                  <div className="space-y-2">
                    {cat.items.map((item) => (
                      <div
                        key={item.name}
                        className="flex items-center gap-3 text-sm text-gray-700"
                      >
                        <span className="flex-1">{item.name}</span>
                        <span className="text-gray-500 whitespace-nowrap">{item.servingSize}</span>
                        <span className="text-gray-400 whitespace-nowrap">
                          {item.quantity} {item.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
        </div>

        {/* Dietary coverage flags */}
        {plan && plan.dietaryCoverage.length > 0 && showConsider && (
          <div className="mt-8 transition-all duration-300 opacity-100">
            <h2 className="text-base font-medium text-gray-900 mb-3">Dietary coverage</h2>
            <div className="space-y-2">
              {plan.dietaryCoverage.map((dc) => (
                <div key={dc.requirement} className="flex items-start gap-2 text-sm">
                  <span className={dc.covered ? 'text-green-500' : 'text-amber-500'}>
                    {dc.covered ? '✓' : '⚠'}
                  </span>
                  <span className={dc.covered ? 'text-gray-600' : 'text-amber-700'}>
                    {dc.requirement}
                    {!dc.covered && ' — not yet covered'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Things to consider */}
        {plan && plan.thingsToConsider.length > 0 && showConsider && (
          <div className="mt-8 transition-all duration-300 opacity-100">
            <h2 className="text-base font-medium text-gray-900 mb-3">💡 Things to consider</h2>
            <div className="space-y-2">
              {plan.thingsToConsider.map((item) => (
                <div key={item.name} className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="text-gray-300">☐</span>
                  <span>{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sticky approve button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4">
        <div className="max-w-2xl mx-auto">
          <button
            type="button"
            disabled={!fullyRendered}
            onClick={onApprove}
            className="w-full px-6 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Generating plan...' : 'Plan looks good →'}
          </button>
        </div>
      </div>
    </div>
  );
}
