// Chamada a cada minuto pelo pg_cron (ver migrations/0002_cron.sql).
//
// 1. reivindicar_lembretes() marca e devolve, de forma atômica, os lembretes vencidos
//    (duas execuções sobrepostas nunca pegam o mesmo lembrete).
// 2. Envia Web Push para todos os aparelhos da pessoa.
// 3. Se NENHUM aparelho recebeu por erro transitório (rede, 5xx, 429), devolve o
//    lembrete para a fila com liberar_lembrete() — ele é tentado no minuto seguinte.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'
import { json } from '../_shared/cors.ts'
import { textoQuando } from '../_shared/datas.ts'

type Lembrete = {
  id: string
  user_id: string
  titulo: string
  descricao: string | null
  inicio: string
  fuso: string
}
type Inscricao = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

let vapidPronto = false
function configurarVapid(): boolean {
  if (vapidPronto) return true
  const pub = Deno.env.get('VAPID_PUBLIC_KEY')
  const priv = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!pub || !priv) return false
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:ti@example.com', pub, priv)
  return (vapidPronto = true)
}

/** Comparação em tempo constante (evita descobrir o segredo pelo tempo de resposta). */
function segredoConfere(recebido: string | null): boolean {
  const esperado = Deno.env.get('CRON_SECRET')
  if (!esperado || !recebido) return false
  const a = new TextEncoder().encode(recebido)
  const b = new TextEncoder().encode(esperado)
  if (a.length !== b.length) return false
  let dif = 0
  for (let i = 0; i < a.length; i++) dif |= a[i] ^ b[i]
  return dif === 0
}

Deno.serve(async (req) => {
  if (!segredoConfere(req.headers.get('x-cron-secret'))) {
    return json({ erro: 'não autorizado' }, 401)
  }
  if (!configurarVapid()) {
    console.error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY não configuradas')
    return json({ erro: 'push não configurado' }, 500)
  }

  const { data, error } = await supabase.rpc('reivindicar_lembretes', { lote: 200 })
  if (error) {
    console.error(error)
    return json({ erro: error.message }, 500)
  }
  const lembretes = (data ?? []) as Lembrete[]
  if (lembretes.length === 0) return json({ eventos: 0, enviados: 0 })

  // uma consulta só para os aparelhos de todas as pessoas do lote
  const userIds = [...new Set(lembretes.map((l) => l.user_id))]
  const { data: subsData, error: subsErro } = await supabase
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', userIds)
  if (subsErro) {
    console.error(subsErro)
    await Promise.all(lembretes.map((l) => supabase.rpc('liberar_lembrete', { evento_id: l.id })))
    return json({ erro: subsErro.message }, 500)
  }
  const porUsuario = new Map<string, Inscricao[]>()
  for (const s of (subsData ?? []) as Inscricao[]) {
    porUsuario.set(s.user_id, [...(porUsuario.get(s.user_id) ?? []), s])
  }

  const agora = new Date()
  let enviados = 0
  let devolvidos = 0
  const expiradas: string[] = []

  for (const l of lembretes) {
    const subs = porUsuario.get(l.user_id) ?? []
    const quando = textoQuando(new Date(l.inicio), l.fuso, agora)
    const payload = JSON.stringify({
      title: l.titulo,
      body: `${quando}${l.descricao ? ` — ${l.descricao}` : ''}`,
      tag: l.id,
      eventId: l.id,
      url: '/',
    })

    const resultados = await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 60 * 60, urgency: 'high' },
        ),
      ),
    )

    let ok = 0
    let transitorio = false
    resultados.forEach((r, i) => {
      if (r.status === 'fulfilled') return void ok++
      const status = (r.reason as { statusCode?: number }).statusCode
      // 404/410 = aparelho desinstalou ou revogou permissão
      if (status === 404 || status === 410) expiradas.push(subs[i].id)
      else {
        transitorio = true
        console.error('push falhou', status, r.reason)
      }
    })
    enviados += ok

    if (ok === 0 && transitorio) {
      await supabase.rpc('liberar_lembrete', { evento_id: l.id })
      devolvidos++
    }
  }

  if (expiradas.length) {
    await supabase.from('push_subscriptions').delete().in('id', expiradas)
  }

  return json({ eventos: lembretes.length, enviados, devolvidos, inscricoes_removidas: expiradas.length })
})
