#!/usr/bin/env bash
# 전체 pg_dump(auth-migration.sql)에서 COPY 구간만 잘라 Supabase Prod용 data-only SQL 생성.
# 줄 번호는 pg_dump 출력 형식에 의존 — 파일 바뀌면 sed 범위 조정 필요.
#
# 사용: ./scripts/build-auth-migration-data-only.sh [입력.sql] [출력.sql]
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IN="${1:-$ROOT/auth-migration.sql}"
OUT="${2:-$ROOT/auth-migration-data-only.sql}"
[[ -f "$IN" ]] || { echo "missing: $IN" >&2; exit 1; }

{
  echo "-- Data-only: no DDL on auth. Order: auth.users → auth.identities → public.users"
  echo "-- session_replication_role=replica skips most triggers during COPY"
  echo "SET session_replication_role = replica;"
  echo "SET row_security = off;"
  sed -n '10,19p' "$IN"
  sed -n '22,24p' "$IN"
  echo ""
  echo "-- auth.users"
  sed -n '159,170p' "$IN"
  echo ""
  echo "-- auth.identities"
  sed -n '141,152p' "$IN"
  echo ""
  echo "-- public.users"
  sed -n '177,188p' "$IN"
  echo ""
  echo "SET session_replication_role = DEFAULT;"
} > "$OUT"

echo "Wrote $OUT"
echo "Prod: psql \"\$PROD_DATABASE_URL\" -v ON_ERROR_STOP=1 -f \"$OUT\""
