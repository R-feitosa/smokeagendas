import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Evento } from './types'

/**
 * Agenda da equipe: o dono da conta (ex.: Saulo) registra também os compromissos
 * da equipe dele. eventos.responsavel = null → "Minha"; = nome → "Equipe".
 */
let cache: string[] | null = null
const ouvintes = new Set<(e: string[]) => void>()

export async function carregarEquipe(): Promise<string[]> {
  const { data, error } = await supabase.from('perfis').select('equipe').maybeSingle()
  if (error) throw error
  cache = (data?.equipe as string[] | undefined) ?? []
  ouvintes.forEach((f) => f(cache!))
  return cache
}

export async function salvarEquipe(nomes: string[]): Promise<string[]> {
  const limpos = [...new Set(nomes.map((n) => n.trim()).filter(Boolean))].slice(0, 20)
  const { data: u } = await supabase.auth.getUser()
  const { error } = await supabase.from('perfis').update({ equipe: limpos }).eq('id', u.user?.id ?? '')
  if (error) throw error
  cache = limpos
  ouvintes.forEach((f) => f(limpos))
  return limpos
}

/** Membros da equipe (carrega uma vez e compartilha entre as telas). */
export function useEquipe(): string[] {
  const [equipe, setEquipe] = useState<string[]>(cache ?? [])
  useEffect(() => {
    ouvintes.add(setEquipe)
    if (!cache) carregarEquipe().catch(() => {})
    return () => {
      ouvintes.delete(setEquipe)
    }
  }, [])
  return equipe
}

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Se a fala cita um membro da equipe ("reunião do Toyota"), sugere ele como responsável. */
export function detectarResponsavel(transcricao: string | null, equipe: string[]): string | null {
  if (!transcricao) return null
  const texto = ` ${normalizar(transcricao).replace(/[^a-z0-9]+/g, ' ')} `
  return equipe.find((nome) => texto.includes(` ${normalizar(nome).replace(/[^a-z0-9]+/g, ' ').trim()} `)) ?? null
}

// ---- filtro Tudo | Minha | Equipe (lembrado no aparelho, igual em Hoje e Calendário) ----
export type FiltroDono = 'tudo' | 'minha' | 'equipe'
const CHAVE = 'agenda.filtro.dono'

function filtroSalvo(): FiltroDono {
  try {
    const f = localStorage.getItem(CHAVE)
    return f === 'minha' || f === 'equipe' ? f : 'tudo'
  } catch {
    return 'tudo'
  }
}

export function useFiltroDono() {
  const [filtro, setFiltroState] = useState<FiltroDono>(filtroSalvo)
  const setFiltro = (f: FiltroDono) => {
    setFiltroState(f)
    try {
      localStorage.setItem(CHAVE, f)
    } catch {
      /* sem armazenamento: só não lembra */
    }
  }
  const aplicar = (evs: Evento[]) =>
    filtro === 'tudo' ? evs : evs.filter((e) => (filtro === 'minha' ? !e.responsavel : !!e.responsavel))
  return { filtro, setFiltro, aplicar }
}
