/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // WisdomBi Brand Colors - Navy from brand guidelines
        'brand-navy': {
          DEFAULT: '#172238',
          50: '#f4f6f9',
          100: '#e8ecf3',
          200: '#cdd7e5',
          300: '#a3b7d0',
          400: '#7392b6',
          500: '#52729d',
          600: '#405b83',
          700: '#354b6b',
          800: '#1A2744',
          900: '#172238',  // Primary brand navy (matched to logo)
          950: '#0f1726',
        },
        'brand-teal': {
          DEFAULT: '#0d9488',
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',  // Secondary brand teal
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
          950: '#042f2e',
        },
        'brand-orange': {
          DEFAULT: '#F5821F',
          50: '#fff8f1',
          100: '#feecdc',
          200: '#fcd5b8',
          300: '#fab889',
          400: '#f79550',
          500: '#F5821F',  // Primary brand orange (exact brand color)
          600: '#e06c0a',
          700: '#ba560b',
          800: '#954510',
          900: '#793a11',
          950: '#411b06',
        },
      },
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
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.3s ease-out forwards',
      },
    },
  },
  plugins: [],
}
