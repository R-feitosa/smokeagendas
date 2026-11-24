import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { entradaAutomatica, mensagemErroLogin, supabase } from '../lib/supabase'

export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [carregando, setCarregando] = useState(true)
  /** falha da entrada automática: a tela de login aparece com este erro, para não esconder o problema */
  const [erroEntrada, setErroEntrada] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      let { data: { session: s } } = await supabase.auth.getSession()
      if (!s && entradaAutomatica) {
        const { data, error } = await supabase.auth.signInWithPassword(entradaAutomatica)
        if (error) vivo && setErroEntrada(mensagemErroLogin(error))
        else s = data.session
      }
      if (!vivo) return
      setSession(s)
      setCarregando(false)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => {
      vivo = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return { session, carregando, erroEntrada }
}
