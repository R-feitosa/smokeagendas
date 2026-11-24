-- Agendador: chama a Edge Function send-reminders a cada minuto.
--
-- ATENÇÃO: este arquivo tem placeholders. Substitua antes de rodar
-- (SQL Editor do Supabase), ou rode a parte do Vault e do schedule à mão.
--   <PROJECT_REF>  -> referência do projeto (ex.: abcdefghijklmn)
--   <CRON_SECRET>  -> o mesmo valor do secret CRON_SECRET das Edge Functions

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- guarda o segredo no Vault (não fica em texto puro no job)
select vault.create_secret('<CRON_SECRET>', 'cron_secret');

select cron.schedule(
  'enviar-lembretes',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Para desligar:  select cron.unschedule('enviar-lembretes');
