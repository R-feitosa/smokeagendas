-- 0002_cron.sql depende de pg_cron/pg_net/Vault (só existem no Supabase).
-- Aqui criamos apenas a função que a 0003 substitui, com a mesma assinatura.
create function agenda.disparar_send_reminders() returns void language sql as $$ select $$;
