import type { Config } from 'tailwindcss';

/**
 * z.ai brand theme — extracted from z.ai's production CSS design tokens.
 * See: docs/zai-brand.md
 *
 * Key choices:
 *   - Canvas: #0D0D0D (deepest dark, chat background)
 *   - Page:   #161616 (themed page bg)
 *   - Surface: #202020 (cards/panels)
 *   - Accent: #4099FF (dark mode) / #0B7FFF (light mode) — z.ai azure
 *   - Primary buttons: monochrome (white on dark, black on light) — z.ai convention
 *   - Wordmark: chrome gradient (liquid-metal sweep)
 *   - Fonts: Geist + Geist Mono (Vercel) with PingFang SC fallback for CJK
 */
export default {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ─── z.ai brand ────────────────────────────────────────────────
        brand: {
          DEFAULT: '#0B7FFF',      // primary accent (light)  rgb(11,127,255)
          dark:      '#4099FF',     // primary accent (dark)   rgb(64,153,255)
          hover:     '#0066DD',
          pressed:   '#004FBB',
          subtle:    '#EBF4FF',     // light tint bg
          border:    '#80BEFF',
          // z.ai-custom blue scale (brighter than default Tailwind)
          50:  '#EFF6FF', 100: '#DBEAFE', 200: '#BEDBFF', 300: '#91C5FF',
          400: '#56A2FF', 500: '#3280FF', 600: '#155DFC', 700: '#1447E6',
          800: '#193CB8', 900: '#1C398E',
        },
        // ─── Semantic accents (z.ai) ──────────────────────────────────
        danger:  { DEFAULT: '#E03131', dark: '#FF5C5C' },
        warning: { DEFAULT: '#E07B00', dark: '#FF8A30' },
        success: { DEFAULT: '#1E8A3E', dark: '#46BF72' },
        purple:  { DEFAULT: '#9E77ED', dark: '#7B5CE5' },
        // ─── Dark surfaces (z.ai "ink" scale) ─────────────────────────
        bg:        '#0D0D0D',   // canvas (deepest)
        'bg-page': '#161616',   // themed page bg
        surface:   '#202020',   // cards / panels
        'surface-2': '#2B2B2B', // raised
        'surface-3': '#363636', // highest
        border:    'rgba(255,255,255,0.10)',
        'border-strong': 'rgba(255,255,255,0.18)',
        // ─── Text ──────────────────────────────────────────────────────
        fg:        '#F8F8F8',   // primary text (dark mode)
        'fg-secondary': '#A8AAB8', // secondary text
        muted:     '#747689',   // tertiary text / icons
        'muted-2': '#5C5C5C',   // placeholder
      },
      fontFamily: {
        sans: ['Geist', '"PingFang SC"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', '"Fira Sans"', '"Droid Sans"', '"Helvetica Neue"', '"Microsoft YaHei"', 'sans-serif'],
        mono: ['GeistMono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', '"Liberation Mono"', '"Courier New"', 'monospace'],
        serif: ['"Crimson Text"', '"Noto Serif SC"', 'Georgia', 'serif'],
      },
      fontSize: {
        // Mobile-friendly base sizes
        xs: ['0.75rem', '1rem'],
        sm: ['0.875rem', '1.25rem'],
        base: ['1rem', '1.5rem'],
        lg: ['1.125rem', '1.75rem'],
        xl: ['1.25rem', '1.75rem'],
      },
      borderRadius: {
        xs: '2px',
        sm: '4px',
        md: '6px',
        lg: '8px',
        xl: '12px',
        '2xl': '16px',
        '3xl': '24px',
        btn: '8px',       // primary buttons
        bubble: '16px',   // chat bubbles
      },
      backgroundImage: {
        // z.ai signature liquid-metal chrome sweep (wordmark / hero shimmer)
        'zai-chrome': 'linear-gradient(90deg,#191A1D,#222327 20%,#44454D 35%,#747689 44%,#A8AAB8,#747689 56%,#44454D 65%,#222327 80%,#191A1D)',
      },
      animation: {
        'pulse-subtle': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.25s ease-out',
        'chrome-shimmer': 'chrome-shimmer 8s linear infinite',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'chrome-shimmer': {
          '0%': { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '200% 50%' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
