import { defineConfig } from 'vite';

export default defineConfig({
  base: '/app/maimai-renderer/',
  appType: 'mpa',
  server: { strictPort: true, hmr: false, ws: false, watch: null },
});
