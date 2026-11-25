import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'

// versão exibida em Ajustes: commit (a Vercel informa em VERCEL_GIT_COMMIT_SHA) + data/hora do build
function commitAtual(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'local'
  }
}
const dataBuild = new Date().toLocaleString('pt-BR', {
  timeZone: 'America/Fortaleza',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

export default defineConfig({
  define: { __VERSAO__: JSON.stringify(`${commitAtual()} · ${dataBuild}`) },
  plugins: [
    react(),
    VitePWA({
      // Service worker próprio (src/sw.ts) para tratar push e cliques na notificação
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      // inclui as fontes da marca no cache offline
      injectManifest: { globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest,woff2}'] },
      // o registro é feito em src/main.tsx (registerSW), com busca de atualização
      injectRegister: false,
      manifest: {
        name: 'Agenda por Voz',
        short_name: 'Agenda',
        description: 'Grave um áudio e ele vira compromisso com lembrete.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#121b45',
        theme_color: '#22357a',
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
