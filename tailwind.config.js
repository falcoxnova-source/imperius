/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Colores del tema imperio romano (piedra, bronce y dorado)
        space: {
          900: '#0c0806',
          800: '#140e09',
          700: '#1c140d',
          600: '#2a1f14',
          500: '#3a2b1b',
          400: '#4a3826',
        },
        cyber: {
          blue: '#fbbf24',
          purple: '#b45309',
          pink: '#9f1239',
          green: '#10b981',
          orange: '#d97706',
          red: '#dc2626',
          yellow: '#f59e0b',
        },
        neon: {
          blue: '#fde68a',
          green: '#39ff14',
          pink: '#fb7185',
          orange: '#f59e0b',
        }
      },
      fontFamily: {
        orbitron: ['Cinzel', 'Georgia', 'Times New Roman', 'serif'],
        cinzel: ['Cinzel', 'Georgia', 'serif'],
        rajdhani: ['Rajdhani', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'space-gradient': 'linear-gradient(135deg, #1b1109 0%, #332619 50%, #241a10 100%)',
        'cyber-gradient': 'linear-gradient(135deg, #fbbf24 0%, #b45309 100%)',
        'card-gradient': 'linear-gradient(180deg, rgba(47, 43, 37, 0.8) 0%, rgba(16, 13, 10, 0.9) 100%)',
        'auth': "url('https://photos.pinksale.finance/file/pinksale-logo-upload/1773939381181-98aeb228cd03fddfe65809d37ac7b98d.jpg')",
      },
      boxShadow: {
        'neon-blue': '0 0 20px rgba(251, 191, 36, 0.5)',
        'neon-green': '0 0 20px rgba(57, 255, 20, 0.5)',
        'neon-pink': '0 0 20px rgba(251, 113, 133, 0.5)',
        'card': '0 4px 30px rgba(0, 0, 0, 0.3)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'spin-slow': 'spin 20s linear infinite',
        'shimmer': 'shimmer 2.8s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(251, 191, 36, 0.5)' },
          '100%': { boxShadow: '0 0 20px rgba(251, 191, 36, 0.8)' },
        },
        shimmer: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(400%)' },
        },
      },
    },
  },
  plugins: [],
};
