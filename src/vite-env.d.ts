/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** commit e data/hora do build (vite.config.ts), exibidos em Ajustes */
declare const __VERSAO__: string

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_VAPID_PUBLIC_KEY: string
  /** entrada automática, temporária (ver src/lib/supabase.ts) */
  readonly VITE_ENTRADA_AUTOMATICA_EMAIL?: string
  readonly VITE_ENTRADA_AUTOMATICA_SENHA?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
