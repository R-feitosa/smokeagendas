/// <reference lib="webworker" />
// Service worker: cache do app (offline) + recebimento de push + cliques na notificação.
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>
}

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

type PushPayload = {
  title?: string
  body?: string
  tag?: string
  eventId?: string
  envio?: number
  url?: string
}

// Opções que pedem alerta sonoro/vibração ao sistema. A tipagem do lib "WebWorker" não traz
// vibrate/renotify/actions, mas os navegadores aceitam em runtime.
type OpcoesNotificacao = NotificationOptions & {
  vibrate?: number[]
  renotify?: boolean
  actions?: { action: string; title: string }[]
}
const ALERTA = { silent: false, renotify: true, vibrate: [400, 150, 400, 150, 700] }

/** Se o app estiver aberto, ele toca o alarme sonoro próprio (ver src/lib/som.ts). */
async function avisarAppAberto(titulo: string): Promise<void> {
  const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  for (const j of janelas) j.postMessage({ tipo: 'lembrete', titulo })
}

/** Fecha os avisos já exibidos deste compromisso (reenvios não se acumulam). */
async function fecharAvisosDoEvento(eventId?: string): Promise<void> {
  if (!eventId) return
  try {
    const abertas = await self.registration.getNotifications()
    for (const n of abertas) if ((n.data as { eventId?: string })?.eventId === eventId) n.close()
  } catch {
    // getNotifications indisponível: segue sem fechar
  }
}

self.addEventListener('push', (event) => {
  const data: PushPayload = event.data?.json() ?? {}
  event.waitUntil(
    fecharAvisosDoEvento(data.eventId)
      .then(() =>
        self.registration.showNotification(data.title ?? 'Lembrete', {
          ...ALERTA,
          body: data.body,
          tag: data.tag,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          requireInteraction: true,
          data: { url: data.url ?? '/', eventId: data.eventId },
          actions: [
            { action: 'concluir', title: 'Concluir' },
            { action: 'adiar', title: 'Adiar 10 min' },
          ],
        } as OpcoesNotificacao),
      )
      .then(() => avisarAppAberto(data.title ?? 'Lembrete')),
  )
})

// Clicar abre o app; os botões mandam ?acao=...&id=... e o app executa (ver useAcaoNotificacao)
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const { url, eventId } = event.notification.data as { url: string; eventId?: string }
  const acao = event.action // '' | 'concluir' | 'adiar'
  const destino = acao && eventId ? `/?acao=${acao}&id=${eventId}` : url

  event.waitUntil(
    (async () => {
      await fecharAvisosDoEvento(eventId)
      const abertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const c of abertas) {
        if ('focus' in c) {
          await c.focus()
          if ('navigate' in c) await (c as WindowClient).navigate(destino)
          return
        }
      }
      await self.clients.openWindow(destino)
    })(),
  )
})
