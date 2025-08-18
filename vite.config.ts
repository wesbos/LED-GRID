import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5556,
    host: true,
    allowedHosts: ['local.wesbos.com'],
    proxy: {
      '/party': {
        target: 'http://localhost:5555',
        ws: true, // important for WebSocket connections
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
