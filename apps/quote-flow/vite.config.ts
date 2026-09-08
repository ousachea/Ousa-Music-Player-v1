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
    // one port per app, so they can run side by side and a bookmark keeps working. vite
    // takes the next free one if this is busy, and says which on startup
    port: 5178,
    proxy: await daemonProxy(),
  },
}));
