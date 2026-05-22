import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    root: path.resolve(process.cwd(), '.'),
    base: './',
    cacheDir: path.resolve(process.cwd(), '.vite-cache'),
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), '.'),
      },
    },
    optimizeDeps: {
      noDiscovery: true,
      include: ['react-router-dom', 'react-router', 'cookie'],
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      fs: {
        allow: [path.resolve(process.cwd(), '.')],
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;

            if (id.includes('react') || id.includes('scheduler')) return 'react-vendor';
            if (id.includes('react-router')) return 'router-vendor';
            if (id.includes('firebase/auth')) return 'firebase-auth-vendor';
            if (id.includes('firebase/storage')) return 'firebase-storage-vendor';
            if (id.includes('firebase/firestore')) return 'firebase-firestore-vendor';
            if (id.includes('firebase/app')) return 'firebase-core-vendor';
            if (id.includes('firebase')) return 'firebase-vendor';
            if (id.includes('html2canvas')) return 'html2canvas-vendor';
            if (id.includes('dompurify')) return 'dompurify-vendor';
            if (id.includes('jspdf-autotable')) return 'jspdf-table-vendor';
            if (id.includes('jspdf')) return 'jspdf-vendor';
            if (id.includes('date-fns')) return 'date-vendor';
            if (id.includes('lucide-react') || id.includes('motion')) return 'ui-vendor';

            return 'vendor';
          },
        },
      },
    },
  };
});
