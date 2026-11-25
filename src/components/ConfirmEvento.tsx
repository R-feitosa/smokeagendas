import { useState } from 'react'
import type { Rascunho, Recorrencia } from '../lib/types'
import { deInput, paraInput, rotuloAntecedencia } from '../lib/datas'
import { useEquipe } from '../lib/equipe'

const ANTECEDENCIAS = [0, 5, 10, 15, 30, 60, 120, 1440]

/** Se a IA devolver um valor fora da lista (ex.: 45 min), ele entra nas opções; senão o select mostraria outro valor e salvaria este. */
function opcoesAntecedencia(atual: number) {
  return ANTECEDENCIAS.includes(atual) ? ANTECEDENCIAS : [...ANTECEDENCIAS, atual].sort((a, b) => a - b)
}

type Props = {
  rascunho: Rascunho
  salvando: boolean
  onSalvar: (r: Rascunho) => void
  onDescartar: () => void
}

/** Tela de conferência: a IA erra às vezes, então nada é salvo sem o "ok" da pessoa. */
export function ConfirmEvento({ rascunho, salvando, onSalvar, onDescartar }: Props) {
  const [titulo, setTitulo] = useState(rascunho.titulo)
  const [descricao, setDescricao] = useState(rascunho.descricao ?? '')
  const [inicio, setInicio] = useState(paraInput(rascunho.inicio))
  const [antes, setAntes] = useState(rascunho.lembrar_min_antes)
  const [recorrencia, setRecorrencia] = useState<Recorrencia>(rascunho.recorrencia)
  const [responsavel, setResponsavel] = useState<string>(rascunho.responsavel ?? '')
  const equipe = useEquipe()

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        onSalvar({
          ...rascunho,
          titulo: titulo.trim(),
          descricao: descricao.trim() || null,
          inicio: deInput(inicio),
          lembrar_min_antes: antes,
          recorrencia,
          responsavel: responsavel || null,
        })
      }}
    >
      {rascunho.transcricao && <blockquote className="transcricao">“{rascunho.transcricao}”</blockquote>}

      {(equipe.length > 0 || responsavel) && (
        <label>
          De quem é
          <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
            <option value="">Meu</option>
            {[...new Set([...equipe, ...(responsavel ? [responsavel] : [])])].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}

      <label>
        Título
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} required />
      </label>

      <label>
        Quando
        <input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} required />
      </label>

      <label>
        Avisar antes
        <select value={antes} onChange={(e) => setAntes(Number(e.target.value))}>
          {opcoesAntecedencia(antes).map((m) => (
            <option key={m} value={m}>
              {rotuloAntecedencia(m)}
            </option>
          ))}
        </select>
      </label>

      <label>
        Repetir
        <select value={recorrencia ?? ''} onChange={(e) => setRecorrencia((e.target.value || null) as Recorrencia)}>
          <option value="">Não repete</option>
          <option value="diaria">Todo dia</option>
          <option value="semanal">Toda semana</option>
          <option value="mensal">Todo mês</option>
        </select>
      </label>

      <label>
        Detalhes
        <textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </label>

      <div className="form__acoes">
        <button type="button" className="btn btn--sec" onClick={onDescartar} disabled={salvando}>
          Descartar
        </button>
        <button type="submit" className="btn" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  )
}
