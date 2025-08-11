import { defineConfig } from 'vite';

export default defineConfig({
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
  }
});
