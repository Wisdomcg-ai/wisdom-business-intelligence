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
        // Increased font scale for better readability
        'xs': ['0.8125rem', { lineHeight: '1.25rem' }],    // 13px (was 12px)
        'sm': ['0.9375rem', { lineHeight: '1.5rem' }],     // 15px (was 14px)
        'base': ['1.0625rem', { lineHeight: '1.75rem' }],  // 17px (was 16px)
        'lg': ['1.1875rem', { lineHeight: '1.875rem' }],   // 19px (was 18px)
        'xl': ['1.375rem', { lineHeight: '2rem' }],        // 22px (was 20px)
        '2xl': ['1.625rem', { lineHeight: '2.25rem' }],    // 26px (was 24px)
        '3xl': ['2rem', { lineHeight: '2.5rem' }],         // 32px (was 30px)
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
