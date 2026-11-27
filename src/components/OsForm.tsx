import { useState } from 'react'
import { deInput, paraInput } from '../lib/datas'
import { ROTULO_PRIORIDADE, ROTULO_TIPO } from '../lib/os'
import type { DadosOS, OrdemServico, PrioridadeOS, TipoOS } from '../lib/types'

type Props = {
  inicial?: OrdemServico
  bloqueado?: boolean
  salvando: boolean
  textoBotao: string
  onSalvar: (d: DadosOS) => void
  onCancelar?: () => void
}

const vazio = (v: string) => (v.trim() ? v.trim() : null)

/** Formulário da OS (abrir e editar). Número, datas e status são do servidor. */
export function OsForm({ inicial, bloqueado = false, salvando, textoBotao, onSalvar, onCancelar }: Props) {
  const [f, setF] = useState({
    cliente: inicial?.cliente ?? 'PHILCO',
    unidade: inicial?.unidade ?? '',
    solicitante: inicial?.solicitante ?? '',
    contato: inicial?.contato ?? '',
    tecnico: inicial?.tecnico ?? '',
    tipo: (inicial?.tipo ?? 'corretiva') as TipoOS,
    prioridade: (inicial?.prioridade ?? 'media') as PrioridadeOS,
    equipamento: inicial?.equipamento ?? '',
    marca: inicial?.marca ?? 'Philco',
    modelo: inicial?.modelo ?? '',
    numero_serie: inicial?.numero_serie ?? '',
    patrimonio: inicial?.patrimonio ?? '',
    problema: inicial?.problema ?? '',
    diagnostico: inicial?.diagnostico ?? '',
    servico_executado: inicial?.servico_executado ?? '',
    pecas: inicial?.pecas ?? '',
    observacoes: inicial?.observacoes ?? '',
    valor: inicial?.valor != null ? String(inicial.valor).replace('.', ',') : '',
    prazo: inicial?.prazo ? paraInput(inicial.prazo) : '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const editando = !!inicial

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        const valor = f.valor.trim() ? Number(f.valor.replace(/\./g, '').replace(',', '.')) : null
        onSalvar({
          cliente: f.cliente.trim() || 'PHILCO',
          unidade: vazio(f.unidade),
          solicitante: vazio(f.solicitante),
          contato: vazio(f.contato),
          tecnico: vazio(f.tecnico),
          tipo: f.tipo,
          prioridade: f.prioridade,
          equipamento: vazio(f.equipamento),
          marca: vazio(f.marca),
          modelo: vazio(f.modelo),
          numero_serie: vazio(f.numero_serie),
          patrimonio: vazio(f.patrimonio),
          problema: f.problema.trim(),
          diagnostico: vazio(f.diagnostico),
          servico_executado: vazio(f.servico_executado),
          pecas: vazio(f.pecas),
          observacoes: vazio(f.observacoes),
          valor: valor != null && Number.isFinite(valor) ? valor : null,
          prazo: f.prazo ? deInput(f.prazo) : null,
        })
      }}
    >
      <fieldset disabled={bloqueado || salvando} className="form__grupo">
        <legend>Chamado</legend>
        <div className="form__linha">
          <label>
            Cliente
            <input value={f.cliente} onChange={set('cliente')} required maxLength={120} />
          </label>
          <label>
            Tipo
            <select value={f.tipo} onChange={set('tipo')}>
              {Object.entries(ROTULO_TIPO).map(([v, r]) => (
                <option key={v} value={v}>{r}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Unidade / local
          <input value={f.unidade} onChange={set('unidade')} placeholder="Loja, filial ou endereço" maxLength={200} />
        </label>
        <div className="form__linha">
          <label>
            Solicitante
            <input value={f.solicitante} onChange={set('solicitante')} maxLength={120} />
          </label>
          <label>
            Contato
            <input value={f.contato} onChange={set('contato')} placeholder="Telefone ou e-mail" maxLength={120} />
          </label>
        </div>
        <div className="form__linha">
          <label>
            Prioridade
            <select value={f.prioridade} onChange={set('prioridade')}>
              {Object.entries(ROTULO_PRIORIDADE).map(([v, r]) => (
                <option key={v} value={v}>{r}</option>
              ))}
            </select>
          </label>
          <label>
            Prazo
            <input type="datetime-local" value={f.prazo} onChange={set('prazo')} />
          </label>
        </div>
        <label>
          Técnico responsável
          <input value={f.tecnico} onChange={set('tecnico')} maxLength={120} />
        </label>
      </fieldset>

      <fieldset disabled={bloqueado || salvando} className="form__grupo">
        <legend>Equipamento</legend>
        <label>
          Equipamento
          <input value={f.equipamento} onChange={set('equipamento')} placeholder='Ex.: TV 50", Ar-condicionado 12.000 BTUs' maxLength={160} />
        </label>
        <div className="form__linha">
          <label>
            Marca
            <input value={f.marca} onChange={set('marca')} maxLength={80} />
          </label>
          <label>
            Modelo
            <input value={f.modelo} onChange={set('modelo')} maxLength={80} />
          </label>
        </div>
        <div className="form__linha">
          <label>
            Nº de série
            <input value={f.numero_serie} onChange={set('numero_serie')} maxLength={80} />
          </label>
          <label>
            Patrimônio
            <input value={f.patrimonio} onChange={set('patrimonio')} maxLength={80} />
          </label>
        </div>
      </fieldset>

      <fieldset disabled={bloqueado || salvando} className="form__grupo">
        <legend>Serviço</legend>
        <label>
          Problema relatado *
          <textarea rows={3} value={f.problema} onChange={set('problema')} required maxLength={4000} />
        </label>
        {editando && (
          <>
            <label>
              Diagnóstico
              <textarea rows={3} value={f.diagnostico} onChange={set('diagnostico')} maxLength={4000} />
            </label>
            <label>
              Serviço executado <small>(obrigatório para concluir)</small>
              <textarea rows={3} value={f.servico_executado} onChange={set('servico_executado')} maxLength={4000} />
            </label>
            <div className="form__linha">
              <label>
                Peças utilizadas
                <input value={f.pecas} onChange={set('pecas')} maxLength={2000} />
              </label>
              <label>
                Valor (R$)
                <input inputMode="decimal" value={f.valor} onChange={set('valor')} placeholder="0,00" />
              </label>
            </div>
          </>
        )}
        <label>
          Observações
          <textarea rows={2} value={f.observacoes} onChange={set('observacoes')} maxLength={4000} />
        </label>
      </fieldset>

      {!bloqueado && (
        <div className="form__acoes">
          {onCancelar && (
            <button type="button" className="btn btn--sec" onClick={onCancelar} disabled={salvando}>
              Voltar
            </button>
          )}
          <button type="submit" className="btn" disabled={salvando}>
            {salvando ? 'Salvando…' : textoBotao}
          </button>
        </div>
      )}
    </form>
  )
}
