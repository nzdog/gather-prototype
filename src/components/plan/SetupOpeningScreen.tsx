'use client';

import { useState } from 'react';
import MomentArc from './MomentArc';

interface SetupOpeningScreenProps {
  onStart: () => void;
}

export default function SetupOpeningScreen({ onStart }: SetupOpeningScreenProps) {
  const [fading, setFading] = useState(false);

  const handleClick = () => {
    setFading(true);
    setTimeout(() => {
      onStart();
    }, 400);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-white transition-opacity duration-400 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="max-w-[600px] w-full px-6 text-center">
        {/* The line */}
        <p className="text-2xl sm:text-3xl text-gray-800 leading-relaxed mb-12">
          We&rsquo;re here to organise what could be described as a herd of cats. Let&rsquo;s get it
          done.
        </p>

        {/* The four moment arc */}
        <div className="mb-12">
          <MomentArc currentMoment={1} />
        </div>

        {/* Entry button */}
        <button
          onClick={handleClick}
          disabled={fading}
          className="px-8 py-3 bg-accent text-white text-lg rounded-lg hover:bg-accent-dark transition-colors disabled:opacity-50"
        >
          Ready to start herding →
        </button>
      </div>
    </div>
  );
}
