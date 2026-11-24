-- Agendador: chama a Edge Function agenda-send-reminders a cada minuto.
--
-- Isolamento: usa segredos próprios no Vault (prefixo agenda_) — o projeto
-- hospedeiro já tem `cron_secret`/`project_url` de outros sistemas, que NÃO
-- devem ser lidos aqui. O job também tem prefixo próprio.
--
-- O segredo do cron é gerado aqui mesmo e nunca sai do banco: a Edge Function
-- confere o cabeçalho recebido chamando agenda.cron_segredo_confere().
-- Falta só, uma vez, a URL do projeto (não é segredo):
--   select vault.create_secret('https://<PROJECT_REF>.supabase.co', 'agenda_project_url');
-- Enquanto ela não existir, o job roda e não faz nada.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- segredo aleatório de 256 bits, criado uma única vez
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'agenda_cron_secret',
                           'Agenda por Voz: autentica o pg_cron na Edge Function agenda-send-reminders')
where not exists (select 1 from vault.secrets where name = 'agenda_cron_secret');

create or replace function agenda.cron_segredo_confere(segredo text) returns boolean
language sql stable security definer set search_path = pg_catalog as $$
  select coalesce(
    (select decrypted_secret = segredo from vault.decrypted_secrets where name = 'agenda_cron_secret'),
    false)
$$;

create or replace function agenda.disparar_send_reminders() returns void
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'agenda_project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'agenda_cron_secret';
  if v_url is null or v_secret is null then
    raise log 'agenda-send-reminders: configure agenda_project_url no Vault';
    return;
  end if;

  perform net.http_post(
    url     := rtrim(v_url, '/') || '/functions/v1/agenda-send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end $$;

revoke all on function agenda.cron_segredo_confere(text)  from public, anon, authenticated;
revoke all on function agenda.disparar_send_reminders()   from public, anon, authenticated;
grant execute on function agenda.cron_segredo_confere(text) to service_role;

-- idempotente: recria o job se a migration rodar de novo
select cron.unschedule(jobid) from cron.job where jobname = 'agenda-enviar-lembretes';
select cron.schedule('agenda-enviar-lembretes', '* * * * *', 'select agenda.disparar_send_reminders()');

-- Para desligar:  select cron.unschedule('agenda-enviar-lembretes');
