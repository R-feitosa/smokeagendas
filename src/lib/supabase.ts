import { createClient } from '@supabase/supabase-js'

// Valores colados no painel da hospedagem às vezes vêm com espaço, quebra de linha ou aspas.
function limpar(v: string | undefined): string {
  return (v ?? '').trim().replace(/^["']|["']$/g, '').trim()
}

const url = limpar(import.meta.env.VITE_SUPABASE_URL).replace(/\/+$/, '')
const anon = limpar(import.meta.env.VITE_SUPABASE_ANON_KEY)

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
export const configurado = Boolean(anon) && /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)

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
  if (!error.status) return `Sem conexão com o servidor (${servidor}). Verifique a internet e tente de novo.`
  return `Não foi possível entrar (${error.status}): ${error.message}`
}
