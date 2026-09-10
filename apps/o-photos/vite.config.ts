import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { bridgething, daemonProxy } from './scripts/bridgething';

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss(), bridgething()],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    host: true,
    // one port per app, so they can run side by side and a bookmark keeps working
    port: 5180,
    proxy: await daemonProxy(),
  },
}));
