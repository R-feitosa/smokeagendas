import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ConfirmEvento } from '../components/ConfirmEvento'
import { Fumaca, type FumacaHandle } from '../components/Fumaca'
import { Recorder } from '../components/Recorder'
import { criarEvento, processarAudio } from '../lib/api'
import { detectarResponsavel, useEquipe } from '../lib/equipe'
import type { Rascunho } from '../lib/types'

type Etapa = 'gravar' | 'processando' | 'confirmar'

const EXEMPLOS = [
  'Reunião com o cliente sexta às 15h, me avisa 30 minutos antes',
  'Pagar o boleto do condomínio amanhã às 9h',
  'Audiência dia 12 às 14h, me lembra 1 dia antes',
  'Revisão do caixa toda segunda às 8h',
]

export function Gravar() {
  const navigate = useNavigate()
  const [etapa, setEtapa] = useState<Etapa>('gravar')
  const [audio, setAudio] = useState<Blob | null>(null) // guardado para reenviar sem regravar
  const [rascunho, setRascunho] = useState<Rascunho | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const equipe = useEquipe()
  const spinner = useRef<HTMLDivElement>(null)
  const fumaca = useRef<FumacaHandle>(null)

  // "puf" ao terminar de gravar: a baforada sai de onde estava o botão
  useEffect(() => {
    if (etapa === 'processando') fumaca.current?.rajada(24)
  }, [etapa])

  async function enviar(blob: Blob) {
    setErro(null)
    setAudio(blob)
    setEtapa('processando')
    try {
      const r = await processarAudio(blob)
      setRascunho({ ...r, responsavel: detectarResponsavel(r.transcricao, equipe) })
      setEtapa('confirmar')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao processar o áudio')
      setEtapa('gravar')
    }
  }

  async function salvar(r: Rascunho) {
    setSalvando(true)
    setErro(null)
    try {
      await criarEvento(r)
      navigate('/')
    } catch {
      setErro('Não foi possível salvar. Tente de novo.')
      setSalvando(false)
    }
  }

  function recomecar() {
    setAudio(null)
    setRascunho(null)
    setErro(null)
    setEtapa('gravar')
  }

  return (
    <section>
      <h2>Gravar compromisso</h2>
      <p className="sub">Diga o quê, quando e com quanta antecedência quer ser avisado.</p>

      {erro && (
        <div className="erro-box" role="alert">
          <p>{erro}</p>
          {audio && etapa === 'gravar' && (
            <button type="button" className="btn btn--sec" onClick={() => enviar(audio)}>
              Enviar o mesmo áudio de novo
            </button>
          )}
        </div>
      )}

      {etapa === 'gravar' && (
        <>
          <Recorder onComecar={() => setErro(null)} onGravado={enviar} onErro={setErro} />
          <div className="exemplos">
            <h3>Você pode dizer, por exemplo</h3>
            <ul>
              {EXEMPLOS.map((e) => (
                <li key={e}>“{e}”</li>
              ))}
            </ul>
          </div>
        </>
      )}

      {etapa === 'processando' && (
        <div className="processando" role="status">
          <div className="processando__palco">
            <Fumaca ref={fumaca} className="processando__fumaca" tom="escuro" fonte={spinner} ponto={{ x: 0.5, y: 0.2 }} taxa={4} aneis={0.6} escala={1.1} />
            <div ref={spinner} className="spinner" aria-hidden="true" />
          </div>
          <p>Entendendo o que você disse…</p>
        </div>
      )}

      {etapa === 'confirmar' && rascunho && (
        <ConfirmEvento rascunho={rascunho} salvando={salvando} onSalvar={salvar} onDescartar={recomecar} />
      )}
    </section>
  )
}
