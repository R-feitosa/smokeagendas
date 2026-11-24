# Agenda por Voz

PWA para celular: a pessoa **grava um áudio**, a IA transforma em compromisso, ela **confere e salva**, e o app **avisa por notificação** na hora certa.

```
Celular (PWA)                         Supabase
┌──────────────┐  áudio   ┌─────────────────────────┐
│ 🎙 Gravar    │ ───────▶ │ Edge Function           │
│              │          │  process-audio          │
│ ✏️ Conferir  │ ◀─────── │  Whisper → LLM → JSON   │
│ 💾 Salvar    │ ───────▶ │ Postgres (eventos, RLS) │
│              │          │                         │
│ 🔔 Push      │ ◀─────── │ pg_cron (1/min) →       │
└──────────────┘          │  send-reminders → Web Push
                          └─────────────────────────┘
```

## Estrutura

```
agenda-voz/
├── public/icons/                 ícones do PWA (192, 512, maskable)
├── src/
│   ├── main.tsx · App.tsx        entrada e rotas (Hoje, Semana, Novo, Ajustes)
│   ├── sw.ts                     service worker: cache + push + botões da notificação
│   ├── styles.css
│   ├── components/
│   │   ├── Layout.tsx            barra de abas inferior
│   │   ├── Recorder.tsx          botão de gravar (toque para iniciar/parar)
│   │   ├── ConfirmEvento.tsx     conferência do rascunho antes de salvar
│   │   └── EventCard.tsx
│   ├── pages/                    Login · Hoje · Semana · Novo · Ajustes
│   ├── hooks/
│   │   ├── useSession.ts
│   │   └── useAcaoNotificacao.ts "Concluir" / "Adiar" vindos da notificação
│   └── lib/
│       ├── supabase.ts · api.ts · types.ts · datas.ts
│       ├── recorder.ts           MediaRecorder (webm no Chrome, mp4 no Safari)
│       └── push.ts               inscrição Web Push
└── supabase/
    ├── config.toml
    ├── migrations/
    │   ├── 0001_init.sql         tabelas, RLS, função eventos_para_lembrar()
    │   └── 0002_cron.sql         agendador de 1 em 1 minuto (tem placeholders)
    └── functions/
        ├── _shared/cors.ts
        ├── process-audio/        transcrever.ts → extrair.ts → rascunho
        └── send-reminders/       envia o push dos lembretes vencidos
```

## Como subir

1. **Dependências**
   ```bash
   npm install
   cp .env.example .env
   ```
2. **Supabase** — crie o projeto, preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no `.env`, depois:
   ```bash
   supabase link --project-ref SEU_REF
   supabase db push                      # roda 0001_init.sql e 0002_cron.sql
   ```
3. **Chaves VAPID** (identificam o servidor de push)
   ```bash
   npm run gen:vapid
   ```
   Coloque a chave pública em `VITE_VAPID_PUBLIC_KEY` (.env) e as duas nos secrets:
   ```bash
   supabase secrets set OPENAI_API_KEY=... VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... \
     VAPID_SUBJECT=mailto:ti@seuescritorio.com.br CRON_SECRET=$(openssl rand -hex 32) \
     ALLOWED_ORIGINS=https://agenda.seudominio.com.br
   ```
4. **Funções**
   ```bash
   supabase functions deploy process-audio
   supabase functions deploy send-reminders --no-verify-jwt
   ```
5. **Agendador** — o job já foi criado pelo `db push`. Falta só guardar no Vault, uma vez, a URL do
   projeto e o mesmo `CRON_SECRET` (SQL Editor):
   ```sql
   select vault.create_secret('https://SEU_REF.supabase.co', 'project_url');
   select vault.create_secret('O_MESMO_CRON_SECRET', 'cron_secret');
   ```
6. **Usuários** — crie em *Authentication → Users* (o login é e-mail e senha).
7. **Rodar**: `npm run dev` · **Publicar**: `npm run build` e suba a pasta `dist/` (Netlify/Vercel).

## Backend: decisões e garantias

| Tema | Como está resolvido | Onde |
|---|---|---|
| Lembrete duplicado | `reivindicar_lembretes()` marca e devolve o lote na mesma instrução (`FOR UPDATE SKIP LOCKED`); execuções sobrepostas do cron não pegam o mesmo evento | `0001_init.sql` |
| Falha de envio | Se nenhum aparelho recebeu por erro transitório, `liberar_lembrete()` devolve à fila e tenta no minuto seguinte (até 2h após o início) | `send-reminders` |
| Remarcação | Mudar `inicio` ou `lembrar_min_antes` rearma o lembrete (trigger) | `0001_init.sql` |
| Fuso | Texto "Hoje/Amanhã/Sexta, 28/11 às 09:00" no fuso do perfil (`profiles.fuso`, padrão `America/Fortaleza`) | `_shared/datas.ts` |
| Data errada da IA | "Agora" vem do relógio do servidor com dia da semana; a resposta é validada (ISO com offset, limites) antes de voltar ao app | `process-audio/validar.ts` |
| Acesso | RLS por `user_id`; funções do cron só para `service_role`; segredo do cron comparado em tempo constante; CORS restrito por `ALLOWED_ORIGINS` | — |

## Testes

```bash
npm run test:fn    # Deno: datas/fuso e validação do rascunho
npm run test:db    # Postgres local: RLS, constraints, reivindicação de lembretes
```

`test:db` precisa de um Postgres acessível (`PGHOST`, `PGPORT`, `PGUSER`); ele cria e apaga um banco
temporário e usa `tests/db/_shim_supabase.sql` para imitar `auth.users`/`auth.uid()` e os papéis do Supabase.

## Pontos de atenção

- **iPhone**: push só funciona com o app instalado (*Compartilhar → Adicionar à Tela de Início*, iOS 16.4+) e com a permissão pedida após um toque. A tela *Ajustes* já orienta isso.
- **HTTPS** é obrigatório para microfone e push (`localhost` vale em desenvolvimento).
- O **áudio não é guardado**: só a transcrição fica no evento.
- O push pode ser dispensado sem querer. Para compromissos críticos, o próximo passo é reenviar até a pessoa tocar em *Concluir* e/ou ter um canal de reserva (WhatsApp/e-mail).

## Ainda não feito (próximos passos)

- [ ] Recorrência: hoje só é guardada, não gera as próximas ocorrências
- [ ] Agenda compartilhada por setor / atribuir compromisso a outra pessoa
- [ ] Resumo matinal por push
- [ ] Exportar `.ics` / sincronizar com Google Agenda
- [ ] Reenvio de lembrete até confirmação
- [x] Testes automatizados do backend (funções puras + banco)
- [ ] Testes do front
