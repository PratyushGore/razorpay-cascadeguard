/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        fintech: {
          bg: '#080C14',        // Deepest dark background
          panel: '#0F172A',     // Dark slate panel background
          card: '#1E293B',      // Card/elevated background
          border: '#334155',    // Muted slate border
          primary: '#6366F1',   // Indigo primary brand
          accent: '#06B6D4',    // Cyan accent
        },
      },
      fontFamily: {
        sans: ['Outfit', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow-green': 'glow-green-pulse 2s infinite',
        'glow-amber': 'glow-amber-pulse 2s infinite',
        'glow-red': 'glow-red-pulse 2s infinite',
        'scan': 'scan 8s linear infinite',
      },
      keyframes: {
        'glow-green-pulse': {
          '0%, 100%': { boxShadow: '0 0 4px rgba(16, 185, 129, 0.2)', borderColor: 'rgba(16, 185, 129, 0.4)' },
          '50%': { boxShadow: '0 0 12px rgba(16, 185, 129, 0.6)', borderColor: 'rgba(16, 185, 129, 0.8)' },
        },
        'glow-amber-pulse': {
          '0%, 100%': { boxShadow: '0 0 4px rgba(245, 158, 11, 0.2)', borderColor: 'rgba(245, 158, 11, 0.4)' },
          '50%': { boxShadow: '0 0 12px rgba(245, 158, 11, 0.6)', borderColor: 'rgba(245, 158, 11, 0.8)' },
        },
        'glow-red-pulse': {
          '0%, 100%': { boxShadow: '0 0 4px rgba(239, 68, 68, 0.2)', borderColor: 'rgba(239, 68, 68, 0.4)' },
          '50%': { boxShadow: '0 0 12px rgba(239, 68, 68, 0.6)', borderColor: 'rgba(239, 68, 68, 0.8)' },
        },
        'scan': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        }
      }
    },
  },
  plugins: [],
}
