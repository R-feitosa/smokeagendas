#!/usr/bin/env bash
# Cria um banco descartável, aplica o shim + migrations e roda os testes.
# Uso: PGHOST=... PGPORT=... PGUSER=postgres npm run test:db
set -euo pipefail
cd "$(dirname "$0")/../.."
DB="agenda_test_$$"
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/db/_shim_supabase.sql
# 0002 depende de pg_cron/pg_net/vault (só existem no Supabase): testamos apenas o schema
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/migrations/0001_init.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/db/eventos_test.sql
