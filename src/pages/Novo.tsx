import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ConfirmEvento } from '../components/ConfirmEvento'
import { Recorder } from '../components/Recorder'
import { criarEvento, processarAudio } from '../lib/api'
import type { Rascunho } from '../lib/types'

type Etapa = 'gravar' | 'processando' | 'confirmar'

export function Novo() {
  const navigate = useNavigate()
  const [etapa, setEtapa] = useState<Etapa>('gravar')
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function aoGravar(audio: Blob) {
    setErro(null)
    setEtapa('processando')
    try {
      setRascunho(await processarAudio(audio))
      setEtapa('confirmar')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao processar o áudio')
      setEtapa('gravar')
    }
  }

  async function salvar(r: Rascunho) {
    setSalvando(true)
    try {
      await criarEvento(r)
      navigate('/')
    } catch {
      setErro('Não foi possível salvar. Tente de novo.')
      setSalvando(false)
    }
  }

  return (
    <section>
      <h2>Novo compromisso</h2>
      {erro && <p className="erro">{erro}</p>}

      {etapa === 'gravar' && <Recorder onGravado={aoGravar} onErro={setErro} />}
      {etapa === 'processando' && <p className="processando">Entendendo o que você disse…</p>}
      {etapa === 'confirmar' && rascunho && (
        <ConfirmEvento
          rascunho={rascunho}
          salvando={salvando}
          onSalvar={salvar}
          onDescartar={() => {
            setRascunho(null)
            setEtapa('gravar')
          }}
        />
      )}
    </section>
  )
}
