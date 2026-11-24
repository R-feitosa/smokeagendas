// CORS. Em produção, defina AGENDA_ALLOWED_ORIGINS (separado por vírgula), ex.:
//   supabase secrets set AGENDA_ALLOWED_ORIGINS=https://agenda.seudominio.com.br,http://localhost:5173
// Sem a variável, qualquer origem é aceita (útil só em desenvolvimento).

const BASE = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function corsHeaders(req: Request): Record<string, string> {
  const permitidas = (Deno.env.get('AGENDA_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (permitidas.length === 0) return { ...BASE, 'Access-Control-Allow-Origin': '*' }

  const origem = req.headers.get('origin') ?? ''
  return {
    ...BASE,
    'Access-Control-Allow-Origin': permitidas.includes(origem) ? origem : permitidas[0],
    Vary: 'Origin',
  }
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}
