import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { OsForm } from '../../components/OsForm'
import { useOsContexto } from '../../hooks/useOsContexto'
import { checklistDoModelo, criarOS } from '../../lib/os'
import type { DadosOS } from '../../lib/types'

export function OsNova() {
  const navigate = useNavigate()
  const ctx = useOsContexto()
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function salvar(d: DadosOS) {
    setSalvando(true)
    setErro(null)
    try {
      const checklist = checklistDoModelo(ctx.modelos.find((m) => m.categoria === d.categoria))
      const os = await criarOS({ ...d, checklist })
      // vai direto para a OS criada, onde se anexam as fotos de ANTES
      navigate(`/os/${os.id}`, { replace: true })
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir a OS')
      setSalvando(false)
    }
  }

  return (
    <section>
      <h2>Abrir OS</h2>
      <p className="sub">O número é gerado ao salvar. Depois você anexa as fotos de antes.</p>
      {erro && <p className="erro">{erro}</p>}
      {ctx.pronto ? (
        <OsForm
          equipes={ctx.equipes}
          modelos={ctx.modelos}
          meuId={ctx.meuId}
          salvando={salvando}
          textoBotao="Abrir OS"
          onSalvar={salvar}
          onCancelar={() => navigate('/os')}
        />
      ) : (
        <p>Carregando…</p>
      )}
    </section>
  )
}
