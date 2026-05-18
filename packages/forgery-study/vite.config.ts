import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served by the backend at /forge — `base` must match so built asset
// URLs resolve. Client-side it reads the study id straight off the path.
export default defineConfig({
  base: '/forge/',
  plugins: [react()],
  server: {
    host: true,
    port: 5175,
    proxy: {
      '/api': {
        target: 'http://localhost:3003',
        changeOrigin: true,
      },
    },
  },
});
