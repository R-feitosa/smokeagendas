import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { OsAssinatura } from '../../components/OsAssinatura'
import { OsChecklist } from '../../components/OsChecklist'
import { OsFotos } from '../../components/OsFotos'
import { OsForm } from '../../components/OsForm'
import { useOsContexto } from '../../hooks/useOsContexto'
import {
  atualizarOS, checklistDoModelo, checklistPendentes, estaAtrasada, listarFotos, listarHistorico, mudarStatus,
  descreverHistorico, nomeMembro, obterOS, ROTULO_STATUS, salvarChecklist,
} from '../../lib/os'
import type { DadosOS, FotoOS, HistoricoOS, MomentoFoto, OrdemServico, StatusOS } from '../../lib/types'

const dataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

export function OsDetalhe() {
  const { id = '' } = useParams()
  const ctx = useOsContexto()
  const [os, setOs] = useState<OrdemServico | null>(null)
  const [fotos, setFotos] = useState<FotoOS[]>([])
  const [hist, setHist] = useState<HistoricoOS[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [gerandoPdf, setGerandoPdf] = useState(false)
  const [versao, setVersao] = useState(0) // remonta formulário/checklist após mudanças do servidor

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
  if (!os || !ctx.pronto) return <p>Carregando…</p>

  const qtd = (m: MomentoFoto) => fotos.filter((f) => f.momento === m).length
  const pendentes = checklistPendentes(os.checklist ?? [])
  const pronta = {
    antes: qtd('antes') > 0,
    depois: qtd('depois') > 0,
    servico: !!os.servico_executado?.trim(),
    checklist: pendentes === 0,
  }
  const podeConcluir = pronta.antes && pronta.depois && pronta.servico && pronta.checklist
  const travada = os.status === 'concluida' || os.status === 'cancelada'
  const podeCancelar = os.user_id === ctx.meuId || ctx.souGestor(os.equipe_id)
  const equipe = ctx.equipes.find((e) => e.id === os.equipe_id)
  const tecnico = os.equipe_id ? nomeMembro(ctx.equipes, os.tecnico_id) ?? (os.tecnico_id ? os.tecnico : null) : os.tecnico

  async function acao(fn: () => Promise<OrdemServico>, msg: string) {
    setErro(null)
    setAviso(null)
    setSalvando(true)
    try {
      setOs(await fn())
      setVersao((v) => v + 1)
      setAviso(msg)
      setHist(await listarHistorico(id))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha')
    } finally {
      setSalvando(false)
    }
  }

  const trocar = (status: StatusOS, extra: Parameters<typeof mudarStatus>[2] = {}) =>
    acao(() => mudarStatus(os.id, status, extra), `Status: ${ROTULO_STATUS[status]}`)

  function salvar(d: DadosOS) {
    const atual = os!
    // trocou a categoria: oferece carregar o checklist do novo modelo
    const trocaChecklist =
      d.categoria !== atual.categoria && d.categoria &&
      ((atual.checklist ?? []).length === 0 ||
        window.confirm('Substituir o checklist atual pelo da nova categoria? As respostas atuais serão perdidas.'))
    acao(async () => {
      const salva = await atualizarOS(atual.id, d)
      if (!trocaChecklist) return salva
      return salvarChecklist(atual.id, checklistDoModelo(ctx.modelos.find((m) => m.categoria === d.categoria)))
    }, 'Alterações salvas')
  }

  async function pdf() {
    setGerandoPdf(true)
    setErro(null)
    try {
      // fotos com URL assinada recente (as da tela podem ter expirado)
      const [frescas, historico] = await Promise.all([listarFotos(os!.id), listarHistorico(os!.id)])
      const { gerarPdfOS, entregarPdf } = await import('../../lib/osPdf')
      const blob = await gerarPdfOS(os!, frescas, historico, { equipe: equipe?.nome, tecnico })
      await entregarPdf(blob, `${os!.numero}.pdf`)
    } catch {
      setErro('Não foi possível gerar o PDF. Tente de novo.')
    } finally {
      setGerandoPdf(false)
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
        {equipe && <> · {equipe.nome}</>}
        {tecnico && <> · técnico: {tecnico}</>}
      </p>

      {erro && <p className="erro">{erro}</p>}
      {aviso && <p className="ok">{aviso}</p>}
      {os.status === 'cancelada' && <p className="aviso">Motivo do cancelamento: {os.motivo_cancelamento}</p>}

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
            onClick={() => window.confirm('Concluir a OS? Depois disso fotos, checklist e assinatura ficam travados.') && trocar('concluida')}
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
        <button className="btn btn--sec" disabled={gerandoPdf} onClick={pdf}>
          {gerandoPdf ? 'Gerando PDF…' : '📄 PDF da OS'}
        </button>
        {!travada && podeCancelar && (
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
          <li className={pronta.checklist ? 'ok' : ''}>
            {pronta.checklist ? '✓' : '○'} Checklist respondido{pendentes ? ` (${pendentes} pendente${pendentes > 1 ? 's' : ''})` : ''}
          </li>
          <li className={pronta.servico ? 'ok' : ''}>{pronta.servico ? '✓' : '○'} Serviço executado descrito (e salvo)</li>
          <li className={os.assinatura_caminho ? 'ok' : ''}>{os.assinatura_caminho ? '✓' : '○'} Assinatura do cliente (opcional)</li>
        </ul>
      )}

      <h3 className="secao">Fotos</h3>
      <OsFotos os={os} fotos={fotos} onMudou={carregar} />

      <h3 className="secao">Checklist{os.categoria ? ` · ${os.categoria}` : ''}</h3>
      <OsChecklist key={`ck-${versao}`} os={os} travada={travada} onSalvo={setOs} />

      <h3 className="secao">Assinatura do cliente</h3>
      <OsAssinatura
        os={os}
        travada={travada}
        onSalvo={(o) => {
          setOs(o)
          setAviso('Assinatura registrada')
          listarHistorico(id).then(setHist)
        }}
      />

      <h3 className="secao">Dados da OS</h3>
      {travada && <p className="sub">OS {ROTULO_STATUS[os.status].toLowerCase()}: dados somente leitura.</p>}
      <OsForm
        key={`form-${versao}`}
        inicial={os}
        equipes={ctx.equipes}
        modelos={ctx.modelos}
        meuId={ctx.meuId}
        bloqueado={travada}
        salvando={salvando}
        textoBotao="Salvar alterações"
        onSalvar={salvar}
      />

      <h3 className="secao">Histórico</h3>
      <ul className="historico">
        {hist.map((h) => (
          <li key={h.id}>
            <time>{dataHora(h.quando)}</time> {descreverHistorico(h)}
            {h.autor_nome && <small> · {h.autor_nome}</small>}
          </li>
        ))}
      </ul>
    </section>
  )
}
