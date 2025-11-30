/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontSize: {
        // Enhanced font scale for better readability (Option 1 - Global bump)
        'xs': ['0.875rem', { lineHeight: '1.25rem' }],     // 14px (was 13px)
        'sm': ['1rem', { lineHeight: '1.5rem' }],          // 16px (was 15px)
        'base': ['1.125rem', { lineHeight: '1.75rem' }],   // 18px (was 17px)
        'lg': ['1.25rem', { lineHeight: '1.875rem' }],     // 20px (was 19px)
        'xl': ['1.5rem', { lineHeight: '2rem' }],          // 24px (was 22px)
        '2xl': ['1.75rem', { lineHeight: '2.25rem' }],     // 28px (was 26px)
        '3xl': ['2.125rem', { lineHeight: '2.5rem' }],     // 34px (was 32px)
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
}
