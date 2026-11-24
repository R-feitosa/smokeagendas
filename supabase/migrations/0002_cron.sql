-- Agendador: chama a Edge Function send-reminders a cada minuto.
--
-- Este arquivo NÃO tem placeholders e pode ir no `supabase db push`.
-- A URL do projeto e o segredo ficam no Vault e são lidos a cada execução.
-- Antes (ou depois) de rodar, crie os dois segredos UMA vez no SQL Editor:
--
--   select vault.create_secret('https://<PROJECT_REF>.supabase.co', 'project_url');
--   select vault.create_secret('<o mesmo valor do secret CRON_SECRET>', 'cron_secret');
--
-- Enquanto os segredos não existirem, o job roda e não faz nada.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.disparar_send_reminders() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  if v_url is null or v_secret is null then
    raise log 'send-reminders: configure project_url e cron_secret no Vault';
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end $$;

revoke all on function public.disparar_send_reminders() from public, anon, authenticated;

-- idempotente: recria o job se a migration rodar de novo
select cron.unschedule(jobid) from cron.job where jobname = 'enviar-lembretes';
select cron.schedule('enviar-lembretes', '* * * * *', 'select public.disparar_send_reminders()');

-- Para desligar:  select cron.unschedule('enviar-lembretes');
