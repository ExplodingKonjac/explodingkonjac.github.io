import { defineConfig } from 'vite';
import { component } from '@site/config';

export default defineConfig({
  base: component('maimai-renderer').mount,
  appType: 'mpa',
  server: { strictPort: true, hmr: false, ws: false, watch: null },
});
