#!/usr/bin/env bash
# Para cada *_test.sql: cria um banco descartável, aplica o shim + migrations e roda.
# Uso: PGHOST=... PGPORT=... PGUSER=postgres npm run test:db
set -euo pipefail
cd "$(dirname "$0")/../.."
falhas=0
for teste in tests/db/*_test.sql; do
  DB="agenda_test_$$_$(basename "$teste" .sql)"
  createdb "$DB"
  echo "== $teste"
  if psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/db/_shim_supabase.sql \
     && psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/migrations/0001_init.sql \
     && psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/db/_shim_0002.sql \
     && psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/migrations/0003_recorrencia_reenvio.sql \
     && psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/db/_shim_storage.sql \
     && psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/migrations/0004_os.sql \
     && psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/migrations/0005_os_equipe_checklist_assinatura.sql \
     && psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$teste"; then :; else falhas=$((falhas + 1)); fi
  dropdb --if-exists "$DB"
done
[ "$falhas" -eq 0 ] || { echo "$falhas arquivo(s) de teste falharam"; exit 1; }
