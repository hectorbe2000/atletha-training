/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Superficies y tinta — los tokens que salieron del prototipo ganador.
        fondo: '#0b0d10',
        superficie: '#14171c',
        'superficie-alta': '#1b1f26',
        borde: 'rgba(255,255,255,0.08)',
        'borde-fuerte': 'rgba(255,255,255,0.16)',
        texto: '#f2f4f7',
        'texto-suave': '#98a2b3',
        'texto-tenue': '#667085',

        // Acento de marca: SOLO acciones e identidad, nunca datos.
        acento: '#c9f24d',
        'acento-texto': '#121608',

        // Series de gráficos: slots 1-3 del tema categórico, pasos oscuros.
        // Validados con scripts/validate_palette.js contra la superficie #14171c.
        serie: { 1: '#3987e5', 2: '#d95926', 3: '#199e70' },

        // Paleta de estado, reservada. Siempre acompañada de ícono + texto.
        estado: {
          bien: '#0ca30c',
          aviso: '#fab219',
          grave: '#ec835a',
          critico: '#d03b3b',
        },

        // Cromo de los gráficos.
        grafico: { grilla: '#2c2c2a', eje: '#383835', muted: '#898781' },
      },
      borderRadius: { xl2: '14px' },
      transitionTimingFunction: { salida: 'cubic-bezier(.16,1,.3,1)' },
      transitionDuration: { rapido: '140ms', medio: '220ms' },
      fontFamily: {
        sans: ['ui-sans-serif', '-apple-system', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
