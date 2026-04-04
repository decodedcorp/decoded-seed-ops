#!/usr/bin/env bash
# pg_dump auth.users, auth.identities, public.users (Supabase dev → prod 등)
#
# MCP(execute_sql)로는 pg_dump 포맷을 만들 수 없음 — 로컬에 PostgreSQL client(pg_dump) 필요.
#
# 1) Supabase Dashboard → Project Settings → Database
#    - Connection string → URI, Direct connection (port 5432 권장)
#    - Pooler(6543)는 pg_dump가 실패할 수 있음
# 2) Supabase Prod에 넣을 때는 반드시 데이터만 (--data-only):
#    DATA_ONLY=1 DATABASE_URL='postgresql://...@db....supabase.co:5432/postgres' \
#      OUT=./auth-migration-data.sql ./scripts/pg-dump-auth-users-migration.sh
#    (전체 덤프에 CREATE TABLE auth.* 가 들어가면 Prod에서 permission denied for schema auth)
#
# 3) Dev에서 뽑을 때 기본(스키마+데이터)은 로컬/빈 인스턴스용. Prod 적용은 위 DATA_ONLY=1.
#
# 환경변수:
#   OUT=./dump.sql     출력 파일 (기본: repo 루트 auth-users-migration-YYYYMMDD-HHMMSS.sql)
#   DATA_ONLY=1        필수에 가깝게: Supabase Prod (이미 auth/public.users 테이블 존재)
#   USE_INSERTS=1      COPY 대신 INSERT (느리지만 편집 용이)

set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to Postgres URI (Supabase Database settings)}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${OUT:-$ROOT/auth-users-migration-${STAMP}.sql}"

EXTRA=(--no-owner --no-acl)
[[ "${DATA_ONLY:-}" == "1" ]] && EXTRA+=(--data-only)
[[ "${USE_INSERTS:-}" == "1" ]] && EXTRA+=(--inserts)

echo "Writing: $OUT"
case "$DATABASE_URL" in
  postgresql://*|postgres://*) ;;
  *)
    echo "ERROR: DATABASE_URL 은 postgresql://... Supabase Database URI 전체여야 합니다." >&2
    exit 1
    ;;
esac
pg_dump "${EXTRA[@]}" \
  -t "auth.users" \
  -t "auth.identities" \
  -t "public.users" \
  -f "$OUT" \
  -d "$DATABASE_URL"

if [[ "${DATA_ONLY:-}" != "1" ]]; then
  echo "" >&2
  echo "WARNING: 이 파일은 DDL(CREATE TABLE 등)을 포함합니다. Supabase Prod에는 DATA_ONLY=1 로 다시 뽑은 뒤 적용하세요." >&2
fi
echo "Done. Prod 적용 예시 (데이터-only 덤프 가정):"
echo "  psql \"\$PROD_DATABASE_URL\" -v ON_ERROR_STOP=1 -f \"$OUT\""
