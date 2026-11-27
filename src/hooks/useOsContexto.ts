import { useEffect, useState } from 'react'
import { minhasEquipes, modelosChecklist } from '../lib/os'
import { supabase } from '../lib/supabase'
import type { Equipe, ModeloChecklist } from '../lib/types'

/** Quem sou, minhas equipes e os modelos de checklist — carregados uma vez por tela. */
export function useOsContexto() {
  const [meuId, setMeuId] = useState('')
  const [equipes, setEquipes] = useState<Equipe[]>([])
  const [modelos, setModelos] = useState<ModeloChecklist[]>([])
  const [pronto, setPronto] = useState(false)

  useEffect(() => {
    let vivo = true
    Promise.all([
      supabase.auth.getSession().then(({ data }) => data.session?.user.id ?? ''),
      minhasEquipes().catch(() => [] as Equipe[]),
      modelosChecklist().catch(() => [] as ModeloChecklist[]),
    ]).then(([id, eq, mod]) => {
      if (!vivo) return
      setMeuId(id)
      setEquipes(eq)
      setModelos(mod)
      setPronto(true)
    })
    return () => {
      vivo = false
    }
  }, [])

  const souGestor = (equipeId: string | null) => !!equipeId && equipes.find((e) => e.id === equipeId)?.meu_papel === 'gestor'
  return { meuId, equipes, modelos, pronto, souGestor, recarregarEquipes: () => minhasEquipes().then(setEquipes) }
}
