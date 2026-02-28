/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Sage green palette (primary brand color)
        sage: {
          50: '#f6f7f6',
          100: '#e3e6e3',
          200: '#c7cdc6',
          300: '#a3ada0',
          400: '#8b9687',
          500: '#7D8B7A', // Default sage
          600: '#6B7869', // Sage dark
          700: '#5a615a',
          800: '#4a504a',
          900: '#3d423d',
        },
        // Accent colors (aliased to sage for compatibility)
        accent: {
          DEFAULT: 'var(--accent)', // #7D8B7A
          light: 'var(--accent-light)', // #A3ADA0
          dark: 'var(--accent-dark)', // #6B7869
        },
        // Warm grey scale
        warm: {
          white: 'var(--warm-white)',
          grey: {
            100: 'var(--warm-grey-100)',
            200: 'var(--warm-grey-200)',
            300: 'var(--warm-grey-300)',
            400: 'var(--warm-grey-400)',
            500: 'var(--warm-grey-500)',
            600: 'var(--warm-grey-600)',
            700: 'var(--warm-grey-700)',
            800: 'var(--warm-grey-800)',
          },
          black: 'var(--warm-black)',
        },
      },
    },
  },
  plugins: [],
};

module.exports = config;
