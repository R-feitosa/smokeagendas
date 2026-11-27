import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { OsFotos } from '../../components/OsFotos'
import { OsForm } from '../../components/OsForm'
import {
  atualizarOS, estaAtrasada, listarFotos, listarHistorico, mudarStatus, obterOS,
  ROTULO_MOMENTO, ROTULO_STATUS,
} from '../../lib/os'
import type { DadosOS, FotoOS, HistoricoOS, MomentoFoto, OrdemServico, StatusOS } from '../../lib/types'

const dataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

export function OsDetalhe() {
  const { id = '' } = useParams()
  const [os, setOs] = useState<OrdemServico | null>(null)
  const [fotos, setFotos] = useState<FotoOS[]>([])
  const [hist, setHist] = useState<HistoricoOS[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [formKey, setFormKey] = useState(0)

  const carregar = useCallback(async () => {
    try {
      const [o, f, h] = await Promise.all([obterOS(id), listarFotos(id), listarHistorico(id)])
      setOs(o)
      setFotos(f)
      setHist(h)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar')
    }
  }, [id])

  useEffect(() => {
    carregar()
  }, [carregar])

  if (erro && !os) return <p className="erro">{erro}</p>
  if (!os) return <p>Carregando…</p>

  const qtd = (m: MomentoFoto) => fotos.filter((f) => f.momento === m).length
  const pronta = { antes: qtd('antes') > 0, depois: qtd('depois') > 0, servico: !!os.servico_executado?.trim() }
  const podeConcluir = pronta.antes && pronta.depois && pronta.servico
  const travada = os.status === 'concluida' || os.status === 'cancelada'

  async function trocar(status: StatusOS, extra: Parameters<typeof mudarStatus>[2] = {}) {
    setErro(null)
    setAviso(null)
    setSalvando(true)
    try {
      setOs(await mudarStatus(os!.id, status, extra))
      setFormKey((k) => k + 1)
      setAviso(`Status: ${ROTULO_STATUS[status]}`)
      setHist(await listarHistorico(os!.id))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao mudar status')
    } finally {
      setSalvando(false)
    }
  }

  async function salvar(d: DadosOS) {
    setErro(null)
    setAviso(null)
    setSalvando(true)
    try {
      setOs(await atualizarOS(os!.id, d))
      setAviso('Alterações salvas')
      setHist(await listarHistorico(os!.id))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao salvar')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section>
      <Link to="/os" className="voltar">← Ordens de Serviço</Link>
      <div className="os__topo">
        <h2>{os.numero}</h2>
        <span className={`status status--${os.status}`}>{ROTULO_STATUS[os.status]}</span>
      </div>
      <p className="sub os__datas">
        Aberta {dataHora(os.aberta_em)}
        {os.prazo && <> · prazo {dataHora(os.prazo)}{estaAtrasada(os) && ' ⚠️'}</>}
        {os.concluida_em && <> · concluída {dataHora(os.concluida_em)}</>}
        {os.cancelada_em && <> · cancelada {dataHora(os.cancelada_em)}</>}
      </p>

      {erro && <p className="erro">{erro}</p>}
      {aviso && <p className="ok">{aviso}</p>}
      {os.status === 'cancelada' && <p className="aviso">Motivo do cancelamento: {os.motivo_cancelamento}</p>}

      {/* Ações de status */}
      <div className="acoes-status">
        {os.status === 'aberta' && (
          <button className="btn" disabled={salvando} onClick={() => trocar('em_andamento')}>▶ Iniciar atendimento</button>
        )}
        {os.status === 'em_andamento' && (
          <button className="btn btn--sec" disabled={salvando} onClick={() => trocar('aguardando_peca')}>⏸ Aguardando peça</button>
        )}
        {os.status === 'aguardando_peca' && (
          <button className="btn" disabled={salvando} onClick={() => trocar('em_andamento')}>▶ Retomar</button>
        )}
        {!travada && (
          <button
            className="btn btn--ok"
            disabled={salvando || !podeConcluir}
            onClick={() => window.confirm('Concluir a OS? Depois disso fotos e dados ficam travados.') && trocar('concluida')}
          >
            ✓ Concluir OS
          </button>
        )}
        {os.status === 'concluida' && (
          <button
            className="btn btn--sec"
            disabled={salvando}
            onClick={() => window.confirm('Reabrir a OS? A reabertura fica no histórico.') && trocar('em_andamento')}
          >
            ↺ Reabrir
          </button>
        )}
        {!travada && (
          <button
            className="btn btn--perigo"
            disabled={salvando}
            onClick={() => {
              const motivo = window.prompt('Motivo do cancelamento (obrigatório). Cancelamento é definitivo.')
              if (motivo?.trim()) trocar('cancelada', { motivo_cancelamento: motivo.trim() })
            }}
          >
            Cancelar OS
          </button>
        )}
      </div>

      {!travada && (
        <ul className="checklist">
          <li className={pronta.antes ? 'ok' : ''}>{pronta.antes ? '✓' : '○'} Foto de antes</li>
          <li className={pronta.depois ? 'ok' : ''}>{pronta.depois ? '✓' : '○'} Foto de depois</li>
          <li className={pronta.servico ? 'ok' : ''}>{pronta.servico ? '✓' : '○'} Serviço executado descrito (e salvo)</li>
        </ul>
      )}

      <h3 className="secao">Fotos</h3>
      <OsFotos os={os} fotos={fotos} onMudou={carregar} />

      <h3 className="secao">Dados da OS</h3>
      {travada && <p className="sub">OS {ROTULO_STATUS[os.status].toLowerCase()}: dados somente leitura.</p>}
      <OsForm key={formKey} inicial={os} bloqueado={travada} salvando={salvando} textoBotao="Salvar alterações" onSalvar={salvar} />

      <h3 className="secao">Histórico</h3>
      <ul className="historico">
        {hist.map((h) => (
          <li key={h.id}>
            <time>{dataHora(h.quando)}</time> {descrever(h)}
          </li>
        ))}
      </ul>
    </section>
  )
}

function descrever(h: HistoricoOS): string {
  const st = (s: string | null) => (s && s in ROTULO_STATUS ? ROTULO_STATUS[s as StatusOS] : s ?? '')
  const mo = (s: string | null) => (s && s in ROTULO_MOMENTO ? ROTULO_MOMENTO[s as MomentoFoto].toLowerCase() : s ?? '')
  switch (h.acao) {
    case 'abertura': return `OS aberta (${h.detalhe})`
    case 'status': return `Status: ${st(h.de)} → ${st(h.para)}${h.detalhe ? ` — ${h.detalhe}` : ''}`
    case 'foto_incluida': return `Foto de ${mo(h.para)} incluída${h.detalhe ? ` — ${h.detalhe}` : ''}`
    case 'foto_removida': return `Foto de ${mo(h.de)} removida${h.detalhe ? ` — ${h.detalhe}` : ''}`
    case 'edicao': return 'Dados editados'
  }
}
