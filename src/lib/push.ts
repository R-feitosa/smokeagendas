import { supabase } from './supabase'

function urlBase64ParaUint8(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export function pushSuportado(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** iOS só libera push se o app estiver instalado na tela inicial */
export function estaInstalado(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

export function ehIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export async function statusPush(): Promise<'ativo' | 'inativo' | 'negado' | 'indisponivel'> {
  if (!pushSuportado()) return 'indisponivel'
  if (Notification.permission === 'denied') return 'negado'
  const reg = await navigator.serviceWorker.ready
  return (await reg.pushManager.getSubscription()) ? 'ativo' : 'inativo'
}

/** Precisa ser chamada a partir de um toque do usuário (exigência do iOS). */
export async function ativarPush(): Promise<void> {
  const chave = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!chave) throw new Error('VITE_VAPID_PUBLIC_KEY não configurada')

  const permissao = await Notification.requestPermission()
  if (permissao !== 'granted') throw new Error('Permissão de notificação negada')

  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ParaUint8(chave) as BufferSource,
    }))

  const json = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      endpoint: sub.endpoint,
      p256dh: json.keys!.p256dh,
      auth: json.keys!.auth,
      user_agent: navigator.userAgent,
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw error
}

export async function desativarPush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}
