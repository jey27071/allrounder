import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#1A1A1A',
        surface: '#FAFAF9',
        border: '#E5E5E0',
        warning: '#D97757',
        success: '#5C7A4F',
        agent: {
          jarvis: '#2D3E50',
          lumi: '#7B6FB8',
          aki: '#5C8A6E',
        },
      },
      fontFamily: {
        sans: ['Pretendard', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '8px',
      },
      transitionDuration: {
        DEFAULT: '200ms',
      },
    },
  },
  plugins: [],
} satisfies Config
