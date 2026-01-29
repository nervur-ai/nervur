/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  safelist: [
    { pattern: /^(bg|text|border|hover:bg|hover:text)-local-(200|300|400|500|600|700|800|900)/ },
  ],
  theme: {
    extend: {
      colors: {
        nervur: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },
        local: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#15533c',
          800: '#1a3a2a',
          900: '#14281e',
          950: '#0d1a14',
        },
      },
    },
  },
  plugins: [],
}
