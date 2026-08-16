import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  root: '.',

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  plugins: [react(), tailwindcss()],

  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },

  build: {
    outDir: 'build',
    sourcemap: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 2000,
    minify: false,
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          if (id.includes('recharts')) return 'vendor-charts';
          if (id.includes('jspdf') || id.includes('html-to-image')) return 'vendor-export';
          if (id.includes('socket.io-client')) return 'vendor-socket';
          if (id.includes('axios')) return 'vendor-network';

          return 'vendor';
        },
      },
    },
  },

  base: './',

  optimizeDeps: {
    include: ['react', 'react-dom', 'recharts'],
  },
});
