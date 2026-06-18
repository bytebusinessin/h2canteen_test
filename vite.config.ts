import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'generate-manifest',
        closeBundle() {
          const manifest = {
            name: env.VITE_APP_TITLE || 'Byte Business',
            short_name: env.VITE_STORE_NAME || 'Vendor',
            start_url: '/',
            display: 'standalone',
            display_override: ['standalone', 'fullscreen'],
            background_color: '#ffffff',
            theme_color: '#ffffff',
            orientation: 'portrait',
            icons: [
              { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
              { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
            ],
          };
          fs.writeFileSync(
            path.resolve(__dirname, 'dist/manifest.json'),
            JSON.stringify(manifest, null, 2),
          );
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
