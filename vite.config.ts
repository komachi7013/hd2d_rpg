import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [],
  build: {
    rollupOptions: {
      output: { manualChunks: { three: ['three'] } },
    },
  },
});
