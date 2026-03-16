import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const backendApiBase = env.VITE_BACKEND_API_BASE || env.BACKEND_API_BASE || 'http://127.0.0.1:8787';
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), tailwindcss()],
      build: {
        chunkSizeWarningLimit: 1000,
        rollupOptions: {
          output: {
            manualChunks: {
              'vendor-ai': ['@google/genai'],
              'vendor-react': ['react', 'react-dom'],
            }
          }
        }
      },
      define: {
        'process.env.API_KEY': JSON.stringify(''),
        'process.env.GEMINI_API_KEY': JSON.stringify(''),
        'process.env.API_BASE': JSON.stringify(backendApiBase),
        'process.env.AUTH_API_BASE': JSON.stringify(env.VITE_AUTH_API_BASE || env.AUTH_API_BASE || backendApiBase),
        'process.env.AUTH_MODE': JSON.stringify(env.VITE_AUTH_MODE || env.AUTH_MODE || 'api')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
