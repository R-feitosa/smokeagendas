// Chamada a cada minuto pelo pg_cron (ver migrations/0002_cron.sql).
// Autenticação: o cabeçalho x-cron-secret é conferido contra o Vault
// (agenda.cron_segredo_confere) — o segredo não existe em variável de ambiente.
//
// 1. reivindicar_lembretes() marca e devolve, de forma atômica, os lembretes vencidos
//    (duas execuções sobrepostas nunca pegam o mesmo lembrete).
//    Inclui os REENVIOS: compromisso ainda pendente recebe novo aviso a cada
//    perfis.reenviar_a_cada_min, até perfis.max_reenvios vezes ("envio" = 1, 2, ...).
// 2. Envia Web Push para todos os aparelhos da pessoa.
// 3. Se NENHUM aparelho recebeu por erro transitório (rede, 5xx, 429), devolve o
//    lembrete para a fila com liberar_lembrete() — ele é tentado no minuto seguinte.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'
import { json } from '../_shared/cors.ts'
import { montarNotificacao, type LembreteParaPush } from '../_shared/notificacao.ts'
import { diagnosticarIA, escolherProvedor } from '../_shared/provedor.ts'

type Lembrete = LembreteParaPush & { user_id: string }
type Inscricao = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }

// tudo da agenda fica no schema `agenda` (isolado do projeto hospedeiro)
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { db: { schema: 'agenda' }, auth: { persistSession: false } },
)

let vapidPronto = false
function configurarVapid(): boolean {
  if (vapidPronto) return true
  const pub = Deno.env.get('AGENDA_VAPID_PUBLIC_KEY')
  const priv = Deno.env.get('AGENDA_VAPID_PRIVATE_KEY')
  if (!pub || !priv) return false
  webpush.setVapidDetails(Deno.env.get('AGENDA_VAPID_SUBJECT') ?? 'mailto:ti@example.com', pub, priv)
  return (vapidPronto = true)
}

/** Confere o segredo no Vault. Sem cabeçalho, nem consulta o banco. */
async function segredoConfere(recebido: string | null): Promise<boolean> {
  if (!recebido || recebido.length > 200) return false
  const { data, error } = await supabase.rpc('cron_segredo_confere', { segredo: recebido })
  if (error) console.error('conferência do segredo falhou', error.message)
  return data === true
}

Deno.serve(async (req) => {
  if (!(await segredoConfere(req.headers.get('x-cron-secret')))) {
    return json({ erro: 'não autorizado' }, 401)
  }

  // Diagnóstico (só com o segredo do cron): confere chave de IA e modelos, sem expor valores.
  //   corpo: {"diagnostico": true}
  const corpo = await req.json().catch(() => ({}))
  if (corpo?.diagnostico === true) {
    try {
      const ia = escolherProvedor((nome) => Deno.env.get(nome))
      return json({ ia: await diagnosticarIA(ia), push_configurado: configurarVapid() })
    } catch (e) {
      return json({ ia: { erro: (e as Error).message }, push_configurado: configurarVapid() })
    }
  }
  if (!configurarVapid()) {
    console.error('AGENDA_VAPID_PUBLIC_KEY / AGENDA_VAPID_PRIVATE_KEY não configuradas')
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
  const reenvios = lembretes.filter((l) => l.envio > 1).length
  const expiradas: string[] = []

  for (const l of lembretes) {
    const subs = porUsuario.get(l.user_id) ?? []
    const payload = JSON.stringify(montarNotificacao(l, agora))

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

  return json({ eventos: lembretes.length, reenvios, enviados, devolvidos, inscricoes_removidas: expiradas.length })
})
