// Quem pode usar as funções da agenda: usuário LOGADO e HABILITADO em agenda.perfis.
//
// Por que não basta o verify_jwt do gateway: ele aceita a chave anon do projeto
// (que é um JWT válido e vai embutida no app). Sem esta checagem, qualquer um com
// a chave pública poderia chamar a função e gastar créditos da OpenAI.
import { createClient } from 'npm:@supabase/supabase-js@2'

export type Acesso =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403; erro: string }

export async function exigirUsuarioDaAgenda(req: Request): Promise<Acesso> {
  const authorization = req.headers.get('Authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) {
    return { ok: false, status: 401, erro: 'Faça login para continuar' }
  }

  // cliente com o token de quem chamou: RLS vale como se fosse o próprio app
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
    db: { schema: 'agenda' },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // getUser() valida o token no Auth: a chave anon não é usuário e é recusada aqui
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { ok: false, status: 401, erro: 'Sessão inválida. Entre de novo.' }

  // RLS: cada um só enxerga o próprio perfil; sem linha = não habilitado
  const { data: perfil } = await supabase.from('perfis').select('id').eq('id', user.id).maybeSingle()
  if (!perfil) return { ok: false, status: 403, erro: 'Seu usuário não tem acesso à agenda.' }

  return { ok: true, userId: user.id }
}
