/**
 * Aba Apartamentos — estrutura pronta, conteúdo a definir (em outra conversa).
 * Rota: /apartamentos (ver App.tsx); ícone e posição na barra: components/Layout.tsx.
 */
export function Apartamentos() {
  return (
    <section>
      <h2>Apartamentos</h2>
      <div className="em-breve">
        <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 21V5.5L12 3l8 2.5V21M2.5 21h19M9 21v-4h6v4" />
          <path d="M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01" strokeWidth="2.2" />
        </svg>
        <p className="em-breve__titulo">Em breve</p>
        <p className="vazio">Esta área vai reunir as informações dos apartamentos.</p>
      </div>
    </section>
  )
}
