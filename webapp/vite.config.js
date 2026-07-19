import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// La Mini App se compila a webapp/dist y la sirve el mismo Express.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    // En desarrollo, redirigir /api al backend Express
    proxy: {
      '/api': 'http://localhost:3000'
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
