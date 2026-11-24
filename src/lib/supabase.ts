import { createClient } from '@supabase/supabase-js'

// Valores colados no painel da hospedagem às vezes vêm com espaço, quebra de linha ou aspas.
function limpar(v: string | undefined): string {
  return (v ?? '').trim().replace(/^["']|["']$/g, '').trim()
}

const url = limpar(import.meta.env.VITE_SUPABASE_URL).replace(/\/+$/, '')
const anon = limpar(import.meta.env.VITE_SUPABASE_ANON_KEY)

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
