import type { Config } from 'tailwindcss';

const config: Config = {
  // Class-based dark mode: add `dark` class to <html> to activate.
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f4ff',
          100: '#e0eaff',
          200: '#c7d9ff',
          400: '#7ba3ff',
          500: '#4f7df7',
          600: '#3563e9',
          700: '#2b50c8',
          800: '#1e3a9e',
          900: '#162d7a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
