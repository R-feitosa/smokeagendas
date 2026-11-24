import { createClient } from '@supabase/supabase-js'

// Valores colados no painel da hospedagem às vezes vêm com espaço, quebra de linha ou aspas.
function limpar(v: string | undefined): string {
  return (v ?? '').trim().replace(/^["']|["']$/g, '').trim()
}

// Projeto hospedeiro: rf-ops. URL e chave anon são públicas por natureza (o RF OPS usa a
// mesma chave; quem protege os dados é o login + RLS). Ficam aqui como padrão para o app
// não depender de valores colados no painel da hospedagem, que já chegaram corrompidos.
const PADRAO = {
  url: 'https://gxmoxejamprvltpozlrk.supabase.co',
  anon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd4bW94ZWphbXBydmx0cG96bHJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1Nzk1NTksImV4cCI6MjA5MTE1NTU1OX0.WlLuGvvS6jKXAzGS0ryHL3z_v5mB3lt0dEAyWumGU90',
}
const urlValida = (u: string) => /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(u)
// JWT (3 partes base64url) ou chave publicável nova; qualquer espaço/quebra de linha no meio invalida
const anonValida = (k: string) => /^[\w-]+\.[\w-]+\.[\w-]+$/.test(k) || /^sb_publishable_[\w-]+$/.test(k)

const urlEnv = limpar(import.meta.env.VITE_SUPABASE_URL).replace(/\/+$/, '')
const anonEnv = limpar(import.meta.env.VITE_SUPABASE_ANON_KEY)
// usa as variáveis só se as DUAS estiverem válidas (URL e chave precisam ser do mesmo projeto)
const usarEnv = urlValida(urlEnv) && anonValida(anonEnv)
if ((urlEnv || anonEnv) && !usarEnv) console.warn('VITE_SUPABASE_URL/ANON_KEY inválidas no build; usando a configuração padrão do rf-ops')
const url = usarEnv ? urlEnv : PADRAO.url
const anon = usarEnv ? anonEnv : PADRAO.anon

/**
 * Entrada automática (sem tela de login), TEMPORÁRIA para testes: se as duas variáveis
 * existirem no build, o app entra sozinho com essa conta. Atenção: tudo que é VITE_* fica
 * visível no código do site; quem tiver o link usa a agenda dessa conta.
 * Para voltar a exigir login, apague as duas variáveis na hospedagem e publique de novo.
 */
const autoEmail = limpar(import.meta.env.VITE_ENTRADA_AUTOMATICA_EMAIL)
const autoSenha = limpar(import.meta.env.VITE_ENTRADA_AUTOMATICA_SENHA)
export const entradaAutomatica = autoEmail && autoSenha ? { email: autoEmail, password: autoSenha } : null

/** Endereço do servidor que este build está usando (não é segredo; aparece nas mensagens de erro). */
export const servidor = url || '(vazio)'

/** false quando o build foi feito sem as variáveis (ex.: deploy anterior ao cadastro delas na Vercel) */
export const configurado = urlValida(url) && anonValida(anon)

if (!configurado) {
  console.warn('Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env')
}

// As tabelas da agenda ficam no schema `agenda` do projeto Supabase hospedeiro
// (isoladas do restante). O schema precisa estar em Settings → API → Exposed schemas.
export const supabase = createClient(url || 'http://localhost', anon || 'anon', {
  db: { schema: 'agenda' },
  auth: { persistSession: true, autoRefreshToken: true },
})

/** Traduz o erro do login para algo acionável (só credencial errada vira "senha inválida"). */
export function mensagemErroLogin(error: { status?: number; message: string }): string {
  if (error.status === 400 && /invalid login credentials/i.test(error.message)) return 'E-mail ou senha inválidos'
  if (/email not confirmed/i.test(error.message)) return 'Este e-mail ainda não foi confirmado.'
  if (!error.status) return `Sem conexão com o servidor (${servidor}). Verifique a internet e tente de novo. Detalhe: ${error.message}`
  return `Não foi possível entrar (${error.status}): ${error.message}`
}
