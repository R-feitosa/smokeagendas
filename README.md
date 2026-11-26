# Agenda por Voz

PWA para celular: a pessoa **grava um áudio**, a IA transforma em compromisso, ela **confere e salva**, e o app **avisa por notificação** na hora certa.

A aba **Apartamentos** é o quadro de ocupação dos imóveis do escritório: cada unidade aparece como **vaga** ou **ocupada** e, com um toque, abre a escolha do status (ver [Apartamentos](#apartamentos-vago--ocupado)).

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
│   ├── main.tsx · App.tsx        entrada e rotas (Hoje, Calendário, Gravar, Apartamentos, Ajustes)
│   ├── sw.ts                     service worker: cache + push + botões da notificação
│   ├── styles.css
│   ├── components/
│   │   ├── Layout.tsx            barra de abas inferior
│   │   ├── Recorder.tsx          botão de gravar: medidor de volume, cronômetro, limite de 2 min, cancelar
│   │   ├── ConfirmEvento.tsx     conferência do rascunho antes de salvar
│   │   ├── UnidadeFolha.tsx      folha "Vago | Ocupado" que sobe ao tocar numa unidade (aba Apartamentos)
│   │   └── EventCard.tsx
│   ├── pages/                    Login · Hoje · Calendário (dia/semana/mês) · Gravar · Apartamentos (quadro vago/ocupado) · Ajustes
│   ├── hooks/
│   │   ├── useSession.ts
│   │   └── useAcaoNotificacao.ts "Concluir" / "Adiar" vindos da notificação
│   └── lib/
│       ├── supabase.ts · api.ts · types.ts · datas.ts
│       ├── apartamentos.ts       regras de exibição da aba Apartamentos (resumo, fileiras, textos), sem rede
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
    │   ├── 0006_responsavel_no_lembrete.sql  lembrete sai com o responsável (título do push)
    │   ├── 0007_apartamentos.sql  prédios + unidades (vago|ocupado) + histórico; carga da planilha
    │   ├── 0008_casas_temporada.sql  predios.categoria + 5 casas de temporada (1 unidade cada)
    │   ├── 0009_casas_so_saulo.sql  só o Saulo muda o status das casas (predios.editavel_por + policy)
    │   ├── 0010_vistorias.sql     vistoria de saída: tabela, abre ao vagar, trava ao concluir
    │   └── 0011_vistoria_temporada.sql  casas de temporada também (modelo temporada_v1)
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
| Schema | `agenda` (tabelas `perfis`, `eventos`, `push_subscriptions`; aba Apartamentos: `predios`, `unidades`, `unidades_historico`) |
| Edge Functions | `agenda-process-audio`, `agenda-send-reminders` |
| Job do pg_cron | `agenda-enviar-lembretes` |
| Vault | `agenda_cron_secret` (gerado no banco), `agenda_project_url` |
| Secrets das funções | `AGENDA_GROQ_API_KEY` (ou `AGENDA_OPENAI_API_KEY`), `AGENDA_VAPID_PUBLIC_KEY`, `AGENDA_VAPID_PRIVATE_KEY`, `AGENDA_VAPID_SUBJECT`, `AGENDA_ALLOWED_ORIGINS` |
| Histórico de migrations | `agenda_0001_init`, `agenda_0002_cron`, `agenda_0003_recorrencia_reenvio`, `agenda_0004_projecao_recorrencia`, `agenda_0005_equipe`, `agenda_0006_responsavel_no_lembrete`, `agenda_0007_apartamentos`, `agenda_0008_casas_temporada`, `agenda_0009_casas_so_saulo` |

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
2. **Banco** — já aplicado no rf-ops (`agenda_0001_init`, `agenda_0002_cron`, `agenda_0003_recorrencia_reenvio`, `agenda_0004_projecao_recorrencia`, `agenda_0005_equipe`, `agenda_0006_responsavel_no_lembrete`, `agenda_0007_apartamentos`, `agenda_0008_casas_temporada`, `agenda_0009_casas_so_saulo`).
   Para um ambiente novo, rode `supabase/migrations/0001` → `0002` → `0003` → `0004` → `0005` → `0006` → `0007` → `0008` → `0009` no SQL Editor (a 0009 exige um perfil chamado "Saulo") e depois:
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
| Apartamentos (vago/ocupado) | Dados **do escritório**, não por pessoa: todo usuário habilitado vê tudo e muda o status; login do rf-ops sem perfil na agenda não vê nem altera. O app só tem `SELECT` e `UPDATE` da coluna `status`; quem/quando mudou é carimbado por trigger (não dá para forjar) e cada mudança entra em `unidades_historico` (só leitura). Marcar o mesmo status de novo não conta como mudança. **Fonte da verdade do status = `agenda.unidades`**; o módulo imobiliário do RF OPS (`public.feitosa_imoveis`) não é lido nem escrito | `0007`, `src/pages/Apartamentos.tsx`, `src/lib/apartamentos.ts` |
| Provedor de IA | Groq (padrão, via `AGENDA_GROQ_API_KEY`) ou OpenAI; mesma API. Modelos em lista de preferência com troca automática se um for descontinuado; fixáveis por `AGENDA_IA_MODELO_*` | `agenda-process-audio/provedor.ts` |
| Data errada da IA | "Agora" vem do relógio do servidor com dia da semana; a resposta é validada (ISO com offset, limites) antes de voltar ao app | `process-audio/validar.ts` |
| Acesso | Só usuários habilitados em `agenda.perfis` (FK); a função de áudio confere o usuário no Auth + perfil antes de gastar OpenAI (o gateway sozinho aceita a chave anon); RLS por `user_id`; `anon` sem acesso ao schema; funções do cron só para `service_role`; segredo do cron gerado e conferido no Vault; CORS por `AGENDA_ALLOWED_ORIGINS` | `0001`/`0002` |

## Apartamentos (vago | ocupado)

Resumo no topo (quantos vagos, ocupação geral e por prédio) e, abaixo, um quadro por prédio com uma
placa por unidade. **Tocar na placa** abre a folha com *Vago* e *Ocupado*; escolher grava na hora,
mostra "Desfazer" por alguns segundos e registra quem mudou e quando. O filtro *Todos · Vagos · Ocupados*
mostra só o que interessa. A lista recarrega ao voltar para a tela (outra pessoa pode ter alterado).

**Por voz (aba Gravar):** diga, por exemplo, *"o apartamento 304 do Feitosa 2 está desocupado"*. A
transcrição que a função de áudio já devolve é lida no app (`src/lib/comandoApartamento.ts`, sem IA
extra e sem mudar o servidor): se tiver uma palavra de status (vago, desocupado, liberado, entregou
as chaves… / ocupado, alugado, locado…; "não está mais vago" inverte) e um número de unidade, o status
é gravado na hora, com *Desfazer*. Aceita vários números ("6, 18 e 24 do Feitosa 3") e número por
extenso. Se o número existe em mais de um prédio e nenhum foi dito, a tela pergunta qual. *"Não era
isso"* desfaz e segue como compromisso. Fala sem status (ex.: "vistoria no 304 amanhã") continua
virando compromisso.

A carga inicial veio da planilha de 25/11/2026: 68 unidades (Feitosa 1 = 11, Feitosa 2 = 16,
Feitosa 3 = 34, Connect Office = 7), 8 vagas.

**Casas de temporada** (0008, 26/11/2026): Escritório Moradas, Residência Roneely, Casa da Serra,
Casa Camocim e Apartamento de Fortaleza ficam numa seção separada, abaixo dos prédios, e **não entram**
no resumo de ocupação da locação. Cada uma é um `predios` com `categoria = 'temporada'`,
`tipo_unidade = 'imovel'` e uma única unidade (`numero = '1'`). Entraram como vagas. Por voz, basta o
nome: *"a Casa da Serra está ocupada"* (também "Camocim", "Moradas", "Roneely", "Fortaleza").
Nova casa: `insert into agenda.predios (nome, tipo_unidade, categoria, ordem) values ('Casa X', 'imovel', 'temporada', 106);`
e depois a unidade `'1'` dela em `agenda.unidades`.

**Quem altera as casas** (0009): todos veem; **só o Saulo** muda o status (`predios.editavel_por`, conferido
na policy de UPDATE de `agenda.unidades`). Para outra pessoa, a folha mostra "Só Saulo altera…" e a voz
não muda nada. Reaplicou a 0007? Reaplique a 0009 (a 0007 recria a policy sem a trava). Liberar uma casa
para todos: `update agenda.predios set editavel_por = null, editavel_por_nome = null where nome = 'Casa X';`

## Vistoria de saída (branch de teste `claude/vistoria-saida`)

Checklist copiado do PDF "Checklist de vistoria de saída" da Feitosa (AP 304 · Feitosa II, 18/11/2026):
cabeçalho (locatário, data, cidade, locador), **1 Quarto** (7 itens) e **2 Banheiro** (11 itens) com
Ótimo / Bom / Ruim / N/A + observação, **3 Checklist operacional** (6 itens), **4 Pendências** e
**5 Declaração**. Modelo em `src/lib/vistoria.ts` (`saida_v1`); respostas em `agenda.vistorias` (0010).

- Unidade marcada como **vaga** → o banco abre a vistoria; o aviso da aba mostra *Fazer vistoria*.
- **Dois modelos**, escolhidos pelo banco conforme o imóvel: `saida_v1` (apartamento/sala, PDF do AP 304) e
  `temporada_v1` (casa de temporada, PDF da Casa da Serra de 22/11/2026: Acessos e áreas externas 15 itens,
  Estrutura e acabamentos 17, Cozinha e eletrodomésticos 20, Mobiliário e enxoval 16, operacional 6).
  As 5 casas usam o mesmo modelo; item que não existe na casa vai como N/A.
- Cada seção tem **Marcar o resto como Ótimo** (só preenche o que está em branco).
- *Desfazer* com a vistoria ainda em branco → ela é apagada. Com algo preenchido, fica.
- Unidade que já estava vaga: botão **Vistoria de saída (checklist)** na folha da unidade.
- Salva sozinha a cada toque. **Concluir** exige os 18 itens avaliados e descrição em todo item *Ruim*;
  concluída fica travada (trigger), com vistoriador e data, e pode ser impressa/salva em PDF.
- Aba **Vistorias** na barra de baixo (e atalho no painel Hoje): a fazer e concluídas.

## Aba Hoje (painel do dia)

Saudação com o nome do perfil, atalho **Gravar agora**, indicadores (compromissos de hoje com concluídos e
atrasados, próximo compromisso, vagos da locação, casas de temporada ocupadas), acesso rápido
(Calendário, Apartamentos, Casas de temporada, Ajustes) e a agenda de hoje com o filtro Tudo/Minha/Equipe.
Os números dos imóveis vêm da mesma fonte da aba Apartamentos; se falharem, a agenda continua. Unidades da carga não têm "vago desde": a data só
passa a existir quando o status é alterado no app.

Cadastro é administrativo (SQL Editor do rf-ops); o app não cria nem apaga unidade:

```sql
-- nova unidade (nasce "ocupado"; informe 'vago' se for o caso)
insert into agenda.unidades (predio_id, numero, status)
select id, '305', 'vago' from agenda.predios where nome = 'Feitosa 2';

-- novo prédio (tipo_unidade: 'apartamento' ou 'sala'; ordem = posição na tela)
insert into agenda.predios (nome, tipo_unidade, ordem) values ('Feitosa 4', 'apartamento', 5);

-- renomear prédio / tirar unidade do quadro (apaga também o histórico dela)
update agenda.predios set nome = 'Connect Office' where nome = 'Connect';
delete from agenda.unidades where numero = '305' and predio_id = (select id from agenda.predios where nome = 'Feitosa 2');

-- o que está vago e há quantos dias (null = desde antes do app)
select p.nome, u.numero, (now() - u.status_desde) as vago_ha
  from agenda.unidades u join agenda.predios p on p.id = u.predio_id
 where u.status = 'vago' order by p.ordem, u.numero::int;

-- histórico de uma unidade
select h.alterado_em, h.status_anterior, h.status_novo, h.alterado_por_nome
  from agenda.unidades_historico h join agenda.unidades u on u.id = h.unidade_id
  join agenda.predios p on p.id = u.predio_id
 where p.nome = 'Feitosa 2' and u.numero = '304' order by h.alterado_em desc;
```

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
npm run test:front # Node 22.18+ (roda TypeScript direto): regras de exibição da aba Apartamentos
npm run test:db    # Postgres local: isolamento/RLS, fila de lembretes, recorrência, reenvio, projeção, equipe, apartamentos
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
- [x] Aba Apartamentos: quadro vago/ocupado com troca por toque
- [ ] Apartamentos: histórico e tempo de vacância na tela (os dados já são gravados)
- [ ] Apartamentos: cadastrar prédio/unidade pelo app
- [ ] Apartamentos: decidir a integração com o módulo imobiliário do RF OPS (hoje são fontes separadas)
- [ ] Testes do front (por enquanto só a lógica da aba Apartamentos; telas ainda não)
