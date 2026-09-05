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
          bg: '#070C18',        // Deep fintech dark background
          panel: '#0B1426',     // Dense dark navy panel background
          card: '#0F1A30',      // Elevated card surface
          header: '#012652',    // Deep Prussian Blue header/high-emphasis
          border: '#1B2C4B',    // Crisp muted fintech border
          primary: '#0D94FB',   // Dodger Blue primary brand
          primaryHover: '#0B7FE0',
          accent: '#0D94FB',    // Dodger Blue accent
        },
        razorpay: {
          blue: '#0D94FB',      // Dodger Blue
          blueHover: '#0B7FE0',
          prussian: '#012652',  // Prussian Blue
          navy: '#0B1426',
          card: '#0F1A30',
          dark: '#070C18',
          border: '#1B2C4B',
        }
      },
      fontFamily: {
        sans: ['"Geist Sans"', 'Geist', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Fira Code', 'monospace'],
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
