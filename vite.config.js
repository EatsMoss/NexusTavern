import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PORT = Number(process.env.NEXUSTAVERN_SERVER_PORT) || 8088;
const CLIENT_PORT = Number(process.env.NEXUSTAVERN_CLIENT_PORT) || 5173;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@app': path.resolve(__dirname, 'src/app'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@core': path.resolve(__dirname, 'src/core'),
      '@features': path.resolve(__dirname, 'src/features'),
      '@styles': path.resolve(__dirname, 'src/styles'),
      '@assets': path.resolve(__dirname, 'src/assets'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: CLIENT_PORT,
    strictPort: true,
    allowedHosts: true,
    open: `http://localhost:${CLIENT_PORT}`,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${SERVER_PORT}`,
        changeOrigin: true,
      },
      '/user-data': {
        target: `http://127.0.0.1:${SERVER_PORT}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      treeshake: {
        moduleSideEffects: (id) => id.endsWith('.css'),
      },
      output: {
        manualChunks(id) {
          const norm = id.replace(/\\/g, '/');
          if (norm.includes('/node_modules/')) {
            if (
              norm.includes('/node_modules/react/') ||
              norm.includes('/node_modules/react-dom/') ||
              norm.includes('/node_modules/scheduler/')
            ) {
              return 'vendor-react';
            }
            return 'vendor-utils';
          }
          if (norm.includes('/src/ui/atoms/')) {
            return 'ui-atoms';
          }
          if (norm.includes('/src/ui/molecules/') && !norm.includes('emojiCatalog')) {
            return 'ui-molecules';
          }
          if (
            (norm.includes('/src/features/characters/CharacterSheet/') &&
              !norm.includes('IntroEditorSheet') &&
              !norm.includes('AdvancedDefinitionsPanel')) ||
            norm.includes('/src/features/characters/CharacterGallery') ||
            norm.includes('/src/features/characters/CharacterTome') ||
            norm.includes('/src/features/characters/PinnedSection') ||
            norm.includes('/src/features/characters/FolderPopover') ||
            norm.includes('/src/features/characters/MultiSelectPopoverContent') ||
            norm.includes('/src/features/characters/useScenarioWorkspace')
          ) {
            return 'feature-characters';
          }
          if (norm.includes('/src/features/chat/')) {
            return 'feature-chat';
          }
          return undefined;
        },
      },
    },
  },
});
