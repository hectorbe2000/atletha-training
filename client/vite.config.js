import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API = process.env.VITE_API_URL ?? 'http://localhost:4100';

export default defineConfig({
  plugins: [react()],
  server: {
    // 0.0.0.0 para que los socios entren desde el celular en el WiFi del gym.
    host: true,
    port: 5173,
    proxy: {
      // El front habla siempre con rutas relativas; el proxy las manda a Express.
      // Asi la misma URL funciona en la PC del mostrador y en el celular.
      '/api': { target: API, changeOrigin: true },
      '/media': { target: API, changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
