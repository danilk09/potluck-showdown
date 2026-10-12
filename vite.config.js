import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  css: {
    preprocessorOptions: {
      // Bootstrap 5.3 still uses @import / global functions internally.
      scss: { quietDeps: true, silenceDeprecations: ['import', 'global-builtin', 'color-functions', 'if-function'] },
    },
  },
  test: {
    testTimeout: 20000,
    fileParallelism: false,
  },
});
