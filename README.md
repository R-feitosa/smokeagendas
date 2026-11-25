# Agenda por Voz

PWA para celular: a pessoa **grava um áudio**, a IA transforma em compromisso, ela **confere e salva**, e o app **avisa por notificação** na hora certa.

```
Celular (PWA)                         Supabase
┌──────────────┐  áudio   ┌─────────────────────────┐
│ 🎙 Gravar    │ ───────▶ │ Edge Function           │
│              │          │  agenda-process-audio   │
│ ✏️ Conferir  │ ◀─────── │  Whisper → LLM → JSON   │
│ 💾 Salvar    │ ───────▶ │ schema agenda (RLS)     │
│              │          │                         │
│ 🔔 Push      │ ◀─────── │ pg_cron (1/min) →       │
└──────────────┘          │  agenda-send-reminders → Web Push
                          └─────────────────────────┘
```

## Estrutura

```
agenda-voz/
├── public/icons/                 ícones do PWA (192, 512, maskable)
├── src/
│   ├── main.tsx · App.tsx        entrada e rotas (Hoje, Calendário, Gravar, Ajustes)
│   ├── sw.ts                     service worker: cache + push + botões da notificação
│   ├── styles.css
│   ├── components/
│   │   ├── Layout.tsx            barra de abas inferior
│   │   ├── Recorder.tsx          botão de gravar: medidor de volume, cronômetro, limite de 2 min, cancelar
│   │   ├── ConfirmEvento.tsx     conferência do rascunho antes de salvar
│   │   └── EventCard.tsx
│   ├── pages/                    Login · Hoje · Calendário (dia/semana/mês) · Gravar · Ajustes
│   ├── hooks/
│   │   ├── useSession.ts
│   │   └── useAcaoNotificacao.ts "Concluir" / "Adiar" vindos da notificação
│   └── lib/
│       ├── supabase.ts · api.ts · types.ts · datas.ts
│       ├── recorder.ts           MediaRecorder (webm no Chrome, mp4 no Safari) + erros de microfone traduzidos
│       └── push.ts               inscrição Web Push
└── supabase/
    ├── config.toml
    ├── migrations/
    │   ├── 0001_init.sql         schema agenda: tabelas, RLS, reivindicar_lembretes()
    │   ├── 0002_cron.sql         agendador de 1 em 1 minuto (segredo no Vault)
    │   ├── 0003_recorrencia_reenvio.sql  séries (7 dias gravados) + reenvio do lembrete
    │   ├── 0004_projecao_recorrencia.sql projetar_ocorrencias(): repetições futuras p/ o calendário
    │   ├── 0005_equipe.sql       perfis.equipe + eventos.responsavel (filtro Minha | Equipe)
    │   └── 0006_responsavel_no_lembrete.sql  lembrete sai com o responsável (título do push)
    └── functions/
        ├── _shared/cors.ts
        ├── agenda-process-audio/ transcrever.ts → extrair.ts → validar.ts → rascunho
        └── agenda-send-reminders/ envia o push dos lembretes vencidos
```

## Onde roda (produção)

O backend vive **dentro do projeto Supabase `rf-ops`**, isolado no schema **`agenda`**.
Nada da agenda é criado em `public`, não há trigger em `auth.users`, e todos os nomes
compartilháveis têm prefixo próprio:

| Recurso | Nome |
|---|---|
| Schema | `agenda` (tabelas `perfis`, `eventos`, `push_subscriptions`) |
| Edge Functions | `agenda-process-audio`, `agenda-send-reminders` |
| Job do pg_cron | `agenda-enviar-lembretes` |
| Vault | `agenda_cron_secret` (gerado no banco), `agenda_project_url` |
| Secrets das funções | `AGENDA_GROQ_API_KEY` (ou `AGENDA_OPENAI_API_KEY`), `AGENDA_VAPID_PUBLIC_KEY`, `AGENDA_VAPID_PRIVATE_KEY`, `AGENDA_VAPID_SUBJECT`, `AGENDA_ALLOWED_ORIGINS` |
| Histórico de migrations | `agenda_0001_init`, `agenda_0002_cron`, `agenda_0003_recorrencia_reenvio`, `agenda_0004_projecao_recorrencia`, `agenda_0005_equipe`, `agenda_0006_responsavel_no_lembrete` |

**Único ponto compartilhado: o login.** Os usuários ficam no Authentication do rf-ops,
mas estar lá **não dá acesso** à agenda. Só usa o app quem for habilitado:

```sql
select agenda.habilitar_usuario('fulano@empresa.com.br', 'Fulano');          -- habilitar
delete from agenda.perfis where id = (select id from auth.users where email = 'fulano@empresa.com.br'); -- desabilitar
```

> ⚠️ **Não rode `supabase link` + `supabase db push` contra o rf-ops a partir deste repositório.**
> O histórico de migrations do rf-ops pertence a outro sistema. Migrations da agenda são
> aplicadas pelo SQL Editor (ou MCP) com nome prefixado `agenda_`.

## Como subir

1. **Dependências**
   ```bash
   npm install
   cp .env.example .env
   ```
2. **Banco** — já aplicado no rf-ops (`agenda_0001_init`, `agenda_0002_cron`, `agenda_0003_recorrencia_reenvio`, `agenda_0004_projecao_recorrencia`, `agenda_0005_equipe`, `agenda_0006_responsavel_no_lembrete`).
   Para um ambiente novo, rode `supabase/migrations/0001` → `0002` → `0003` → `0004` → `0005` → `0006` no SQL Editor e depois:
   ```sql
   select vault.create_secret('https://SEU_REF.supabase.co', 'agenda_project_url');
   ```
3. **Expor o schema na API** — *Project Settings → Data API → Exposed schemas* → adicionar `agenda`.
   Sem isso o app e o cron recebem `Invalid schema: agenda`.
4. **Chaves VAPID** (identificam o servidor de push)
   ```bash
   npm run gen:vapid
   ```
   A pública vai em `VITE_VAPID_PUBLIC_KEY` (.env) e as duas nos secrets das funções:
   ```bash
   supabase secrets set --project-ref gxmoxejamprvltpozlrk \
     AGENDA_GROQ_API_KEY=... AGENDA_VAPID_PUBLIC_KEY=... AGENDA_VAPID_PRIVATE_KEY=... \
     AGENDA_VAPID_SUBJECT=mailto:ti@seuescritorio.com.br \
     AGENDA_ALLOWED_ORIGINS=https://agenda.seudominio.com.br
   ```
   O segredo do cron **não** é configurado à mão: é gerado no Vault pela migration.
5. **Funções** — já publicadas no rf-ops. Para republicar:
   ```bash
   supabase functions deploy agenda-process-audio  --project-ref gxmoxejamprvltpozlrk
   supabase functions deploy agenda-send-reminders --project-ref gxmoxejamprvltpozlrk --no-verify-jwt
   ```
6. **Usuários** — criar em *Authentication → Users* (e-mail e senha) e **habilitar** com
   `agenda.habilitar_usuario(...)`.
7. **Rodar**: `npm run dev` · **Publicar**: `npm run build` e suba a pasta `dist/` (Netlify/Vercel).

## Backend: decisões e garantias

| Tema | Como está resolvido | Onde |
|---|---|---|
| Lembrete duplicado | `reivindicar_lembretes()` marca e devolve o lote na mesma instrução (`FOR UPDATE SKIP LOCKED`); execuções sobrepostas do cron não pegam o mesmo evento | `0001_init.sql` |
| Falha de envio | Se nenhum aparelho recebeu por erro transitório, `liberar_lembrete()` devolve à fila e tenta no minuto seguinte (até 2h após o início) | `send-reminders` |
| Remarcação | Mudar `inicio` ou `lembrar_min_antes` rearma o lembrete (trigger) | `0001_init.sql` |
| Fuso | Texto "Hoje/Amanhã/Sexta, 28/11 às 09:00" no fuso do perfil (`agenda.perfis.fuso`, padrão `America/Fortaleza`) | `_shared/datas.ts` |
| Recorrência | Ocorrências materializadas até 7 dias à frente; a ocorrência *k* = âncora + *k* × passo **no fuso da pessoa** (sem deriva: 31/01 mensal → 28/02 → 31/03; hora local mantida no horário de verão). Cancelar uma não encerra a série; `agenda.encerrar_serie(id)` encerra; trocar o passo inicia série nova e cancela as posteriores da antiga. O calendário mostra as repetições além dos 7 dias como "previstas", calculadas por `agenda.projetar_ocorrencias(de, ate)` com a mesma regra (só leitura, RLS) | `0003`, `0004` |
| Reenvio até confirmar | Pendente após o 1º aviso → novo aviso a cada `perfis.reenviar_a_cada_min` (padrão 5), até `perfis.max_reenvios` (padrão 3; 0 desliga). Concluir para; "Adiar" e remarcar zeram a contagem. Cada envio tem `tag` própria (toca de novo) e o service worker fecha os avisos anteriores do mesmo compromisso | `0003`, `_shared/notificacao.ts`, `src/sw.ts` |
| Agenda da equipe | O dono da conta registra também os compromissos da equipe: `eventos.responsavel` (null = dele; nome = membro de `perfis.equipe`). Filtro Tudo / Minha / Equipe em Hoje e Calendário; o nome dito na gravação já vem marcado na conferência. Acesso e avisos continuam só do dono; repetições herdam o responsável; no push o nome vem no título ("Toyota: Visita ao cliente") | `0005`, `0006`, `src/lib/equipe.ts`, `_shared/notificacao.ts` |
| Provedor de IA | Groq (padrão, via `AGENDA_GROQ_API_KEY`) ou OpenAI; mesma API. Modelos em lista de preferência com troca automática se um for descontinuado; fixáveis por `AGENDA_IA_MODELO_*` | `agenda-process-audio/provedor.ts` |
| Data errada da IA | "Agora" vem do relógio do servidor com dia da semana; a resposta é validada (ISO com offset, limites) antes de voltar ao app | `process-audio/validar.ts` |
| Acesso | Só usuários habilitados em `agenda.perfis` (FK); a função de áudio confere o usuário no Auth + perfil antes de gastar OpenAI (o gateway sozinho aceita a chave anon); RLS por `user_id`; `anon` sem acesso ao schema; funções do cron só para `service_role`; segredo do cron gerado e conferido no Vault; CORS por `AGENDA_ALLOWED_ORIGINS` | `0001`/`0002` |

## Diagnóstico em produção

Confere chave de IA, modelos disponíveis e push, sem expor nenhum segredo (rode no SQL Editor):

```sql
select net.http_post(
  url     := (select decrypted_secret from vault.decrypted_secrets where name = 'agenda_project_url') || '/functions/v1/agenda-send-reminders',
  headers := jsonb_build_object('Content-Type', 'application/json',
             'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'agenda_cron_secret')),
  body    := '{"diagnostico": true}'::jsonb) as request_id;
-- alguns segundos depois:
select status_code, content::jsonb from net._http_response where id = <request_id>;
```

## Testes

```bash
npm run test:fn    # Deno: datas/fuso e validação do rascunho
npm run test:db    # Postgres local: isolamento/RLS, fila de lembretes, recorrência, reenvio, projeção, equipe
```

`test:db` precisa de um Postgres acessível (`PGHOST`, `PGPORT`, `PGUSER`); ele cria e apaga um banco
temporário e usa `tests/db/_shim_supabase.sql` para imitar `auth.users`/`auth.uid()` e os papéis do Supabase.

## Pontos de atenção

- **iPhone**: push só funciona com o app instalado (*Compartilhar → Adicionar à Tela de Início*, iOS 16.4+) e com a permissão pedida após um toque. A tela *Ajustes* já orienta isso.
- **HTTPS** é obrigatório para microfone e push (`localhost` vale em desenvolvimento).
- O **áudio não é guardado**: só a transcrição fica no evento.
- O push pode ser dispensado sem querer. Para compromissos críticos, o próximo passo é reenviar até a pessoa tocar em *Concluir* e/ou ter um canal de reserva (WhatsApp/e-mail).

## Ainda não feito (próximos passos)

- [x] Recorrência: gera as próximas ocorrências (horizonte de 7 dias)
- [ ] Agenda compartilhada por setor / atribuir compromisso a outra pessoa
- [ ] Resumo matinal por push
- [ ] Exportar `.ics` / sincronizar com Google Agenda
- [x] Reenvio de lembrete até confirmação
- [x] Testes automatizados do backend (funções puras + banco)
- [ ] Testes do front
