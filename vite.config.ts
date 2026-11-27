import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Service worker próprio (src/sw.ts) para tratar push e cliques na notificação
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      // jsPDF traz extras opcionais (html2canvas, DOMPurify, canvg) que não usamos: não pré-baixar.
      // O chunk do PDF (osPdf) continua no cache para gerar o relatório offline.
      injectManifest: { globIgnores: ['**/html2canvas*', '**/purify*', '**/index.es-*'] },
      injectRegister: 'auto',
      manifest: {
        name: 'Agenda por Voz',
        short_name: 'Agenda',
        description: 'Grave um áudio e ele vira compromisso com lembrete.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#4f46e5',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: { enabled: true, type: 'module' },
    }),
  ],
})
