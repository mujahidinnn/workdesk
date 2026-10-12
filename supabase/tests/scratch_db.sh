#!/usr/bin/env bash
# Throwaway Postgres with every migration applied, for the *_smoke.sql tests.
#   supabase/tests/scratch_db.sh supabase/tests/security_smoke.sql
# One test per run: the smoke files commit fixtures that would collide.
# With no test file it leaves the DB running and prints its URL (for gen types).
# Stubs auth.uid()/auth.role() to read test.uid/test.role, and the bits of
# storage the migrations touch. The container is removed on exit.
set -euo pipefail
cd "$(dirname "$0")/../.."
IMAGE=public.ecr.aws/supabase/postgres:17.11.0.004
NAME=workdesk-smoke-$$
PORT=${SMOKE_PORT:-54377}
export PGPASSWORD=postgres
docker run -d --rm --name "$NAME" -e POSTGRES_PASSWORD=postgres -p "$PORT:5432" "$IMAGE" >/dev/null
trap 'docker rm -f "$NAME" >/dev/null' EXIT
psqlx() { psql -h localhost -p "$PORT" -U supabase_admin -d postgres -q -v ON_ERROR_STOP=1 "$@"; }
for _ in $(seq 1 60); do psqlx -c 'select 1' >/dev/null 2>&1 && break; sleep 2; done
sleep 3
psqlx <<'SQL'
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(coalesce(nullif(current_setting('test.uid', true), ''),
                         nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('test.role', true), ''),
                  nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') $$;
ALTER TABLE auth.users
  ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_token text,
  ADD COLUMN IF NOT EXISTS recovery_token text,
  ADD COLUMN IF NOT EXISTS email_change text,
  ADD COLUMN IF NOT EXISTS email_change_token_new text,
  ADD COLUMN IF NOT EXISTS email_change_token_current text,
  ADD COLUMN IF NOT EXISTS banned_until timestamptz,
  ADD COLUMN IF NOT EXISTS last_sign_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_sso_user boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE TABLE IF NOT EXISTS auth.identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, provider_id text,
  identity_data jsonb, provider text, last_sign_in_at timestamptz,
  created_at timestamptz, updated_at timestamptz, email text);
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY, name text, public boolean, file_size_limit bigint,
  allowed_mime_types text[], owner uuid, created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text,
  owner uuid, owner_id text, metadata jsonb, created_at timestamptz DEFAULT now());
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT ALL ON storage.objects, storage.buckets TO authenticated;
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[]
  LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
SQL
for f in supabase/migrations/*.sql; do psqlx -f "$f" >/dev/null; done
if [ $# -eq 0 ]; then
  trap - EXIT
  echo "postgresql://supabase_admin:postgres@localhost:$PORT/postgres  (docker rm -f $NAME when done)"
  exit 0
fi
psqlx -f "$1"
