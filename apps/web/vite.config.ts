import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const gateway = 'http://localhost:8787';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5175,
    proxy: {
      '/api': gateway,
      '/llms.txt': gateway,
      '/.well-known': gateway,
      '/mcp': gateway,
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
