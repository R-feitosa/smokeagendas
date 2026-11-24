// Chamada a cada minuto pelo pg_cron (ver migrations/0002_cron.sql).
// Busca lembretes vencidos, envia Web Push para todos os aparelhos da pessoa
// e marca como enviado.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'
import { json } from '../_shared/cors.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:ti@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) {
    return json({ erro: 'não autorizado' }, 401)
  }

  const { data: eventos, error } = await supabase.rpc('eventos_para_lembrar')
  if (error) {
    console.error(error)
    return json({ erro: error.message }, 500)
  }

  let enviados = 0
  for (const ev of eventos ?? []) {
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', ev.user_id)

    const hora = new Date(ev.inicio).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Fortaleza',
    })
    const payload = JSON.stringify({
      title: ev.titulo,
      body: `Hoje às ${hora}${ev.descricao ? ` — ${ev.descricao}` : ''}`,
      tag: ev.id,
      eventId: ev.id,
      url: '/',
    })

    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        )
        enviados++
      } catch (e) {
        // 404/410 = aparelho desinstalou ou revogou permissão
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', s.id)
        } else {
          console.error('push falhou', status, e)
        }
      }
    }

    await supabase
      .from('eventos')
      .update({ lembrete_enviado_em: new Date().toISOString(), adiar_ate: null })
      .eq('id', ev.id)
  }

  return json({ eventos: eventos?.length ?? 0, enviados })
})
