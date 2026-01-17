import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: 'var(--accent)',
          light: 'var(--accent-light)',
          dark: 'var(--accent-dark)',
        },
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
}
export default config
