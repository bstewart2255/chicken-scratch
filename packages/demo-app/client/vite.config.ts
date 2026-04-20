import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, '../dist/client'),
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 5174,
    proxy: {
      '/demo-api': {
        target: 'http://localhost:3004',
        changeOrigin: true,
      },
    },
  },
});
