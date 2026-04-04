#!/usr/bin/env bash
# pg_dump 전체 warehouse 스키마 (Dev → Prod 등)
#
# Dev 테이블 예: artists, brands, group_members, groups, images, instagram_accounts,
#               posts, seed_asset, seed_posts, seed_solutions, seed_spots
#
# 사용:
#   DATABASE_URL='postgresql://...@db....supabase.co:5432/postgres' \
#     ./scripts/pg-dump-warehouse-migration.sh
#
# 환경변수:
#   OUT=./warehouse.sql              출력 (기본: warehouse-migration-YYYYMMDD-HHMMSS.sql)
#   DATA_ONLY=1                      데이터만 (Prod에 warehouse DDL이 이미 있을 때)
#   SCHEMA_ONLY=1                    DDL만 (테이블·제약만, 데이터 없음) — DATA_ONLY와 동시 사용 불가
#   USE_INSERTS=1                    COPY 대신 INSERT
#
# Prod 적용:
#   psql "$PROD_DATABASE_URL" -v ON_ERROR_STOP=1 -f warehouse-migration-....sql
#
# 주의: public 앱 DB(posts/spots/…)와는 별계층이다. 전체 이전이면 public + warehouse + auth 순서·FK를
#       각자 설계해야 한다. seed_* 의 source_post_id 등은 warehouse.posts/images와 연결된다.

set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL (소스 DB, 보통 Dev Supabase Direct URI)}"

if [[ "${DATA_ONLY:-}" == "1" && "${SCHEMA_ONLY:-}" == "1" ]]; then
  echo "DATA_ONLY 와 SCHEMA_ONLY 는 동시에 쓸 수 없습니다." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${OUT:-$ROOT/warehouse-migration-${STAMP}.sql}"

EXTRA=(--no-owner --no-acl --schema=warehouse)
[[ "${DATA_ONLY:-}" == "1" ]] && EXTRA+=(--data-only)
[[ "${SCHEMA_ONLY:-}" == "1" ]] && EXTRA+=(--schema-only)
[[ "${USE_INSERTS:-}" == "1" ]] && EXTRA+=(--inserts)

echo "Writing: $OUT"
# 연결 문자열은 반드시 postgresql:// 또는 postgres:// 로 시작하는 Supabase Database URI 전체.
# '...dev...' 같은 placeholder 를 쓰면 libpq 가 로컬 소켓으로 붙으려다 실패할 수 있음.
case "$DATABASE_URL" in
  postgresql://*|postgres://*) ;;
  *)
    echo "ERROR: DATABASE_URL 은 postgresql://... 또는 postgres://... 형식이어야 합니다 (Supabase Dashboard → Database → URI)." >&2
    exit 1
    ;;
esac
pg_dump "${EXTRA[@]}" -f "$OUT" -d "$DATABASE_URL"

if [[ "${DATA_ONLY:-}" != "1" && "${SCHEMA_ONLY:-}" != "1" ]]; then
  echo "" >&2
  echo "NOTE: 전체 덤프(DDL+데이터). Prod에 warehouse 스키마가 이미 있으면 DATA_ONLY=1 로 다시 뽑는 편이 안전할 수 있습니다." >&2
fi
echo "Done."
echo "  psql \"\$PROD_DATABASE_URL\" -v ON_ERROR_STOP=1 -f \"$OUT\""
