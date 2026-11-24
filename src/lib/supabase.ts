import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anon) {
  console.warn('Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env')
}

// As tabelas da agenda ficam no schema `agenda` do projeto Supabase hospedeiro
// (isoladas do restante). O schema precisa estar em Settings → API → Exposed schemas.
export const supabase = createClient(url ?? 'http://localhost', anon ?? 'anon', {
  db: { schema: 'agenda' },
  auth: { persistSession: true, autoRefreshToken: true },
})
