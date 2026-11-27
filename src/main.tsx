import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import '@fontsource/cinzel/400.css'
import '@fontsource/cinzel/600.css'
import './styles.css'
import './liquid-glass.css' // TESTE: visual Liquid Glass (branch claude/liquid-glass-teste)

// Atualização do app instalado: procura versão nova ao abrir, ao voltar para a tela e a
// cada 15 min. A versão nova assume na hora (skipWaiting no sw.ts) e, com registerType
// 'autoUpdate', a página recarrega sozinha — sem precisar fechar e abrir o app.
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return
    const procurar = () => {
      if (navigator.onLine) reg.update().catch(() => {})
    }
    setInterval(procurar, 15 * 60_000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') procurar()
    })
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
