
  tailwind.config = {
    theme: {
      extend: {
        fontFamily: {
          sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'Segoe UI', 'sans-serif'],
        },
        colors: {
          brand: {
            50: '#eef4ff', 100: '#dbe6ff', 200: '#bcd0ff', 300: '#8fadff',
            400: '#5c80ff', 500: '#3757ff', 600: '#2136f5', 700: '#1a27d8',
            800: '#1b24ae', 900: '#1c2689',
          },
        },
        boxShadow: {
          soft: '0 10px 30px -12px rgba(15, 23, 42, .25)',
          card: '0 1px 2px rgba(15,23,42,.06), 0 12px 28px -18px rgba(15,23,42,.35)',
        },
        keyframes: {
          'fade-in': { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
          'slide-up': { '0%': { opacity: 0, transform: 'translateY(14px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
          'pop-in':   { '0%': { opacity: 0, transform: 'scale(.94)' }, '100%': { opacity: 1, transform: 'scale(1)' } },
          'toast-in': { '0%': { opacity: 0, transform: 'translateY(16px) scale(.97)' }, '100%': { opacity: 1, transform: 'translateY(0) scale(1)' } },
        },
        animation: {
          'fade-in': 'fade-in .25s ease-out both',
          'slide-up': 'slide-up .4s cubic-bezier(.22,1,.36,1) both',
          'pop-in': 'pop-in .22s cubic-bezier(.22,1,.36,1) both',
          'toast-in': 'toast-in .3s cubic-bezier(.22,1,.36,1) both',
        },
      },
    },
  };

