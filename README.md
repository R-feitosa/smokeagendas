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
    │   ├── 0001_init.sql         schema agenda: tabelas, RLS, reivindicar_lembretes()
    │   └── 0002_cron.sql         agendador de 1 em 1 minuto (segredo no Vault)
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
| Histórico de migrations | `agenda_0001_init`, `agenda_0002_cron`, `agenda_0003_recorrencia_reenvio`, `agenda_0004_os`, `agenda_0005_os_equipe` |
| Storage (OS) | bucket privado `agenda-os-fotos` (policies com prefixo `agenda_os_fotos`) |

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
2. **Banco** — já aplicado no rf-ops (`agenda_0001_init`, `agenda_0002_cron`, `agenda_0003_recorrencia_reenvio`).
   Para um ambiente novo, rode `supabase/migrations/0001` → `0002` → `0003` no SQL Editor e depois:
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

## Ordens de Serviço (aba 🛠 OS)

Abrir OS → anexar fotos de **antes** (e durante) → executar → fotos de **depois** → concluir.

| Regra (garantida no banco, migration `0004_os.sql`) | Como |
|---|---|
| Número `OS-AAAA-NNNNN` sequencial por ano, gerado no servidor | `os_contador` + trigger |
| Concluir exige ≥1 foto de antes, ≥1 de depois e o serviço executado descrito | trigger `os_validar` + check |
| OS concluída/cancelada fica travada (sem editar, sem incluir/remover foto) | triggers + policy do Storage |
| Reabrir só volta para "em andamento"; cancelar exige motivo e é definitivo; não há DELETE | trigger + grants |
| Datas de abertura/início/conclusão carimbadas pelo servidor | triggers |
| Histórico (auditoria) de abertura, status, fotos e edições — só leitura para o usuário | `os_historico` |
| Fotos em bucket privado, caminho `<user_id>/<os_id>/<momento>/…`, URLs assinadas de 1h; reduzidas no aparelho (≤1600px JPEG) | `src/lib/os.ts`, `src/lib/imagem.ts` |

Na lista: indicadores (em aberto, atrasadas, concluídas no mês, % no prazo, tempo médio), filtros, busca e **exportação CSV** (abre no Excel).

### Equipe, checklist, assinatura e PDF (`0005_os_equipe_checklist_assinatura.sql`)

| Recurso | Regra |
|---|---|
| **Equipes** (`os_equipes`, `os_membros`) | **Gestor** vê/edita todas as OS da equipe, atribui técnico, cancela e gere membros (tela *OS → 👥 Equipe*). **Técnico** vê as OS atribuídas a ele e as que abriu; removido da equipe, perde o acesso às atribuídas. Sem equipe, o uso continua individual. |
| **Checklist por categoria** (`os_checklist_modelos`) | Escolher a categoria do equipamento carrega o checklist (OK / Não OK / N/A + observação; itens podem ser incluídos/removidos). **Concluir exige todos os itens respondidos.** Modelos iniciais são sugestões: ajuste pelo SQL Editor. |
| **Assinatura do cliente** | Com o dedo na tela + nome de quem assinou; PNG no bucket, `assinado_em` carimbado pelo servidor; opcional; travada após concluir. |
| **PDF da OS** | Gerado no aparelho (jsPDF, carregado sob demanda): dados, checklist, fotos **antes × depois lado a lado**, durante, assinatura e histórico. No celular abre o compartilhar (WhatsApp/e-mail). |
| **Histórico** | Agora com o nome de quem fez, atribuições e assinatura. |

**Aplicar no rf-ops (SQL Editor), nesta ordem:**
1. `supabase/migrations/0004_os.sql` (nome `agenda_0004_os`) — cria tabelas, bucket e policies do Storage.
2. `supabase/migrations/0005_os_equipe_checklist_assinatura.sql` (nome `agenda_0005_os_equipe`).
3. Criar a equipe e o gestor (a pessoa precisa estar habilitada com `agenda.habilitar_usuario`):
   ```sql
   select agenda.os_criar_equipe('PHILCO Fortaleza', 'gestor@empresa.com.br');
   ```
   Os técnicos o próprio gestor inclui pelo app (ou: `select agenda.os_definir_membro('<equipe_id>', 'tecnico@empresa.com.br', 'tecnico');`).

## Backend: decisões e garantias

| Tema | Como está resolvido | Onde |
|---|---|---|
| Lembrete duplicado | `reivindicar_lembretes()` marca e devolve o lote na mesma instrução (`FOR UPDATE SKIP LOCKED`); execuções sobrepostas do cron não pegam o mesmo evento | `0001_init.sql` |
| Falha de envio | Se nenhum aparelho recebeu por erro transitório, `liberar_lembrete()` devolve à fila e tenta no minuto seguinte (até 2h após o início) | `send-reminders` |
| Remarcação | Mudar `inicio` ou `lembrar_min_antes` rearma o lembrete (trigger) | `0001_init.sql` |
| Fuso | Texto "Hoje/Amanhã/Sexta, 28/11 às 09:00" no fuso do perfil (`agenda.perfis.fuso`, padrão `America/Fortaleza`) | `_shared/datas.ts` |
| Recorrência | Ocorrências materializadas até 7 dias à frente; a ocorrência *k* = âncora + *k* × passo **no fuso da pessoa** (sem deriva: 31/01 mensal → 28/02 → 31/03; hora local mantida no horário de verão). Cancelar uma não encerra a série; `agenda.encerrar_serie(id)` encerra; trocar o passo inicia série nova e cancela as posteriores da antiga | `0003` |
| Reenvio até confirmar | Pendente após o 1º aviso → novo aviso a cada `perfis.reenviar_a_cada_min` (padrão 5), até `perfis.max_reenvios` (padrão 3; 0 desliga). Concluir para; "Adiar" e remarcar zeram a contagem. Cada envio tem `tag` própria (toca de novo) e o service worker fecha os avisos anteriores do mesmo compromisso | `0003`, `_shared/notificacao.ts`, `src/sw.ts` |
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
npm run test:db    # Postgres local: isolamento/RLS, fila de lembretes, recorrência, reenvio
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
