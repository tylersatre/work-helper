import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'node',
    setupFiles: ['./tests/component/setup.ts'],
    css: true,
  },
});
