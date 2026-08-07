import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  root: 'src/client',
  plugins: [vue()],
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
  server: {
    // Ports are derived per feature branch by scripts/dev-ports.sh so parallel
    // worktrees never collide. strictPort: a taken port must fail loudly, not
    // silently shift the URL the browser-tester and evidence rely on.
    port: Number(process.env.VITE_PORT ?? 5173),
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.PORT ?? 3000}`,
        changeOrigin: true,
      },
    },
  },
});
